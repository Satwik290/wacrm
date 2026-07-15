/**
 * scripts/seed_aralya_flows.ts
 *
 * Seeds the 5 Aralya customer-facing flows into wacrm.
 * Run: npx ts-node --project tsconfig.scripts.json scripts/seed_aralya_flows.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARALYA_ACCOUNT_ID
 */

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const ACCOUNT_ID = process.env.ARALYA_ACCOUNT_ID!
const USER_ID = process.env.ARALYA_ADMIN_USER_ID! // admin user_id

function uid() {
  return crypto.randomUUID()
}

// Flow definitions
const flows = [
  // ── 1. ONBOARDING ───────────────────────────────────────────────
  {
    name: 'Onboarding',
    description: 'Welcome new customers, collect name, choose plan, send Razorpay link.',
    trigger_type: 'first_inbound_message',
    trigger_config: {},
    status: 'active',
    nodes: (() => {
      const start = uid(), askName = uid(), choosePlan = uid(),
        sendLink = uid(), waitPayment = uid(), endNode = uid()
      return {
        entry_node_id: start,
        nodes: {
          [start]: {
            key: start, type: 'start', 
            config: { next_node_key: askName }
          },
          [askName]: {
            key: askName, type: 'send_message',
            config: { 
              text: "Hi! Welcome to Aralya 🌸 I'm your flower delivery assistant.\n\nWhat's your name?",
              next_node_key: choosePlan
            }
          },
          [choosePlan]: {
            key: choosePlan, type: 'send_buttons',
            config: {
              text: 'Choose your subscription plan:',
              buttons: [
                { reply_id: 'plan_lotus',    title: '🌸 Lotus — ₹449/mo', next_node_key: sendLink },
                { reply_id: 'plan_marigold', title: '🌼 Marigold — ₹549/mo', next_node_key: sendLink },
                { reply_id: 'plan_premium',  title: '✨ Premium — ₹649/mo', next_node_key: sendLink },
              ],
            }
          },
          [sendLink]: {
            key: sendLink, type: 'send_message',
            config: { 
              text: 'Great choice! 🎉 Here is your secure payment link:\nhttps://rzp.io/l/aralya-{{vars.plan}}\n\nOnce paid, your flowers start tomorrow morning 6–7 AM.',
              next_node_key: waitPayment
            }
          },
          [waitPayment]: {
            key: waitPayment, type: 'end',
            config: { reason: 'awaiting_payment' }
          },
          [endNode]: {
            key: endNode, type: 'end',
            config: {}
          }
        }
      }
    })()
  },

  // ── 2. PAUSE / RESUME ────────────────────────────────────────────
  {
    name: 'Pause or Resume Subscription',
    description: 'Customer says "pause" or "resume" and the flow updates their subscription.',
    trigger_type: 'keyword',
    trigger_config: { keywords: ['pause', 'resume', 'stop', 'restart', 'hold'] },
    status: 'active',
    nodes: (() => {
      const start = uid(), detect = uid(),
        pauseMenu = uid(), resumeMsg = uid(), endNode = uid()
      return {
        entry_node_id: start,
        nodes: {
          [start]: {
            key: start, type: 'start', 
            config: { next_node_key: detect }
          },
          [detect]: {
            key: detect, type: 'send_buttons',
            config: {
              text: 'What would you like to do with your subscription?',
              buttons: [
                { reply_id: 'action_pause',  title: '⏸ Pause delivery', next_node_key: pauseMenu },
                { reply_id: 'action_resume', title: '▶️ Resume delivery', next_node_key: resumeMsg }
              ]
            }
          },
          [pauseMenu]: {
            key: pauseMenu, type: 'send_list',
            config: {
              button_label: 'Select duration',
              text: 'How long should we pause?',
              sections: [{
                title: 'Duration',
                rows: [
                  { reply_id: 'pause_1w',   title: '1 week', next_node_key: endNode },
                  { reply_id: 'pause_2w',   title: '2 weeks', next_node_key: endNode },
                  { reply_id: 'pause_date', title: 'Until I resume', next_node_key: endNode }
                ]
              }]
            }
          },
          [resumeMsg]: {
            key: resumeMsg, type: 'send_message',
            config: { 
              text: '✅ Your subscription is active again! Flowers resume tomorrow morning 6–7 AM. 🌸',
              next_node_key: endNode
            }
          },
          [endNode]: {
            key: endNode, type: 'end', config: {}
          }
        }
      }
    })()
  },

  // ── 3. CHURN PREVENTION ──────────────────────────────────────────
  {
    name: 'Churn Prevention',
    description: 'Re-engage customers who have been paused for more than 14 days.',
    trigger_type: 'manual',
    trigger_config: {},
    status: 'draft',
    nodes: (() => {
      const start = uid(), msg = uid(), menu = uid(), endNode = uid()
      return {
        entry_node_id: start,
        nodes: {
          [start]: { 
            key: start, type: 'start', 
            config: { next_node_key: msg } 
          },
          [msg]: {
            key: msg, type: 'send_message',
            config: { 
              text: "We miss you! 🌸 It's been a while since your last delivery. Everything okay?",
              next_node_key: menu
            }
          },
          [menu]: {
            key: menu, type: 'send_buttons',
            config: {
              text: 'How can we help?',
              buttons: [
                { reply_id: 'churn_quality', title: '😕 Quality issue', next_node_key: endNode },
                { reply_id: 'churn_price',   title: '💰 Price concern', next_node_key: endNode },
                { reply_id: 'churn_resume',  title: '✅ Ready to resume!', next_node_key: endNode }
              ]
            }
          },
          [endNode]: { key: endNode, type: 'end', config: {} }
        }
      }
    })()
  },

  // ── 4. VENDOR DAILY COORDINATION ─────────────────────────────────
  {
    name: 'Vendor Daily Coordination',
    description: 'Send vendor their daily order summary and wait for their confirmation.',
    trigger_type: 'manual',
    trigger_config: {},
    status: 'draft',
    nodes: (() => {
      const start = uid(), summary = uid(), confirm = uid(), endNode = uid()
      return {
        entry_node_id: start,
        nodes: {
          [start]: { 
            key: start, type: 'start', 
            config: { next_node_key: summary } 
          },
          [summary]: {
            key: summary, type: 'send_message',
            config: { 
              text: "🌸 Good evening! Here is your order brief for tomorrow ({{vars.date}}):\n\n📦 Total orders: {{vars.order_count}}\n🗺️ Zone: {{vars.zone}}\n\nPlease confirm you'll be ready by replying ✓",
              next_node_key: confirm
            }
          },
          [confirm]: {
            key: confirm, type: 'collect_input',
            config: { 
              var_key: 'vendor_confirm', 
              prompt_text: 'Reply ✓ to confirm or ✗ to flag an issue.',
              next_node_key: endNode
            }
          },
          [endNode]: { key: endNode, type: 'end', config: {} }
        }
      }
    })()
  },

  // ── 5. ISSUE REPORTING ───────────────────────────────────────────
  {
    name: 'Issue Reporting',
    description: 'Customer reports a delivery or quality issue. Creates a support ticket.',
    trigger_type: 'keyword',
    trigger_config: { keywords: ['issue', 'problem', 'complaint', 'wrong', 'late', 'missed', 'help'] },
    status: 'active',
    nodes: (() => {
      const start = uid(), ask = uid(), typeMenu = uid(), collect = uid(), endNode = uid()
      return {
        entry_node_id: start,
        nodes: {
          [start]: { 
            key: start, type: 'start', 
            config: { next_node_key: ask } 
          },
          [ask]: {
            key: ask, type: 'send_buttons',
            config: {
              text: 'Sorry to hear that! What kind of issue is this?',
              buttons: [
                { reply_id: 'issue_delivery', title: '🚚 Delivery issue', next_node_key: typeMenu },
                { reply_id: 'issue_quality',  title: '🌺 Quality issue', next_node_key: typeMenu },
                { reply_id: 'issue_payment',  title: '💳 Payment issue', next_node_key: typeMenu }
              ]
            }
          },
          [typeMenu]: {
            key: typeMenu, type: 'collect_input',
            config: { 
              var_key: 'issue_description', 
              prompt_text: 'Please describe the issue briefly:',
              next_node_key: collect
            }
          },
          [collect]: {
            key: collect, type: 'send_message',
            config: { 
              text: "✅ Thanks! We've logged your issue and our team will call you within 30 minutes.\n\nTicket reference: {{vars.support_ticket_id}}",
              next_node_key: endNode
            }
          },
          [endNode]: { key: endNode, type: 'end', config: {} }
        }
      }
    })()
  }
]

