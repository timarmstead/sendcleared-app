import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const { data: approval } = await supabaseAdmin
    .from('approvals')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (!approval || new Date(approval.expires_at) < new Date()) {
    return new NextResponse('Link not found or expired', { status: 404 })
  }

  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('html_body')
    .eq('id', approval.campaign_id)
    .single()

  if (!campaign?.html_body) {
    return new NextResponse('No preview available', { status: 404 })
  }

  return new NextResponse(campaign.html_body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}