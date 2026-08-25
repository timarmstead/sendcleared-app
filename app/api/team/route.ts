import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resend } from '@/lib/resend'

const SEAT_LIMITS: Record<string, number> = {
  free: 1,
  freelancer: 1,
  agency: 3,
  studio: 10,
}

function generateToken(length = 32) {
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

  const { email } = await request.json()
  if (!email || !email.trim() || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }
  const normalizedEmail = email.trim().toLowerCase()

  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'No team found for this account' }, { status: 404 })
  }

  if (membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only the team owner can invite members' }, { status: 403 })
  }

  const { data: subscription } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, status')
    .eq('team_id', membership.team_id)
    .maybeSingle()

  const plan = subscription?.status === 'active' ? subscription.plan : 'free'
  const seatLimit = SEAT_LIMITS[plan] ?? 1

  const { count: memberCount } = await supabaseAdmin
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', membership.team_id)

  const { count: pendingCount } = await supabaseAdmin
    .from('team_invites')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', membership.team_id)
    .eq('status', 'pending')

  const seatsUsed = (memberCount ?? 0) + (pendingCount ?? 0)

  if (seatsUsed >= seatLimit) {
    const message = plan === 'studio'
      ? `You've reached your ${seatLimit}-seat limit. Contact support if you need more seats.`
      : `Your ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan is limited to ${seatLimit} seat${seatLimit > 1 ? 's' : ''}. Upgrade for more.`
    return NextResponse.json({ error: message, limit_reached: true }, { status: 403 })
  }

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('name')
    .eq('id', membership.team_id)
    .single()

  // Check whether this email already belongs to an existing account
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
  const existingUser = existingUsers?.users.find(
    (u) => u.email?.toLowerCase() === normalizedEmail
  )

  if (existingUser) {
    // Existing account — they just need to log in, then accept. No signup involved.
    const token = generateToken()
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { error: insertError } = await supabaseAdmin
      .from('team_invites')
      .insert({
        team_id: membership.team_id,
        email: normalizedEmail,
        token,
        invited_by: user.id,
        status: 'pending',
        expires_at,
      })

    if (insertError) {
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }

    try {
      await resend.emails.send({
        from: 'SendCleared <notifications@sendcleared.com>',
        to: normalizedEmail,
        subject: `You've been invited to join ${team?.name || 'a team'} on SendCleared`,
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto">
            <h2 style="color:#134e8e">You've been invited to SendCleared</h2>
            <p>${user.email} has invited you to join their team. Log in with your existing SendCleared account to accept.</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}"
               style="display:inline-block;background:#f26600;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;margin-top:10px">
              Accept invite
            </a>
            <p style="margin-top:24px;font-size:13px;color:#5a5a56">This invite expires in 7 days.</p>
          </div>
        `,
      })
    } catch (err) {
      console.error('Failed to send invite email:', err)
    }

    return NextResponse.json({ success: true, type: 'existing_user' })
  }

  // Brand new person — create their account server-side via Supabase's own
  // invite system, and merge them into the correct team immediately, in this
  // same request. By the time they open the email, they're already a member —
  // no signup form, no race condition, no ambiguity.
  const { data: inviteData, error: inviteAuthError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    normalizedEmail,
    { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password` }
  )

  if (inviteAuthError || !inviteData?.user) {
    return NextResponse.json({ error: 'Failed to invite this person. Please check the email address.' }, { status: 500 })
  }

  const newUserId = inviteData.user.id

  // The auto-create-team trigger just fired for this new user — remove that
  // personal membership and put them in the real team instead.
  await supabaseAdmin.from('team_members').delete().eq('user_id', newUserId)
  await supabaseAdmin.from('team_members').insert({
    team_id: membership.team_id,
    user_id: newUserId,
    role: 'member',
  })

  return NextResponse.json({ success: true, type: 'new_user' })
}