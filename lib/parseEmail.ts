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
  // html should already be QP-decoded before calling this
  const patterns = [
    // Standard hidden div — most ESPs including Klaviyo
    /display:\s*none[^>]*>\s*([^<]{5,})/i,
    // Visibility hidden
    /visibility:\s*hidden[^>]*>\s*([^<]{5,})/i,
    // Font size 0
    /font-size:\s*0[^>]*>\s*([^<]{5,})/i,
    // Max height 0
    /max-height:\s*0[^>]*>\s*([^<]{5,})/i,
    // Preheader class
    /class=["'][^"']*preheader[^"']*["'][^>]*>\s*([^<]{5,})/i,
    // Preview class
    /class=["'][^"']*preview[^"']*["'][^>]*>\s*([^<]{5,})/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) {
      const text = match[1]
        // Strip all invisible/padding unicode characters ESPs add
        .replace(/[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180D\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\u3164\uFEFF\uFFA0]/g, '')
        // Strip Klaviyo specific spacers
        .replace(/\u2007/g, '')  // figure space
        .replace(/\u034F/g, '')  // combining grapheme joiner
        .replace(/\u00A0/g, '')  // non-breaking space
        .replace(/&nbsp;/g, '')
        .replace(/&#[0-9]+;/g, '')
        .replace(/&[a-z]+;/g, '')
        .replace(/\s+/g, ' ')
        .trim()

      if (text.length > 3) {
        return text.substring(0, 150)
      }
    }
  }

  return ''
}

export function extractLinks(html: string): string[] {
  const matches = html.matchAll(/href=["']([^"']+)["']/gi)
  return [...matches].map(m => m[1]).filter(url => url.startsWith('http'))
}

export function extractLinksFromPlainText(plain: string): string[] {
  const matches = plain.matchAll(/https?:\/\/[^\s\)]+/g)
  return [...matches].map(m => m[0]).filter(url => url.startsWith('http'))
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

  // Extract preheader from DECODED html
  const preheader = extractPreheader(html)
  const links = extractLinks(html)
  const plainLinks = extractLinksFromPlainText(plainText)

  return { subject, from, to, html, plainText, preheader, links, plainLinks, raw }
}