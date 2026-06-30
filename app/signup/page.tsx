'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
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

        <form onSubmit={handleSignUp}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
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
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
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
          Already have an account? <a href="/login" style={{ color: '#f26600' }}>Log in</a>
        </p>
      </div>
    </div>
  )
}