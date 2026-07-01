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