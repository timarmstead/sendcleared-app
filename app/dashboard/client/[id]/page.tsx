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

export default function ClientDetail() {
  const [client, setClient] = useState<ClientData | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
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

    const { data: campaignData } = await supabase
      .from('campaigns')
      .select('*')
      .eq('client_id', clientId)
      .order('received_at', { ascending: false })

    if (campaignData) setCampaigns(campaignData)

    setLoading(false)
  }

  function copyAddress() {
    if (client) {
      navigator.clipboard.writeText(client.inbox_address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return <div style={{ padding: '3rem', fontFamily: '-apple-system, sans-serif' }}>Loading...</div>
  }

  if (!client) {
    return <div style={{ padding: '3rem', fontFamily: '-apple-system, sans-serif' }}>Client not found</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: '-apple-system, sans-serif' }}>
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
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                style={{
                  background: '#fff',
                  padding: '1rem 1.25rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(0,0,0,0.09)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f1117', marginBottom: '2px' }}>
                    {campaign.subject || '(no subject)'}
                  </p>
                  <p style={{ fontSize: '12px', color: '#9a9891' }}>
                    {new Date(campaign.received_at).toLocaleString()}
                  </p>
                </div>
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
                    flexShrink: 0,
                  }}
                >
                  View report
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}