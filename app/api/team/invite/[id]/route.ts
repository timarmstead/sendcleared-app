import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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
    return NextResponse.json({ error: 'Only the team owner can revoke invites' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('team_invites')
    .update({ status: 'revoked' })
    .eq('id', id)
    .eq('team_id', membership.team_id)

  if (error) {
    return NextResponse.json({ error: 'Failed to revoke invite' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}