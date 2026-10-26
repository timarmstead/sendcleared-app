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
  'Deliverability',
  'Rendering readiness',
] as const

type SectionName = (typeof SECTION_NAMES)[number]

// Header data passed in from the inbound webhook. Everything here is a raw
// fact taken from the received email — nothing is guessed. `available` is
// false when we couldn't capture a meaningful header set at all, so "header
// absent" can be told apart from "headers never reached us".
export interface EmailHeaders {
  available: boolean
  listUnsubscribe: string
  listUnsubscribePost: string
  authenticationResults: string
  receivedSpf: string
  dkimSignature: string
  envelopeSpfResult: string
}

const EMPTY_HEADERS: EmailHeaders = {
  available: false,
  listUnsubscribe: '',
  listUnsubscribePost: '',
  authenticationResults: '',
  receivedSpf: '',
  dkimSignature: '',
  envelopeSpfResult: '',
}

// Deliberately conservative: phrases that are strong spam signals AND rare in
// legitimate eCommerce copy. Things like 'free shipping', 'sale' or 'limited
// time' are normal marketing language and are intentionally NOT on this list.
const SPAM_TRIGGER_PHRASES = [
  'act now', 'act immediately', 'not spam', 'no obligation', 'no strings attached',
  'risk-free', 'risk free', '100% free', '100% guaranteed',
  'you have been selected', "you've been selected",
  'you are a winner', "you're a winner", 'you have won', 'claim your prize',
  'cash bonus', 'earn extra cash', 'earn money fast', 'make money fast',
  'make money online', 'extra income', 'double your income', 'no credit check',
  'dear friend', 'click here', 'click below', 'what are you waiting for',
  'viagra', 'miracle cure', '$$$',
]

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

// Shared HTML -> text pipeline. `blockSeparator` is what block-level tags
// (p, div, td, br, etc.) are replaced with; inline tags are always removed
// with no separator so mid-word markup doesn't split a word.
function htmlToText(html: string, blockSeparator: string): string {
  const withoutHiddenAndCode = stripHiddenDivs(html)
    // Comments (incl. Outlook <!--[if mso]> blocks) and <!DOCTYPE> aren't
    // rendered text. The tag regex below only matches tags starting with a
    // letter, so these must be removed first or they leak into the copy.
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<![^>]*>/g, ' ')
    // Nothing in <head> is rendered copy. This also catches Outlook's
    // <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</...> block, whose
    // bare "96" would otherwise show up as the first "word" of the email.
    .replace(/<head[\s>][\s\S]*?<\/head>/i, '')
    .replace(/<xml[^>]*>[\s\S]*?<\/xml>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')

  // Replace each tag individually: inline tags -> '', block tags -> separator.
  return withoutHiddenAndCode.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g,
    (_match, tagName: string) => (INLINE_TAGS.has(tagName.toLowerCase()) ? '' : blockSeparator)
  )
}

function extractTextFromHtml(html: string): string {
  return htmlToText(html, ' ').replace(/\s+/g, ' ').trim()
}

