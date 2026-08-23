'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'

type Report = {
  score: number
  summary: string
  sections: {
    name: string
    score: number
    issues: {
      severity: string
      text: string
    }[]
  }[]
  ctas: { label: string; url: string; trackingUrl?: string; unresolved?: boolean }[]
}

type Campaign = {
  id: string
  subject: string
  from_address: string
  reply_to: string | null
  preheader: string
  received_at: string
  client_id: string
  html_body: string
}

type ClientData = {
  inbox_address: string
}

export default function ReportPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [client, setClient] = useState<ClientData | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [approvalLink, setApprovalLink] = useState<string | null>(null)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [inboxCopied, setInboxCopied] = useState(false)
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop')
  const router = useRouter()
  const params = useParams()
  const campaignId = params.id as string

  useEffect(() => {
    loadReport()
  }, [campaignId])

  async function loadReport() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: campaignData } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (campaignData) {
      setCampaign(campaignData)

      const { data: clientData } = await supabase
        .from('clients')
        .select('inbox_address')
        .eq('id', campaignData.client_id)
        .single()

      if (clientData) setClient(clientData)
    }

    const { data: reportData } = await supabase
      .from('reports')
      .select('*')
      .eq('campaign_id', campaignId)
      .single()

    if (reportData) setReport(reportData)

    setLoading(false)
  }

  async function generateApprovalLink() {
    setGeneratingLink(true)
    setLinkError(null)
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.limit_reached) {
          throw new Error(data.error + ' Visit Billing to upgrade.')
        }
        throw new Error(data.error || 'Failed to generate link')
      }
      setApprovalLink(`${window.location.origin}/r/${data.token}`)
    } catch (err: any) {
      setLinkError(err.message)
    } finally {
      setGeneratingLink(false)
    }
  }

  function copyLink() {
    if (!approvalLink) return
    navigator.clipboard.writeText(approvalLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyInboxAddress() {
    if (!client) return
    navigator.clipboard.writeText(client.inbox_address)
    setInboxCopied(true)
    setTimeout(() => setInboxCopied(false), 2000)
  }

  function getBadgeStyle(severity: string) {
    switch (severity) {
      case 'critical':
        return { background: '#fcebeb', color: '#791f1f', label: '✕ CRITICAL' }
      case 'warning':
        return { background: '#faeeda', color: '#5c3308', label: '⚠ WARNING' }
      case 'pass':
        return { background: '#eaf3de', color: '#27500a', label: '✓ PASS' }
      default:
        return { background: '#e3eff9', color: '#0c3d6e', label: 'ℹ INFO' }
    }
  }

  function getScoreColor(score: number) {
    if (score >= 80) return '#5a9020'
    if (score >= 60) return '#b06d10'
    return '#d94040'
  }

  function getStatusLabel(score: number) {
    if (score >= 80) return { label: 'Send-ready', color: '#5a9020' }
    if (score >= 60) return { label: 'Almost ready', color: '#b06d10' }
    return { label: 'Needs work', color: '#d94040' }
  }

  function getHeadline(criticalCount: number, warningCount: number) {
    if (criticalCount > 0) {
      return `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} need${criticalCount === 1 ? 's' : ''} fixing before this is ready to send`
    }
    if (warningCount > 0) {
      return `${warningCount} quick win${warningCount > 1 ? 's' : ''} left to polish before sending`
    }
    return 'This email is ready to send'
  }

  if (loading) {
    return (
      <div style={{ padding: '3rem', fontFamily: '-apple-system, sans-serif' }}>
        Loading report...
      </div>
    )
  }

  if (!campaign) {
    return (
      <div style={{ padding: '3rem', fontFamily: '-apple-system, sans-serif' }}>
        Campaign not found.
      </div>
    )
  }

  const allIssues = report?.sections?.flatMap(s => s.issues) || []
  const criticalCount = allIssues.filter(i => i.severity === 'critical').length
  const warningCount = allIssues.filter(i => i.severity === 'warning').length
  const passCount = allIssues.filter(i => i.severity === 'pass').length
  const status = report ? getStatusLabel(report.score) : null

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', fontSize: '12px', fontWeight: 500,
    borderRadius: '20px', border: '1px solid rgba(0,0,0,0.14)',
    background: active ? '#0f1117' : '#f0efe9', color: active ? '#fff' : '#5a5a56',
    cursor: 'pointer',
  })

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f7f7f5',
      fontFamily: '-apple-system, sans-serif',
    }}>
      <DashboardHeader showBack />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2.5rem 2rem' }}>

        <h1 style={{
          fontSize: '1.4rem', fontWeight: 800, color: '#134e8e',
          marginBottom: '4px', letterSpacing: '-0.01em',
        }}>
          "{campaign.subject || '(no subject)'}"
        </h1>
        <p style={{ fontSize: '13px', color: '#5a5a56', marginBottom: '2px' }}>
          From {campaign.from_address} · {new Date(campaign.received_at).toLocaleString()}
        </p>
        <p style={{ fontSize: '13px', color: '#5a5a56', marginBottom: '2px' }}>
          Reply-to: {campaign.reply_to || 'Not set'}
        </p>
        <p style={{ fontSize: '13px', color: '#5a5a56', marginBottom: '1.5rem' }}>
          Preview text: {campaign.preheader || 'Not detected'}
        </p>

        {!report && (
          <div style={{
            background: '#fff', padding: '2rem', borderRadius: '12px',
            border: '1px solid rgba(0,0,0,0.09)', textAlign: 'center',
          }}>
            <p style={{ color: '#9a9891', fontSize: '14px' }}>
              QA report is still processing — refresh in a few seconds.
            </p>
          </div>
        )}

        {report && status && (
          <>
            {/* Hero */}
            <div style={{
              background: '#fff', borderRadius: '14px', border: '1px solid rgba(0,0,0,0.09)',
              padding: '1.75rem', marginBottom: '1.25rem', display: 'flex', gap: '2rem', alignItems: 'center',
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px', color: status.color }}>
                  {status.label}
                </p>
                <p style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '8px', letterSpacing: '-0.01em' }}>
                  {getHeadline(criticalCount, warningCount)}
                </p>
                <p style={{ fontSize: '13px', color: '#5a5a56', marginBottom: '1.1rem' }}>
                  {criticalCount > 0
                    ? 'Work through the fix queue below, starting with the critical issues.'
                    : 'Review the details below before sending for client approval.'}
                </p>
                <div style={{
                  position: 'relative', height: '8px', borderRadius: '4px', marginBottom: '6px',
                  background: 'linear-gradient(to right, #d94040 0%, #d94040 60%, #b06d10 60%, #b06d10 80%, #5a9020 80%, #5a9020 100%)',
                }}>
                  <div style={{
                    position: 'absolute', top: '50%', left: `${report.score}%`,
                    transform: 'translate(-50%,-50%)', width: '16px', height: '16px',
                    borderRadius: '50%', background: '#fff', border: '3px solid #0f1117',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9a9891' }}>
                  <span>Needs work</span>
                  <span>Almost ready</span>
                  <span>Send-ready</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexShrink: 0 }}>
                <div style={{
                  width: '78px', height: '78px', borderRadius: '50%', background: '#fff',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  borderWidth: '5px', borderStyle: 'solid', borderColor: getScoreColor(report.score),
                }}>
                  <span style={{ fontSize: '26px', fontWeight: 800, lineHeight: 1 }}>{report.score}</span>
                  <span style={{ fontSize: '10px', color: '#9a9891' }}>/100</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 600, color: '#791f1f' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d94040' }} />{criticalCount} critical
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 600, color: '#5c3308' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#b06d10' }} />{warningCount} warnings
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 600, color: '#27500a' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5a9020' }} />{passCount} passed
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.25rem' }}>
              {/* Main column */}
              <div>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f1117', marginBottom: '8px' }}>Summary</p>
                <div style={{
                  background: '#fff', borderLeft: '3px solid #5a9020', borderRadius: '0 8px 8px 0',
                  padding: '12px 16px', marginBottom: '1.25rem', fontSize: '14px', color: '#0f1117', lineHeight: 1.6,
                }}>
                  {report.summary}
                </div>

                {report.sections?.map((section, i) => (
                  <div key={i} style={{
                    background: '#fff', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.09)',
                    padding: '1rem 1.25rem', marginBottom: '8px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f1117' }}>{section.name}</span>
                      <span style={{ fontSize: '12px', color: '#9a9891' }}>{section.score}/100</span>
                    </div>
                    <div style={{ height: '3px', background: '#f0efe9', borderRadius: '2px', overflow: 'hidden', marginBottom: '10px' }}>
                      <div style={{ width: `${section.score}%`, height: '100%', background: getScoreColor(section.score), borderRadius: '2px' }} />
                    </div>
                    {section.issues?.map((issue, j) => {
                      const badge = getBadgeStyle(issue.severity)
                      return (
                        <div key={j} style={{
                          display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '7px 0',
                          borderBottom: j < section.issues.length - 1 ? '0.5px solid rgba(0,0,0,0.07)' : 'none',
                          fontSize: '13px', color: '#0f1117', lineHeight: 1.45,
                        }}>
                          <span style={{
                            background: badge.background, color: badge.color, fontSize: '10px', fontWeight: 700,
                            padding: '2px 7px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0, marginTop: '1px',
                          }}>
                            {badge.label}
                          </span>
                          <span>{issue.text}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}

                {report.ctas && report.ctas.length > 0 && (
                  <details style={{
                    background: '#fff', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.09)',
                    padding: '0.75rem 1.25rem', marginBottom: '8px',
                  }}>
                    <summary style={{ fontSize: '14px', fontWeight: 600, color: '#0f1117', cursor: 'pointer', userSelect: 'none' }}>
                      View all CTAs and links ({report.ctas.length})
                    </summary>
                    <div style={{ marginTop: '10px' }}>
                      {report.ctas.map((cta, i) => (
                        <div key={i} style={{
                          padding: '8px 0', borderBottom: i < report.ctas.length - 1 ? '0.5px solid rgba(0,0,0,0.07)' : 'none',
                        }}>
                          <p style={{ fontSize: '13px', fontWeight: 500, color: '#0f1117', marginBottom: '2px' }}>{cta.label}</p>

                          <a
                          href={cta.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '12px', color: '#134e8e', wordBreak: 'break-all', textDecoration: 'none' }}
                          >
                            {cta.url}
                          </a>
                          {cta.trackingUrl && (
                            <p style={{ fontSize: '11px', color: '#9a9891', marginTop: '2px' }}>Resolved from ESP tracking link</p>
                          )}
                          {cta.unresolved && (
                            <p style={{ fontSize: '11px', color: '#b06d10', marginTop: '2px' }}>⚠ Could not resolve destination — showing tracking link</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f1117', marginBottom: '8px', marginTop: '1.25rem' }}>Email preview</p>
                <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.09)', padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                    <button onClick={() => setView('desktop')} style={toggleBtnStyle(view === 'desktop')}>Desktop</button>
                    <button onClick={() => setView('mobile')} style={toggleBtnStyle(view === 'mobile')}>Mobile</button>
                  </div>
                  <div style={{
                    background: '#ebebeb', borderRadius: view === 'mobile' ? '20px' : '6px',
                    padding: view === 'mobile' ? '12px' : '10px',
                    border: view === 'mobile' ? '3px solid #333' : '1px solid rgba(0,0,0,0.14)',
                    maxWidth: view === 'mobile' ? '300px' : 'none', margin: view === 'mobile' ? '0 auto' : '0',
                  }}>
                    <iframe
                      sandbox=""
                      srcDoc={campaign.html_body || '<p style="font-family:sans-serif;padding:20px;color:#888">No preview available</p>'}
                      style={{ width: '100%', height: view === 'mobile' ? '420px' : '380px', border: 'none', borderRadius: '4px', background: '#fff' }}
                    />
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              <div>
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.09)', padding: '1.1rem', marginBottom: '1rem' }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '.9rem' }}>Category breakdown</p>
                  {report.sections?.map((section, i) => (
                    <div key={i} style={{ marginBottom: i < report.sections.length - 1 ? '.85rem' : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#5a5a56', marginBottom: '4px' }}>
                        <span>{section.name}</span><span>{section.score}/100</span>
                      </div>
                      <div style={{ height: '5px', borderRadius: '3px', background: '#f0efe9', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: '3px', width: `${section.score}%`, background: getScoreColor(section.score) }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.09)', padding: '1.1rem', marginBottom: '1rem' }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '.9rem' }}>Made changes?</p>
                  <p style={{ fontSize: '12px', color: '#5a5a56', lineHeight: 1.5, marginBottom: '.75rem' }}>
                    Fix the issues in your ESP, then resend a test email to this same address to see your updated score.
                  </p>
                  {client && (
                    <div
                      onClick={copyInboxAddress}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                        background: '#f7f7f5', border: '1px solid rgba(0,0,0,0.09)', borderRadius: '8px',
                        padding: '8px 10px', fontFamily: 'monospace', fontSize: '11px', color: '#f26600', cursor: 'pointer',
                      }}
                    >
                      <span>{client.inbox_address}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={inboxCopied ? '#27500a' : '#f26600'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </div>
                  )}
                </div>

                <div style={{ background: '#134e8e', borderRadius: '12px', padding: '1.25rem' }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '3px' }}>Ready to send for client approval?</p>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '12px' }}>
                    Generates a passwordless magic link — client approves in one click
                  </p>
                  {!approvalLink && (
                    <button
                      onClick={generateApprovalLink}
                      disabled={generatingLink}
                      style={{
                        width: '100%', background: generatingLink ? '#8fd9ab' : '#4ade80', color: '#0f1117',
                        border: 'none', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                        cursor: generatingLink ? 'default' : 'pointer',
                      }}
                    >
                      {generatingLink ? 'Generating…' : 'Generate approval link →'}
                    </button>
                  )}
                  {linkError && (
                    <p style={{ color: '#ffb4b4', fontSize: '12px', marginTop: '10px' }}>
                      {linkError.includes('Visit Billing') ? (
                        <>
                          {linkError.replace('Visit Billing to upgrade.', '')}

                          <a href="/dashboard/billing" style={{ color: '#4ade80', textDecoration: 'underline' }}>
                            Visit Billing to upgrade.
                          </a>
                        </>
                      ) : linkError}
                    </p>
                  )}
                  {approvalLink && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px',
                      background: 'rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 8px 8px 14px',
                    }}>
                      <span style={{ color: '#fff', fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {approvalLink}
                      </span>
                      <button
                        onClick={copyLink}
                        style={{
                          background: copied ? '#4ade80' : 'rgba(255,255,255,0.15)', color: copied ? '#0f1117' : '#fff',
                          border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}