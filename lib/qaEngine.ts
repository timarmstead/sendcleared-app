import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 2000)
}

export async function runQA(email: {
  subject: string
  from: string
  preheader: string
  html: string
  plainText: string
  links: string[]
}) {
  // Truncate HTML safely to avoid JSON parse errors
  const htmlSample = email.html.substring(0, 4000)
  const textSample = stripHtml(email.html).substring(0, 1000)

  const meta = [
    email.subject ? `Subject line: "${email.subject}"` : '',
    email.from ? `From: ${email.from}` : '',
    email.preheader ? `Preheader: "${email.preheader}"` : 'Preheader: NOT SET',
    email.plainText ? 'Plain text version: present' : 'Plain text version: MISSING',
    email.links.length
      ? `Links found (${email.links.length}): ${email.links.slice(0, 8).join(', ')}`
      : 'No links found',
    textSample ? `Email text content: ${textSample}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = `You are SendCleared, an expert email marketing QA agent. Analyse this email and return ONLY a valid JSON object. No markdown, no backticks, no explanation — raw JSON only.

${meta}

Return exactly this JSON structure:
{
  "score": 75,
  "summary": "Two sentence summary here.",
  "sections": [
    {
      "name": "Content & copy",
      "score": 80,
      "issues": [
        { "severity": "pass", "text": "Finding here." }
      ]
    }
  ]
}

Rules:
- score is an integer 0-100
- sections must be exactly these 5 names: "Content & copy", "Links & tracking", "Accessibility", "Spam signals", "Rendering readiness"
- each section has 3-4 issues
- severity is one of: critical, warning, info, pass
- all strings must be properly escaped JSON — no unescaped quotes or special characters
- be specific but keep each issue text under 120 characters

Check for:
- Unresolved merge tags like \${...} or {{...}} — critical
- Missing UTM parameters on links — warning  
- Empty alt text on images — warning
- Subject line length and spam words
- Unsubscribe link present — critical if missing
- Physical address in footer — critical if missing
- Plain text version missing — warning
- CTA clarity

HTML sample:
${htmlSample}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()

  // Clean any markdown formatting just in case
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