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

// GET /api/v1/customers
// Query params: status (active|paused|cancelled), plan, page (1-based), limit (default 50)
export async function GET(request: Request) {
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.ARALYA_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const plan = searchParams.get('plan')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))
  const offset = (page - 1) * limit

  const accountId = process.env.ARALYA_ACCOUNT_ID ?? ''
  const db = supabaseAdmin()

  let query = db
    .from('subscriptions')
    .select('id, customer_phone, plan, status, next_delivery_date, paused_since, created_at', {
      count: 'exact',
    })
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)
  if (plan) query = query.eq('plan', plan)

  const { data, count, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: data ?? [],
    pagination: {
      page,
      limit,
      total: count ?? 0,
      pages: Math.ceil((count ?? 0) / limit),
    },
  })
}

// POST /api/v1/subscriptions/[phone]/pause — inline for simplicity
// Dedicated pause endpoint is at /api/v1/subscriptions/pause/route.ts