// The same text, kept as separate chunks of copy (one per block-level
// element). Used for duplicate-word detection so that a word ending one
// element and the same word starting the next (a "SHOP PJUR" button followed
// by a product title that begins "Pjur ...") isn't mistaken for a typo.
function extractTextBlocks(html: string): string[] {
  return htmlToText(html, '\n')
    .split('\n')
    .map(b => b.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
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

interface AltTextResult {
  missing: number
  total: number
  missingSrcs: string[]
  // Images that are the ONLY content of a link and have alt="". These are not
  // decorative: the link has no accessible name, so screen readers read out
  // the raw URL instead.
  linkedEmpty: number
  linkedEmptySrcs: string[]
}

function imageFileName(tag: string): string {
  const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i)
  if (!srcMatch) return '(unknown image)'
  const src = srcMatch[1]
  const filename = src.split('/').pop()?.split('?')[0] || src
  return filename.length > 40 ? filename.substring(0, 37) + '...' : filename
}

function hasAltAttribute(tag: string): boolean {
  return /\balt\s*=/i.test(tag)
}

// True only when alt is present AND quoted-empty (alt="" or alt=''). An
// unquoted alt value is treated as non-empty.
function hasEmptyAlt(tag: string): boolean {
  const m = tag.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
  if (!m) return false
  return (m[1] ?? m[2] ?? '').trim() === ''
}

function extractAltTexts(html: string): AltTextResult {
  const allImgs = [...html.matchAll(/<img[^>]*>/gi)].map(m => m[0])
  const realImgs = allImgs.filter(tag => !isTrackingPixel(tag))

  const total = realImgs.length
  const missingTags = realImgs.filter(tag => !hasAltAttribute(tag))
  const missing = missingTags.length
  const missingSrcs = missingTags.slice(0, 3).map(imageFileName)

  // alt="" is correct for genuinely decorative images, so it is NOT counted as
  // missing above. But it is wrong on an image that is the only content of a
  // link. If the link has its own text, alt="" is fine and is not flagged.
  const linkedEmptyTags: string[] = []
  for (const a of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const inner = a[1]
    const imgs = [...inner.matchAll(/<img[^>]*>/gi)].map(m => m[0]).filter(t => !isTrackingPixel(t))
    if (imgs.length === 0) continue

    const linkText = inner.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s+/g, '').trim()
    if (linkText) continue

    if (imgs.every(hasEmptyAlt)) linkedEmptyTags.push(...imgs)
  }

  return {
    missing,
    total,
    missingSrcs,
    linkedEmpty: linkedEmptyTags.length,
    linkedEmptySrcs: linkedEmptyTags.slice(0, 3).map(imageFileName),
  }
}

