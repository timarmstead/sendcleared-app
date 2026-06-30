'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
  const [userEmail, setUserEmail] = useState('')
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

    setUserEmail(user.email || '')

    const { data, error } = await supabase
      .from('clients')
      .select('*')
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Generate inbox address from client name + user id snippet
    const slug = newClientName.toLowerCase().replace(/[^a-z0-9]/g, '')
    const userSnippet = user.id.substring(0, 6)
    const inboxAddress = `${slug}@${userSnippet}.check.sendcleared.com`

    const { error } = await supabase.from('clients').insert({
      user_id: user.id,
      name: newClientName,
      inbox_address: inboxAddress,
    })

    if (!error) {
      setNewClientName('')
      await checkUserAndLoadClients()
    }
    setAdding(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
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
      {/* Header */}
      <div style={{
        background: '#f26600',
        padding: '0 2rem',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '17px' }}>
          SendCleared
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px' }}>
            {userEmail}
          </span>
          <button
            onClick={handleLogout}
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
            Log out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2.5rem 2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#134e8e', marginBottom: '.5rem' }}>
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
          display: 'flex',
          gap: '8px',
        }}>
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
                onClick={() => router.push(`/dashboard/client/${client.id}`)}
                style={{
                  background: '#fff',
                  padding: '1rem 1.25rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(0,0,0,0.09)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f1117', marginBottom: '2px' }}>
                    {client.name}
                  </p>
                  <p style={{ fontSize: '12px', color: '#f26600', fontFamily: 'monospace' }}>
                    {client.inbox_address}
                  </p>
                </div>
                <span style={{ color: '#9a9891', fontSize: '13px' }}>→</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}