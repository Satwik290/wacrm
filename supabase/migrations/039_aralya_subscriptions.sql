-- ============================================================
-- 039_aralya_subscriptions.sql
-- Aralya Phase 0: subscriptions + vendors tables
-- Single-tenant. RLS disabled for Phase 0 simplicity.
-- ============================================================

-- ============================================================
-- SUBSCRIPTIONS
-- Tracks each active/paused/cancelled flower subscription.
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id         UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  customer_phone     TEXT NOT NULL,
  contact_id         UUID REFERENCES contacts(id) ON DELETE SET NULL,
  plan               TEXT NOT NULL CHECK (plan IN ('lotus', 'marigold', 'premium')),
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'paused', 'cancelled', 'pending_payment')),
  next_delivery_date DATE,
  paused_since       TIMESTAMPTZ,
  paused_until       TIMESTAMPTZ,
  razorpay_customer_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_account
  ON subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_phone
  ON subscriptions(customer_phone);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active
  ON subscriptions(account_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_contact
  ON subscriptions(contact_id) WHERE contact_id IS NOT NULL;

-- Auto-update updated_at
DROP TRIGGER IF EXISTS set_updated_at ON subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SUBSCRIPTION_HISTORY
-- Audit trail for every status change on a subscription.
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  action          TEXT NOT NULL, -- 'created','paused','resumed','cancelled','plan_changed'
  reason          TEXT,
  changed_by      TEXT DEFAULT 'system', -- 'customer', 'admin', 'system'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_history_sub
  ON subscription_history(subscription_id, created_at DESC);

-- ============================================================
-- VENDORS
-- Flower vendors assigned to zones. Each vendor services
-- a group of active subscribers.
-- ============================================================
CREATE TABLE IF NOT EXISTS vendors (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  phone            TEXT NOT NULL,
  zone             TEXT NOT NULL, -- e.g. 'bhubaneswar-1', 'bhubaneswar-2'
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'inactive', 'suspended')),
  subscriber_count INTEGER NOT NULL DEFAULT 0,
  earnings_month   NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_account
  ON vendors(account_id);
CREATE INDEX IF NOT EXISTS idx_vendors_zone
  ON vendors(account_id, zone);

DROP TRIGGER IF EXISTS set_updated_at ON vendors;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
