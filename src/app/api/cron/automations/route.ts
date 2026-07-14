import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAutomationsForTrigger } from '@/lib/automations/engine'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

/**
 * POST /api/cron/automations?trigger=<name>
 * GET  /api/cron/automations?trigger=<name>&test=true
 *
 * Called by the node-schedule scheduler (src/lib/aralya/scheduler.ts)
 * OR manually by the engineer for testing.
 *
 * Triggers:
 *   daily_orders      — 10:30 PM: generate tomorrow's orders + vendor briefing
 *   delivery_reminders — 6:00 AM: send customer delivery reminders
 *   monthly_renewal   — 28th: send renewal reminders + calculate vendor payments
 *   churn_detection   — Every 6h: find paused >14d and re-engage
 */

async function requireAuth(request: Request): Promise<boolean> {
  const secret = request.headers.get('x-cron-secret')
  const apiKey = request.headers.get('x-api-key')
  const isTestMode = new URL(request.url).searchParams.get('test') === 'true'

  // In test mode, accept the ops API key as well
  if (isTestMode && apiKey && apiKey === process.env.ARALYA_API_KEY) return true
  return secret === process.env.CRON_SECRET
}

async function handleDailyOrders(accountId: string, testMode: boolean) {
  const db = supabaseAdmin()
  const tomorrow = new Date()
  if (!testMode) tomorrow.setDate(tomorrow.getDate() + 1)
  const dateStr = tomorrow.toISOString().slice(0, 10)

  // Fetch all active subscriptions
  const { data: subs, error: subsError } = await db
    .from('subscriptions')
    .select('id, customer_phone, plan, contact_id, vendors(id)')
    .eq('account_id', accountId)
    .eq('status', 'active')

  if (subsError) throw new Error(`subscriptions fetch: ${subsError.message}`)
  if (!subs || subs.length === 0) return { orders_created: 0, date: dateStr }

  // Upsert daily_orders (idempotent on date + subscription_id)
  const orderRows = subs.map((s: { id: string; vendors?: { id: string }[] }) => ({
    account_id: accountId,
    date: dateStr,
    subscription_id: s.id,
    vendor_id: null, // will be assigned by ops or automation
    status: 'pending',
  }))

  const { error: insertError } = await db
    .from('daily_orders')
    .upsert(orderRows, { onConflict: 'date,subscription_id', ignoreDuplicates: true })

  if (insertError) throw new Error(`daily_orders insert: ${insertError.message}`)

  // Fire automation trigger for vendor briefing
  runAutomationsForTrigger({
    accountId,
    triggerType: 'daily_orders_generated' as Parameters<typeof runAutomationsForTrigger>[0]['triggerType'],
    contactId: undefined,
    context: {
      vars: {
        date: dateStr,
        order_count: String(subs.length),
        test_mode: String(testMode),
      },
    },
  }).catch((e) => console.error('[cron] daily_orders automation failed:', e))

  return { orders_created: subs.length, date: dateStr }
}

async function handleDeliveryReminders(accountId: string) {
  const today = new Date().toISOString().slice(0, 10)

  // Fire automation for each pending order contact
  runAutomationsForTrigger({
    accountId,
    triggerType: 'delivery_reminder' as Parameters<typeof runAutomationsForTrigger>[0]['triggerType'],
    contactId: undefined,
    context: { vars: { date: today } },
  }).catch((e) => console.error('[cron] delivery_reminders automation failed:', e))

  return { trigger: 'delivery_reminder', date: today }
}

async function handleMonthlyRenewal(accountId: string) {
  const month = new Date().toISOString().slice(0, 7)

  runAutomationsForTrigger({
    accountId,
    triggerType: 'monthly_renewal' as Parameters<typeof runAutomationsForTrigger>[0]['triggerType'],
    contactId: undefined,
    context: { vars: { month } },
  }).catch((e) => console.error('[cron] monthly_renewal automation failed:', e))

  return { trigger: 'monthly_renewal', month }
}

async function handleChurnDetection(accountId: string) {
  const db = supabaseAdmin()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 14)

  const { data: atrisk, error } = await db
    .from('subscriptions')
    .select('id, customer_phone, contact_id, paused_since')
    .eq('account_id', accountId)
    .eq('status', 'paused')
    .lte('paused_since', cutoff.toISOString())

  if (error) throw new Error(`churn query: ${error.message}`)
  if (!atrisk || atrisk.length === 0) return { at_risk: 0 }

  // Fire individual automation per at-risk contact
  for (const sub of atrisk) {
    if (!sub.contact_id) continue
    runAutomationsForTrigger({
      accountId,
      triggerType: 'churn_risk' as Parameters<typeof runAutomationsForTrigger>[0]['triggerType'],
      contactId: sub.contact_id,
      context: {
        vars: {
          customer_phone: sub.customer_phone,
          paused_since: sub.paused_since,
        },
      },
    }).catch((e) => console.error('[cron] churn_detection per-contact failed:', e))
  }

  return { at_risk: atrisk.length }
}

async function runTrigger(trigger: string, accountId: string, testMode: boolean) {
  switch (trigger) {
    case 'daily_orders':
      return handleDailyOrders(accountId, testMode)
    case 'delivery_reminders':
      return handleDeliveryReminders(accountId)
    case 'monthly_renewal':
      return handleMonthlyRenewal(accountId)
    case 'churn_detection':
      return handleChurnDetection(accountId)
    default:
      throw new Error(`Unknown trigger: ${trigger}`)
  }
}

export async function POST(request: Request) {
  if (!(await requireAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const trigger = searchParams.get('trigger')
  const testMode = searchParams.get('test') === 'true'
  const accountId = process.env.ARALYA_ACCOUNT_ID ?? ''

  if (!trigger) {
    return NextResponse.json({ error: 'trigger param required' }, { status: 400 })
  }
  if (!accountId) {
    return NextResponse.json({ error: 'ARALYA_ACCOUNT_ID not set' }, { status: 500 })
  }

  try {
    const result = await runTrigger(trigger, accountId, testMode)
    return NextResponse.json({ ok: true, trigger, test: testMode, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron] trigger ${trigger} failed:`, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET for convenient browser/curl testing
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('test') !== 'true') {
    return NextResponse.json({ error: 'Add ?test=true to use GET' }, { status: 400 })
  }
  return POST(request)
}
