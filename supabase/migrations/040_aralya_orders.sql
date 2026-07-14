-- ============================================================
-- 040_aralya_orders.sql
-- Aralya Phase 0: daily_orders + payment_logs tables
-- ============================================================

-- ============================================================
-- DAILY_ORDERS
-- One row per (date, subscription). Generated each night
-- by the 10:30 PM cron. Vendor confirms or marks failed.
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  vendor_id       UUID REFERENCES vendors(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'delivered', 'failed', 'skipped')),
  delivered_at    TIMESTAMPTZ,
  proof_url       TEXT,  -- optional photo proof
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_orders_uniq
  ON daily_orders(date, subscription_id);

CREATE INDEX IF NOT EXISTS idx_daily_orders_account_date
  ON daily_orders(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_orders_vendor_date
  ON daily_orders(vendor_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_orders_status
  ON daily_orders(status) WHERE status IN ('pending', 'confirmed');

DROP TRIGGER IF EXISTS set_updated_at ON daily_orders;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON daily_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PAYMENT_LOGS
-- Every Razorpay event recorded here for audit + reconciliation.
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_logs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  contact_id     UUID REFERENCES contacts(id) ON DELETE SET NULL,
  razorpay_id    TEXT NOT NULL,        -- payment_id or order_id
  razorpay_event TEXT NOT NULL,        -- 'payment.authorized', 'payment.captured', etc.
  amount         INTEGER NOT NULL,     -- in paise
  currency       TEXT NOT NULL DEFAULT 'INR',
  plan           TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'captured', 'failed', 'refunded')),
  raw_payload    JSONB NOT NULL DEFAULT '{}',
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_account
  ON payment_logs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_logs_phone
  ON payment_logs(customer_phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_logs_razorpay
  ON payment_logs(razorpay_id);

-- ============================================================
-- REFUND_LOGS
-- Tracks any refunds issued to customers.
-- ============================================================
CREATE TABLE IF NOT EXISTS refund_logs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  payment_log_id UUID REFERENCES payment_logs(id) ON DELETE SET NULL,
  razorpay_refund_id TEXT,
  amount         INTEGER NOT NULL, -- in paise
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processed', 'failed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_logs_account
  ON refund_logs(account_id, created_at DESC);

-- ============================================================
-- VENDOR_PAYMENTS
-- Monthly payment records for each vendor.
-- ============================================================
CREATE TABLE IF NOT EXISTS vendor_payments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vendor_id      UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  month          TEXT NOT NULL, -- 'YYYY-MM'
  deliveries     INTEGER NOT NULL DEFAULT 0,
  amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending'
                   CHECK (payment_status IN ('pending', 'paid', 'disputed')),
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_payments_uniq
  ON vendor_payments(vendor_id, month);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_account
  ON vendor_payments(account_id);
