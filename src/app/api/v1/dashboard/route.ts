import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

// GET /api/v1/dashboard
export async function GET(request: Request) {
  // Auth: require X-Api-Key header
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.ARALYA_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accountId = process.env.ARALYA_ACCOUNT_ID ?? ''
  const db = supabaseAdmin()

  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = new Date().toISOString().slice(0, 7)

  const [
    { count: activeSubscriptions },
    { count: pausedSubscriptions },
    { count: todayOrders },
    { count: todayDelivered },
    { count: openTickets },
    { data: revenueData },
  ] = await Promise.all([
    db.from('subscriptions').select('id', { count: 'exact', head: true })
      .eq('account_id', accountId).eq('status', 'active'),
    db.from('subscriptions').select('id', { count: 'exact', head: true })
      .eq('account_id', accountId).eq('status', 'paused'),
    db.from('daily_orders').select('id', { count: 'exact', head: true })
      .eq('account_id', accountId).eq('date', today),
    db.from('daily_orders').select('id', { count: 'exact', head: true })
      .eq('account_id', accountId).eq('date', today).eq('status', 'delivered'),
    db.from('support_tickets').select('id', { count: 'exact', head: true })
      .eq('account_id', accountId).in('status', ['open', 'in_progress']),
    db.from('payment_logs').select('amount')
      .eq('account_id', accountId).eq('status', 'captured')
      .gte('created_at', `${thisMonth}-01`),
  ])

  const monthlyRevenuePaise = (revenueData ?? []).reduce(
    (sum: number, row: { amount: number }) => sum + row.amount, 0
  )

  return NextResponse.json({
    subscriptions: {
      active: activeSubscriptions ?? 0,
      paused: pausedSubscriptions ?? 0,
      total: (activeSubscriptions ?? 0) + (pausedSubscriptions ?? 0),
    },
    today: {
      orders: todayOrders ?? 0,
      delivered: todayDelivered ?? 0,
      pending: (todayOrders ?? 0) - (todayDelivered ?? 0),
    },
    support: {
      open_tickets: openTickets ?? 0,
    },
    revenue: {
      month: thisMonth,
      amount_inr: monthlyRevenuePaise / 100,
    },
  })
}
