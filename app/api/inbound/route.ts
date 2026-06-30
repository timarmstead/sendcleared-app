import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseEmail } from '@/lib/parseEmail'
import { runQA } from '@/lib/qaEngine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    let body: Record<string, string> = {}

    if (contentType.includes('application/json')) {
      body = await req.json()
    } else {
      const formData = await req.formData()
      formData.forEach((value, key) => {
        body[key] = value.toString()
      })
    }

    console.log('Inbound body keys:', Object.keys(body))

    // CloudMailin sends flat form keys like 'envelope[to]'
    const toAddress =
      body['envelope[to]'] ||
      body['envelope[recipients][0]'] ||
      body['headers[to]'] ||
      ''

    console.log('To address:', toAddress)

    if (!toAddress) {
      console.log('No to address found')
      return NextResponse.json({ message: 'No recipient' }, { status: 200 })
    }

    // Extract just the email address
    const toMatch = toAddress.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/)
    const inboxAddress = toMatch ? toMatch[1].toLowerCase() : toAddress.toLowerCase()

    console.log('Inbox address:', inboxAddress)

    // Find which client this inbox belongs to
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, user_id, name')
      .eq('inbox_address', inboxAddress)
      .single()

    if (clientError || !client) {
      console.log('No client found for address:', inboxAddress)
      return NextResponse.json({ message: 'Unknown inbox address' }, { status: 200 })
    }

    console.log('Client found:', client.name)

    // Extract email parts from flat keys
    const subject = body['headers[subject]'] || ''
    const from = body['envelope[from]'] || body['headers[from]'] || ''
    const html = body['html'] || ''
    const plainText = body['plain'] || ''

    // Parse for preheader and links
    const parsed = parseEmail(html || plainText)
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

    console.log('Campaign stored:', campaign.id)

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