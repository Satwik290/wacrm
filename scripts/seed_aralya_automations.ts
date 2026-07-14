/**
 * scripts/seed_aralya_automations.ts
 *
 * Seeds the 5 Aralya core automations into wacrm.
 * Run: npx ts-node --project tsconfig.scripts.json scripts/seed_aralya_automations.ts
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARALYA_ACCOUNT_ID, ARALYA_ADMIN_USER_ID
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const ACCOUNT_ID = process.env.ARALYA_ACCOUNT_ID!
const USER_ID = process.env.ARALYA_ADMIN_USER_ID!

interface StepDef {
  step_type: string
  step_config: Record<string, unknown>
  position: number
  parent_step_id?: string | null
  branch?: 'yes' | 'no' | null
}

interface AutomationDef {
  name: string
  description: string
  trigger_type: string
  trigger_config: Record<string, unknown>
  is_active: boolean
  steps: StepDef[]
}

const automations: AutomationDef[] = [
  // ── 1. PAYMENT RECEIVED ─────────────────────────────────────────
  {
    name: 'Payment Received → Welcome',
    description: 'Triggered by Razorpay webhook. Adds subscription + sends welcome message.',
    trigger_type: 'payment_received',
    trigger_config: {},
    is_active: true,
    steps: [
      {
        step_type: 'send_message',
        step_config: {
          text: '🌸 Welcome to Aralya! Your *{{vars.plan}}* subscription is confirmed.\n\n✅ First flowers tomorrow morning between 6–7 AM.\n\nQuestions? Just message us here anytime!',
        },
        position: 1,
      },
      {
        step_type: 'add_tag',
        step_config: { tag_name: 'subscriber' },
        position: 2,
      },
      {
        step_type: 'add_tag',
        step_config: { tag_name: '{{vars.plan}}' },
        position: 3,
      },
      {
        step_type: 'update_contact_field',
        step_config: { field: 'subscription_plan', value: '{{vars.plan}}' },
        position: 4,
      },
    ],
  },

  // ── 2. DAILY ORDERS GENERATED (10:30 PM) ─────────────────────────
  {
    name: 'Daily Orders → Vendor Briefing',
    description: 'Fires after 10:30 PM cron generates daily_orders. Sends each vendor their summary.',
    trigger_type: 'daily_orders_generated',
    trigger_config: {},
    is_active: true,
    steps: [
      {
        step_type: 'send_message',
        step_config: {
          text: '🌸 Good evening! Tomorrow\'s order brief ({{vars.date}}):\n\n📦 Total orders: {{vars.order_count}}\n\nPlease confirm you\'ll be ready by replying ✓\n\nThank you! 🙏',
          target: 'vendor', // custom flag — engine routes to vendor contacts
        },
        position: 1,
      },
    ],
  },

  // ── 3. DELIVERY REMINDERS (6:00 AM) ─────────────────────────────
  {
    name: 'Morning Delivery Reminders',
    description: 'Sent at 6 AM. Notifies active subscribers that flowers are on the way.',
    trigger_type: 'delivery_reminder',
    trigger_config: {},
    is_active: true,
    steps: [
      {
        step_type: 'send_message',
        step_config: {
          text: '🌸 Good morning! Your flowers are on their way.\n\nExpected delivery: 6–7 AM today.\n\nHave a beautiful day! 🌺',
        },
        position: 1,
      },
    ],
  },

  // ── 4. MONTHLY RENEWAL REMINDERS ────────────────────────────────
  {
    name: 'Monthly Renewal Reminders',
    description: 'Fires on 28th of each month. Reminds subscribers about renewal.',
    trigger_type: 'monthly_renewal',
    trigger_config: {},
    is_active: true,
    steps: [
      {
        step_type: 'send_message',
        step_config: {
          text: '🌸 Hi! Your Aralya *{{vars.plan}}* subscription renews in a few days.\n\nYour payment of ₹{{vars.amount}} will be collected automatically.\n\nNeed to change your plan or pause? Just message us!',
        },
        position: 1,
      },
    ],
  },

  // ── 5. CHURN PREVENTION ──────────────────────────────────────────
  {
    name: 'Churn Prevention — Re-engagement',
    description: 'Fires every 6h for subscriptions paused >14 days. Sends re-engagement message.',
    trigger_type: 'churn_risk',
    trigger_config: {},
    is_active: true,
    steps: [
      {
        step_type: 'send_message',
        step_config: {
          text: 'We miss you! 🌸 It\'s been a while since your last Aralya delivery.\n\nWould you like to resume? Reply *resume* and flowers start tomorrow.\n\nOr let us know if there\'s anything we can do better! 💬',
        },
        position: 1,
      },
      {
        step_type: 'add_tag',
        step_config: { tag_name: 'churn-risk' },
        position: 2,
      },
    ],
  },
]

async function seedAutomations() {
  console.log('🌸 Seeding Aralya automations...\n')

  for (const autoDef of automations) {
    const { steps, ...meta } = autoDef

    // Skip if already exists
    const { data: existing } = await supabase
      .from('automations')
      .select('id')
      .eq('account_id', ACCOUNT_ID)
      .eq('name', meta.name)
      .maybeSingle()

    if (existing) {
      console.log(`  ⏭  Skipping "${meta.name}" (already exists, id: ${existing.id})`)
      continue
    }

    const { data: automation, error: autoError } = await supabase
      .from('automations')
      .insert({
        account_id: ACCOUNT_ID,
        user_id: USER_ID,
        ...meta,
      })
      .select('id')
      .single()

    if (autoError || !automation) {
      console.error(`  ❌ Failed to insert automation "${meta.name}":`, autoError?.message)
      continue
    }

    // Insert steps
    const stepRows = steps.map((s) => ({
      automation_id: automation.id,
      step_type: s.step_type,
      step_config: s.step_config,
      position: s.position,
      parent_step_id: s.parent_step_id ?? null,
      branch: s.branch ?? null,
    }))

    const { error: stepsError } = await supabase.from('automation_steps').insert(stepRows)
    if (stepsError) {
      console.error(`  ❌ Failed to insert steps for "${meta.name}":`, stepsError.message)
      continue
    }

    console.log(`  ✅ Created automation "${meta.name}" (id: ${automation.id}, steps: ${steps.length})`)
  }

  console.log('\n✅ Automation seeding complete!')
}

seedAutomations().catch((err) => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
