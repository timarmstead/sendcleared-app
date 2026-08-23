'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'

type Approval = {
  status: string
  approver_name: string | null
  approved_at: string | null
  changes_requested: string | null
  expires_at: string
  is_expired: boolean
}

type Campaign = {
  id: string
  subject: string
  from_address: string
  preheader: string
  html_body: string
  received_at: string
}

type Report = {
  score: number
  summary: string
  sections: {
    name: string
    score: number
    issues: { severity: string; text: string }[]
  }[]
}

export default function ApprovalPage() {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [approval, setApproval] = useState<Approval | null>(null)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [report, setReport] = useState<Report | null>(null)

  const [name, setName] = useState('')
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop')
  const [showChangesForm, setShowChangesForm] = useState(false)
  const [changesText, setChangesText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    loadApproval()
  }, [token])

  async function loadApproval() {
    try {
      const res = await fetch(`/api/public-approval/${token}`)
      const data = await res.json()
      if (!res.ok) {
        setNotFound(true)
        return
      }
      setApproval(data.approval)
      setCampaign(data.campaign)
      setReport(data.report)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove() {
    setActionError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public-approval/${token}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver_name: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      await loadApproval()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendChanges() {
    setActionError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public-approval/${token}/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes_text: changesText, approver_name: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      await loadApproval()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setSubmitting(false)
    }
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

  function TopBar() {
    return (
      <div style={{
        background: '#f26600',
        padding: '0 2rem',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Image
          src="/sendcleared-logo.png"
          alt="SendCleared"
          width={140}
          height={29}
          priority
          style={{ height: '29px', width: 'auto' }}
        />
      </div>
    )
  }

  const shellStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: '#f7f7f5',
    fontFamily: '-apple-system, sans-serif',
  }
  const containerStyle: React.CSSProperties = {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '2.5rem 2rem',
  }
  const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: '10px',
    border: '1px solid rgba(0,0,0,0.09)',
    padding: '1rem 1.25rem',
    marginBottom: '8px',
  }

  if (loading) {
    return (
      <div style={shellStyle}>
        <TopBar />
        <div style={containerStyle}>
          <p style={{ color: '#9a9891', fontSize: '14px' }}>Loading…</p>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={shellStyle}>
        <TopBar />
        <div style={containerStyle}>
          <div style={{ ...cardStyle, padding: '2rem', textAlign: 'center' }}>
            <p style={{ color: '#0f1117', fontSize: '14px' }}>
              This approval link isn't valid. Please check the link or contact your agency.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (approval?.is_expired) {
    return (
      <div style={shellStyle}>
        <TopBar />
        <div style={containerStyle}>
          <div style={{ ...cardStyle, padding: '2rem', textAlign: 'center' }}>
            <p style={{ color: '#0f1117', fontSize: '14px' }}>
              This approval link has expired. Please contact your agency for a new one.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (approval?.status === 'approved') {
    return (
      <div style={shellStyle}>
        <TopBar />
        <div style={containerStyle}>
          <div style={{
            background: '#eaf3de',
            border: '1px solid #5a9020',
            borderRadius: '12px',
            padding: '2rem',
            textAlign: 'center',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#27500a', marginBottom: '4px' }}>
              Email approved
            </h2>
            <p style={{ fontSize: '13px', color: '#27500a' }}>
              Approved by <strong>{approval.approver_name}</strong>
              {approval.approved_at && ` · ${new Date(approval.approved_at).toLocaleString()}`}
            </p>
            <p style={{ fontSize: '13px', color: '#27500a', marginTop: '6px', opacity: 0.8 }}>
              Your agency has been notified and can now proceed with the send.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (approval?.status === 'changes_requested') {
    return (
      <div style={shellStyle}>
        <TopBar />
        <div style={containerStyle}>
          <div style={{
            background: '#faeeda',
            border: '1px solid #b06d10',
            borderRadius: '12px',
            padding: '1.5rem',
          }}>
            <p style={{ fontSize: '14px', color: '#5c3308' }}>
              ↩ Feedback sent to your agency — they'll resolve the issues and send you an updated version to review.
            </p>
            {approval.changes_requested && (
              <p style={{ fontSize: '13px', color: '#5c3308', marginTop: '10px', opacity: 0.85 }}>
                "{approval.changes_requested}"
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Pending — full review UI
  return (
    <div style={shellStyle}>
      <TopBar />
      <div style={containerStyle}>

        {/* Campaign header, matching report page's title block */}
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
              "{campaign?.subject || '(no subject)'}"
            </h1>
            <p style={{ fontSize: '13px', color: '#5a5a56' }}>
              From {campaign?.from_address} · {campaign?.received_at ? new Date(campaign.received_at).toLocaleString() : ''}
            </p>
            <p style={{ fontSize: '13px', color: '#5a5a56', marginTop: '4px' }}>
              Preview text: {campaign?.preheader || 'Not detected'}
            </p>
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

        {/* QA summary — always visible */}
        {report && (
          <div style={{
            background: '#fff',
            borderLeft: '3px solid #5a9020',
            borderRadius: '0 8px 8px 0',
            padding: '12px 16px',
            marginBottom: '8px',
            fontSize: '14px',
            color: '#0f1117',
            lineHeight: 1.6,
          }}>
            {report.summary}
          </div>
        )}

        {/* Full technical breakdown — collapsed by default */}
        {report && (
          <details style={{
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid rgba(0,0,0,0.09)',
            padding: '0.75rem 1.25rem',
            marginBottom: '8px',
          }}>
            <summary style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#0f1117',
              cursor: 'pointer',
              userSelect: 'none',
            }}>
              View full QA details
            </summary>
            <div style={{ marginTop: '12px' }}>
              {report.sections?.map((section, i) => (
                <div key={i} style={{ ...cardStyle, padding: '1rem 1.25rem', border: '1px solid rgba(0,0,0,0.06)' }}>
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
            </div>
          </details>
        )}

        {/* Email preview */}
        <div style={{ ...cardStyle, padding: '1rem 1.25rem', marginTop: '8px' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f1117', marginBottom: '10px' }}>
            Email preview
          </p>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setView('desktop')} style={toggleBtnStyle(view === 'desktop')}>
                Desktop
              </button>
              <button onClick={() => setView('mobile')} style={toggleBtnStyle(view === 'mobile')}>
                Mobile
              </button>
            </div>
            <button
              onClick={() => window.open(`/api/public-approval/${token}/preview`, '_blank')}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 500,
                borderRadius: '20px',
                border: '1px solid rgba(0,0,0,0.14)',
                background: '#f0efe9',
                color: '#134e8e',
                cursor: 'pointer',
              }}
            >
              View full-size ↗
            </button>
          </div>
          <div style={{
            background: '#ebebeb',
            borderRadius: view === 'mobile' ? '20px' : '6px',
            padding: view === 'mobile' ? '12px' : '10px',
            border: view === 'mobile' ? '3px solid #333' : '1px solid rgba(0,0,0,0.14)',
            maxWidth: view === 'mobile' ? '320px' : 'none',
            margin: view === 'mobile' ? '0 auto' : '0',
          }}>
            <iframe
              sandbox=""
              srcDoc={campaign?.html_body || '<p style="font-family:sans-serif;padding:20px;color:#888">No preview available</p>'}
              style={{
                width: '100%',
                height: view === 'mobile' ? '480px' : '520px',
                border: 'none',
                borderRadius: '5px',
                background: '#fff',
              }}
            />
          </div>
        </div>

        {/* Approval CTA — matches report page's blue action panel */}
        <div style={{
          background: '#134e8e',
          borderRadius: '12px',
          padding: '1.25rem',
          marginTop: '1rem',
        }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '10px' }}>
            Review and approve this email
          </p>

          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: 'rgba(255,255,255,0.75)',
            marginBottom: '5px',
          }}>
            Your name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Sarah Johnson"
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '13px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.4)',
              background: '#fff',
              color: '#0f1117',
              marginBottom: '12px',
            }}
          />

          {actionError && (
            <p style={{ color: '#ffb4b4', fontSize: '12px', marginBottom: '10px' }}>{actionError}</p>
          )}

          {!showChangesForm ? (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={handleApprove}
                disabled={!name.trim() || submitting}
                style={{
                  background: (!name.trim() || submitting) ? '#8fd9ab' : '#4ade80',
                  color: '#0f1117',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: (!name.trim() || submitting) ? 'default' : 'pointer',
                  flex: 1,
                }}
              >
                {submitting ? 'Submitting…' : '✓ Approve to send'}
              </button>
              <button
                onClick={() => setShowChangesForm(true)}
                disabled={!name.trim() || submitting}
                style={{
                  background: '#fff',
                  color: '#134e8e',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: (!name.trim() || submitting) ? 'default' : 'pointer',
                  opacity: (!name.trim() || submitting) ? 0.5 : 1,
                  flex: 1,
                }}
              >
                ↩ Request changes
              </button>
            </div>
          ) : (
            <div>
              <textarea
                value={changesText}
                onChange={e => setChangesText(e.target.value)}
                placeholder="What needs changing?"
                style={{
                  width: '100%',
                  height: '90px',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.4)',
                  background: '#fff',
                  color: '#0f1117',
                  resize: 'vertical',
                  marginBottom: '8px',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleSendChanges}
                  disabled={!changesText.trim() || submitting}
                  style={{
                    background: (!changesText.trim() || submitting) ? '#f2cf94' : '#fbbf24',
                    color: '#0f1117',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: (!changesText.trim() || submitting) ? 'default' : 'pointer',
                    flex: 1,
                  }}
                >
                  {submitting ? 'Sending…' : 'Send feedback'}
                </button>
                <button
                  onClick={() => setShowChangesForm(false)}
                  style={{
                    background: '#fff',
                    color: '#134e8e',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    flex: 1,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function toggleBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.14)',
    background: active ? '#0f1117' : '#f0efe9',
    color: active ? '#fff' : '#5a5a56',
    cursor: 'pointer',
  }
}