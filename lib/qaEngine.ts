import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const ESP_TRACKING_DOMAINS = [
  'trk.klclick.com', 'klclick.com',
  'click.braze.com', 'links.braze.com',
  'tracking.omnisend.com', 'omnisnd.com',
  'click.brevo.com', 'r.brevo.com', 'clicks.sib-sg.com',
  'mailchi.mp', 'list-manage.com', 'mcusercontent.com',
  'click.hubspot.com', 'hs-email.com', 'hubspotemail.net',
  'tracking.activecampaign.com',
  'click.salesforce.com', 'links.sfmc.co', 'em.exacttarget.com',
  'cmail1.com', 'cmail2.com', 'cmail3.com', 'cmail4.com',
  'cmail5.com', 'cmail6.com', 'cmail7.com', 'createsend.com',
  'r1.dotdigital-pages.com', 'dotmailer.com',
  'links.iterable.com',
  'sendgrid.net',
  'mailgun.org',
  'links.drip.com',
  'email.moosend.com',
]

function decodeQP(str: string): string {
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
}

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 2000)
}

function extractLinksFromHtml(html: string): string[] {
  const matches = [...html.matchAll(/href=["']([^"']+)["']/gi)]
  return matches
    .map(m => m[1])
    .filter(url => url.startsWith('http'))
    .slice(0, 20)
}

function extractAltTexts(html: string): { missing: number; total: number } {
  const imgs = [...html.matchAll(/<img[^>]*>/gi)]
  const total = imgs.length
  const missing = imgs.filter(m =>
    !m[0].includes('alt=') || m[0].match(/alt=["']\s*["']/)
  ).length
  return { missing, total }
}

function checkMergeTags(html: string, plain: string): string[] {
  const combined = html + plain
  const patterns = [
    /\$\{[^}]+\}/g,
    /\{\{[^}]+\}\}/g,
    /%7B%7B[^%]+%7D%7D/g,
  ]
  const found: string[] = []
  patterns.forEach(p => {
    const matches = combined.match(p)
    if (matches) found.push(...matches.slice(0, 3))
  })
  return [...new Set(found)]
}

function checkUTM(htmlLinks: string[]): {
  missing: number
  total: number
  espTracked: boolean
} {
  const total = htmlLinks.length

  // Check if ESP tracking domains are present
  const espTracked = htmlLinks.some(l =>
    ESP_TRACKING_DOMAINS.some(domain => l.includes(domain))
  )

  // If ESP tracking is active, UTMs are embedded in the redirect chain
  // Do not check destination URLs — they won't have UTMs directly
  if (espTracked) {
    return { missing: 0, total, espTracked: true }
  }

  // No ESP tracking — check links directly for UTM parameters
  const missing = htmlLinks.filter(l => !l.includes('utm_')).length
  return { missing, total, espTracked: false }
}

function sanitiseForJson(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, "'")
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .substring(0, 200)
}