async function seedFlows() {
  console.log('🌸 Seeding Aralya flows...\n')

  for (const flowDef of flows) {
    const { nodes, ...meta } = flowDef

    // Check if a flow with this name already exists
    const { data: existing } = await supabase
      .from('flows')
      .select('id')
      .eq('account_id', ACCOUNT_ID)
      .eq('name', meta.name)
      .maybeSingle()

    if (existing) {
      console.log(`  ⏭  Skipping "${meta.name}" (already exists, id: ${existing.id})`)
      continue
    }

    const { data: flow, error: flowError } = await supabase
      .from('flows')
      .insert({
        account_id: ACCOUNT_ID,
        user_id: USER_ID,
        name: meta.name,
        description: meta.description,
        trigger_type: meta.trigger_type,
        trigger_config: meta.trigger_config,
        status: meta.status,
      })
      .select('id')
      .single()

    if (flowError || !flow) {
      console.error(`  ❌ Failed to insert flow "${meta.name}":`, flowError?.message)
      continue
    }

    // Insert nodes
    const nodeRows = Object.values(nodes.nodes).map((n) => {
      const nodeDef = n as { key: string; type: string; config: Record<string, unknown> }
      return {
        flow_id: flow.id,
        node_key: nodeDef.key,
        node_type: nodeDef.type,
        config: nodeDef.config,
        position_x: 0,
        position_y: 0,
      }
    })

    const { error: nodesError } = await supabase.from('flow_nodes').insert(nodeRows)
    if (nodesError) {
      console.error(`  ❌ Failed to insert nodes for "${meta.name}":`, nodesError.message)
      continue
    }

    // Set entry_node_id on flow
    await supabase
      .from('flows')
      .update({ entry_node_id: nodes.entry_node_id })
      .eq('id', flow.id)

    console.log(`  ✅ Created flow "${meta.name}" (id: ${flow.id})`)
  }

  console.log('\n✅ Flow seeding complete!')
}

seedFlows().catch((err) => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
