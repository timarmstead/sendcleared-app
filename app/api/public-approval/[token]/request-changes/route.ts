import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resend } from '@/lib/resend'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { changes_text, approver_name } = await request.json()

  if (!changes_text || !changes_text.trim()) {
    return NextResponse.json({ error: 'Please describe what needs changing' }, { status: 400 })
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
      status: 'changes_requested',
      changes_requested: changes_text.trim(),
      approver_name: approver_name?.trim() || null,
    })
    .eq('token', token)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to send feedback' }, { status: 500 })
  }

  // Notify the agency — best-effort, doesn't block the update itself if it fails
  try {
    const { data: campaign } = await supabaseAdmin
      .from('campaigns')
      .select('id, subject, client_id')
      .eq('id', approval.campaign_id)
      .single()

    if (campaign) {
      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('name, user_id')
        .eq('id', campaign.client_id)
        .single()

      if (client) {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(client.user_id)
        const agencyEmail = userData?.user?.email

        if (agencyEmail) {
          await resend.emails.send({
            from: 'SendCleared <notifications@sendcleared.com>',
            to: agencyEmail,
            subject: `↩ Changes requested: ${campaign.subject || 'Campaign'} — ${client.name}`,
            html: `
              <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto">
                <h2 style="color:#5c3308">Changes requested</h2>
                <p><strong>${approver_name?.trim() || 'The client'}</strong> requested changes for <strong>${client.name}</strong>:</p>
                <p style="background:#f7f7f5;padding:12px 16px;border-radius:8px;font-size:14px">
                  "${campaign.subject || '(no subject)'}"
                </p>
                <p style="background:#faeeda;padding:12px 16px;border-radius:8px;font-size:14px;color:#5c3308">
                  ${changes_text.trim()}
                </p>
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/report/${campaign.id}"
                   style="display:inline-block;background:#134e8e;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;margin-top:10px">
                  View report
                </a>
              </div>
            `,
          })
        }
      }
    }
  } catch (emailErr) {
    console.error('Failed to send changes-requested notification email:', emailErr)
  }

  return NextResponse.json({ success: true })
}