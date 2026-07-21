import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { stripe } from '@/lib/stripe'

const PRICE_MAP: Record<string, string> = {
  freelancer: process.env.STRIPE_PRICE_FREELANCER!,
  agency: process.env.STRIPE_PRICE_AGENCY!,
  studio: process.env.STRIPE_PRICE_STUDIO!,
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { plan } = await request.json()
  const priceId = PRICE_MAP[plan]

  if (!priceId) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  // Reuse existing Stripe customer if we have one on file
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: existingSub?.stripe_customer_id || undefined,
    customer_email: existingSub?.stripe_customer_id ? undefined : user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=cancelled`,
    client_reference_id: user.id,
    metadata: { user_id: user.id, plan },
  })

  return NextResponse.json({ url: session.url })
}