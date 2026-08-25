'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'

type Member = {
  user_id: string
  role: string
  email: string
  joined_at: string
}

type Invite = {
  id: string
  email: string
  status: string
  created_at: string
  expires_at: string
}

export default function TeamPage() {
  const [teamName, setTeamName] = useState('')
  const [role, setRole] = useState<'owner' | 'member' | null>(null)
  const [plan, setPlan] = useState('free')
  const [seatLimit, setSeatLimit] = useState(1)
  const [seatsUsed, setSeatsUsed] = useState(0)
  const [members, setMembers] = useState<Member[]>([])
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    loadTeam()
  }, [])

  async function loadTeam() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    setLoadError(null)
    try {
      const res = await fetch('/api/team')
      const data = await res.json()
      if (!res.ok) {
        setLoadError(data.error || 'Failed to load team')
        setLoading(false)
        return
      }
      setTeamName(data.team?.name || 'Your team')
      setRole(data.role)
      setPlan(data.plan)
      setSeatLimit(data.seatLimit)
      setSeatsUsed(data.seatsUsed)
      setMembers(data.members || [])
      setPendingInvites(data.pendingInvites || [])
    } catch (err) {
      setLoadError('Something went wrong loading your team. Please try refreshing.')
    } finally {
      setLoading(false)
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    setInviting(true)
    setInviteError(null)
    setInviteSuccess(false)
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send invite')
      setInviteEmail('')
      setInviteSuccess(true)
      await loadTeam()
    } catch (err: any) {
      setInviteError(err.message)
    } finally {
      setInviting(false)
    }
  }

  async function revokeInvite(id: string) {
    setRevokingId(id)
    try {
      await fetch(`/api/team/invite/${id}`, { method: 'DELETE' })
      await loadTeam()
    } finally {
      setRevokingId(null)
    }
  }

  const seatsRemaining = Math.max(0, seatLimit - seatsUsed)
  const canInvite = role === 'owner' && seatsRemaining > 0

  if (loading) {
    return (
      <div style={{ padding: '3rem', fontFamily: '-apple-system, sans-serif' }}>
        Loading...
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: '-apple-system, sans-serif' }}>
        <DashboardHeader />
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '2.5rem 2rem' }}>
          <div style={{
            background: '#fcebeb', border: '1px solid rgba(0,0,0,0.09)', borderRadius: '12px',
            padding: '1.5rem', color: '#791f1f', fontSize: '14px',
          }}>
            {loadError}
          </div>
        </div>
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

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '2.5rem 2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#134e8e', marginBottom: '.3rem' }}>
          {teamName}
        </h1>
        <p style={{ fontSize: '14px', color: '#5a5a56', marginBottom: '1.5rem' }}>
          {plan.charAt(0).toUpperCase() + plan.slice(1)} plan · {seatsUsed} of {seatLimit} seat{seatLimit !== 1 ? 's' : ''} used
          {seatsRemaining > 0 && ` · ${seatsRemaining} remaining`}
        </p>

        <div style={{
          background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.09)',
          padding: '1.25rem', marginBottom: '1.5rem',
        }}>
          <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '1rem' }}>
            Members ({members.length})
          </p>
          {members.map((m) => (
            <div key={m.user_id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,0.06)',
            }}>
              <span style={{ fontSize: '14px', color: '#0f1117' }}>{m.email}</span>
              <span style={{
                fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '20px',
                background: m.role === 'owner' ? '#e3eff9' : '#f0efe9',
                color: m.role === 'owner' ? '#0c3d6e' : '#5a5a56',
                textTransform: 'capitalize',
              }}>
                {m.role}
              </span>
            </div>
          ))}
        </div>

        {role === 'owner' && (
          <>
            <div style={{
              background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.09)',
              padding: '1.25rem', marginBottom: '1.5rem',
            }}>
              <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '.75rem' }}>
                Invite a teammate
              </p>
              {!canInvite ? (
                <p style={{ fontSize: '13px', color: '#5a5a56' }}>
                  {seatsRemaining === 0
                    ? `You've used all ${seatLimit} seats on your ${plan} plan. Upgrade for more, or remove a member first.`
                    : 'Invites are only available on paid plans.'}
                </p>
              ) : (
                <form onSubmit={sendInvite} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="email"
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: '8px',
                      border: '1px solid rgba(0,0,0,0.14)', fontSize: '14px', color: '#0f1117',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={inviting}
                    style={{
                      padding: '10px 20px', borderRadius: '8px', border: 'none',
                      background: '#f26600', color: '#fff', fontWeight: 600, fontSize: '14px',
                      cursor: inviting ? 'default' : 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {inviting ? 'Sending...' : 'Send invite'}
                  </button>
                </form>
              )}
              {inviteError && (
                <p style={{ color: '#791f1f', fontSize: '12px', marginTop: '8px' }}>{inviteError}</p>
              )}
              {inviteSuccess && (
                <p style={{ color: '#27500a', fontSize: '12px', marginTop: '8px' }}>✓ Invite sent</p>
              )}
            </div>

            {pendingInvites.length > 0 && (
              <div style={{
                background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.09)',
                padding: '1.25rem',
              }}>
                <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '1rem' }}>
                  Pending invites ({pendingInvites.length})
                </p>
                {pendingInvites.map((inv) => (
                  <div key={inv.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,0.06)',
                  }}>
                    <span style={{ fontSize: '14px', color: '#0f1117' }}>{inv.email}</span>
                    <button
                      onClick={() => revokeInvite(inv.id)}
                      disabled={revokingId === inv.id}
                      style={{
                        background: 'transparent', border: 'none', color: '#9a9891',
                        fontSize: '12px', textDecoration: 'underline',
                        cursor: revokingId === inv.id ? 'default' : 'pointer',
                      }}
                    >
                      {revokingId === inv.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}