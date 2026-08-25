import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
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

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only the team owner can remove members' }, { status: 403 })
  }

  if (userId === user.id) {
    return NextResponse.json({ error: "You can't remove yourself as the owner" }, { status: 400 })
  }

  const { data: targetMembership } = await supabaseAdmin
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('team_id', membership.team_id)
    .maybeSingle()

  if (!targetMembership) {
    return NextResponse.json({ error: 'This person is not a member of your team' }, { status: 404 })
  }

  // Simply remove them from the team — no ban, no auto-created replacement
  // account. This immediately revokes access to this team's clients, reports,
  // and billing (everything is gated by team membership), while staying
  // fully reversible: re-inviting them later just adds them back cleanly.
  await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('user_id', userId)
    .eq('team_id', membership.team_id)

  return NextResponse.json({ success: true })
}