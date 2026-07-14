/**
 * src/lib/aralya/scheduler.ts
 *
 * Aralya Phase 0 — Scheduled Automation Triggers
 *
 * Uses `node-schedule` with explicit IST (Asia/Kolkata) timezone so cron
 * expressions match the business's local time regardless of server TZ.
 *
 * Initialise once at app boot via `initArályaScheduler()` from
 * `src/app/layout.tsx` (or a server component that runs once).
 *
 * All schedules call the internal cron endpoint so they can also be
 * manually triggered via GET /api/cron/automations?trigger=<name>&test=true
 */

import schedule from 'node-schedule'

const IST = 'Asia/Kolkata'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET ?? ''

let initialised = false

async function fireTrigger(trigger: string) {
  try {
    const url = `${BASE_URL}/api/cron/automations?trigger=${trigger}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-cron-secret': CRON_SECRET,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) {
      console.error(`[scheduler] ${trigger} failed:`, res.status, await res.text())
    } else {
      console.log(`[scheduler] ${trigger} fired:`, await res.json())
    }
  } catch (err) {
    console.error(`[scheduler] ${trigger} error:`, err)
  }
}

export function initAralyaScheduler() {
  if (initialised) return
  initialised = true

  // ── 10:30 PM IST daily ───────────────────────────────────────
  // Generate daily_orders for tomorrow + send vendor briefings
  schedule.scheduleJob(
    { rule: '30 22 * * *', tz: IST },
    () => void fireTrigger('daily_orders')
  )

  // ── 6:00 AM IST daily ────────────────────────────────────────
  // Send delivery reminders to customers + monitor vendor confirmations
  schedule.scheduleJob(
    { rule: '0 6 * * *', tz: IST },
    () => void fireTrigger('delivery_reminders')
  )

  // ── 10:00 AM on the 28th of every month ──────────────────────
  // Send renewal reminders + calculate vendor payments
  schedule.scheduleJob(
    { rule: '0 10 28 * *', tz: IST },
    () => void fireTrigger('monthly_renewal')
  )

  // ── Every 6 hours — churn detection ─────────────────────────
  // Find subscriptions paused > 14 days and fire re-engagement
  schedule.scheduleJob(
    { rule: '0 */6 * * *', tz: IST },
    () => void fireTrigger('churn_detection')
  )

  console.log('[scheduler] Aralya scheduler initialised (IST timezone)')
}
