export function decodeQP(str: string): string {
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)))
}

export function extractHeader(raw: string, name: string): string {
  const match = raw.match(new RegExp(`^${name}:\\s*(.+)`, 'im'))
  return match ? match[1].trim() : ''
}

export function extractPreheader(html: string): string {
  const patterns = [
    /display:\s*none[^>]*>([^<]{10,})</i,
    /display:\s*none[^>]*>([\s\S]{10,?}?)<\/div>/i,
    /visibility:\s*hidden[^>]*>([^<]{10,})</i,
    /font-size:\s*0[^>]*>([^<]{10,})</i,
    /class=["'][^"']*preheader[^"']*["'][^>]*>([^<]{10,})</i,
    /class=["'][^"']*preview[^"']*["'][^>]*>([^<]{10,})</i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) {
      const text = match[1]
        .replace(/[\u200C\u00A0\u200B\uFEFF\u034F\u2028\u2029]/g, '')
        .replace(/&nbsp;/g, '')
        .replace(/&#[0-9]+;/g, '')
        .replace(/&[a-z]+;/g, '')
        .trim()
      if (text.length > 5) return text.substring(0, 150)
    }
  }

  return ''
}

export function extractLinks(html: string): string[] {
  const matches = html.matchAll(/href=["']([^"']+)["']/gi)
  return [...matches].map(m => m[1]).filter(url => url.startsWith('http'))
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

  return { subject, from, to, html, plainText, preheader, links, raw }
}