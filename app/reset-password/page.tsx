'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
    setTimeout(() => router.push('/dashboard'), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(0,0,0,0.14)',
    fontSize: '14px',
    color: '#0f1117',
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
          Set a new password
        </h1>

        {success ? (
          <p style={{ fontSize: '14px', color: '#27500a', lineHeight: 1.5 }}>
            ✓ Password updated. Redirecting you to your dashboard...
          </p>
        ) : (
          <form onSubmit={handleReset}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px', color: '#0f1117' }}>
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px', color: '#0f1117' }}>
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={inputStyle}
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
              {loading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}