/**
 * scripts/mock_razorpay.ts
 *
 * Sends a fake Razorpay payment webhook to your local server.
 * Run: npx ts-node --project tsconfig.scripts.json scripts/mock_razorpay.ts
 *
 * Requires env: RAZORPAY_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL (optional, defaults to localhost:3000)
 */

import crypto from 'crypto'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? 'test_secret'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const CUSTOMER_PHONE = process.argv[2] ?? '+919999999999'
const PLAN = process.argv[3] ?? 'lotus'
const PLAN_AMOUNTS: Record<string, number> = { lotus: 44900, marigold: 54900, premium: 64900 }

function generateSignature(body: string): string {
  return crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex')
}

async function main() {
  const paymentId = `pay_test_${Date.now()}`

  const payload = {
    id: `evt_test_${Date.now()}`,
    entity: 'event',
    event: 'payment.captured',
    contains: ['payment'],
    payload: {
      payment: {
        entity: {
          id: paymentId,
          entity: 'payment',
          amount: PLAN_AMOUNTS[PLAN] ?? 44900,
          currency: 'INR',
          status: 'captured',
          customer_id: `cust_test_${Date.now()}`,
          contact: CUSTOMER_PHONE,
          notes: {
            customer_phone: CUSTOMER_PHONE,
            plan: PLAN,
          },
        },
      },
    },
  }

  const body = JSON.stringify(payload)
  const signature = generateSignature(body)

  console.log(`\n🧪 Mock Razorpay Webhook`)
  console.log(`   URL:     ${APP_URL}/api/webhooks/razorpay`)
  console.log(`   Event:   payment.captured`)
  console.log(`   Phone:   ${CUSTOMER_PHONE}`)
  console.log(`   Plan:    ${PLAN} (₹${(PLAN_AMOUNTS[PLAN] ?? 44900) / 100})`)
  console.log(`   Secret:  ${WEBHOOK_SECRET.slice(0, 6)}***`)
  console.log(`   Sig:     ${signature.slice(0, 20)}...`)
  console.log()

  const response = await fetch(`${APP_URL}/api/webhooks/razorpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
    },
    body,
  })

  const json = await response.json()
  console.log(`   Status:  ${response.status}`)
  console.log(`   Result:  ${JSON.stringify(json, null, 2)}`)

  if (response.ok) {
    console.log('\n✅ Webhook accepted! Check automation logs for trigger.')
  } else {
    console.error('\n❌ Webhook rejected!')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
