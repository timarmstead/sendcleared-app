'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser()
    setLoggedIn(!!user)
    setLoading(false)
  }

  async function acceptInvite() {
    setAccepting(true)
    setError(null)
    try {
      const res = await fetch('/api/team/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to accept invite')
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAccepting(false)
    }
  }

  const shellStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f7f7f5',
    fontFamily: '-apple-system, sans-serif',
  }
  const cardStyle: React.CSSProperties = {
    background: '#fff',
    padding: '2.5rem',
    borderRadius: '16px',
    border: '1px solid rgba(0,0,0,0.09)',
    width: '100%',
    maxWidth: '420px',
    textAlign: 'center',
  }

  if (loading) {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <p style={{ color: '#9a9891', fontSize: '14px' }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#27500a', marginBottom: '.5rem' }}>
            ✓ You're in!
          </h1>
          <p style={{ fontSize: '14px', color: '#5a5a56' }}>Redirecting you to the dashboard...</p>
        </div>
      </div>
    )
  }

  if (!loggedIn) {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#134e8e', marginBottom: '.75rem' }}>
            You've been invited to SendCleared
          </h1>
          <p style={{ fontSize: '14px', color: '#5a5a56', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Log in or sign up with the email address this invite was sent to, then come back to this link to join the team.
          </p>
          <button
            onClick={() => router.push('/login')}
            style={{
              width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
              background: '#f26600', color: '#fff', fontWeight: 600, fontSize: '14px',
              cursor: 'pointer', marginBottom: '.75rem',
            }}
          >
            Log in
          </button>
          <button
            onClick={() => router.push('/signup')}
            style={{
              width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.14)',
              background: 'transparent', color: '#0f1117', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
            }}
          >
            Sign up
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#134e8e', marginBottom: '.75rem' }}>
          You've been invited to a team
        </h1>
        <p style={{ fontSize: '14px', color: '#5a5a56', marginBottom: '1.5rem' }}>
          Click below to join and start collaborating.
        </p>
        {error && (
          <p style={{ color: '#791f1f', fontSize: '13px', marginBottom: '1rem' }}>{error}</p>
        )}
        <button
          onClick={acceptInvite}
          disabled={accepting}
          style={{
            width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
            background: '#f26600', color: '#fff', fontWeight: 600, fontSize: '14px',
            cursor: accepting ? 'default' : 'pointer',
          }}
        >
          {accepting ? 'Joining...' : 'Accept invite'}
        </button>
      </div>
    </div>
  )
}