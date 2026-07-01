export function decodeQP(str: string): string {
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
}

export function extractHeader(raw: string, name: string): string {
  const match = raw.match(new RegExp(`^${name}:\\s*(.+)`, 'im'))
  return match ? match[1].trim() : ''
}

export function extractPreheader(html: string): string {
  const markers = ['display:none', 'display: none']

  for (const marker of markers) {
    const markerIndex = html.indexOf(marker)
    if (markerIndex === -1) continue

    const tagClose = html.indexOf('>', markerIndex)
    if (tagClose === -1) continue

    const divClose = html.indexOf('</div>', tagClose)
    if (divClose === -1) continue

    let text = html.substring(tagClose + 1, divClose)

    // Remove \r\n and leading/trailing whitespace first
    text = text.replace(/\r\n/g, ' ').replace(/\r/g, ' ').replace(/\n/g, ' ')

    // Remove the ͏ character (U+034F combining grapheme joiner) and all variants
    // Use charCodeAt-based replacement to be absolutely sure
    text = text.split('').filter(char => {
      const code = char.charCodeAt(0)
      // Keep only printable ASCII and common safe unicode
      // Remove invisible/zero-width/control characters
      if (code <= 0x001F) return false  // control chars
      if (code === 0x007F) return false  // DEL
      if (code >= 0x0080 && code <= 0x009F) return false  // C1 controls
      if (code === 0x00AD) return false  // soft hyphen
      if (code === 0x034F) return false  // combining grapheme joiner ͏
      if (code === 0x061C) return false  // arabic letter mark
      if (code >= 0x200B && code <= 0x200F) return false  // zero width spaces
      if (code >= 0x202A && code <= 0x202E) return false  // directional formatting
      if (code >= 0x2060 && code <= 0x2064) return false  // word joiner etc
      if (code >= 0x206A && code <= 0x206F) return false  // deprecated formatting
      if (code === 0x2007) return false  // figure space
      if (code === 0xFEFF) return false  // BOM
      if (code === 0xFFA0) return false  // halfwidth hangul filler
      if (code === 0x3164) return false  // hangul filler
      return true
    }).join('')

    // Clean up HTML entities and extra whitespace
    text = text
      .replace(/&nbsp;/g, '')
      .replace(/&#[0-9]+;/g, '')
      .replace(/&[a-z]+;/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (text.length > 3) {
      return text.substring(0, 150)
    }
  }

  return ''
}

export function extractLinks(html: string): string[] {
  const matches = html.matchAll(/href=["']([^"']+)["']/gi)
  return [...matches].map(m => m[1]).filter(url => url.startsWith('http'))
}

export function extractLinksFromPlainText(plain: string): string[] {
  const matches = [...plain.matchAll(/https?:\/\/[^\s\)>]+/g)]
  return matches.map(m => m[0]).filter(url => url.startsWith('http'))
}

export function parseEmail(raw: string) {
  raw = raw.replace(/\r\n/g, '\n')

  const subject = extractHeader(raw, 'Subject')
  const from = extractHeader(raw, 'From')
  const to = extractHeader(raw, 'To')

  const boundaryMatch = raw.match(/boundary=["']?([^"'\r\n;]+)["']?/i)
  let html = ''
  let plainText = ''

  if (boundaryMatch) {
    const boundary = boundaryMatch[1].trim()
    const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts = raw.split(new RegExp('--' + escaped + '(?:--)?'))

    for (const part of parts) {
      const ct = part.match(/Content-Type:\s*([^\r\n;]+)/i)
      const cte = part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)
      if (!ct) continue

      const contentType = ct[1].trim().toLowerCase()
      const encoding = cte ? cte[1].trim().toLowerCase() : ''
      const bodyStart = part.search(/\n\n/)
      if (bodyStart === -1) continue

      let body = part.slice(bodyStart).trim()
      if (encoding === 'quoted-printable') body = decodeQP(body)

      if (contentType.includes('text/html')) html = body
      if (contentType.includes('text/plain')) plainText = body
    }
  }

  const preheader = extractPreheader(html)
  const links = extractLinks(html)
  const plainLinks = extractLinksFromPlainText(plainText)

  return { subject, from, to, html, plainText, preheader, links, plainLinks, raw }
}