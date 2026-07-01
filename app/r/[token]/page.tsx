'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

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

  const wrapStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: '#f5f4f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: '1.5rem 1rem',
    color: '#0f1117',
  }
  const pageStyle: React.CSSProperties = { maxWidth: '620px', margin: '0 auto' }
  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '0.5px solid rgba(0,0,0,0.09)',
    borderRadius: '10px',
    padding: '1.125rem 1.25rem',
    marginBottom: '10px',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 600,
    color: '#9a9891',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: '10px',
  }

  function Header() {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '1.5rem',
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f1117' }}>
          Cleared<span style={{ fontWeight: 400, color: '#9a9891' }}>ToSend</span>
        </span>
      </div>
    )
  }

  function Footer() {
    return (
      <div style={{
        fontSize: '11px', color: '#9a9891', textAlign: 'center', marginTop: '14px',
      }}>
        Powered by <a href="https://sendcleared.com" style={{ color: 'inherit' }}>SendCleared</a>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={wrapStyle}>
        <div style={pageStyle}>
          <Header />
          <p>Loading…</p>
          <Footer />
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={wrapStyle}>
        <div style={pageStyle}>
          <Header />
          <div style={cardStyle}>
            <p style={{ fontSize: '14px' }}>This approval link isn't valid. Please check the link or contact your agency.</p>
          </div>
          <Footer />
        </div>
      </div>
    )
  }

  if (approval?.is_expired) {
    return (
      <div style={wrapStyle}>
        <div style={pageStyle}>
          <Header />
          <div style={cardStyle}>
            <p style={{ fontSize: '14px' }}>This approval link has expired. Please contact your agency for a new one.</p>
          </div>
          <Footer />
        </div>
      </div>
    )
  }

  if (approval?.status === 'approved') {
    return (
      <div style={wrapStyle}>
        <div style={pageStyle}>
          <Header />
          <div style={{
            background: '#eaf3de',
            border: '0.5px solid #5a9020',
            borderRadius: '10px',
            padding: '2rem',
            textAlign: 'center',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#27500a', marginBottom: '4px' }}>
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
          <Footer />
        </div>
      </div>
    )
  }

  if (approval?.status === 'changes_requested') {
    return (
      <div style={wrapStyle}>
        <div style={pageStyle}>
          <Header />
          <div style={{
            background: '#faeeda',
            border: '0.5px solid #b06d10',
            borderRadius: '10px',
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
          <Footer />
        </div>
      </div>
    )
  }

  // Pending — full review UI
  return (
    <div style={wrapStyle}>
      <div style={pageStyle}>
        <Header />

        {/* Campaign meta */}
        <div style={cardStyle}>
          <p style={labelStyle}>Campaign details</p>
          <Row label="Subject line" value={campaign?.subject || '(no subject)'} />
          <Row label="Preview text" value={campaign?.preheader || 'Not detected'} />
          <Row label="From" value={campaign?.from_address || ''} />
          <Row
            label="Received"
            value={campaign?.received_at ? new Date(campaign.received_at).toLocaleString() : ''}
          />
        </div>

        {/* QA summary */}
        {report && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <p style={{ ...labelStyle, margin: 0 }}>QA check summary</p>
              <div style={{
                width: '46px', height: '46px', borderRadius: '50%',
                border: `2.5px solid ${report.score >= 80 ? '#5a9020' : report.score >= 60 ? '#b06d10' : '#d94040'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '17px', fontWeight: 600 }}>{report.score}</span>
                <span style={{ fontSize: '9px', color: '#9a9891' }}>/100</span>
              </div>
            </div>
            {report.sections?.flatMap(s => s.issues).map((issue, i) => {
              const badge = getBadgeStyle(issue.severity)
              return (
                <div key={i} style={{
                  display: 'flex', gap: '9px', padding: '8px 0',
                  borderBottom: '0.5px solid rgba(0,0,0,0.09)', fontSize: '13px', lineHeight: 1.45,
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
        )}

        {/* Email preview */}
        <div style={cardStyle}>
          <p style={labelStyle}>Email preview</p>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <button
              onClick={() => setView('desktop')}
              style={toggleBtnStyle(view === 'desktop')}
            >
              Desktop
            </button>
            <button
              onClick={() => setView('mobile')}
              style={toggleBtnStyle(view === 'mobile')}
            >
              Mobile
            </button>
          </div>
          <div style={{
            background: '#ebebeb',
            borderRadius: view === 'mobile' ? '20px' : '6px',
            padding: view === 'mobile' ? '12px' : '10px',
            border: view === 'mobile' ? '3px solid #333' : '0.5px solid rgba(0,0,0,0.14)',
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

        {/* Action panel */}
        <div style={cardStyle}>
          <p style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Your name</p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Sarah Johnson"
            style={{
              width: '100%',
              padding: '9px 12px',
              fontSize: '13px',
              borderRadius: '6px',
              border: '0.5px solid rgba(0,0,0,0.14)',
              background: '#f0efe9',
              marginBottom: '12px',
            }}
          />

          {actionError && (
            <p style={{ color: '#791f1f', fontSize: '12px', marginBottom: '10px' }}>{actionError}</p>
          )}

          {!showChangesForm ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleApprove}
                disabled={!name.trim() || submitting}
                style={actionBtnStyle(!name.trim() || submitting, 'approve')}
              >
                {submitting ? 'Submitting…' : '✓ Approve to send'}
              </button>
              <button
                onClick={() => setShowChangesForm(true)}
                disabled={!name.trim() || submitting}
                style={actionBtnStyle(!name.trim() || submitting, 'neutral')}
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
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '0.5px solid rgba(0,0,0,0.14)',
                  background: '#f0efe9',
                  resize: 'vertical',
                  marginBottom: '8px',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleSendChanges}
                  disabled={!changesText.trim() || submitting}
                  style={actionBtnStyle(!changesText.trim() || submitting, 'amber')}
                >
                  {submitting ? 'Sending…' : 'Send feedback'}
                </button>
                <button onClick={() => setShowChangesForm(false)} style={actionBtnStyle(false, 'neutral')}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <Footer />

      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '5px 0',
      borderBottom: '0.5px solid rgba(0,0,0,0.09)', fontSize: '13px',
    }}>
      <span style={{ color: '#5a5a56', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function toggleBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '20px',
    border: '0.5px solid rgba(0,0,0,0.14)',
    background: active ? '#0f1117' : '#f0efe9',
    color: active ? '#fff' : '#5a5a56',
    cursor: 'pointer',
  }
}

function actionBtnStyle(disabled: boolean, variant: 'approve' | 'amber' | 'neutral'): React.CSSProperties {
  const colors = {
    approve: { bg: '#eaf3de', color: '#27500a', border: '#5a9020' },
    amber: { bg: '#faeeda', color: '#5c3308', border: '#b06d10' },
    neutral: { bg: '#fff', color: '#0f1117', border: 'rgba(0,0,0,0.14)' },
  }[variant]
  return {
    flex: 1,
    padding: '10px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    border: `0.5px solid ${colors.border}`,
    background: disabled ? '#f0efe9' : colors.bg,
    color: disabled ? '#9a9891' : colors.color,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}