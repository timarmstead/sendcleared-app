'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'

type Subscription = {
  plan: string
  status: string
  current_period_end: string | null
  stripe_customer_id: string | null
}

export default function AccountPage() {
  const [email, setEmail] = useState('')
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    loadAccount()
  }, [])

  async function loadAccount() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    setEmail(user.email || '')

    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end, stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    setSubscription(data)
    setLoading(false)
  }

  async function openBillingPortal() {
    setOpeningPortal(true)
    setPortalError(null)
    try {
      const res = await fetch('/api/billing-portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to open billing portal')
      window.location.href = data.url
    } catch (err: any) {
      setPortalError(err.message)
      setOpeningPortal(false)
    }
  }

  const currentPlan = subscription?.status === 'active' ? subscription.plan : 'free'
  const hasStripeAccount = !!subscription?.stripe_customer_id

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

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '2.5rem 2rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#134e8e', marginBottom: '1.5rem' }}>
          Account
        </h1>

        {/* Profile card */}
        <div style={{
          background: '#fff',
          border: '1px solid rgba(0,0,0,0.09)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1rem',
        }}>
          <p style={{
            fontSize: '11px', fontWeight: 700, color: '#9a9891',
            textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '10px',
          }}>
            Profile
          </p>
          <p style={{ fontSize: '14px', color: '#0f1117' }}>{email}</p>
        </div>

        {/* Subscription card */}
        <div style={{
          background: '#fff',
          border: '1px solid rgba(0,0,0,0.09)',
          borderRadius: '12px',
          padding: '1.5rem',
        }}>
          <p style={{
            fontSize: '11px', fontWeight: 700, color: '#9a9891',
            textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '10px',
          }}>
            Subscription
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <p style={{ fontSize: '20px', fontWeight: 800, color: '#134e8e' }}>
              {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
            </p>
            {currentPlan !== 'free' && (
              <span style={{
                background: '#eaf3de', color: '#27500a', fontSize: '11px', fontWeight: 700,
                padding: '3px 10px', borderRadius: '20px',
              }}>
                Active
              </span>
            )}
          </div>

          {subscription?.current_period_end && currentPlan !== 'free' && (
            <p style={{ fontSize: '13px', color: '#5a5a56', marginBottom: '1.25rem' }}>
              Renews {new Date(subscription.current_period_end).toLocaleDateString()}
            </p>
          )}

          {currentPlan === 'free' && (
            <p style={{ fontSize: '13px', color: '#5a5a56', marginBottom: '1.25rem' }}>
              You're on the free plan. Upgrade any time for unlimited approval links and more.
            </p>
          )}

          {portalError && (
            <p style={{ color: '#791f1f', fontSize: '12px', marginBottom: '10px' }}>{portalError}</p>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {hasStripeAccount && (
              <button
                onClick={openBillingPortal}
                disabled={openingPortal}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1.5px solid rgba(19,78,142,0.25)',
                  background: 'transparent',
                  color: '#134e8e',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: openingPortal ? 'default' : 'pointer',
                }}
              >
                {openingPortal ? 'Opening…' : 'Manage subscription'}
              </button>
            )}
            <button
              onClick={() => router.push('/dashboard/billing')}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: 'none',
                background: '#134e8e',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {currentPlan === 'free' ? 'View plans' : 'Change plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}