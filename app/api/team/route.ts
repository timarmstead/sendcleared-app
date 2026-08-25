import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'No team found for this account' }, { status: 404 })
  }

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id, name, owner_id')
    .eq('id', membership.team_id)
    .single()

  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('user_id, role, created_at')
    .eq('team_id', membership.team_id)
    .order('created_at', { ascending: true })

  const membersWithEmail = await Promise.all(
    (members || []).map(async (m) => {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(m.user_id)
      return {
        user_id: m.user_id,
        role: m.role,
        email: userData?.user?.email || 'Unknown',
        joined_at: m.created_at,
      }
    })
  )

  let pendingInvites: any[] = []
  if (membership.role === 'owner') {
    const { data: invites } = await supabaseAdmin
      .from('team_invites')
      .select('id, email, status, created_at, expires_at')
      .eq('team_id', membership.team_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    pendingInvites = invites || []
  }

  return NextResponse.json({
    team,
    role: membership.role,
    members: membersWithEmail,
    pendingInvites,
  })
}