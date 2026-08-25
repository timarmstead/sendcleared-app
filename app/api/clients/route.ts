import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const CLIENT_LIMITS: Record<string, number | null> = {
  free: null,
  freelancer: 5,
  agency: 20,
  studio: 50,
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  freelancer: 'Freelancer',
  agency: 'Agency',
  studio: 'Studio',
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { name } = await request.json()
  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
  }

  // Every user belongs to exactly one team (their own personal team, or one they've joined)
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'No team found for this account' }, { status: 500 })
  }

  const teamId = membership.team_id

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('team_id', teamId)
    .maybeSingle()

  const plan = subscription?.status === 'active' ? subscription.plan : 'free'
  const limit = CLIENT_LIMITS[plan] ?? null

  if (limit !== null) {
    const { count } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .is('archived_at', null)

    if ((count ?? 0) >= limit) {
      const planLabel = PLAN_LABELS[plan] || plan

      const message = plan === 'studio'
        ? `You've reached the ${limit}-client limit on Studio. Archive an existing client to add a new one, or contact support if you need a higher limit.`
        : `Your ${planLabel} plan is limited to ${limit} active clients. Archive an existing client to add a new one, or upgrade for more.`

      return NextResponse.json({
        error: message,
        limit_reached: true,
        can_upgrade: plan !== 'studio',
      }, { status: 403 })
    }
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const randomToken = Math.random().toString(36).substring(2, 6)
  const inboxAddress = `${slug}-${randomToken}@check.sendcleared.com`

  const { data: client, error } = await supabase
    .from('clients')
    .insert({
      user_id: user.id, // who created it — kept for reference/audit purposes
      team_id: teamId,   // actual ownership, used for access and limit checks
      name: name.trim(),
      inbox_address: inboxAddress,
    })
    .select()
    .single()

  if (error || !client) {
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }

  return NextResponse.json({ client })
}