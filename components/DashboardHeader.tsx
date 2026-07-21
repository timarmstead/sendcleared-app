'use client'

import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DashboardHeader({ showBack = false }: { showBack?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const linkStyle = (active: boolean): React.CSSProperties => ({
    color: '#fff',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: active ? 700 : 500,
    opacity: active ? 1 : 0.75,
    padding: '6px 4px',
    borderBottom: active ? '2px solid #fff' : '2px solid transparent',
  })

  return (
    <div style={{
      background: '#f26600',
      padding: '0 2rem',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '17px', whiteSpace: 'nowrap' }}>
          SendCleared
        </span>
        <nav style={{ display: 'flex', gap: '1.25rem' }}>
          <a href="/dashboard" style={linkStyle(pathname === '/dashboard')}>Dashboard</a>
          <a href="/dashboard/billing" style={linkStyle(pathname === '/dashboard/billing')}>Billing</a>
        </nav>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {showBack && (
          <button
            onClick={() => router.back()}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.5)',
              color: '#fff',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ← Back
          </button>
        )}
        <button
          onClick={handleLogout}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.5)',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Log out
        </button>
      </div>
    </div>
  )
}