// Finds a likely "missing link" on a grid tile: an unlinked image that has the
// same width as a group of linked images (e.g. 7 linked collection tiles plus
// one unlinked tile of the same size). Headers, logos and banners are normally
// a different width from tile groups, so they are not flagged. This is a
// heuristic, so it is reported as 'info', never as a hard failure.
function findUnlinkedTiles(html: string): { count: number; srcs: string[] } {
  const anchorRanges = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map(m => [
    m.index as number,
    (m.index as number) + m[0].length,
  ])

  const widthOf = (tag: string): number | null => {
    const m = tag.match(/\bwidth=["']?(\d+)/i)
    return m ? parseInt(m[1]) : null
  }

  const linkedByWidth = new Map<number, number>()
  const unlinked: { tag: string; width: number }[] = []

  for (const m of html.matchAll(/<img[^>]*>/gi)) {
    const tag = m[0]
    if (isTrackingPixel(tag)) continue
    const width = widthOf(tag)
    if (width === null) continue
    const idx = m.index as number
    const isLinked = anchorRanges.some(([start, end]) => idx > start && idx < end)
    if (isLinked) linkedByWidth.set(width, (linkedByWidth.get(width) || 0) + 1)
    else unlinked.push({ tag, width })
  }

  const unlinkedByWidth = new Map<number, number>()
  unlinked.forEach(u => unlinkedByWidth.set(u.width, (unlinkedByWidth.get(u.width) || 0) + 1))

  const flagged = unlinked.filter(u => {
    const linkedCount = linkedByWidth.get(u.width) || 0
    const unlinkedCount = unlinkedByWidth.get(u.width) || 0
    return linkedCount >= 2 && unlinkedCount <= linkedCount / 2
  })

  return { count: flagged.length, srcs: flagged.slice(0, 3).map(u => imageFileName(u.tag)) }
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

function detectDuplicateWords(blocks: string[]): string[] {
  const found: string[] = []
  for (const block of blocks) {
    for (const m of block.matchAll(/\b(\w+)\s+\1\b/gi)) {
      // Repeated numbers ("10 10") aren't a word typo.
      if (/^\d+$/.test(m[1])) continue
      found.push(m[0].toLowerCase())
    }
  }
  return [...new Set(found)]
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

function normaliseForMatching(text: string): string {
  return decodeHtmlEntities(text).replace(/[\u2018\u2019]/g, "'").toLowerCase()
}

function findSpamTriggers(text: string): string[] {
  const haystack = normaliseForMatching(text)
  const found: string[] = []
  for (const phrase of SPAM_TRIGGER_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const startBoundary = /^\w/.test(phrase) ? '\\b' : ''
    const endBoundary = /\w$/.test(phrase) ? '\\b' : ''
    if (new RegExp(startBoundary + escaped + endBoundary, 'i').test(haystack)) {
      found.push(phrase)
    }
  }
  return found
}

function analyseSpamTriggers(subject: string, bodyText: string): Issue {
  const inSubject = findSpamTriggers(subject)
  const inBody = findSpamTriggers(bodyText).filter(p => !inSubject.includes(p))
  const all = [...inSubject, ...inBody]

  if (all.length === 0) {
    return { severity: 'pass', text: 'No common spam-trigger phrases found in the subject line or body copy.' }
  }

  const list = all.slice(0, 5).map(p => `'${p}'`).join(', ')
  const where = inSubject.length > 0 ? ' (including in the subject line)' : ''
  return {
    // A trigger phrase in the subject matters most; in the body it takes a few to matter.
    severity: inSubject.length > 0 || all.length >= 3 ? 'warning' : 'info',
    text: `Spam-trigger phrase(s) found${where}: ${list}. Consider rewording.`,
  }
}

function analyseSubject(rawSubject: string): Issue[] {
  const issues: Issue[] = []
  const testPrefix = rawSubject.match(/^\s*\[(preview|test)\]\s*/i)
  const subject = rawSubject.replace(/^\s*\[(preview|test)\]\s*/i, '').trim()

  if (testPrefix) {
    issues.push({
      severity: 'info',
      text: `Subject has an ESP test prefix '${testPrefix[0].trim()}' — expected on test sends, not on live sends.`,
    })
  }

  if (subject.length === 0) {
    issues.push({ severity: 'warning', text: 'Subject line is empty.' })
    return issues
  }

  let flagged = false

  const letters = subject.replace(/[^A-Za-z]/g, '')
  const upperLetters = subject.replace(/[^A-Z]/g, '')
  const allCapsWords = subject.split(/\s+/).filter(w => /^[A-Z]{3,}$/.test(w.replace(/[^A-Za-z]/g, ''))).length
  if ((letters.length >= 8 && upperLetters.length / letters.length > 0.6) || allCapsWords >= 3) {
    flagged = true
    issues.push({ severity: 'warning', text: 'Subject line is mostly capitals — a common spam-filter trigger.' })
  }

  if (/[!?]{2,}/.test(subject) || (subject.match(/!/g) || []).length >= 3) {
    flagged = true
    issues.push({ severity: 'warning', text: 'Subject line has excessive punctuation (e.g. !!! or ???).' })
  }

  if (/^\s*(re|fwd?|fw):/i.test(subject)) {
    flagged = true
    issues.push({ severity: 'warning', text: "Subject starts with 'Re:' or 'Fwd:' — fake reply prefixes are a spam signal." })
  }

  if (subject.length > 80) {
    issues.push({ severity: 'info', text: `Subject line is ${subject.length} characters — likely to be cut off on mobile.` })
  } else if (subject.length < 10) {
    issues.push({ severity: 'info', text: `Subject line is very short (${subject.length} characters).` })
  }

  if (!flagged) {
    issues.push({ severity: 'pass', text: 'Subject line has no obvious spam patterns (capitals, punctuation, fake prefixes).' })
  }

  return issues
}

function analyseTextImageBalance(text: string, imageCount: number): Issue {
  const words = text.split(/\s+/).filter(Boolean).length

  if (imageCount >= 3 && words < 50) {
    return {
      severity: 'warning',
      text: `Very little text (${words} words) alongside ${imageCount} images — image-led emails are a spam trigger and look blank with images off.`,
    }
  }
  if (imageCount >= 5 && words / imageCount < 12) {
    return {
      severity: 'info',
      text: `Image-heavy email (${words} words, ${imageCount} images) — make sure the key message still works with images blocked.`,
    }
  }
  return { severity: 'pass', text: `Healthy text-to-image balance (${words} words, ${imageCount} images).` }
}

function authResults(headers: EmailHeaders, mechanism: 'spf' | 'dkim' | 'dmarc'): string[] {
  const re = new RegExp(`\\b${mechanism}\\s*=\\s*([a-z]+)`, 'gi')
  return [...headers.authenticationResults.matchAll(re)].map(m => m[1].toLowerCase())
}

// CloudMailin reports SPF results with underscores (e.g. 'soft_fail'); the RFC
// spelling is 'softfail'. Normalise every spelling to one form before comparing.
function normaliseSpfResult(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/[\s_\-]/g, '')
  return cleaned === 'hardfail' ? 'fail' : cleaned
}

function resolveSpf(headers: EmailHeaders): string | null {
  const fromAuthResults = authResults(headers, 'spf')[0]
  if (fromAuthResults) return normaliseSpfResult(fromAuthResults)
  if (headers.envelopeSpfResult.trim()) return normaliseSpfResult(headers.envelopeSpfResult)
  const m = headers.receivedSpf.match(/^\s*(pass|fail|softfail|neutral|none|temperror|permerror)\b/i)
  return m ? m[1].toLowerCase() : null
}

// The signing domain (d=) can come from two places: the raw DKIM-Signature
// header, or — more commonly, since this is what receiving servers actually
// verified against — a 'header.d=' field reported right alongside the
// dkim= verdict inside Authentication-Results (e.g. the real Omnisend header
// seen in testing: 'dkim=pass header.d=dkim1.omnisend.email header.s=omni2').
// Authentication-Results is checked first since it reflects what was
// actually verified; the raw signature is a fallback when no verdict at all
// was reported.
function dkimSigningDomains(headers: EmailHeaders): string[] {
  const fromAuthResults = [...headers.authenticationResults.matchAll(
    /dkim\s*=\s*[a-z]+[^;]*?header\.d\s*=\s*([a-z0-9.\-]+\.[a-z]{2,})/gi
  )].map(m => m[1].toLowerCase())

  const fromSignature = [...headers.dkimSignature.matchAll(/(?:^|[;\s])d=([a-z0-9.\-]+\.[a-z]{2,})/gi)]
    .map(m => m[1].toLowerCase())

  return [...new Set([...fromAuthResults, ...fromSignature])]
}

function domainsAlign(a: string, b: string): boolean {
  if (!a || !b) return false
  return a === b || a.endsWith('.' + b) || b.endsWith('.' + a)
}

// Everything here is a measured fact from the email's own headers. Where the
// header data simply isn't there, we say so as 'info' — never as a guess.
function buildDeliverabilityIssues(headers: EmailHeaders, fromDomain: string): Issue[] {
  if (!headers.available) {
    return [{
      severity: 'info',
      text: 'Email headers were not captured for this test send, so SPF, DKIM, DMARC and unsubscribe-header checks were skipped.',
    }]
  }

  const issues: Issue[] = []

  // SPF
  const spf = resolveSpf(headers)
  if (spf === 'pass') {
    issues.push({ severity: 'pass', text: 'SPF check passed.' })
  } else if (spf === 'fail' || spf === 'softfail') {
    issues.push({ severity: 'warning', text: `SPF ${spf} — the sending server isn't authorised by this domain's SPF record.` })
  } else if (spf === 'none') {
    issues.push({ severity: 'warning', text: 'No SPF record found for the sending domain.' })
  } else if (spf === 'permerror') {
    issues.push({ severity: 'warning', text: 'SPF permerror — the SPF record is invalid (e.g. too many DNS lookups).' })
  } else if (spf) {
    issues.push({ severity: 'info', text: `SPF result: ${spf} — inconclusive.` })
  }

  // DKIM — a cryptographic pass is NOT the same as DMARC alignment. A message
  // signed only by the ESP's own sending domain (e.g. d=mail.esp.com) can
  // show a clean DKIM pass while still failing DMARC's alignment requirement,
  // because DMARC needs the signing domain to match (or be a subdomain of)
  // the visible From domain — not just a valid signature from ANY domain.
  // So alignment is checked every time DKIM passes, not only as a fallback
  // when no verdict was reported.
  const dkimVerdicts = authResults(headers, 'dkim')
  const dkimDomains = dkimSigningDomains(headers)
  const dkimAlignedDomain = dkimDomains.find(d => domainsAlign(d, fromDomain))
  const dmarc = authResults(headers, 'dmarc')[0]

  if (dkimVerdicts.includes('pass')) {
    if (dkimDomains.length === 0) {
      // Verdict reported but no d= domain available to check alignment against.
      issues.push({ severity: 'pass', text: 'DKIM signature verified.' })
    } else if (dkimAlignedDomain) {
      issues.push({ severity: 'pass', text: `DKIM signature verified and aligned with your From domain (${fromDomain}).` })
    } else {
      const signer = dkimDomains[0]
      if (dmarc === 'pass') {
        // DMARC's own alignment check already accounts for this — SPF alignment covered it.
        issues.push({
          severity: 'info',
          text: `DKIM passed but is signed by ${signer}, not your From domain (${fromDomain || 'unknown'}) — DMARC still passed via SPF alignment.`,
        })
      } else if (dmarc === 'fail') {
        issues.push({
          severity: 'warning',
          text: `DKIM passed but is signed by ${signer}, not your From domain (${fromDomain || 'unknown'}), and DMARC failed — this can push mail to spam or get it rejected.`,
        })
      } else {
        issues.push({
          severity: 'warning',
          text: `DKIM passed but is signed by ${signer}, not your From domain (${fromDomain || 'unknown'}) — fails DKIM alignment for DMARC. DMARC's own result wasn't reported, so it's not confirmed whether SPF alignment covers it instead.`,
        })
      }
    }
  } else if (dkimVerdicts.includes('fail')) {
    issues.push({ severity: 'warning', text: "DKIM verification failed — the message signature didn't validate." })
  } else if (dkimVerdicts.length > 0) {
    issues.push({ severity: 'info', text: `DKIM result: ${dkimVerdicts[0]}.` })
  } else if (dkimDomains.length > 0) {
    issues.push(
      dkimAlignedDomain
        ? { severity: 'info', text: `DKIM signature present for ${dkimAlignedDomain}; a verification result wasn't reported.` }
        : {
            severity: 'info',
            text: `DKIM signed by ${dkimDomains[0]}, not your From domain (${fromDomain || 'unknown'}) — set up branded DKIM for best deliverability.`,
          }
    )
  } else {
    issues.push({ severity: 'warning', text: 'No DKIM signature found on this email.' })
  }

  // DMARC
  if (dmarc === 'pass') {
    issues.push({ severity: 'pass', text: 'DMARC check passed.' })
  } else if (dmarc === 'fail') {
    issues.push({ severity: 'warning', text: 'DMARC failed — receiving servers may quarantine or reject this email.' })
  } else if (dmarc) {
    issues.push({ severity: 'info', text: `DMARC result: ${dmarc}.` })
  }

  const notReported: string[] = []
  if (!spf) notReported.push('SPF')
  if (!dmarc) notReported.push('DMARC')
  if (notReported.length > 0) {
    issues.push({
      severity: 'info',
      text: `${notReported.join(' and ')} ${notReported.length > 1 ? "results weren't" : "result wasn't"} reported for this test send.`,
    })
  }

  // List-Unsubscribe / one-click (RFC 8058) — Gmail & Yahoo bulk-sender requirement.
  // Absence on a TEST send is a warning, not critical: some ESPs only add these on live sends.
  const listUnsub = headers.listUnsubscribe.trim()
  const oneClick = /list-unsubscribe\s*=\s*one-click/i.test(headers.listUnsubscribePost)
  const hasHttpsLink = /<https:\/\/[^>]+>/i.test(listUnsub)

  if (!listUnsub) {
    issues.push({
      severity: 'warning',
      text: 'No List-Unsubscribe header on this test send — Gmail/Yahoo require it (plus one-click) for bulk senders. Some ESPs only add it on live sends.',
    })
  } else if (!oneClick) {
    issues.push({
      severity: 'warning',
      text: 'List-Unsubscribe is present but one-click unsubscribe (List-Unsubscribe-Post) is missing — required by Gmail/Yahoo for bulk senders.',
    })
  } else if (!hasHttpsLink) {
    issues.push({
      severity: 'warning',
      text: 'One-click unsubscribe is declared but List-Unsubscribe has no https link, which RFC 8058 requires.',
    })
  } else {
    issues.push({ severity: 'pass', text: 'List-Unsubscribe with one-click (RFC 8058) is present — meets the Gmail/Yahoo bulk-sender requirement.' })
  }

  return issues
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
  altTexts: AltTextResult
  unlinkedTiles: { count: number; srcs: string[] }
  decodedPlain: string
  decodedHtml: string
  preheader: string
  collapsedCount: number
  subject: string
  visibleText: string
  headers: EmailHeaders
  fromDomain: string
}): Record<SectionName, Issue[]> {
  const {
    mergeTags, duplicateWords, utmCheck, htmlLinksCount,
    altTexts, unlinkedTiles, decodedPlain, decodedHtml, preheader, collapsedCount,
    subject, visibleText, headers, fromDomain,
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
      ...(unlinkedTiles.count > 0
        ? [{
            severity: 'info',
            text: `${unlinkedTiles.count} image(s) look like grid tiles but have no link, unlike the matching tiles around them — check if a link is missing. Specifically: ${unlinkedTiles.srcs.join(', ')}.`,
          } as Issue]
        : []),
    ],

    'Accessibility': [
      ...(altTexts.total === 0
        ? [{ severity: 'info', text: 'No content images found in email (tracking pixels excluded).' } as Issue]
        : []),
      ...(altTexts.missing > 0
        ? [{
            severity: 'warning',
            text: `${altTexts.missing} of ${altTexts.total} content images are missing alt text entirely. Specifically: ${altTexts.missingSrcs.join(', ')}.`,
          } as Issue]
        : []),
      ...(altTexts.linkedEmpty > 0
        ? [{
            severity: 'warning',
            text: `${altTexts.linkedEmpty} linked image(s) have empty alt text, so screen readers will read out the link URL instead. Specifically: ${altTexts.linkedEmptySrcs.join(', ')}.`,
          } as Issue]
        : []),
      ...(altTexts.total > 0 && altTexts.missing === 0 && altTexts.linkedEmpty === 0
        ? [{ severity: 'pass', text: `All ${altTexts.total} content images have alt attributes.` } as Issue]
        : []),
    ],

    'Spam signals': [
      hasUnsubscribe
        ? { severity: 'pass', text: 'Unsubscribe link found.' }
        : { severity: 'critical', text: 'No unsubscribe link detected.' },
      hasPhysicalAddress
        ? { severity: 'pass', text: 'Physical address found in email — CAN-SPAM/GDPR footer requirement met.' }
        : { severity: 'critical', text: 'No physical address detected — required by CAN-SPAM and GDPR.' },
      ...analyseSubject(subject),
      analyseSpamTriggers(subject, visibleText),
      analyseTextImageBalance(visibleText, altTexts.total),
    ],

    'Deliverability': buildDeliverabilityIssues(headers, fromDomain),

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
  headers?: EmailHeaders
}) {
  const decodedHtml = decodeQP(email.html)
  const decodedPlain = decodeQP(email.plainText)

  // Single extraction pass — used for BOTH the summary count and the CTAs dropdown
  const rawCtas = extractCtasFromHtml(decodedHtml)
  const htmlLinks = rawCtas.map(c => c.url)
  const ctas = await resolveAllCtas(rawCtas)

  const rawTextContent = extractTextFromHtml(decodedHtml)
  const altTexts = extractAltTexts(decodedHtml)
  const unlinkedTiles = findUnlinkedTiles(decodedHtml)
  const mergeTags = checkMergeTags(decodedHtml, decodedPlain)
  const utmCheck = checkUTM(htmlLinks)
  const duplicateWords = detectDuplicateWords(extractTextBlocks(decodedHtml))

  const { text: dedupedText, collapsedCount } = collapseDuplicateBlocks(rawTextContent)
  const textContent = truncateAtWordBoundary(dedupedText, 2000)

  const fromDomain = (email.from.match(/@([a-z0-9.\-]+)/i)?.[1] || '').toLowerCase()

  const deterministicSections = buildDeterministicSections({
    mergeTags,
    duplicateWords,
    utmCheck,
    htmlLinksCount: htmlLinks.length,
    altTexts,
    unlinkedTiles,
    decodedPlain,
    decodedHtml,
    preheader: email.preheader,
    collapsedCount,
    subject: email.subject,
    visibleText: dedupedText,
    headers: email.headers ?? EMPTY_HEADERS,
    fromDomain,
  })

  const safeTextContent = textContent
    .replace(/\\/g, '')
    .replace(/"/g, "'")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')

  const safeSubject = sanitiseForJson(email.subject)
  const safeFrom = sanitiseForJson(email.from)
  const safePreheader = email.preheader ? sanitiseForJson(email.preheader) : ''

  const alreadyHandled = SECTION_NAMES.flatMap(name =>
    deterministicSections[name].map(issue => `[${name}] (${issue.severity.toUpperCase()}) ${issue.text}`)
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
1. A 2-3 sentence overall summary of the email's readiness, in plain prose, using single quotes only — never double quotes inside strings. You may cite the exact figures given to you above; never invent or estimate a figure you were not given. Every item in the ALREADY HANDLED list carries its final severity in capitals. When the summary mentions an item, describe it at exactly that severity: use the word 'critical' ONLY for items marked CRITICAL, call WARNING items 'warnings' or 'worth fixing', and treat INFO items as minor notes. Never escalate or soften a severity, and never describe an item as an accessibility, spam or deliverability risk unless it is listed under that section.
2. Any GENUINELY SUBJECTIVE additional findings, one array per section, that a deterministic check cannot make — specifically:
   - "Content & copy": typos, misspellings, missing words, and grammatical errors found by proofreading the email text below, word by word, like a professional proofreader. Quote the exact error. Do NOT report: repeated words that sit in separate parts of the email (e.g. a button label followed by a product name — the text below joins separate blocks with a space), brand or product names, intentional styling or all-caps button labels, numbers, URLs, or anything that looks like code or template syntax. If none found, return an empty array — do not report a "pass" here, that's added automatically.
   - "Links & tracking": e.g. link labels or destinations that look suspicious or misleading. Empty array if nothing to add.
   - "Accessibility": e.g. a suggestion (severity "info" only — see RULES) to check CTA button colour contrast. Empty array if nothing to add.
   - "Spam signals": subjective wording or tone risk NOT already covered in the ALREADY HANDLED list (capitals, punctuation, fake prefixes and common spam phrases are already checked in code) — e.g. misleading urgency or deceptive claims. Empty array if nothing to add.
   - "Rendering readiness": any subjective rendering nuance not already covered (e.g. preview text length recommendation). Empty array if nothing to add.

RULES:
- Severity for anything you add must be "warning" or "info" only — never "critical" and never "pass". Critical is reserved for the deterministic checks in code, because you are reading extracted text, not the rendered email, and can be wrong about it.
- Severity reflects CONFIDENCE, not importance. Use "warning" ONLY for something you can directly confirm from the actual email text/HTML given to you. If you are suggesting something be verified, checked, or double-checked — anything you cannot confirm yourself from what's in front of you (e.g. whether a link destination is reputable, whether a CTA button's contrast ratio actually passes WCAG) — that is always "info", never "warning", no matter how important the underlying issue would be if true.
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
  const textWasTruncated = dedupedText.length > textContent.length
  const sections = SECTION_NAMES.map(name => {
    // Defence in depth: the model may only add warnings and info. Critical
    // belongs to the deterministic checks, so a model false positive can't
    // sink a section score on its own.
    const extra = (modelOutput.extraIssues?.[name] || [])
      .filter(i => i.severity !== 'pass')
      .map(i => (i.severity === 'critical' ? { ...i, severity: 'warning' as const } : i))
    const issues = [...deterministicSections[name], ...extra]

    // Proofreading finds nothing -> say so. Without a visible line a clean
    // email looks as if it was never proofread at all.
    if (name === 'Content & copy' && extra.length === 0 && textContent.length > 0) {
      issues.push({
        severity: 'pass',
        text: textWasTruncated
          ? 'Spelling and grammar proofread (first 2,000 characters of copy): no errors found.'
          : 'Spelling and grammar proofread: no errors found.',
      })
    }
    return {
      name,
      score: scoreFromIssues(issues),
      issues,
    }
  })

  const score = Math.round(sections.reduce((sum, s) => sum + s.score, 0) / sections.length)

  // The summary is prose from the model, so check it against the final
  // severities. If nothing is actually critical, the word must not appear —
  // a "warning" described as "critical" contradicts the report beside it.
  const criticalCount = sections.reduce(
    (n, s) => n + s.issues.filter(i => i.severity === 'critical').length,
    0
  )
  const summary =
    criticalCount === 0
      ? String(modelOutput.summary ?? '').replace(/\bcritically\b/gi, 'importantly').replace(/\bcritical\b/gi, 'notable')
      : modelOutput.summary

  return {
    score,
    summary,
    sections,
    ctas,
  }
}