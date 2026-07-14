/**
 * scripts/test_db.ts
 *
 * Verifies all Aralya database tables are reachable and writable.
 * Run: npx ts-node --project tsconfig.scripts.json scripts/test_db.ts
 *
 * On success: exits 0
 * On failure: exits 1 with error details
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const ACCOUNT_ID = process.env.ARALYA_ACCOUNT_ID!

async function test(label: string, fn: () => Promise<{ data: unknown; error: { message: string } | null }>) {
  try {
    const { data, error } = await fn()
    if (error) {
      console.error(`  ❌ ${label}: ${error.message}`)
      return false
    }
    console.log(`  ✅ ${label}:`, JSON.stringify(data).slice(0, 120))
    return true
  } catch (e) {
    console.error(`  ❌ ${label}: exception —`, e)
    return false
  }
}

async function cleanup(table: string, filter: Record<string, string>) {
  let q = supabase.from(table).delete()
  for (const [key, value] of Object.entries(filter)) {
    q = q.eq(key, value)
  }
  await q
}

async function run() {
  console.log('🌸 Testing Aralya database schema...\n')
  let allPassed = true

  const testPhone = '+919000000001'

  // ── SUBSCRIPTIONS ────────────────────────────────────────────────
  const subOk = await test('INSERT subscriptions', () =>
    supabase.from('subscriptions').insert({
      account_id: ACCOUNT_ID,
      customer_phone: testPhone,
      plan: 'lotus',
      status: 'active',
      next_delivery_date: new Date().toISOString().slice(0, 10),
    }).select('id, customer_phone, plan')
  )
  if (!subOk) allPassed = false

  const { data: sub } = await supabase.from('subscriptions')
    .select('id').eq('customer_phone', testPhone).eq('account_id', ACCOUNT_ID).maybeSingle()

  // ── SUBSCRIPTION_HISTORY ─────────────────────────────────────────
  if (sub) {
    const histOk = await test('INSERT subscription_history', () =>
      supabase.from('subscription_history').insert({
        subscription_id: sub.id,
        action: 'created',
        changed_by: 'test_script',
      }).select()
    )
    if (!histOk) allPassed = false
  }

  // ── VENDORS ───────────────────────────────────────────────────────
  const vendorOk = await test('INSERT vendors', () =>
    supabase.from('vendors').insert({
      account_id: ACCOUNT_ID,
      name: 'Test Vendor',
      phone: '+919000000002',
      zone: 'bhubaneswar-test',
    }).select('id, name, zone')
  )
  if (!vendorOk) allPassed = false

  const { data: vendor } = await supabase.from('vendors')
    .select('id').eq('phone', '+919000000002').eq('account_id', ACCOUNT_ID).maybeSingle()

  // ── DAILY_ORDERS ──────────────────────────────────────────────────
  if (sub && vendor) {
    const orderOk = await test('INSERT daily_orders', () =>
      supabase.from('daily_orders').insert({
        account_id: ACCOUNT_ID,
        date: new Date().toISOString().slice(0, 10),
        subscription_id: sub.id,
        vendor_id: vendor.id,
        status: 'pending',
      }).select('id, date, status')
    )
    if (!orderOk) allPassed = false
  }

  // ── PAYMENT_LOGS ──────────────────────────────────────────────────
  const payOk = await test('INSERT payment_logs', () =>
    supabase.from('payment_logs').insert({
      account_id: ACCOUNT_ID,
      customer_phone: testPhone,
      razorpay_id: `pay_test_${Date.now()}`,
      razorpay_event: 'payment.captured',
      amount: 44900,
      plan: 'lotus',
      status: 'captured',
      raw_payload: { test: true },
      signature_valid: true,
    }).select('id, razorpay_id, amount')
  )
  if (!payOk) allPassed = false

  // ── CUSTOMER_FEEDBACK ─────────────────────────────────────────────
  const fbOk = await test('INSERT customer_feedback', () =>
    supabase.from('customer_feedback').insert({
      account_id: ACCOUNT_ID,
      customer_phone: testPhone,
      rating: 5,
      message: 'Test feedback from seed script',
    }).select('id, rating')
  )
  if (!fbOk) allPassed = false

  // ── SUPPORT_TICKETS ───────────────────────────────────────────────
  const ticketOk = await test('INSERT support_tickets', () =>
    supabase.from('support_tickets').insert({
      account_id: ACCOUNT_ID,
      customer_phone: testPhone,
      type: 'delivery_issue',
      priority: 'medium',
      status: 'open',
      description: 'Test ticket from seed script',
    }).select('id, type, status')
  )
  if (!ticketOk) allPassed = false

  // ── CLEANUP ───────────────────────────────────────────────────────
  console.log('\n🧹 Cleaning up test rows...')
  await cleanup('support_tickets', { customer_phone: testPhone, account_id: ACCOUNT_ID })
  await cleanup('customer_feedback', { customer_phone: testPhone, account_id: ACCOUNT_ID })
  await cleanup('payment_logs', { customer_phone: testPhone, account_id: ACCOUNT_ID })
  if (sub) {
    await cleanup('daily_orders', { subscription_id: sub.id })
    await cleanup('subscription_history', { subscription_id: sub.id })
    await cleanup('subscriptions', { id: sub.id })
  }
  if (vendor) {
    await cleanup('vendors', { id: vendor.id })
  }

  console.log('\n' + (allPassed ? '🎉 All tables verified!' : '⚠️  Some checks failed — see errors above.'))
  process.exit(allPassed ? 0 : 1)
}

run()
