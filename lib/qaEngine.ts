import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const ESP_TRACKING_DOMAINS = [
  'trk.klclick.com', 'klclick.com', 'ctrk.klclick1.com', 'klclick1.com',
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
  'manage.kmail-lists.com',
]

// Tags that can legitimately sit MID-WORD or mid-sentence with no surrounding
// whitespace — e.g. text pasted from Word/Outlook often splits a single word
// across a bare text node and a <span>, like: R<span>amblers</span>.
// These must be stripped with NO space, or the typo checker sees two words
// where the rendered email shows one. Block-level tags (p, div, td, li, br,
// etc.) are the opposite case — those really do separate distinct chunks of
// copy, so they keep the space.
const INLINE_TAGS = new Set([
  'a', 'span', 'b', 'i', 'u', 'em', 'strong', 'sub', 'sup', 'small', 'mark',
  'abbr', 'cite', 'code', 'q', 'time', 'data', 'label', 'font', 'strike', 's',
  'big', 'tt', 'var', 'kbd', 'samp', 'ins', 'del', 'bdi', 'bdo', 'wbr',
])

type Severity = 'critical' | 'warning' | 'info' | 'pass'

interface Issue {
  severity: Severity
  text: string
}

const SECTION_NAMES = [
  'Content & copy',
  'Links & tracking',
  'Accessibility',
  'Spam signals',
  'Rendering readiness',
] as const

type SectionName = (typeof SECTION_NAMES)[number]

// How much each severity costs a section's score. Deterministic findings
// always carry the same penalty for the same fact, so the same underlying
// email can never score differently between runs based on severity alone.
const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 30,
  warning: 12,
  info: 0,
  pass: 0,
}

function scoreFromIssues(issues: Issue[]): number {
  const penalty = issues.reduce((sum, i) => sum + SEVERITY_PENALTY[i.severity], 0)
  return Math.max(0, Math.min(100, 100 - penalty))
}

function decodeQP(str: string): string {
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
}

function stripHiddenDivs(html: string): string {
  return html.replace(
    /<(div|span)[^>]*style=["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    ' '
  )
}

function extractTextFromHtml(html: string): string {
  const withoutHiddenAndCode = stripHiddenDivs(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')

  // Replace each tag individually: inline tags -> '', block tags -> ' '.
  const withTagsReplaced = withoutHiddenAndCode.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g,
    (_match, tagName: string) => (INLINE_TAGS.has(tagName.toLowerCase()) ? '' : ' ')
  )

  return withTagsReplaced.replace(/\s+/g, ' ').trim()
}

function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const slice = text.substring(0, maxLength)
  const lastSpace = slice.lastIndexOf(' ')
  return lastSpace > 0 ? slice.substring(0, lastSpace) : slice
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
}

// SINGLE source of truth for every link in the email. Both the "N links found"
// summary count AND the "View all CTAs and links" dropdown are derived from this
// exact same list, so they can never disagree again — previously they used two
// separate regex passes that caught slightly different things.
function extractCtasFromHtml(html: string): { label: string; url: string }[] {
  const stripped = stripHiddenDivs(html)
  const matches = [...stripped.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]

  const seen = new Set<string>()
  const results: { label: string; url: string }[] = []

  for (const match of matches) {
    const url = match[1]
    if (!url.startsWith('http')) continue
    if (seen.has(url)) continue

    const inner = match[2]

    let label = inner
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    label = decodeHtmlEntities(label)

    if (!label || label.length < 2) {
      const altMatch = inner.match(/<img[^>]*\balt=["']([^"']*)["'][^>]*>/i)
      if (altMatch && altMatch[1].trim().length > 1) {
        label = decodeHtmlEntities(altMatch[1].trim())
      }
    }

    if (!label || label.length < 2) {
      label = 'Image link'
    }

    if (label.length > 60) label = label.substring(0, 57).trim() + '...'

    seen.add(url)
    results.push({ label, url })

    if (results.length >= 100) break // generous cap, not a realistic limit for a marketing email
  }

  return results
}

async function resolveDestinationUrl(url: string, timeoutMs = 5000): Promise<{ resolved: string; failed: boolean }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SendClearedBot/1.0; +https://sendcleared.com)',
      },
    })
    clearTimeout(timeout)
    response.body?.cancel().catch(() => {})
    return { resolved: response.url || url, failed: false }
  } catch {
    clearTimeout(timeout)
    return { resolved: url, failed: true }
  }
}

