import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const ESP_TRACKING_DOMAINS = [
  'trk.klclick.com',
  'click.emaildomain.com',
  'links.sfmc.co',
  'mailchi.mp',
  'click.convertkit-mail',
  'em.brevo.com',
  'click.hubspot.com',
  'tracking.activecampaign.com',
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

function checkUTM(links: string[]): { missing: number; total: number; espTracked: boolean } {
  const total = links.length
  const espTracked = links.some(l =>
    ESP_TRACKING_DOMAINS.some(domain => l.includes(domain))
  )
  if (espTracked) return { missing: 0, total, espTracked: true }
  const missing = links.filter(l => !l.includes('utm_')).length
  return { missing, total, espTracked: false }
}

function sanitiseForJson(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
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
  const decodedHtml = decodeQP(email.html)
  const decodedPlain = decodeQP(email.plainText)

  const links = extractLinksFromHtml(decodedHtml)
  const textContent = extractTextFromHtml(decodedHtml)
  const altTexts = extractAltTexts(decodedHtml)
  const mergeTags = checkMergeTags(decodedHtml, decodedPlain)
  const utmCheck = checkUTM(links)

  const deterministicChecks = [
    mergeTags.length > 0
      ? `CRITICAL: Unresolved merge tags found: ${mergeTags.join(', ')}`
      : 'PASS: No unresolved merge tags detected',

    utmCheck.espTracked
      ? `PASS: ESP link tracking detected (Klaviyo/similar) — UTM parameters are embedded in tracked redirects`
      : utmCheck.total === 0
      ? 'INFO: No trackable links found in email'
      : utmCheck.missing === utmCheck.total
      ? `WARNING: None of the ${utmCheck.total} links have UTM parameters`
      : utmCheck.missing > 0
      ? `WARNING: ${utmCheck.missing} of ${utmCheck.total} links are missing UTM parameters`
      : `PASS: All ${utmCheck.total} links have UTM parameters`,

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

    email.preheader && email.preheader.length > 5
      ? `PASS: Preheader/preview text detected`
      : 'WARNING: Preheader/preview text not detected in HTML — check your ESP preview text setting',

    links.length > 0
      ? `PASS: ${links.length} links found and extracted`
      : 'WARNING: No links detected — check HTML encoding',
  ]

  // Sanitise text content to prevent JSON issues
  const safeTextContent = textContent
    .replace(/\\/g, '')
    .replace(/"/g, "'")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .substring(0, 1500)

  const safeSubject = sanitiseForJson(email.subject)
  const safeFrom = sanitiseForJson(email.from)
  const safePreheader = email.preheader ? sanitiseForJson(email.preheader) : ''

  const meta = [
    `Subject line: "${safeSubject}" (${email.subject.length} characters)`,
    `From: ${safeFrom}`,
    safePreheader ? `Preheader text: "${safePreheader}"` : 'Preheader: NOT SET',
    `Plain text: ${decodedPlain.length > 50 ? 'present' : 'missing or very short'}`,
    `Links found: ${links.length}`,
    `Images: ${altTexts.total} total, ${altTexts.missing} missing alt text`,
    '',
    'PRE-CHECKED FINDINGS (use these as facts, do not contradict them):',
    ...deterministicChecks,
    '',
    'Email body text content:',
    safeTextContent,
  ].join('\n')

  const prompt = `You are SendCleared, an expert email marketing QA agent. Return ONLY a valid JSON object. No markdown, no backticks, no text before or after the JSON.

IMPORTANT:
- Sending from a subdomain like send.domain.com is normal for ESPs — do NOT flag this
- Trust the pre-checked findings below — they are accurate — do not contradict them
- If ESP link tracking is detected, UTM parameters are in the redirect chain — do not flag as missing
- Base content analysis on the email text provided — do not assume content is missing

${meta}

Return this exact JSON structure with no deviations:
{
  "score": 75,
  "summary": "Two to three sentence summary here.",
  "sections": [
    {
      "name": "Content & copy",
      "score": 80,
      "issues": [
        { "severity": "pass", "text": "Issue text here under 100 chars." }
      ]
    },
    {
      "name": "Links & tracking",
      "score": 80,
      "issues": [
        { "severity": "pass", "text": "Issue text here under 100 chars." }
      ]
    },
    {
      "name": "Accessibility",
      "score": 80,
      "issues": [
        { "severity": "pass", "text": "Issue text here under 100 chars." }
      ]
    },
    {
      "name": "Spam signals",
      "score": 80,
      "issues": [
        { "severity": "pass", "text": "Issue text here under 100 chars." }
      ]
    },
    {
      "name": "Rendering readiness",
      "score": 80,
      "issues": [
        { "severity": "pass", "text": "Issue text here under 100 chars." }
      ]
    }
  ]
}

Rules:
- score is an integer 0-100
- severity must be one of: critical, warning, info, pass
- each section must have 3-4 issues
- issue text must be under 100 characters and contain no double quotes — use single quotes if needed
- summary must contain no double quotes — use single quotes if needed`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()

  // Clean any markdown
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  // Find the JSON object
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1) throw new Error('No JSON in QA response')

  const jsonString = cleaned.substring(start, end + 1)

  try {
    return JSON.parse(jsonString)
  } catch (parseError) {
    // Log the raw response to help debug
    console.error('JSON parse error. Raw response:', jsonString.substring(0, 500))
    throw new Error(`JSON parse failed: ${parseError}`)
  }
}