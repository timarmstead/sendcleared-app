'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'

type Subscription = {
  plan: string
  status: string
  current_period_end: string | null
}

const PLANS = [
  {
    id: 'free',
    tier: 'Free',
    price: '0',
    desc: 'Get started, no credit card. See if SendCleared fits your workflow.',
    features: [
      { text: '3 approval links per month', included: true },
      { text: 'Full 14-point QA report', included: true },
      { text: 'Inbox preview mock', included: true },
      { text: 'Desktop + mobile toggle', included: true },
      { text: 'Remove SendCleared branding', included: false },
      { text: 'White-label approval page', included: false },
      { text: 'Approval audit trail PDF', included: false },
    ],
    note: 'No credit card required',
    buttonStyle: 'outline' as const,
    popular: false,
  },
  {
    id: 'freelancer',
    tier: 'Freelancer',
    price: '19',
    desc: 'For freelancers sending campaigns on behalf of clients.',
    features: [
      { text: 'Unlimited approval links', included: true },
      { text: 'Up to 5 client inboxes', included: true },
      { text: 'Full 14-point QA report', included: true },
      { text: 'Inbox preview mock', included: true },
      { text: 'Desktop + mobile toggle', included: true },
      { text: 'Remove SendCleared branding', included: false },
      { text: 'White-label approval page', included: false },
      { text: 'Approval audit trail PDF', included: false },
    ],
    note: '14-day free trial included',
    buttonStyle: 'primary' as const,
    popular: true,
  },
  {
    id: 'agency',
    tier: 'Agency',
    price: '49',
    desc: 'For agencies managing multiple clients and needing a professional sign-off workflow.',
    features: [
      { text: 'Unlimited approval links', included: true },
      { text: 'Up to 20 client inboxes', included: true },
      { text: 'Full 14-point QA report', included: true },
      { text: 'Inbox preview mock', included: true },
      { text: 'Desktop + mobile toggle', included: true },
      { text: 'Remove SendCleared branding', included: true },
      { text: 'White-label approval page', included: true },
      { text: 'Approval audit trail PDF', included: false },
      { text: '3 team seats included', included: true },
    ],
    note: '14-day free trial included',
    buttonStyle: 'blue' as const,
    popular: false,
  },
  {
    id: 'studio',
    tier: 'Studio',
    price: '99',
    desc: 'For larger studios and multi-brand agencies with high send volume and full team access.',
    features: [
      { text: 'Unlimited approval links', included: true },
      { text: 'Unlimited client inboxes', included: true },
      { text: 'Full 14-point QA report', included: true },
      { text: 'Inbox preview mock', included: true },
      { text: 'Desktop + mobile toggle', included: true },
      { text: 'Remove SendCleared branding', included: true },
      { text: 'White-label approval page', included: true },
      { text: 'Approval audit trail PDF', included: true },
      { text: '10 team seats included', included: true },
      { text: 'Priority support', included: true },
    ],
    note: '14-day free trial included',
    buttonStyle: 'blue' as const,
    popular: false,
  },
]

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    loadSubscription()
  }, [])

  async function loadSubscription() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle()

    setSubscription(data)
    setLoading(false)
  }

  async function handleUpgrade(plan: string) {
    if (plan === 'free') return
    setCheckingOut(plan)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Checkout failed:', err)
      setCheckingOut(null)
    }
  }

  const currentPlan = subscription?.status === 'active' ? subscription.plan : 'free'

  function getButtonStyle(style: 'outline' | 'primary' | 'blue', isCurrent: boolean) {
    if (isCurrent) {
      return { background: '#eaf3de', color: '#27500a', border: 'none' }
    }
    switch (style) {
      case 'outline':
        return { background: 'transparent', color: '#134e8e', border: '1.5px solid rgba(19,78,142,0.25)' }
      case 'primary':
        return { background: '#f26600', color: '#fff', border: 'none' }
      case 'blue':
        return { background: '#134e8e', color: '#fff', border: 'none' }
    }
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
      <DashboardHeader />

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2.5rem 2rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#134e8e', marginBottom: '6px' }}>
          Billing
        </h1>
        <p style={{ fontSize: '14px', color: '#5a5a56', marginBottom: '2rem' }}>
          {currentPlan === 'free'
            ? "You're currently on the free plan."
            : `You're currently on the ${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plan.`}
          {subscription?.current_period_end && (
            <> Renews {new Date(subscription.current_period_end).toLocaleDateString()}.</>
          )}
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.25rem',
          alignItems: 'start',
        }}>
          {PLANS.map(plan => {
            const isCurrent = currentPlan === plan.id
            const btnStyle = getButtonStyle(plan.buttonStyle, isCurrent)
            return (
              <div key={plan.id} style={{
                background: '#fff',
                border: plan.popular ? '1.5px solid #f26600' : '1.5px solid rgba(0,0,0,0.09)',
                borderRadius: '16px',
                padding: '2rem',
                position: 'relative',
              }}>
                {plan.popular && (
                  <div style={{
                    position: 'absolute',
                    top: '-12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#f26600',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 12px',
                    borderRadius: '20px',
                    whiteSpace: 'nowrap',
                    letterSpacing: '.04em',
                    textTransform: 'uppercase',
                  }}>
                    Most popular
                  </div>
                )}

                <p style={{
                  fontSize: '12px', fontWeight: 700, color: '#f26600',
                  textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.5rem',
                }}>
                  {plan.tier}
                </p>

                <p style={{
                  fontSize: '2.5rem', fontWeight: 800, color: '#134e8e',
                  letterSpacing: '-0.03em', lineHeight: 1, marginBottom: '.25rem',
                }}>
                  <sup style={{ fontSize: '1.2rem' }}>$</sup>{plan.price}
                  <span style={{ fontSize: '1rem', fontWeight: 400, color: '#9a9891' }}>/mo</span>
                </p>

                <p style={{ fontSize: '13px', color: '#5a5a56', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                  {plan.desc}
                </p>

                <ul style={{ listStyle: 'none', marginBottom: '1.75rem' }}>
                  {plan.features.map((f, i) => (
                    <li key={i} style={{
                      fontSize: '13px',
                      color: f.included ? '#1a1a1a' : '#5a5a56',
                      padding: '5px 0',
                      borderBottom: i < plan.features.length - 1 ? '1px solid rgba(0,0,0,0.09)' : 'none',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      lineHeight: 1.4,
                    }}>
                      <span style={{
                        color: f.included ? '#f26600' : '#9a9891',
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: '1px',
                      }}>
                        {f.included ? '✓' : '–'}
                      </span>
                      {f.text}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isCurrent || checkingOut !== null}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: (isCurrent || checkingOut !== null) ? 'default' : 'pointer',
                    ...btnStyle,
                  }}
                >
                  {isCurrent
                    ? '✓ Current plan'
                    : checkingOut === plan.id
                      ? 'Redirecting…'
                      : plan.id === 'free'
                        ? 'Downgrade to free'
                        : `Start ${plan.tier} plan`}
                </button>

                <p style={{ fontSize: '11px', color: '#9a9891', marginTop: '10px', textAlign: 'center' }}>
                  {plan.note}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}