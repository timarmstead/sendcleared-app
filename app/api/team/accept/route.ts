import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const SEAT_LIMITS: Record<string, number> = {
  free: 1,
  freelancer: 1,
  agency: 3,
  studio: 10,
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { token } = await request.json()
  if (!token) {
    return NextResponse.json({ error: 'Missing invite token' }, { status: 400 })
  }

  const { data: invite } = await supabaseAdmin
    .from('team_invites')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ error: 'This invite is not valid.' }, { status: 404 })
  }

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'This invite has already been used or revoked.' }, { status: 410 })
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired. Ask for a new one.' }, { status: 410 })
  }

  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.json({
      error: `This invite was sent to ${invite.email}. Please log in with that email address.`,
    }, { status: 403 })
  }

  // Re-check seat limit at accept time too, in case seats filled up since the invite was sent
  const { data: subscription } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, status')
    .eq('team_id', invite.team_id)
    .maybeSingle()

  const plan = subscription?.status === 'active' ? subscription.plan : 'free'
  const seatLimit = SEAT_LIMITS[plan] ?? 1

  const { count: memberCount } = await supabaseAdmin
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', invite.team_id)

  if ((memberCount ?? 0) >= seatLimit) {
    return NextResponse.json({ error: 'This team has no seats remaining.' }, { status: 403 })
  }

  // Check the invited user's CURRENT team — everyone has one from signup
  const { data: currentMembership } = await supabaseAdmin
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (currentMembership && currentMembership.team_id !== invite.team_id) {
    const { count: existingClientCount } = await supabaseAdmin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', currentMembership.team_id)

    if ((existingClientCount ?? 0) > 0) {
      return NextResponse.json({
        error: 'You already have clients set up under your own account. Contact support@sendcleared.com to merge your accounts.',
      }, { status: 409 })
    }

    // Safe to switch — their personal team is unused. Remove old membership
    // (cascade will clean up the now-orphaned personal team's other rows).
    await supabaseAdmin
      .from('team_members')
      .delete()
      .eq('user_id', user.id)
      .eq('team_id', currentMembership.team_id)
  }

  const { error: insertError } = await supabaseAdmin
    .from('team_members')
    .insert({ team_id: invite.team_id, user_id: user.id, role: 'member' })

  if (insertError) {
    return NextResponse.json({ error: 'Failed to join team' }, { status: 500 })
  }

  await supabaseAdmin
    .from('team_invites')
    .update({ status: 'accepted' })
    .eq('id', invite.id)

  return NextResponse.json({ success: true })
}