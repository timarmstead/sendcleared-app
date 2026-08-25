'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function SignUpForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmSent, setConfirmSent] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite')

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const redirectTo = inviteToken
      ? `${window.location.origin}/invite/${inviteToken}`
      : `${window.location.origin}/dashboard`

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setConfirmSent(true)
    setLoading(false)
  }

  if (confirmSent) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f7f7f5',
        fontFamily: '-apple-system, sans-serif',
      }}>
        <div style={{
          background: '#fff',
          padding: '2.5rem',
          borderRadius: '16px',
          border: '1px solid rgba(0,0,0,0.09)',
          width: '100%',
          maxWidth: '400px',
          textAlign: 'center',
        }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#134e8e', marginBottom: '.75rem' }}>
            Check your email
          </h1>
          <p style={{ fontSize: '14px', color: '#5a5a56', lineHeight: 1.5 }}>
            We've sent a confirmation link to <strong>{email}</strong>. Click it to finish setting up your account
            {inviteToken ? ' and join your team.' : '.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f7f7f5',
      fontFamily: '-apple-system, sans-serif',
    }}>
      <div style={{
        background: '#fff',
        padding: '2.5rem',
        borderRadius: '16px',
        border: '1px solid rgba(0,0,0,0.09)',
        width: '100%',
        maxWidth: '400px',
      }}>
        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: 800,
          color: '#134e8e',
          marginBottom: '1.5rem',
        }}>
          Create your account
        </h1>

        {inviteToken && (
          <p style={{
            fontSize: '13px', color: '#0c3d6e', background: '#e3eff9',
            padding: '10px 12px', borderRadius: '8px', marginBottom: '1.25rem',
          }}>
            You're signing up to join a team — you'll be added automatically once you confirm your email.
          </p>
        )}

        <form onSubmit={handleSignUp}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px', color: '#0f1117' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.14)',
                fontSize: '14px',
                color: '#0f1117',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px', color: '#0f1117' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.14)',
                fontSize: '14px',
                color: '#0f1117',
              }}
            />
          </div>

          {error && (
            <p style={{ color: '#791f1f', fontSize: '13px', marginBottom: '1rem' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              background: '#f26600',
              color: '#fff',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            {loading ? 'Creating account...' : 'Sign up'}
          </button>
        </form>

        <p style={{ fontSize: '13px', color: '#5a5a56', marginTop: '1rem', textAlign: 'center' }}>
          Already have an account? <a href={inviteToken ? `/login?invite=${inviteToken}` : '/login'} style={{ color: '#f26600' }}>Log in</a>
        </p>
      </div>
    </div>
  )
}

export default function SignUp() {
  return (
    <Suspense fallback={<div style={{ padding: '3rem', fontFamily: '-apple-system, sans-serif' }}>Loading...</div>}>
      <SignUpForm />
    </Suspense>
  )
}