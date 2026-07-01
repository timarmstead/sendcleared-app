import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const { data: approval, error: approvalError } = await supabaseAdmin
    .from('approvals')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (approvalError || !approval) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  const isExpired = new Date(approval.expires_at) < new Date()

  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('id, subject, from_address, preheader, html_body, received_at')
    .eq('id', approval.campaign_id)
    .single()

  const { data: report } = await supabaseAdmin
    .from('reports')
    .select('score, summary, sections')
    .eq('campaign_id', approval.campaign_id)
    .single()

  return NextResponse.json({
    approval: {
      status: approval.status,
      approver_name: approval.approver_name,
      approved_at: approval.approved_at,
      changes_requested: approval.changes_requested,
      expires_at: approval.expires_at,
      is_expired: isExpired,
    },
    campaign,
    report,
  })
}