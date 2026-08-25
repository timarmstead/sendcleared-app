'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite')

  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(inviteToken ? `/invite/${inviteToken}` : '/dashboard')
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setResetLoading(true)
    setResetError('')

    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    if (error) {
      setResetError(error.message)
      setResetLoading(false)
      return
    }

    setResetSent(true)
    setResetLoading(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(0,0,0,0.14)',
    fontSize: '14px',
    color: '#0f1117',
  }

  if (mode === 'forgot') {
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
            marginBottom: '.5rem',
          }}>
            Reset your password
          </h1>

          {resetSent ? (
            <>
              <p style={{ fontSize: '14px', color: '#0f1117', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                If an account exists for <strong>{resetEmail}</strong>, we've sent a link to reset your password. Check your inbox.
              </p>
              <button
                onClick={() => { setMode('login'); setResetSent(false); setResetEmail('') }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(0,0,0,0.14)',
                  background: 'transparent',
                  color: '#0f1117',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Back to log in
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: '13px', color: '#5a5a56', marginBottom: '1.25rem' }}>
                Enter your email and we'll send you a link to reset your password.
              </p>
              <form onSubmit={handleForgotPassword}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px', color: '#0f1117' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    style={inputStyle}
                  />
                </div>

                {resetError && (
                  <p style={{ color: '#791f1f', fontSize: '13px', marginBottom: '1rem' }}>
                    {resetError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={resetLoading}
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
                    marginBottom: '.75rem',
                  }}
                >
                  {resetLoading ? 'Sending...' : 'Send reset link'}
                </button>

                <button
                  type="button"
                  onClick={() => setMode('login')}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0,0,0,0.14)',
                    background: 'transparent',
                    color: '#0f1117',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  Back to log in
                </button>
              </form>
            </>
          )}
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
          Log in to SendCleared
        </h1>

        {inviteToken && (
          <p style={{
            fontSize: '13px', color: '#0c3d6e', background: '#e3eff9',
            padding: '10px 12px', borderRadius: '8px', marginBottom: '1.25rem',
          }}>
            Log in to accept your team invite.
          </p>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px', color: '#0f1117' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '.5rem' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px', color: '#0f1117' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div style={{ textAlign: 'right', marginBottom: '1.5rem' }}>
            <button
              type="button"
              onClick={() => setMode('forgot')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#134e8e',
                fontSize: '12px',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Forgot password?
            </button>
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
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <p style={{ fontSize: '13px', color: '#5a5a56', marginTop: '1rem', textAlign: 'center' }}>
          Don't have an account? <a href={inviteToken ? `/signup?invite=${inviteToken}` : '/signup'} style={{ color: '#f26600' }}>Sign up</a>
        </p>
      </div>
    </div>
  )
}