export async function runQA(email: {
  subject: string
  from: string
  preheader: string
  html: string
  plainText: string
  links: string[]
}) {
  // Decode QP encoding
  const decodedHtml = decodeQP(email.html)
  const decodedPlain = decodeQP(email.plainText)

  const htmlLinks = extractLinksFromHtml(decodedHtml)
  const textContent = extractTextFromHtml(decodedHtml)
  const altTexts = extractAltTexts(decodedHtml)
  const mergeTags = checkMergeTags(decodedHtml, decodedPlain)
  const utmCheck = checkUTM(htmlLinks)

  const deterministicChecks = [
    mergeTags.length > 0
      ? `CRITICAL: Unresolved merge tags found: ${mergeTags.join(', ')}`
      : 'PASS: No unresolved merge tags detected',

    utmCheck.espTracked
      ? `PASS: ESP link tracking confirmed — UTM parameters are tracked via redirect chain (standard for Klaviyo, Braze, Mailchimp etc)`
      : utmCheck.total === 0
      ? 'INFO: No trackable links found'
      : utmCheck.missing === 0
      ? `PASS: All ${utmCheck.total} links have UTM parameters`
      : `WARNING: ${utmCheck.missing} of ${utmCheck.total} links are missing UTM parameters`,

    altTexts.total === 0
      ? 'INFO: No images found in email'
      : altTexts.missing > 0
      ? `WARNING: ${altTexts.missing} of ${altTexts.total} images are missing alt text`
      : `PASS: All ${altTexts.total} images have alt text`,

    decodedPlain.length > 50
      ? 'PASS: Plain text version present'
      : 'WARNING: Plain text version is missing or very short',

    decodedHtml.toLowerCase().includes('unsubscribe')
      ? 'PASS: Unsubscribe link found'
      : 'CRITICAL: No unsubscribe link detected',

    /\d{1,4}\s+\w+.*?[A-Z]{1,2}\d/.test(decodedHtml + decodedPlain) ||
    /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/.test(decodedHtml + decodedPlain)
      ? 'PASS: Physical address found in email'
      : 'CRITICAL: No physical address detected — required by CAN-SPAM and GDPR',

    email.preheader && email.preheader.length > 3
      ? `PASS: Preview text set: "${email.preheader.substring(0, 80)}"`
      : 'WARNING: Preview text not detected — check your ESP preview text field',

    htmlLinks.length > 0
      ? `PASS: ${htmlLinks.length} links found`
      : 'WARNING: No links detected',
  ]

  const safeTextContent = textContent
    .replace(/\\/g, '')
    .replace(/"/g, "'")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .substring(0, 1500)

  const safeSubject = sanitiseForJson(email.subject)
  const safeFrom = sanitiseForJson(email.from)
  const safePreheader = email.preheader ? sanitiseForJson(email.preheader) : ''

  const meta = [
    `Subject line: "${safeSubject}" (${email.subject.length} chars)`,
    `From: ${safeFrom}`,
    safePreheader ? `Preview text: "${safePreheader}"` : 'Preview text: NOT DETECTED',
    `Plain text: ${decodedPlain.length > 50 ? 'present' : 'missing'}`,
    `HTML links: ${htmlLinks.length}`,
    `Images: ${altTexts.total} total, ${altTexts.missing} missing alt text`,
    '',
    'PRE-CHECKED FINDINGS — these are facts, do not contradict:',
    ...deterministicChecks,
    '',
    'Email text content:',
    safeTextContent,
  ].join('\n')

  const prompt = `You are SendCleared, an expert email marketing QA agent. Return ONLY valid JSON. No markdown, no backticks, no text outside the JSON.

RULES:
- Sending from a subdomain (send.domain.com, mail.domain.com) is normal for ESPs — never flag this
- The PRE-CHECKED FINDINGS below are accurate and deterministic — never contradict them
- If ESP tracking is confirmed with UTM pass, do not flag UTM issues anywhere in your response
- Use single quotes only in all text fields — never double quotes inside strings
- Keep all issue text under 100 characters

${meta}

Return this exact JSON:
{
  "score": 75,
  "summary": "Two to three sentence summary using single quotes only.",
  "sections": [
    {
      "name": "Content & copy",
      "score": 80,
      "issues": [
        { "severity": "pass", "text": "Finding using single quotes only." }
      ]
    },
    {
      "name": "Links & tracking",
      "score": 80,
      "issues": [
        { "severity": "pass", "text": "Finding here." }
      ]
    },
    {
      "name": "Accessibility",
      "score": 80,
      "issues": [
        { "severity": "pass", "text": "Finding here." }
      ]
    },
    {
      "name": "Spam signals",
      "score": 80,
      "issues": [
        { "severity": "pass", "text": "Finding here." }
      ]
    },
    {
      "name": "Rendering readiness",
      "score": 80,
      "issues": [
        { "severity": "pass", "text": "Finding here." }
      ]
    }
  ]
}

Each section: 3-4 issues. Severity: critical, warning, info, or pass.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()

  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1) throw new Error('No JSON in QA response')

  const jsonString = cleaned.substring(start, end + 1)

  try {
    return JSON.parse(jsonString)
  } catch (parseError) {
    console.error('JSON parse error:', jsonString.substring(0, 500))
    throw new Error(`JSON parse failed: ${parseError}`)
  }
}