async function resolveAllCtas(
  ctas: { label: string; url: string }[]
): Promise<{ label: string; url: string; trackingUrl?: string; unresolved?: boolean }[]> {
  const results = await Promise.allSettled(
    ctas.map(async cta => {
      const isTracked = ESP_TRACKING_DOMAINS.some(domain => cta.url.includes(domain))
      if (!isTracked) {
        return { label: cta.label, url: cta.url }
      }

      const { resolved, failed } = await resolveDestinationUrl(cta.url)

      if (failed || resolved === cta.url) {
        return { label: cta.label, url: cta.url, unresolved: true }
      }

      return { label: cta.label, url: resolved, trackingUrl: cta.url }
    })
  )

  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { label: ctas[i].label, url: ctas[i].url, unresolved: true }
  )
}

function isTrackingPixel(imgTag: string): boolean {
  const widthMatch = imgTag.match(/\bwidth=["']?(\d+)/i)
  const heightMatch = imgTag.match(/\bheight=["']?(\d+)/i)
  const width = widthMatch ? parseInt(widthMatch[1]) : null
  const height = heightMatch ? parseInt(heightMatch[1]) : null

  if (width !== null && height !== null && width <= 1 && height <= 1) return true

  const srcMatch = imgTag.match(/\bsrc=["']([^"']+)["']/i)
  const src = srcMatch ? srcMatch[1].toLowerCase() : ''
  const trackingPatterns = ['/wf/open', '/o/', '/open?', 'pixel.gif', 'pixel.png', '/track/open', 'beacon']
  if (trackingPatterns.some(p => src.includes(p))) return true

  return false
}

function extractAltTexts(html: string): { missing: number; total: number; missingSrcs: string[] } {
  const allImgs = [...html.matchAll(/<img[^>]*>/gi)].map(m => m[0])
  const realImgs = allImgs.filter(tag => !isTrackingPixel(tag))

  const total = realImgs.length
  const missingTags = realImgs.filter(tag => !tag.includes('alt='))
  const missing = missingTags.length

  const missingSrcs = missingTags.slice(0, 3).map(tag => {
    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i)
    if (!srcMatch) return '(unknown image)'
    const src = srcMatch[1]
    const filename = src.split('/').pop()?.split('?')[0] || src
    return filename.length > 40 ? filename.substring(0, 37) + '...' : filename
  })

  return { missing, total, missingSrcs }
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

  const espTracked = htmlLinks.some(l =>
    ESP_TRACKING_DOMAINS.some(domain => l.includes(domain))
  )

  if (espTracked) {
    return { missing: 0, total, espTracked: true }
  }

  const missing = htmlLinks.filter(l => !l.includes('utm_')).length
  return { missing, total, espTracked: false }
}

function detectDuplicateWords(text: string): string[] {
  const matches = [...text.matchAll(/\b(\w+)\s+\1\b/gi)]
  const found = matches.map(m => m[0])
  return [...new Set(found.map(f => f.toLowerCase()))]
}

function collapseDuplicateBlocks(text: string): { text: string; collapsedCount: number } {
  const chunks = text.split(/(?<=[.!?])\s+/)
  const seen = new Map<string, number>()
  const result: string[] = []
  let collapsedCount = 0

  for (const chunk of chunks) {
    const trimmed = chunk.trim()
    const key = trimmed.toLowerCase()
    if (trimmed.length > 30 && seen.has(key)) {
      collapsedCount++
      continue
    }
    seen.set(key, (seen.get(key) || 0) + 1)
    result.push(trimmed)
  }

  return { text: result.join(' '), collapsedCount }
}

function detectMsoSupport(html: string): boolean {
  return /<!--\s*\[if\s+mso\]/i.test(html)
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

// Every deterministic fact gets its severity and its section assigned HERE,
// in code — never by the model. This is what makes the same underlying email
// always produce the same severity for the same finding, run after run.
function buildDeterministicSections(params: {
  mergeTags: string[]
  duplicateWords: string[]
  utmCheck: { missing: number; total: number; espTracked: boolean }
  htmlLinksCount: number
  altTexts: { missing: number; total: number; missingSrcs: string[] }
  decodedPlain: string
  decodedHtml: string
  preheader: string
  collapsedCount: number
}): Record<SectionName, Issue[]> {
  const {
    mergeTags, duplicateWords, utmCheck, htmlLinksCount,
    altTexts, decodedPlain, decodedHtml, preheader, collapsedCount,
  } = params

  const hasUnsubscribe = decodedHtml.toLowerCase().includes('unsubscribe')
  const hasPhysicalAddress =
    /\d{1,4}\s+\w+.*?[A-Z]{1,2}\d/.test(decodedHtml + decodedPlain) ||
    /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/.test(decodedHtml + decodedPlain)
  const hasMso = detectMsoSupport(decodedHtml)

  const sections: Record<SectionName, Issue[]> = {
    'Content & copy': [
      mergeTags.length > 0
        ? { severity: 'critical', text: `Unresolved merge tag(s) found: ${mergeTags.join(', ')}` }
        : { severity: 'pass', text: 'No unresolved merge tags detected.' },
      duplicateWords.length > 0
        ? { severity: 'critical', text: `Duplicated consecutive word(s) found: ${duplicateWords.join(', ')}` }
        : { severity: 'pass', text: 'No duplicated consecutive words detected.' },
    ],

    'Links & tracking': [
      utmCheck.espTracked
        ? { severity: 'pass', text: 'ESP link tracking confirmed — UTM parameters are tracked via redirect chain.' }
        : utmCheck.total === 0
        ? { severity: 'info', text: 'No trackable links found.' }
        : utmCheck.missing === 0
        ? { severity: 'pass', text: `All ${utmCheck.total} links have UTM parameters.` }
        : { severity: 'warning', text: `${utmCheck.missing} of ${utmCheck.total} links are missing UTM parameters.` },
      htmlLinksCount > 0
        ? { severity: 'pass', text: `${htmlLinksCount} links found.` }
        : { severity: 'warning', text: 'No links detected.' },
    ],

    'Accessibility': [
      altTexts.total === 0
        ? { severity: 'info', text: 'No content images found in email (tracking pixels excluded).' }
        : altTexts.missing > 0
        ? {
            severity: 'critical',
            text: `${altTexts.missing} of ${altTexts.total} content images are missing alt text entirely. Specifically: ${altTexts.missingSrcs.join(', ')}.`,
          }
        : { severity: 'pass', text: `All ${altTexts.total} content images have alt attributes.` },
    ],

    'Spam signals': [
      hasUnsubscribe
        ? { severity: 'pass', text: 'Unsubscribe link found.' }
        : { severity: 'critical', text: 'No unsubscribe link detected.' },
      hasPhysicalAddress
        ? { severity: 'pass', text: 'Physical address found in email — CAN-SPAM/GDPR footer requirement met.' }
        : { severity: 'critical', text: 'No physical address detected — required by CAN-SPAM and GDPR.' },
    ],

    'Rendering readiness': [
      decodedPlain.length > 50
        ? { severity: 'pass', text: 'Plain text version is present.' }
        : { severity: 'warning', text: 'Plain text version is missing or very short.' },
      preheader && preheader.length > 3
        ? { severity: 'pass', text: `Preview text is set: "${preheader.substring(0, 80)}"` }
        : { severity: 'warning', text: 'Preview text not detected — check your ESP preview text field.' },
      collapsedCount > 0
        ? { severity: 'info', text: `Detected ${collapsedCount} repeated content block(s), consistent with separate desktop/mobile copy — normal for responsive templates.` }
        : { severity: 'info', text: 'No repeated content blocks detected.' },
      hasMso
        ? { severity: 'pass', text: 'MSO conditional comments detected — Outlook rendering support is in place.' }
        : { severity: 'info', text: 'No MSO conditional comments detected — Outlook-specific rendering has not been confirmed.' },
    ],
  }

  return sections
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

  // Single extraction pass — used for BOTH the summary count and the CTAs dropdown
  const rawCtas = extractCtasFromHtml(decodedHtml)
  const htmlLinks = rawCtas.map(c => c.url)
  const ctas = await resolveAllCtas(rawCtas)

  const rawTextContent = extractTextFromHtml(decodedHtml)
  const altTexts = extractAltTexts(decodedHtml)
  const mergeTags = checkMergeTags(decodedHtml, decodedPlain)
  const utmCheck = checkUTM(htmlLinks)
  const duplicateWords = detectDuplicateWords(rawTextContent)

  const { text: dedupedText, collapsedCount } = collapseDuplicateBlocks(rawTextContent)
  const textContent = truncateAtWordBoundary(dedupedText, 2000)

  const deterministicSections = buildDeterministicSections({
    mergeTags,
    duplicateWords,
    utmCheck,
    htmlLinksCount: htmlLinks.length,
    altTexts,
    decodedPlain,
    decodedHtml,
    preheader: email.preheader,
    collapsedCount,
  })

  const safeTextContent = textContent
    .replace(/\\/g, '')
    .replace(/"/g, "'")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')

  const safeSubject = sanitiseForJson(email.subject)
  const safeFrom = sanitiseForJson(email.from)
  const safePreheader = email.preheader ? sanitiseForJson(email.preheader) : ''

  const alreadyHandled = SECTION_NAMES.flatMap(name =>
    deterministicSections[name].map(issue => `[${name}] ${issue.text}`)
  ).join('\n')

  const meta = [
    `Subject line: "${safeSubject}" (${email.subject.length} chars)`,
    `From: ${safeFrom}`,
    safePreheader ? `Preview text: "${safePreheader}"` : 'Preview text: NOT DETECTED',
    '',
    'ALREADY HANDLED — these facts are final and have already been assigned a section and a severity in code. Do NOT re-report, re-judge, or contradict any of these; do not invent your own version of any of them:',
    alreadyHandled,
    '',
    'IMPORTANT: The email text content below has been truncated to a reasonable length for processing, cut cleanly at a word boundary. This is a normal part of QA processing, not a rendering defect — do NOT flag this as "truncated content" or a "rendering issue".',
    '',
    'Email text content (desktop/mobile duplicate blocks already consolidated — treat as single copy):',
    safeTextContent,
  ].join('\n')

  const prompt = `You are SendCleared, an expert email marketing QA agent. Return ONLY valid JSON. No markdown, no backticks, no text outside the JSON.

Your job is narrow: everything deterministic has ALREADY been checked and categorised (see ALREADY HANDLED below). You are only being asked for:
1. A 2-3 sentence overall summary of the email's readiness, in plain prose, using single quotes only — never double quotes inside strings. You may cite the exact figures given to you above; never invent or estimate a figure you were not given.
2. Any GENUINELY SUBJECTIVE additional findings, one array per section, that a deterministic check cannot make — specifically:
   - "Content & copy": typos, misspellings, missing words, and grammatical errors found by proofreading the email text below, word by word, like a professional proofreader. Quote the exact error. If none found, return an empty array — do not report a "pass" here, that's implied by finding nothing.
   - "Links & tracking": e.g. a suggestion (severity "info" only — see RULES) to verify SPF/DKIM/DMARC for the sending domain, if relevant. Empty array if nothing to add.
   - "Accessibility": e.g. a suggestion (severity "info" only — see RULES) to check CTA button colour contrast. Empty array if nothing to add.
   - "Spam signals": subjective spam-trigger wording, tone, excessive punctuation or capitalisation in the subject line or body copy. Empty array if nothing to add.
   - "Rendering readiness": any subjective rendering nuance not already covered (e.g. preview text length recommendation). Empty array if nothing to add.

RULES:
- Severity for anything you add must be "critical", "warning", or "info" only — never "pass" (pass is only for the deterministic facts, which are already handled).
- Severity reflects CONFIDENCE, not importance. Use "warning" or "critical" ONLY for something you can directly confirm from the actual email text/HTML given to you. If you are suggesting something be verified, checked, or double-checked — anything you cannot confirm yourself from what's in front of you (e.g. whether SPF/DKIM/DMARC records are actually published, whether a CTA button's contrast ratio actually passes WCAG) — that is always "info", never "warning" or "critical", no matter how important the underlying issue would be if true.
- Keep all issue text under 100 characters.
- Do not comment on or contradict anything in the ALREADY HANDLED list.
- It is completely normal and expected for a section's array to be empty — do not invent an issue just to fill it.

${meta}

Return this exact JSON shape:
{
  "summary": "Two to three sentence summary using single quotes only.",
  "extraIssues": {
    "Content & copy": [ { "severity": "warning", "text": "Example only — omit if nothing found." } ],
    "Links & tracking": [],
    "Accessibility": [],
    "Spam signals": [],
    "Rendering readiness": []
  }
}`

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

  let modelOutput: { summary: string; extraIssues: Partial<Record<SectionName, Issue[]>> }
  try {
    modelOutput = JSON.parse(jsonString)
  } catch (parseError) {
    console.error('JSON parse error:', jsonString.substring(0, 500))
    throw new Error(`JSON parse failed: ${parseError}`)
  }

  // Merge: deterministic issues first, then whatever the model added — and
  // strip anything the model tries to mark "pass", since that severity is
  // reserved for deterministic facts only.
  const sections = SECTION_NAMES.map(name => {
    const extra = (modelOutput.extraIssues?.[name] || []).filter(i => i.severity !== 'pass')
    const issues = [...deterministicSections[name], ...extra]
    return {
      name,
      score: scoreFromIssues(issues),
      issues,
    }
  })

  const score = Math.round(sections.reduce((sum, s) => sum + s.score, 0) / sections.length)

  return {
    score,
    summary: modelOutput.summary,
    sections,
    ctas,
  }
}