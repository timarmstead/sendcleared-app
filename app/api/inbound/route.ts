import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseEmail } from '@/lib/parseEmail'
import { runQA } from '@/lib/qaEngine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function stripInvisibleChars(raw: string): string {
  return raw
    .split('')
    .filter(char => {
      const code = char.charCodeAt(0)
      if (code <= 0x001F) return false
      if (code === 0x00AD) return false
      if (code === 0x034F) return false
      if (code >= 0x200B && code <= 0x200F) return false
      if (code >= 0x202A && code <= 0x202E) return false
      if (code >= 0x2060 && code <= 0x2064) return false
      if (code === 0x2007) return false
      if (code === 0xFEFF) return false
      return true
    })
    .join('')
}

function extractPreheaderFromHtml(html: string): string {
  const bodyIdx = html.search(/<body[\s>]/i)
  if (bodyIdx === -1) return ''

  const bodyContent = html.substring(bodyIdx)

  const divMatches = [...bodyContent.matchAll(
    /<div[^>]*style=["'][^"']*display\s*:\s*none[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi
  )]

  for (const match of divMatches) {
    let inner = match[1]
    inner = inner.replace(/<[^>]+>/g, ' ')
    inner = inner.replace(/&nbsp;/g, ' ')
    inner = stripInvisibleChars(inner)
    inner = inner.replace(/\s+/g, ' ').trim()

    if (inner.length > 3 && /[a-zA-Z]{3,}/.test(inner)) {
      return inner.substring(0, 150)
    }
  }

  return ''
}

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

    const subject = body['headers[subject]'] || ''
    const from = body['headers[from]'] || body['envelope[from]'] || ''
    const replyTo = body['headers[reply-to]'] || ''
    const html = body['html'] || ''
    const plainText = body['plain'] || ''

    const parsed = parseEmail(html || plainText)

    let preheader = ''
    if (html) {
      preheader = extractPreheaderFromHtml(html)
    }
    if (!preheader) {
      preheader = parsed.preheader || ''
    }

    console.log('Final preheader:', preheader)
    console.log('Reply-to:', replyTo || '(none detected)')

    const links = parsed.links || []
    console.log('Storing campaign:', subject)

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        client_id: client.id,
        subject,
        from_address: from,
        reply_to: replyTo || null,
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

    const qaResult = await runQA({ subject, from, preheader, html, plainText, links })
    console.log('QA complete, score:', qaResult.score)

    const { error: reportError } = await supabase
      .from('reports')
      .insert({
        campaign_id: campaign.id,
        score: qaResult.score,
        summary: qaResult.summary,
        sections: qaResult.sections,
        ctas: qaResult.ctas || [],
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