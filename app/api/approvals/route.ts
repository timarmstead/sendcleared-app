import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

function generateToken(length = 24) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < length; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}

const FREE_TIER_MONTHLY_LIMIT = 3

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { campaign_id } = await request.json()
  if (!campaign_id) {
    return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })
  }

  // Verify the campaign belongs to a client owned by this user
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, client_id, clients!inner(user_id)')
    .eq('id', campaign_id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // @ts-expect-error - joined relation shape
  if (campaign.clients.user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Reuse an existing, still-valid, pending approval instead of creating duplicates
  const { data: existing } = await supabase
    .from('approvals')
    .select('*')
    .eq('campaign_id', campaign_id)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ token: existing.token })
  }

  // Free tier: enforce monthly limit on NEW link generation
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', user.id)
    .maybeSingle()

  const isPaid = subscription?.status === 'active' && subscription.plan !== 'free'

  if (!isPaid) {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('approvals')
      .select('id, campaigns!inner(client_id, clients!inner(user_id))', { count: 'exact', head: true })
      .eq('campaigns.clients.user_id', user.id)
      .gte('created_at', startOfMonth.toISOString())

    if ((count ?? 0) >= FREE_TIER_MONTHLY_LIMIT) {
      return NextResponse.json({
        error: `You've used your ${FREE_TIER_MONTHLY_LIMIT} free approval links this month. Upgrade for unlimited links.`,
        limit_reached: true,
      }, { status: 403 })
    }
  }

  const token = generateToken()
  const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: approval, error: insertError } = await supabase
    .from('approvals')
    .insert({
      campaign_id,
      token,
      status: 'pending',
      expires_at,
    })
    .select()
    .single()

  if (insertError || !approval) {
    return NextResponse.json({ error: 'Failed to create approval link' }, { status: 500 })
  }

  return NextResponse.json({ token: approval.token })
}