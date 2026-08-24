import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resend } from '@/lib/resend'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Atomically "claim" the right to send this email, so two near-simultaneous
  // requests (e.g. React re-running page-load logic) can never both send it.
  // Only one of two concurrent requests can win this UPDATE, thanks to
  // Postgres row-level locking during the write.
  let claimed = false

  const { data: updated } = await supabase
    .from('user_preferences')
    .update({ welcome_email_sent: true, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('welcome_email_sent', false)
    .select()

  if (updated && updated.length > 0) {
    claimed = true
  } else {
    // No existing row matched (either no row yet, or already sent).
    // Try to INSERT — this only succeeds if no row exists at all, since
    // user_id is the primary key. If a concurrent request already inserted
    // it, this fails with a conflict and we correctly do NOT send again.
    const { error: insertErr } = await supabase
      .from('user_preferences')
      .insert({ user_id: user.id, welcome_email_sent: true })

    if (!insertErr) {
      claimed = true
    }
  }

  if (!claimed) {
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

    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('Failed to send welcome email:', err)
    // The claim already succeeded, so welcome_email_sent stays true even
    // if the send itself failed — we don't want to retry indefinitely on
    // a persistently-failing address. Logged for visibility instead.
    return NextResponse.json({ sent: false, reason: 'send_failed' })
  }
}