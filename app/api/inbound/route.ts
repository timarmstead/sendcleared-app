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

    console.log('Webhook received, to:', body['envelope[to]'])

    const toAddress =
      body['envelope[to]'] ||
      body['envelope[recipients][0]'] ||
      body['headers[to]'] ||
      ''

    if (!toAddress) {
      console.log('No to address found')
      return NextResponse.json({ error: 'No recipient' }, { status: 200 })
    }

    const toMatch = toAddress.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/)
    const inboxAddress = toMatch ? toMatch[1].toLowerCase() : toAddress.toLowerCase()
    console.log('Inbox address:', inboxAddress)

    // Find client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, user_id, name')
      .eq('inbox_address', inboxAddress)
      .single()

    if (clientError || !client) {
      console.log('No client found for:', inboxAddress, clientError?.message)
      return NextResponse.json({ message: 'Unknown address' }, { status: 200 })
    }

    console.log('Client found:', client.name)

    // Check for duplicate
    const emailMd5 = body['envelope[md5]'] || ''
    if (emailMd5) {
      const { data: existing } = await supabase
        .from('campaigns')
        .select('id')
        .eq('email_md5', emailMd5)
        .maybeSingle()

      if (existing) {
        console.log('Duplicate email, skipping:', emailMd5)
        return NextResponse.json({ message: 'Duplicate' }, { status: 200 })
      }
    }

    // Extract email parts
    const subject = body['headers[subject]'] || ''
    const from = body['envelope[from]'] || body['headers[from]'] || ''
    const html = body['html'] || ''
    const plainText = body['plain'] || ''

    // Parse for preheader and links
    const parsed = parseEmail(html || plainText)
    const preheader = parsed.preheader || ''

    // DEBUG
    console.log('Preheader extracted:', preheader)
    console.log('HTML length:', html.length)
    console.log('HTML start:', html.substring(0, 500))

    // Find display:none section
    const noneIndex = html.indexOf('display:none')
    console.log('display:none index:', noneIndex)
    if (noneIndex > -1) {
      console.log('display:none context:', html.substring(noneIndex - 20, noneIndex + 300))
    }

    const links = parsed.links || []

    console.log('Storing campaign:', subject)

    // Store campaign
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
        email_md5: emailMd5 || null,
      })
      .select()
      .single()

    if (campaignError || !campaign) {
      console.error('Campaign insert error:', campaignError?.message, campaignError?.details, campaignError?.code)
      return NextResponse.json({ error: 'Campaign insert failed' }, { status: 500 })
    }

    console.log('Campaign stored:', campaign.id)
    console.log('Running QA...')

    // Run QA
    const qaResult = await runQA({ subject, from, preheader, html, plainText, links })
    console.log('QA complete, score:', qaResult.score)

    // Store report
    const { error: reportError } = await supabase
      .from('reports')
      .insert({
        campaign_id: campaign.id,
        score: qaResult.score,
        summary: qaResult.summary,
        sections: qaResult.sections,
      })

    if (reportError) {
      console.error('Report insert error:', reportError?.message)
      return NextResponse.json({ error: 'Report insert failed' }, { status: 500 })
    }

    console.log('Report stored successfully for:', client.name)
    return NextResponse.json({ success: true, score: qaResult.score }, { status: 200 })

  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}