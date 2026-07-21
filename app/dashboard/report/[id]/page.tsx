'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
}

type Campaign = {
  id: string
  subject: string
  from_address: string
  preheader: string
  received_at: string
  client_id: string
}

export default function ReportPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [approvalLink, setApprovalLink] = useState<string | null>(null)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
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

    if (campaignData) setCampaign(campaignData)

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

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f7f7f5',
      fontFamily: '-apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        background: '#f26600',
        padding: '0 2rem',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '17px' }}>SendCleared</span>
        <button
          onClick={() => router.back()}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.5)',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2.5rem 2rem' }}>

        {/* Report header */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          gap: '1rem',
        }}>
          <div>
            <h1 style={{
              fontSize: '1.4rem',
              fontWeight: 800,
              color: '#134e8e',
              marginBottom: '4px',
              letterSpacing: '-0.01em',
            }}>
              "{campaign.subject || '(no subject)'}"
            </h1>
            <p style={{ fontSize: '13px', color: '#9a9891' }}>
              From {campaign.from_address} · {new Date(campaign.received_at).toLocaleString()}
            </p>
            {report && (
              <p style={{ fontSize: '13px', color: '#5a5a56', marginTop: '4px' }}>
                {report.sections?.flatMap(s => s.issues).filter(i => i.severity === 'critical').length} critical ·{' '}
                {report.sections?.flatMap(s => s.issues).filter(i => i.severity === 'warning').length} warnings ·{' '}
                {report.sections?.flatMap(s => s.issues).filter(i => i.severity === 'pass').length} passed
              </p>
            )}
          </div>
          {report && (
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              border: `3px solid ${getScoreColor(report.score)}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: '#fff',
            }}>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#0f1117', lineHeight: 1 }}>
                {report.score}
              </span>
              <span style={{ fontSize: '9px', color: '#9a9891' }}>/100</span>
            </div>
          )}
        </div>

        {/* No report yet */}
        {!report && (
          <div style={{
            background: '#fff',
            padding: '2rem',
            borderRadius: '12px',
            border: '1px solid rgba(0,0,0,0.09)',
            textAlign: 'center',
          }}>
            <p style={{ color: '#9a9891', fontSize: '14px' }}>
              QA report is still processing — refresh in a few seconds.
            </p>
          </div>
        )}

        {/* Summary */}
        {report && (
          <>
            <div style={{
              background: '#fff',
              borderLeft: '3px solid #5a9020',
              borderRadius: '0 8px 8px 0',
              padding: '12px 16px',
              marginBottom: '12px',
              fontSize: '14px',
              color: '#0f1117',
              lineHeight: 1.6,
            }}>
              {report.summary}
            </div>

            {/* Sections */}
            {report.sections?.map((section, i) => (
              <div key={i} style={{
                background: '#fff',
                borderRadius: '10px',
                border: '1px solid rgba(0,0,0,0.09)',
                padding: '1rem 1.25rem',
                marginBottom: '8px',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f1117' }}>
                    {section.name}
                  </span>
                  <span style={{ fontSize: '12px', color: '#9a9891' }}>
                    {section.score}/100
                  </span>
                </div>
                <div style={{
                  height: '3px',
                  background: '#f0efe9',
                  borderRadius: '2px',
                  overflow: 'hidden',
                  marginBottom: '10px',
                }}>
                  <div style={{
                    width: `${section.score}%`,
                    height: '100%',
                    background: getScoreColor(section.score),
                    borderRadius: '2px',
                  }} />
                </div>
                {section.issues?.map((issue, j) => {
                  const badge = getBadgeStyle(issue.severity)
                  return (
                    <div key={j} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '7px 0',
                      borderBottom: j < section.issues.length - 1 ? '0.5px solid rgba(0,0,0,0.07)' : 'none',
                      fontSize: '13px',
                      color: '#0f1117',
                      lineHeight: 1.45,
                    }}>
                      <span style={{
                        background: badge.background,
                        color: badge.color,
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        marginTop: '1px',
                      }}>
                        {badge.label}
                      </span>
                      <span>{issue.text}</span>
                    </div>
                  )
                })}
              </div>
            ))}

            {/* Approval CTA */}
            <div style={{
              background: '#134e8e',
              borderRadius: '12px',
              padding: '1.25rem',
              marginTop: '1rem',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '3px' }}>
                    Ready to send for client approval?
                  </p>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                    Generates a passwordless magic link — client approves in one click
                  </p>
                </div>
                {!approvalLink && (
                  <button
                    onClick={generateApprovalLink}
                    disabled={generatingLink}
                    style={{
                      background: generatingLink ? '#8fd9ab' : '#4ade80',
                      color: '#0f1117',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: generatingLink ? 'default' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {generatingLink ? 'Generating…' : 'Generate approval link →'}
                  </button>
                )}
              </div>

              {linkError && (
                <p style={{ color: '#ffb4b4', fontSize: '12px', marginTop: '10px' }}>
                  {linkError}
                </p>
              )}

              {approvalLink && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '12px',
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  padding: '8px 8px 8px 14px',
                }}>
                  <span style={{
                    color: '#fff',
                    fontSize: '12px',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {approvalLink}
                  </span>
                  <button
                    onClick={copyLink}
                    style={{
                      background: copied ? '#4ade80' : 'rgba(255,255,255,0.15)',
                      color: copied ? '#0f1117' : '#fff',
                      border: 'none',
                      padding: '7px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}