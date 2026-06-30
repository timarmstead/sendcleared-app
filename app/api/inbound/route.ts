import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseEmail } from '@/lib/parseEmail'
import { runQA } from '@/lib/qaEngine'

// Use service role key for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // CloudMailin sends the raw email as plain or the parsed version
    const rawEmail = body.plain || body.html || ''
    const toAddress = body.envelope?.to || body.headers?.to || ''

    if (!toAddress) {
      return NextResponse.json({ error: 'No recipient address' }, { status: 400 })
    }

    // Normalise the to address — extract just the email
    const toMatch = toAddress.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
    const inboxAddress = toMatch ? toMatch[1].toLowerCase() : toAddress.toLowerCase()

    // Find which client this inbox belongs to
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, user_id, name')
      .eq('inbox_address', inboxAddress)
      .single()

    if (clientError || !client) {
      console.log('No client found for address:', inboxAddress)
      // Return 200 so CloudMailin doesn't retry — we just don't know this address
      return NextResponse.json({ message: 'Unknown inbox address' }, { status: 200 })
    }

    // Parse the email
    const parsed = parseEmail(
      body.plain ||
      (body.parts ? body.parts.map((p: any) => p.body).join('\n') : '') ||
      JSON.stringify(body)
    )

    // Override with CloudMailin's pre-parsed fields if available
    const subject = body.headers?.subject || parsed.subject || ''
    const from = body.envelope?.from || parsed.from || ''
    const html = body.html || parsed.html || ''
    const plainText = body.plain || parsed.plainText || ''
    const preheader = parsed.preheader || ''
    const links = parsed.links || []

    // Store the campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        client_id: client.id,
        subject,
        from_address: from,
        preheader,
        html_body: html,
        plain_text: plainText,
        raw_email: JSON.stringify(body),
      })
      .select()
      .single()

    if (campaignError || !campaign) {
      console.error('Campaign insert error:', campaignError)
      return NextResponse.json({ error: 'Failed to store campaign' }, { status: 500 })
    }

    // Run the QA engine
    const qaResult = await runQA({ subject, from, preheader, html, plainText, links })

    // Store the QA report
    const { error: reportError } = await supabase
      .from('reports')
      .insert({
        campaign_id: campaign.id,
        score: qaResult.score,
        summary: qaResult.summary,
        sections: qaResult.sections,
      })

    if (reportError) {
      console.error('Report insert error:', reportError)
      return NextResponse.json({ error: 'Failed to store report' }, { status: 500 })
    }

    console.log(`QA complete for ${client.name} — score: ${qaResult.score}`)
    return NextResponse.json({ success: true, score: qaResult.score }, { status: 200 })

  } catch (err) {
    console.error('Inbound webhook error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}