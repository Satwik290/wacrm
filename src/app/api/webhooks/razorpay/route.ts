import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'

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
 * Verify Razorpay webhook signature.
 * Razorpay signs `webhook_id + "|" + timestamp` using the webhook secret,
 * but when using their webhook v2 they send body HMAC with the secret.
 * We support both: if X-Razorpay-Signature header is present, validate body HMAC.
 */
function verifyRazorpaySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[razorpay] RAZORPAY_WEBHOOK_SECRET not set — skipping signature validation')
    return process.env.NODE_ENV === 'development'
  }
  if (!signature) return false
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

interface RazorpayPaymentEntity {
  id: string
  amount: number
  currency: string
  status: string
  customer_id?: string
  notes?: {
    customer_phone?: string
    plan?: string
    [key: string]: string | undefined
  }
  contact?: string // fallback: phone from contact field
}

interface RazorpayWebhookBody {
  id: string
  entity: string
  event: string
  contains?: string[]
  payload?: {
    payment?: {
      entity?: RazorpayPaymentEntity
    }
    [key: string]: unknown
  }
}

// POST /api/webhooks/razorpay
export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-razorpay-signature')

  let body: RazorpayWebhookBody
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const signatureValid = verifyRazorpaySignature(rawBody, signature)

  // Log EVERY webhook event for audit — even failed signature ones.
  // We'll still reject execution below if invalid.
  const db = supabaseAdmin()

  const paymentEntity = body.payload?.payment?.entity
  const customerPhone = normalizePhone(
    paymentEntity?.notes?.customer_phone ?? paymentEntity?.contact ?? ''
  )
  const plan = paymentEntity?.notes?.plan ?? null
  const razorpayId = paymentEntity?.id ?? body.id
  const amount = paymentEntity?.amount ?? 0

  // Resolve account_id: use ARALYA_ACCOUNT_ID env var set during deployment.
  // Phase 0 is single-tenant so one account.
  const accountId = process.env.ARALYA_ACCOUNT_ID ?? ''

  if (accountId) {
    // Upsert payment log (idempotent on razorpay_id)
    const { error: logError } = await db.from('payment_logs').upsert(
      {
        account_id: accountId,
        customer_phone: customerPhone || 'unknown',
        razorpay_id: razorpayId,
        razorpay_event: body.event,
        amount,
        currency: paymentEntity?.currency ?? 'INR',
        plan,
        status: paymentEntity?.status === 'captured' ? 'captured'
              : paymentEntity?.status === 'failed'   ? 'failed'
              : 'pending',
        raw_payload: body as unknown as Record<string, unknown>,
        signature_valid: signatureValid,
      },
      { onConflict: 'razorpay_id' }
    )
    if (logError) {
      console.error('[razorpay] failed to log payment:', logError.message)
    }
  }

  if (!signatureValid) {
    console.warn('[razorpay] rejected webhook — invalid signature', { event: body.event, razorpayId })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Only act on final payment events
  const ACTIONABLE_EVENTS = new Set([
    'payment.captured',
    'payment.authorized', // authorize + capture mode
  ])

  if (!ACTIONABLE_EVENTS.has(body.event)) {
    // Accept but no-op (status updates, failures, etc.)
    return NextResponse.json({ status: 'acknowledged' })
  }

  if (!customerPhone || !accountId) {
    console.warn('[razorpay] missing customer_phone or account_id — cannot trigger automation', {
      customerPhone,
      accountId,
      notes: paymentEntity?.notes,
    })
    return NextResponse.json({ status: 'no_contact' })
  }

  // Resolve contact_id from phone
  const { data: contact } = await db
    .from('contacts')
    .select('id')
    .eq('account_id', accountId)
    .eq('phone', customerPhone)
    .maybeSingle()

  // Fire "payment_received" automation trigger
  // This is fire-and-forget — webhook must ack within 5s to Razorpay
  runAutomationsForTrigger({
    accountId,
    triggerType: 'payment_received' as Parameters<typeof runAutomationsForTrigger>[0]['triggerType'],
    contactId: contact?.id,
    context: {
      message_text: '',
      vars: {
        razorpay_id: razorpayId,
        amount_paise: String(amount),
        amount_inr: String(amount / 100),
        plan: plan ?? '',
        customer_phone: customerPhone,
      },
      meta_message_id: razorpayId, // idempotency key
    },
  }).catch((err) => console.error('[razorpay] automation dispatch failed:', err))

  return NextResponse.json({ status: 'processed' })
}
