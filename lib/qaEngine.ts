import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function runQA(email: {
  subject: string
  from: string
  preheader: string
  html: string
  plainText: string
  links: string[]
}) {
  const meta = [
    email.subject ? `Subject line: "${email.subject}"` : '',
    email.from ? `From: ${email.from}` : '',
    email.preheader ? `Preheader: "${email.preheader}"` : '',
    email.plainText ? `Plain text version: present` : `Plain text version: MISSING`,
    email.links.length
      ? `Links found (${email.links.length}): ${email.links.slice(0, 10).join(', ')}`
      : 'No links found',
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = `You are SendCleared, an expert email marketing QA agent. Analyse this email and return ONLY a raw JSON object — no markdown, no explanation.

${meta}

Return exactly this structure:
{
  "score": <integer 0-100>,
  "summary": "<2-3 sentence plain English summary for an agency to share with their client>",
  "sections": [
    {
      "name": "<section name>",
      "score": <integer 0-100>,
      "issues": [
        { "severity": "critical|warning|info|pass", "text": "<specific actionable finding>" }
      ]
    }
  ]
}

Sections must be exactly: "Content & copy", "Links & tracking", "Accessibility", "Spam signals", "Rendering readiness".
Each section needs 3-4 issues. Be specific — reference actual content, attributes, and patterns.

Check for:
- Unresolved merge/template tags: \${...} {{...}} — CRITICAL if found
- Empty or missing alt text on non-decorative images — WARNING
- Links without UTM parameters — WARNING
- Preheader text quality (ideal 40-90 chars) — check if meaningful
- Subject line length (ideal 30-50 chars) and spam trigger words
- Unsubscribe link present — CRITICAL if missing
- Physical address in footer — CRITICAL if missing
- Plain text version — WARNING if absent
- Image-to-text ratio — WARNING if too image-heavy
- CTA button text — clear and action-oriented?

Email HTML:
${email.html.substring(0, 6000)}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()

  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1) throw new Error('No JSON in QA response')

  return JSON.parse(raw.substring(start, end + 1))
}