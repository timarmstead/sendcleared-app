import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

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
    .substring(0, 3000)
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
  const missing = imgs.filter(m => !m[0].includes('alt=') || m[0].match(/alt=["']\s*["']/)).length
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

function checkUTM(links: string[]): { missing: number; total: number } {
  const total = links.length
  const missing = links.filter(l => !l.includes('utm_')).length
  return { missing, total }
}

export async function runQA(email: {
  subject: string
  from: string
  preheader: string
  html: string
  plainText: string
  links: string[]
}) {
  // Decode quoted-printable encoding
  const decodedHtml = decodeQP(email.html)
  const decodedPlain = decodeQP(email.plainText)

  // Extract useful data
  const links = extractLinksFromHtml(decodedHtml)
  const textContent = extractTextFromHtml(decodedHtml)
  const altTexts = extractAltTexts(decodedHtml)
  const mergeTags = checkMergeTags(decodedHtml, decodedPlain)
  const utmCheck = checkUTM(links)

  // Build deterministic checks to pass to AI
  const deterministicChecks = [
    mergeTags.length > 0
      ? `CRITICAL: Unresolved merge tags found: ${mergeTags.join(', ')}`
      : 'PASS: No unresolved merge tags detected',
    utmCheck.total === 0
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
    links.length > 0
      ? `PASS: ${links.length} links found and extracted`
      : 'WARNING: No links detected — check HTML encoding',
  ]

  const meta = [
    `Subject line: "${email.subject}" (${email.subject.length} characters)`,
    `From: ${email.from}`,
    email.preheader ? `Preheader text: "${email.preheader}"` : 'Preheader: NOT SET',
    `Plain text: ${decodedPlain.length > 50 ? 'present' : 'missing or very short'}`,
    `Links found: ${links.length}`,
    `Images: ${altTexts.total} total, ${altTexts.missing} missing alt text`,
    '',
    'PRE-CHECKED FINDINGS (use these as facts, do not contradict them):',
    ...deterministicChecks,
    '',
    'Email body text content (first 2000 chars):',
    textContent,
  ].join('\n')

  const prompt = `You are SendCleared, an expert email marketing QA agent. Analyse this email and return ONLY valid JSON — no markdown, no backticks, no explanation.

IMPORTANT CONTEXT:
- This email was sent via Klaviyo or another ESP as a test preview
- Sending from a subdomain like "send.domain.com" or "mail.domain.com" is completely normal for ESP-sent emails — do NOT flag this as an issue
- The email HTML may be complex with many images and product blocks — judge content based on the text content provided, not assumptions about missing content
- Trust the pre-checked findings below — they are deterministic and accurate

${meta}

Return exactly this JSON:
{
  "score": <integer 0-100>,
  "summary": "<2-3 sentences. Be specific and accurate. Do not assume content is missing.>",
  "sections": [
    {
      "name": "<section name>",
      "score": <integer 0-100>,
      "issues": [
        { "severity": "critical|warning|info|pass", "text": "<finding under 120 chars>" }
      ]
    }
  ]
}

Sections must be exactly: "Content & copy", "Links & tracking", "Accessibility", "Spam signals", "Rendering readiness"
Each section: 3-4 issues
Severity: critical=blocks send, warning=hurts performance, info=note, pass=good

For "Links & tracking": base your findings on the pre-checked UTM data above — do not say links are missing if links were found
For "Content & copy": base findings on the actual text content provided — do not say body copy is missing if text content is present
For subdomain sending: this is normal ESP behaviour — only flag if DKIM/DMARC alignment actually fails`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
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

  return JSON.parse(cleaned.substring(start, end + 1))
}