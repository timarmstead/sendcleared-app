import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resend } from '@/lib/resend'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('welcome_email_sent')
    .eq('user_id', user.id)
    .maybeSingle()

  // Already sent — nothing to do, this route is safe to call repeatedly
  if (prefs?.welcome_email_sent) {
    return NextResponse.json({ sent: false, reason: 'already_sent' })
  }

  try {
    await resend.emails.send({
      from: 'SendCleared <notifications@sendcleared.com>',
      to: user.email!,
      subject: 'Welcome to SendCleared 👋',
      html: `
        <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#134e8e">Welcome to SendCleared</h2>
          <p>You're all set up. Here's how it works, in four steps:</p>
          <ol style="line-height:1.8;color:#0f1117">
            <li><strong>Add a client</strong> — you'll get a unique inbox address for them.</li>
            <li><strong>Send a test email</strong> from your ESP to that address.</li>
            <li><strong>Get your QA report</strong> — 14 automated checks, ready in about 10 seconds.</li>
            <li><strong>Generate an approval link</strong> — your client reviews and approves with one click, no login required.</li>
          </ol>
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard"
             style="display:inline-block;background:#f26600;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;margin-top:10px">
            Go to your dashboard
          </a>
          <p style="margin-top:24px;font-size:13px;color:#5a5a56">
            Questions? Just reply to this email — we're happy to help.
          </p>
        </div>
      `,
    })

    await supabase
      .from('user_preferences')
      .upsert({ user_id: user.id, welcome_email_sent: true, updated_at: new Date().toISOString() })

    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('Failed to send welcome email:', err)
    // Don't fail the request over a non-critical email — just log it
    return NextResponse.json({ sent: false, reason: 'send_failed' })
  }
}