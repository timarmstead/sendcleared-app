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
  // Use index-based extraction — more reliable than regex for multiline content
  const markers = ['display:none', 'display: none']

  for (const marker of markers) {
    const markerIndex = html.indexOf(marker)
    if (markerIndex === -1) continue

    // Find the closing > of the opening tag
    const tagClose = html.indexOf('>', markerIndex)
    if (tagClose === -1) continue

    // Find the closing </div>
    const divClose = html.indexOf('</div>', tagClose)
    if (divClose === -1) continue

    // Extract everything between > and </div>
    const raw = html.substring(tagClose + 1, divClose)

    const text = raw
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/[\u00AD]/g, '')
      .replace(/[\u034F]/g, '')
      .replace(/[\u200B-\u200F]/g, '')
      .replace(/[\u202A-\u202E]/g, '')
      .replace(/[\u2060-\u2064]/g, '')
      .replace(/[\u206A-\u206F]/g, '')
      .replace(/[\u2007]/g, '')
      .replace(/[\uFEFF]/g, '')
      .replace(/͏/g, '')
      .replace(/\xad/g, '')
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