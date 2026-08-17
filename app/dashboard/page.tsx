'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'

type Client = {
  id: string
  name: string
  inbox_address: string
  created_at: string
}

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [newClientName, setNewClientName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [limitReached, setLimitReached] = useState(false)
  const [canUpgrade, setCanUpgrade] = useState(true)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    checkUserAndLoadClients()
  }, [])

  async function checkUserAndLoadClients() {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .is('archived_at', null)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setClients(data)
    }
    setLoading(false)
  }

  async function addClient(e: React.FormEvent) {
    e.preventDefault()
    if (!newClientName.trim()) return

    setAdding(true)
    setAddError(null)
    setLimitReached(false)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClientName }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.limit_reached) {
          setLimitReached(true)
          setCanUpgrade(data.can_upgrade)
          throw new Error(data.error)
        }
        throw new Error(data.error || 'Failed to add client')
      }
      setNewClientName('')
      await checkUserAndLoadClients()
    } catch (err: any) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function archiveClient(clientId: string, clientName: string) {
    const confirmed = window.confirm(`Archive ${clientName}? Their campaign history stays intact, but they'll be hidden from your active client list.`)
    if (!confirmed) return

    setArchivingId(clientId)
    const { error } = await supabase
      .from('clients')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', clientId)

    if (!error) {
      await checkUserAndLoadClients()
    }
    setArchivingId(null)
  }

  if (loading) {
    return (
      <div style={{ padding: '3rem', fontFamily: '-apple-system, sans-serif' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f7f7f5',
      fontFamily: '-apple-system, sans-serif',
    }}>
      <DashboardHeader />

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2.5rem 2rem' }}>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          color: '#134e8e',
          marginBottom: '.5rem',
        }}>
          Your clients
        </h1>
        <p style={{ fontSize: '14px', color: '#5a5a56', marginBottom: '2rem' }}>
          Each client gets a unique inbox address. Add it to your ESP test list and every test send is automatically QA checked.
        </p>

        {/* Add client form */}
        <form onSubmit={addClient} style={{
          background: '#fff',
          padding: '1.25rem',
          borderRadius: '12px',
          border: '1px solid rgba(0,0,0,0.09)',
          marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Client name e.g. Bright Spark Energy"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.14)',
                fontSize: '14px',
              }}
            />
            <button
              type="submit"
              disabled={adding}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: '#f26600',
                color: '#fff',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {adding ? 'Adding...' : '+ Add client'}
            </button>
          </div>
          {addError && (
            <p style={{ color: '#791f1f', fontSize: '12px', marginTop: '8px' }}>
              {addError}
              {limitReached && !canUpgrade && (
                <>
                  {' '}
                  <a href="mailto:support@sendcleared.com" style={{ color: '#791f1f', textDecoration: 'underline' }}>
                    support@sendcleared.com
                  </a>
                </>
              )}
              {limitReached && canUpgrade && (
                <>
                  {' '}
                  <a href="/dashboard/billing" style={{ color: '#791f1f', textDecoration: 'underline' }}>
                    Visit Billing
                  </a>
                </>
              )}
            </p>
          )}
        </form>

        {/* Client list */}
        {clients.length === 0 ? (
          <div style={{
            background: '#fff',
            padding: '2.5rem',
            borderRadius: '12px',
            border: '1px solid rgba(0,0,0,0.09)',
            textAlign: 'center',
          }}>
            <p style={{ color: '#9a9891', fontSize: '14px' }}>
              No clients yet. Add your first client above to get started.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {clients.map((client) => (
              <div
                key={client.id}
                style={{
                  background: '#fff',
                  padding: '1rem 1.25rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(0,0,0,0.09)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  onClick={() => router.push(`/dashboard/client/${client.id}`)}
                  style={{ cursor: 'pointer', flex: 1 }}
                >
                  <p style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#0f1117',
                    marginBottom: '2px',
                  }}>
                    {client.name}
                  </p>
                  <p style={{
                    fontSize: '12px',
                    color: '#f26600',
                    fontFamily: 'monospace',
                  }}>
                    {client.inbox_address}
                  </p>
                </div>
                <button
                  onClick={() => archiveClient(client.id, client.name)}
                  disabled={archivingId === client.id}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(0,0,0,0.14)',
                    color: '#5a5a56',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: archivingId === client.id ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {archivingId === client.id ? 'Archiving…' : 'Archive'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}