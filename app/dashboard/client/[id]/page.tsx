'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'

type Campaign = {
  id: string
  subject: string
  from_address: string
  received_at: string
}

type ClientData = {
  id: string
  name: string
  inbox_address: string
}

type ApprovalStatus = {
  status: string
  approver_name: string | null
  changes_requested: string | null
}

export default function ClientDetail() {
  const [client, setClient] = useState<ClientData | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [approvalMap, setApprovalMap] = useState<Record<string, ApprovalStatus>>({})
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string

  useEffect(() => {
    loadData()
  }, [clientId])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: clientData } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()

    if (clientData) setClient(clientData)

    // archived_at IS NULL — archived test sends are hidden from this list
    // but never deleted, so they can be restored later if needed.
    const { data: campaignData } = await supabase
      .from('campaigns')
      .select('*')
      .eq('client_id', clientId)
      .is('archived_at', null)
      .order('received_at', { ascending: false })

    if (campaignData) {
      setCampaigns(campaignData)

      const campaignIds = campaignData.map(c => c.id)
      if (campaignIds.length > 0) {
        const { data: approvalsData } = await supabase
          .from('approvals')
          .select('campaign_id, status, approver_name, changes_requested, created_at')
          .in('campaign_id', campaignIds)
          .order('created_at', { ascending: false })

        if (approvalsData) {
          const map: Record<string, ApprovalStatus> = {}
          for (const a of approvalsData) {
            // Keep only the most recent approval per campaign (results already sorted desc)
            if (!map[a.campaign_id]) {
              map[a.campaign_id] = {
                status: a.status,
                approver_name: a.approver_name,
                changes_requested: a.changes_requested,
              }
            }
          }
          setApprovalMap(map)
        }
      }
    }

    setLoading(false)
  }

  function copyAddress() {
    if (client) {
      navigator.clipboard.writeText(client.inbox_address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function getStatusBadge(campaignId: string) {
    const approval = approvalMap[campaignId]
    if (!approval) return null

    if (approval.status === 'approved') {
      return {
        label: `✓ Approved${approval.approver_name ? ` by ${approval.approver_name}` : ''}`,
        background: '#eaf3de',
        color: '#27500a',
      }
    }
    if (approval.status === 'changes_requested') {
      return {
        label: '↩ Changes requested',
        background: '#faeeda',
        color: '#5c3308',
      }
    }
    return {
      label: 'Pending approval',
      background: '#e3eff9',
      color: '#0c3d6e',
    }
  }

  // A test send can only be archived if it has never had a real approval
  // decision made on it (approved or changes requested). Those two statuses
  // ARE the audit record this tool exists to produce, so they're protected —
  // no approval at all, or a still-"pending" one, is safe to tidy away.
  function canArchive(campaignId: string) {
    const approval = approvalMap[campaignId]
    return !approval || approval.status === 'pending'
  }

  async function handleArchive(campaignId: string) {
    if (!canArchive(campaignId)) {
      setArchiveError("This test can't be archived — it already has an approval record.")
      setConfirmArchiveId(null)
      return
    }

    setArchivingId(campaignId)
    setArchiveError(null)

    const { error } = await supabase
      .from('campaigns')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', campaignId)

    if (error) {
      setArchiveError('Something went wrong archiving this test — please try again.')
      setArchivingId(null)
      return
    }

    setCampaigns(prev => prev.filter(c => c.id !== campaignId))
    setConfirmArchiveId(null)
    setArchivingId(null)
  }

  if (loading) {
    return <div style={{ padding: '3rem', fontFamily: '-apple-system, sans-serif' }}>Loading...</div>
  }

  if (!client) {
    return <div style={{ padding: '3rem', fontFamily: '-apple-system, sans-serif' }}>Client not found</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: '-apple-system, sans-serif', color: '#0f1117' }}>
      <DashboardHeader showBack />

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2.5rem 2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#134e8e', marginBottom: '.5rem' }}>
          {client.name}
        </h1>

        <div
          onClick={copyAddress}
          style={{
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.09)',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            marginBottom: '2rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <p style={{ fontSize: '11px', color: '#9a9891', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>
              Test inbox address — click to copy
            </p>
            <p style={{ fontSize: '14px', color: '#f26600', fontFamily: 'monospace' }}>
              {client.inbox_address}
            </p>
          </div>

          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {copied && (
              <span style={{ fontSize: '12px', color: '#27500a', fontWeight: 600 }}>
                Copied!
              </span>
            )}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke={copied ? '#27500a' : '#9a9891'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </div>
        </div>

        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f1117', marginBottom: '1rem' }}>
          Test sends ({campaigns.length})
        </h2>

        {archiveError && (
          <div style={{
            background: '#fcebeb', border: '1px solid #d94040', borderRadius: '8px',
            padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#791f1f',
          }}>
            {archiveError}
          </div>
        )}

        {campaigns.length === 0 ? (
          <div style={{
            background: '#fff',
            padding: '2.5rem',
            borderRadius: '12px',
            border: '1px solid rgba(0,0,0,0.09)',
            textAlign: 'center',
          }}>
            <p style={{ color: '#9a9891', fontSize: '14px', marginBottom: '.5rem' }}>
              No test emails received yet.
            </p>
            <p style={{ color: '#9a9891', fontSize: '13px' }}>
              Add the address above to your ESP's test send list, then send a test email to see it appear here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {campaigns.map((campaign) => {
              const badge = getStatusBadge(campaign.id)
              const approval = approvalMap[campaign.id]
              const archivable = canArchive(campaign.id)
              const isConfirming = confirmArchiveId === campaign.id
              const isArchiving = archivingId === campaign.id

              return (
                <div
                  key={campaign.id}
                  style={{
                    background: '#fff',
                    padding: '1rem 1.25rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(0,0,0,0.09)',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f1117', marginBottom: '2px' }}>
                        {campaign.subject || '(no subject)'}
                      </p>
                      <p style={{ fontSize: '12px', color: '#9a9891' }}>
                        {new Date(campaign.received_at).toLocaleString()}
                      </p>
                      {badge && (
                        <span style={{
                          display: 'inline-block',
                          marginTop: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 9px',
                          borderRadius: '20px',
                          background: badge.background,
                          color: badge.color,
                        }}>
                          {badge.label}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => router.push(`/dashboard/report/${campaign.id}`)}
                        style={{
                          background: '#134e8e',
                          color: '#fff',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        View report
                      </button>

                      <button
                        onClick={() => setConfirmArchiveId(campaign.id)}
                        disabled={!archivable}
                        title={archivable ? undefined : "Can't archive — this test has an approval record"}
                        style={{
                          background: '#fff',
                          color: archivable ? '#5a5a56' : '#c9c7c1',
                          border: '1px solid rgba(0,0,0,0.14)',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: archivable ? 'pointer' : 'not-allowed',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Archive test
                      </button>
                    </div>
                  </div>

                  {approval?.status === 'changes_requested' && approval.changes_requested && (
                    <p style={{
                      fontSize: '12px',
                      color: '#5c3308',
                      marginTop: '8px',
                      background: '#faeeda',
                      borderRadius: '6px',
                      padding: '8px 10px',
                    }}>
                      "{approval.changes_requested}"
                    </p>
                  )}

                  {isConfirming && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px',
                      background: '#f7f7f5', borderRadius: '8px', padding: '10px 12px',
                    }}>
                      <span style={{ fontSize: '13px', color: '#0f1117', flex: 1 }}>
                        Archive this test send? It'll be hidden from this list but can be recovered.
                      </span>
                      <button
                        onClick={() => handleArchive(campaign.id)}
                        disabled={isArchiving}
                        style={{
                          background: '#d94040', color: '#fff', border: 'none',
                          padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                          cursor: isArchiving ? 'default' : 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        {isArchiving ? 'Archiving…' : 'Yes, archive'}
                      </button>
                      <button
                        onClick={() => setConfirmArchiveId(null)}
                        disabled={isArchiving}
                        style={{
                          background: '#fff', color: '#5a5a56', border: '1px solid rgba(0,0,0,0.14)',
                          padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                          cursor: isArchiving ? 'default' : 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}