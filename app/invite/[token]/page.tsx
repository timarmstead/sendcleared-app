'use client'

import { useEffect, useState, useRef } from 'react'
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
  const attemptedRef = useRef(false)

  useEffect(() => {
    checkAuth()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setLoggedIn(true)
        setLoading(false)
        if (!attemptedRef.current) {
          attemptedRef.current = true
          acceptInvite()
        }
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser()
    setLoggedIn(!!user)
    setLoading(false)

    if (user && !attemptedRef.current) {
      attemptedRef.current = true
      acceptInvite()
    }
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
      attemptedRef.current = false
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
            Log in with your existing SendCleared account to accept this invite.
          </p>
          <button
            onClick={() => router.push(`/login?invite=${token}`)}
            style={{
              width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
              background: '#f26600', color: '#fff', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
            }}
          >
            Log in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#134e8e', marginBottom: '.75rem' }}>
          {accepting ? 'Joining team...' : 'Accept invite'}
        </h1>
        {error && (
          <p style={{ color: '#791f1f', fontSize: '13px', marginBottom: '1rem' }}>{error}</p>
        )}
        {!accepting && (
          <button
            onClick={acceptInvite}
            style={{
              width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
              background: '#f26600', color: '#fff', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
            }}
          >
            Accept invite
          </button>
        )}
      </div>
    </div>
  )
}