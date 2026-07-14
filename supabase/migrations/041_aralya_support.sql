-- ============================================================
-- 041_aralya_support.sql
-- Aralya Phase 0: customer_feedback + support_tickets tables
-- ============================================================

-- ============================================================
-- CUSTOMER_FEEDBACK
-- Ratings and messages from customers.
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_feedback (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  contact_id     UUID REFERENCES contacts(id) ON DELETE SET NULL,
  rating         INTEGER CHECK (rating BETWEEN 1 AND 5),
  message        TEXT,
  resolved       BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_account
  ON customer_feedback(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_phone
  ON customer_feedback(customer_phone);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_unresolved
  ON customer_feedback(account_id) WHERE resolved = FALSE;

-- ============================================================
-- SUPPORT_TICKETS
-- Created via the Issue Reporting flow. Routed to ops.
-- ============================================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  contact_id     UUID REFERENCES contacts(id) ON DELETE SET NULL,
  type           TEXT NOT NULL DEFAULT 'general'
                   CHECK (type IN ('delivery_issue', 'quality_issue', 'payment_issue',
                                   'pause_request', 'cancellation', 'general')),
  priority       TEXT NOT NULL DEFAULT 'medium'
                   CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  description    TEXT,
  resolution     TEXT,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_account
  ON support_tickets(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_open
  ON support_tickets(account_id, status) WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_support_tickets_phone
  ON support_tickets(customer_phone);

DROP TRIGGER IF EXISTS set_updated_at ON support_tickets;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
