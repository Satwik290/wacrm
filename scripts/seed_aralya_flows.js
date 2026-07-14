"use strict";
/**
 * scripts/seed_aralya_flows.ts
 *
 * Seeds the 5 Aralya customer-facing flows into wacrm.
 * Run: npx ts-node --project tsconfig.scripts.json scripts/seed_aralya_flows.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARALYA_ACCOUNT_ID
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const crypto_1 = __importDefault(require("crypto"));
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ACCOUNT_ID = process.env.ARALYA_ACCOUNT_ID;
const USER_ID = process.env.ARALYA_ADMIN_USER_ID; // admin user_id
function uid() {
    return crypto_1.default.randomUUID();
}
// ─── Flow definitions ─────────────────────────────────────────────────────────
const flows = [
    // ── 1. ONBOARDING ───────────────────────────────────────────────
    {
        name: 'Onboarding',
        description: 'Welcome new customers, collect name, choose plan, send Razorpay link.',
        trigger_type: 'first_inbound_message',
        trigger_config: {},
        is_active: true,
        nodes: (() => {
            const start = uid(), askName = uid(), choosePlan = uid(), sendLink = uid(), waitPayment = uid(), endNode = uid();
            return {
                entry_node_id: start,
                nodes: {
                    [start]: {
                        key: start, type: 'start', config: {},
                        next_node_key: askName,
                    },
                    [askName]: {
                        key: askName, type: 'send_message',
                        config: { text: 'Hi! Welcome to Aralya 🌸 I\'m your flower delivery assistant.\n\nWhat\'s your name?' },
                        next_node_key: choosePlan,
                    },
                    [choosePlan]: {
                        key: choosePlan, type: 'send_buttons',
                        config: {
                            body: 'Choose your subscription plan, {{1}}:',
                            body_vars: ['{{contact.name}}'],
                            buttons: [
                                { id: 'plan_lotus', title: '🌸 Lotus — ₹449/mo' },
                                { id: 'plan_marigold', title: '🌼 Marigold — ₹549/mo' },
                                { id: 'plan_premium', title: '✨ Premium — ₹649/mo' },
                            ],
                        },
                        next_node_key: sendLink,
                    },
                    [sendLink]: {
                        key: sendLink, type: 'send_message',
                        config: { text: 'Great choice! 🎉 Here is your secure payment link:\nhttps://rzp.io/l/aralya-{{vars.plan}}\n\nOnce paid, your flowers start tomorrow morning 6–7 AM.' },
                        next_node_key: waitPayment,
                    },
                    [waitPayment]: {
                        key: waitPayment, type: 'end',
                        config: { reason: 'awaiting_payment' },
                    },
                    [endNode]: {
                        key: endNode, type: 'end',
                        config: {},
                    },
                },
            };
        })(),
    },
    // ── 2. PAUSE / RESUME ────────────────────────────────────────────
    {
        name: 'Pause or Resume Subscription',
        description: 'Customer says "pause" or "resume" and the flow updates their subscription.',
        trigger_type: 'keyword_match',
        trigger_config: { keywords: ['pause', 'resume', 'stop', 'restart', 'hold'] },
        is_active: true,
        nodes: (() => {
            const start = uid(), detect = uid(), pauseMenu = uid(), resumeMsg = uid(), endNode = uid();
            return {
                entry_node_id: start,
                nodes: {
                    [start]: {
                        key: start, type: 'start', config: {},
                        next_node_key: detect,
                    },
                    [detect]: {
                        key: detect, type: 'send_buttons',
                        config: {
                            body: 'What would you like to do with your subscription?',
                            buttons: [
                                { id: 'action_pause', title: '⏸ Pause delivery' },
                                { id: 'action_resume', title: '▶️ Resume delivery' },
                            ],
                        },
                        next_node_key: pauseMenu,
                    },
                    [pauseMenu]: {
                        key: pauseMenu, type: 'send_list',
                        config: {
                            button_text: 'Select pause duration',
                            body: 'How long should we pause?',
                            sections: [{
                                    title: 'Duration',
                                    rows: [
                                        { id: 'pause_1w', title: '1 week' },
                                        { id: 'pause_2w', title: '2 weeks' },
                                        { id: 'pause_date', title: 'Until I say resume' },
                                    ],
                                }],
                        },
                        next_node_key: endNode,
                    },
                    [resumeMsg]: {
                        key: resumeMsg, type: 'send_message',
                        config: { text: '✅ Your subscription is active again! Flowers resume tomorrow morning 6–7 AM. 🌸' },
                        next_node_key: endNode,
                    },
                    [endNode]: {
                        key: endNode, type: 'end', config: {},
                    },
                },
            };
        })(),
    },
    // ── 3. CHURN PREVENTION ──────────────────────────────────────────
    {
        name: 'Churn Prevention',
        description: 'Re-engage customers who have been paused for more than 14 days.',
        trigger_type: 'new_message_received',
        trigger_config: {},
        is_active: false, // Triggered programmatically by churn_detection cron
        nodes: (() => {
            const start = uid(), msg = uid(), menu = uid(), endNode = uid();
            return {
                entry_node_id: start,
                nodes: {
                    [start]: { key: start, type: 'start', config: {}, next_node_key: msg },
                    [msg]: {
                        key: msg, type: 'send_message',
                        config: { text: 'We miss you! 🌸 It\'s been a while since your last delivery. Everything okay?' },
                        next_node_key: menu,
                    },
                    [menu]: {
                        key: menu, type: 'send_buttons',
                        config: {
                            body: 'How can we help?',
                            buttons: [
                                { id: 'churn_quality', title: '😕 Quality issue' },
                                { id: 'churn_price', title: '💰 Price concern' },
                                { id: 'churn_resume', title: '✅ Ready to resume!' },
                            ],
                        },
                        next_node_key: endNode,
                    },
                    [endNode]: { key: endNode, type: 'end', config: {} },
                },
            };
        })(),
    },
    // ── 4. VENDOR COORDINATION ───────────────────────────────────────
    {
        name: 'Vendor Daily Coordination',
        description: 'Send vendor their daily order summary and wait for their confirmation.',
        trigger_type: 'new_message_received',
        trigger_config: {},
        is_active: false, // Triggered by daily_orders cron
        nodes: (() => {
            const start = uid(), summary = uid(), confirm = uid(), endNode = uid();
            return {
                entry_node_id: start,
                nodes: {
                    [start]: { key: start, type: 'start', config: {}, next_node_key: summary },
                    [summary]: {
                        key: summary, type: 'send_message',
                        config: { text: '🌸 Good evening! Here is your order brief for tomorrow ({{vars.date}}):\n\n📦 Total orders: {{vars.order_count}}\n🗺️ Zone: {{vars.zone}}\n\nPlease confirm you\'re ready by replying ✓' },
                        next_node_key: confirm,
                    },
                    [confirm]: {
                        key: confirm, type: 'collect_input',
                        config: { var_key: 'vendor_confirm', prompt: 'Reply ✓ to confirm or ✗ to flag an issue.' },
                        next_node_key: endNode,
                    },
                    [endNode]: { key: endNode, type: 'end', config: {} },
                },
            };
        })(),
    },
    // ── 5. ISSUE REPORTING ───────────────────────────────────────────
    {
        name: 'Issue Reporting',
        description: 'Customer reports a delivery or quality issue. Creates a support ticket.',
        trigger_type: 'keyword_match',
        trigger_config: { keywords: ['issue', 'problem', 'complaint', 'wrong', 'late', 'missed', 'help'] },
        is_active: true,
        nodes: (() => {
            const start = uid(), ask = uid(), typeMenu = uid(), collect = uid(), endNode = uid();
            return {
                entry_node_id: start,
                nodes: {
                    [start]: { key: start, type: 'start', config: {}, next_node_key: ask },
                    [ask]: {
                        key: ask, type: 'send_buttons',
                        config: {
                            body: 'Sorry to hear that! What kind of issue is this?',
                            buttons: [
                                { id: 'issue_delivery', title: '🚚 Delivery issue' },
                                { id: 'issue_quality', title: '🌺 Quality issue' },
                                { id: 'issue_payment', title: '💳 Payment issue' },
                            ],
                        },
                        next_node_key: typeMenu,
                    },
                    [typeMenu]: {
                        key: typeMenu, type: 'collect_input',
                        config: { var_key: 'issue_description', prompt: 'Please describe the issue briefly:' },
                        next_node_key: collect,
                    },
                    [collect]: {
                        key: collect, type: 'send_message',
                        config: { text: '✅ Thanks! We\'ve logged your issue and our team will call you within 30 minutes.\n\nTicket reference: {{vars.support_ticket_id}}' },
                        next_node_key: endNode,
                    },
                    [endNode]: { key: endNode, type: 'end', config: {} },
                },
            };
        })(),
    },
];
async function seedFlows() {
    console.log('🌸 Seeding Aralya flows...\n');
    for (const flowDef of flows) {
        const { nodes, ...meta } = flowDef;
        // Check if a flow with this name already exists
        const { data: existing } = await supabase
            .from('flows')
            .select('id')
            .eq('account_id', ACCOUNT_ID)
            .eq('name', meta.name)
            .maybeSingle();
        if (existing) {
            console.log(`  ⏭  Skipping "${meta.name}" (already exists, id: ${existing.id})`);
            continue;
        }
        const { data: flow, error: flowError } = await supabase
            .from('flows')
            .insert({
            account_id: ACCOUNT_ID,
            user_id: USER_ID,
            ...meta,
        })
            .select('id')
            .single();
        if (flowError || !flow) {
            console.error(`  ❌ Failed to insert flow "${meta.name}":`, flowError?.message);
            continue;
        }
        // Insert nodes
        const nodeRows = Object.values(nodes.nodes).map((n) => ({
            flow_id: flow.id,
            key: n.key,
            node_type: n.type,
            config: n.config,
            next_node_key: n.next_node_key ?? null,
        }));
        const { error: nodesError } = await supabase.from('flow_nodes').insert(nodeRows);
        if (nodesError) {
            console.error(`  ❌ Failed to insert nodes for "${meta.name}":`, nodesError.message);
            continue;
        }
        // Set entry_node_id on flow
        await supabase
            .from('flows')
            .update({ entry_node_id: nodes.entry_node_id })
            .eq('id', flow.id);
        console.log(`  ✅ Created flow "${meta.name}" (id: ${flow.id})`);
    }
    console.log('\n✅ Flow seeding complete!');
}
seedFlows().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
});
