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
  const [guideHidden, setGuideHidden] = useState(false)
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

    const { data: prefData } = await supabase
      .from('user_preferences')
      .select('guide_hidden')
      .eq('user_id', user.id)
      .maybeSingle()

    if (prefData) setGuideHidden(prefData.guide_hidden)

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

  async function toggleGuide() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const newValue = !guideHidden
    setGuideHidden(newValue)

    await supabase
      .from('user_preferences')
      .upsert({ user_id: user.id, guide_hidden: newValue, updated_at: new Date().toISOString() })
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

  const badgeStyle = (bg: string, color: string): React.CSSProperties => ({
    background: bg, color, fontSize: '10px', fontWeight: 600,
    padding: '3px 7px', borderRadius: '20px', whiteSpace: 'nowrap',
  })

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f7f7f5',
      fontFamily: '-apple-system, sans-serif',
    }}>
      <DashboardHeader />

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2.5rem 2rem' }}>

        {/* Title row + guide toggle */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#134e8e', marginBottom: '.3rem' }}>
              How to use SendCleared
            </h1>
            <p style={{ fontSize: '14px', color: '#5a5a56' }}>
              From test email to client approval in four simple steps.
            </p>
          </div>
          <button
            onClick={toggleGuide}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'transparent', border: '1px solid rgba(0,0,0,0.14)',
              color: '#5a5a56', padding: '8px 14px', borderRadius: '8px',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0, marginTop: '4px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: guideHidden ? 'rotate(-90deg)' : 'none', transition: 'transform .2s' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {guideHidden ? 'Show guide' : 'Hide guide'}
          </button>
        </div>

        {/* Walkthrough */}
        {!guideHidden && (
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '2rem' }}>

            {/* Step 1 */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.09)', padding: '1.25rem 1.5rem', display: 'flex', gap: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f26600', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px' }}>1</div>
                <div style={{ width: '2px', flex: 1, marginTop: '8px', opacity: 0.25, minHeight: '20px', background: '#f26600' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <p style={{ fontSize: '15px', fontWeight: 700 }}>Add a client &amp; send your test email</p>
                  <span style={{ color: '#134e8e', opacity: 0.6, flexShrink: 0 }}>✉</span>
                </div>
                <p style={{ fontSize: '13px', color: '#5a5a56', lineHeight: 1.5, marginBottom: '.75rem', maxWidth: '480px' }}>
                  Add your client below to generate their unique inbox address, then send a test from Klaviyo, Omnisend, or any ESP.
                </p>
                <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.05em', color: '#5a5a56', marginBottom: '8px' }}>SEND IT TO YOUR UNIQUE INBOX</p>
                <div style={{ background: '#fff3ea', border: '1px solid rgba(242,102,0,0.25)', borderRadius: '8px', padding: '8px 14px', marginBottom: '8px', fontFamily: 'monospace', fontSize: '12px', color: '#f26600', display: 'inline-block' }}>
                  clientname@check.sendcleared.com
                </div>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#f26600', letterSpacing: '.03em', marginTop: '2px' }}>START HERE</p>
              </div>
            </div>

            {/* Step 2 */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.09)', padding: '1.25rem 1.5rem', display: 'flex', gap: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#134e8e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px' }}>2</div>
                <div style={{ width: '2px', flex: 1, marginTop: '8px', opacity: 0.25, minHeight: '20px', background: '#134e8e' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <p style={{ fontSize: '15px', fontWeight: 700 }}>Find your QA report under Reports</p>
                  <span style={{ color: '#134e8e', opacity: 0.6, flexShrink: 0 }}>📄</span>
                </div>
                <p style={{ fontSize: '13px', color: '#5a5a56', lineHeight: 1.5, marginBottom: '.75rem', maxWidth: '480px' }}>
                  Click "Reports" next to your client below — 14 automated checks run in about 10 seconds.
                </p>
                <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.05em', color: '#5a5a56', marginBottom: '8px' }}>EVERY CHECK IS CLEARLY LABELLED</p>
                <div style={{ background: '#f7f7f5', border: '1px solid rgba(0,0,0,0.09)', borderRadius: '8px', padding: '10px', marginBottom: '8px', display: 'inline-block' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <span style={badgeStyle('#fcebeb', '#791f1f')}>● Critical</span>
                    <span style={badgeStyle('#faeeda', '#5c3308')}>● Warning</span>
                    <span style={badgeStyle('#eaf3de', '#27500a')}>● Pass</span>
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: '#5a5a56', marginTop: '2px' }}>Plain-English explanations included.</p>
              </div>
            </div>

            {/* Step 3 */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.09)', padding: '1.25rem 1.5rem', display: 'flex', gap: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#134e8e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px' }}>3</div>
                <div style={{ width: '2px', flex: 1, marginTop: '8px', opacity: 0.25, minHeight: '20px', background: '#134e8e' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <p style={{ fontSize: '15px', fontWeight: 700 }}>Fix &amp; re-run</p>
                  <span style={{ color: '#134e8e', opacity: 0.6, flexShrink: 0 }}>↻</span>
                </div>
                <p style={{ fontSize: '13px', color: '#5a5a56', lineHeight: 1.5, marginBottom: '.75rem', maxWidth: '480px' }}>
                  Fix the flagged issues inside your ESP, then send another test.
                </p>
                <div style={{ background: '#e8f0f8', borderRadius: '8px', padding: '8px 12px', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', maxWidth: '480px' }}>
                  <span>✓</span>
                  <div style={{ fontSize: '12px', lineHeight: 1.4 }}><strong>Every test is saved</strong> — compare full version history.</div>
                </div>
                <p style={{ fontSize: '12px', color: '#5a5a56', marginTop: '2px' }}>Repeat until everything is ready.</p>
              </div>
            </div>

            {/* Step 4 */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.09)', padding: '1.25rem 1.5rem', display: 'flex', gap: '1.25rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#134e8e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px' }}>4</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <p style={{ fontSize: '15px', fontWeight: 700 }}>Get client approval</p>
                  <span style={{ color: '#134e8e', opacity: 0.6, flexShrink: 0 }}>∞</span>
                </div>
                <p style={{ fontSize: '13px', color: '#5a5a56', lineHeight: 1.5, marginBottom: '.75rem', maxWidth: '480px' }}>
                  Create a unique approval link and send it straight to your client.
                </p>
                <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.05em', color: '#5a5a56', marginBottom: '8px' }}>NO CLIENT LOGIN REQUIRED</p>
                <div style={{ background: '#fff3ea', border: '1px solid rgba(242,102,0,0.25)', borderRadius: '8px', padding: '8px 14px', marginBottom: '8px', fontFamily: 'monospace', fontSize: '12px', color: '#f26600', display: 'inline-block' }}>
                  app.sendcleared.com/r/xyz789
                </div>
                <p style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#27500a', fontWeight: 600, marginTop: '2px' }}>✓ Approve in one click.</p>
              </div>
            </div>

          </div>
        )}

        {/* Your clients — real section */}
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#134e8e', marginBottom: '.3rem' }}>
          Your clients
        </h1>
        <p style={{ fontSize: '14px', color: '#5a5a56', marginBottom: '1.5rem' }}>
          Each client gets a unique inbox address. Add it to your ESP test list and every test send is automatically QA checked.
        </p>

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
                color: '#0f1117',
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
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f1117', marginBottom: '2px' }}>
                    {client.name}
                  </p>
                  <p style={{ fontSize: '12px', color: '#f26600', fontFamily: 'monospace' }}></p>