import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { approver_name } = await request.json()

  if (!approver_name || !approver_name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const { data: approval, error } = await supabaseAdmin
    .from('approvals')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (error || !approval) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  if (new Date(approval.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }

  if (approval.status !== 'pending') {
    return NextResponse.json({ error: 'This campaign has already been reviewed' }, { status: 409 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('approvals')
    .update({
      status: 'approved',
      approver_name: approver_name.trim(),
      approved_at: new Date().toISOString(),
    })
    .eq('token', token)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to record approval' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}