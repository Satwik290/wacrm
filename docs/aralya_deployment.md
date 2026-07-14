# Aralya — Deployment Checklist & Operations Guide

## Environment Variables (add to `.env.local` and Hostinger)

```env
# Existing wacrm vars
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Razorpay
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...   # from Razorpay dashboard → Webhooks → Signing Secret

# Aralya
ARALYA_ACCOUNT_ID=<uuid from accounts table>
ARALYA_ADMIN_USER_ID=<uuid from auth.users>
ARALYA_API_KEY=<random-secret-for-ops-dashboard>
CRON_SECRET=<random-secret-for-cron-endpoint>
```

---

## Week 1: Database + Webhook

### 1. Run migrations
```bash
# Apply all 3 new migrations in Supabase dashboard → SQL Editor
# or via Supabase CLI:
supabase db push
```

Migrations added:
- `039_aralya_subscriptions.sql` — subscriptions, vendors
- `040_aralya_orders.sql` — daily_orders, payment_logs, refund_logs, vendor_payments
- `041_aralya_support.sql` — customer_feedback, support_tickets

### 2. Verify tables
```bash
npx ts-node --project tsconfig.scripts.json scripts/test_db.ts
```
Expected: all ✅

### 3. Test Razorpay webhook locally
```bash
# Start dev server in one terminal
npm run dev

# In another terminal
npx ts-node --project tsconfig.scripts.json scripts/mock_razorpay.ts +919999999999 lotus
```
Expected: `200 {"status": "processed"}`

### 4. Register webhook in Razorpay dashboard
- URL: `https://your-domain.com/api/webhooks/razorpay`
- Events: `payment.authorized`, `payment.captured`
- Copy the "Signing Secret" → set as `RAZORPAY_WEBHOOK_SECRET`

---

## Week 2–3: Seed Flows & Automations

### 5. Create account + set env vars
Find your account UUID:
```sql
SELECT id FROM accounts LIMIT 1;
```

### 6. Seed flows
```bash
npx ts-node --project tsconfig.scripts.json scripts/seed_aralya_flows.ts
```

### 7. Seed automations
```bash
npx ts-node --project tsconfig.scripts.json scripts/seed_aralya_automations.ts
```

---

## Week 4: End-to-End Testing

### 8. Test daily orders cron
```bash
curl -X GET "http://localhost:3000/api/cron/automations?trigger=daily_orders&test=true" \
  -H "x-api-key: $ARALYA_API_KEY"
```

### 9. Test delivery reminders
```bash
curl -X GET "http://localhost:3000/api/cron/automations?trigger=delivery_reminders&test=true" \
  -H "x-api-key: $ARALYA_API_KEY"
```

### 10. Test churn detection
```bash
curl -X GET "http://localhost:3000/api/cron/automations?trigger=churn_detection&test=true" \
  -H "x-api-key: $ARALYA_API_KEY"
```

### 11. Test dashboard API
```bash
curl http://localhost:3000/api/v1/dashboard \
  -H "x-api-key: $ARALYA_API_KEY"
```

---

## Week 5: Production Deployment on Hostinger

### 12. Build + start
```bash
npm run build
npm run start
# or use PM2:
pm2 start npm --name wacrm -- run start
```

### 13. Set up Hostinger Cron Jobs
In Hostinger control panel → Cron Jobs, add:

| Schedule (UTC) | Trigger | IST time |
|----------|---------|---------|
| `30 17 * * *` | `daily_orders` | 11:00 PM IST |
| `30 0 * * *` | `delivery_reminders` | 6:00 AM IST |
| `30 4 28 * *` | `monthly_renewal` | 10:00 AM IST on 28th |
| `0 */6 * * *` | `churn_detection` | every 6 hours |

Example cron command:
```bash
curl -X POST "https://your-domain.com/api/cron/automations?trigger=daily_orders" \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

> ⚠️ **IST offset**: Hostinger cron runs in UTC. IST = UTC+5:30.

---

## Daily Monitoring Checklist

```
□ Check /api/v1/dashboard — active subscribers, today's orders
□ Review payment_logs — any failed signatures?
□ Check daily_orders — all delivered by 9 AM?
□ Review open support_tickets
□ Check automation_logs — any failures?
```

---

## Rollback Procedures

### Disable an automation (no deletion needed)
```sql
UPDATE automations SET is_active = FALSE WHERE name = 'Daily Orders → Vendor Briefing';
```

### Revert a migration (additive-only, safe to drop)
```sql
DROP TABLE IF EXISTS support_tickets CASCADE;
DROP TABLE IF EXISTS customer_feedback CASCADE;
DROP TABLE IF EXISTS refund_logs CASCADE;
DROP TABLE IF EXISTS vendor_payments CASCADE;
DROP TABLE IF EXISTS daily_orders CASCADE;
DROP TABLE IF EXISTS payment_logs CASCADE;
DROP TABLE IF EXISTS subscription_history CASCADE;
DROP TABLE IF EXISTS vendors CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
```

### Emergency: stop all crons
Remove the Hostinger cron jobs. The `node-schedule` in `scheduler.ts` will not re-register after app restart if you comment out the `initAralyaScheduler()` call.

---

## Schema ERD (Text)

```
accounts ──< subscriptions >── contacts
              │
              ├── subscription_history
              │
              └── daily_orders >── vendors
                                   └── vendor_payments

payment_logs >── contacts
refund_logs >── payment_logs
customer_feedback >── contacts
support_tickets >── contacts
```
