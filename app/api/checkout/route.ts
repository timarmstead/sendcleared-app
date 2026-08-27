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

  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id, stripe_subscription_id, status')
    .eq('user_id', user.id)
    .maybeSingle()

  // If they already have an active subscription, change it in place rather
  // than creating a new checkout session — creating a second one here is
  // exactly what caused two simultaneously-billing subscriptions.
  if (existingSub?.status === 'active' && existingSub.stripe_subscription_id) {
    const currentSubscription = await stripe.subscriptions.retrieve(existingSub.stripe_subscription_id)
    const currentItemId = currentSubscription.items.data[0]?.id

    if (currentItemId) {
      await stripe.subscriptions.update(existingSub.stripe_subscription_id, {
        items: [{ id: currentItemId, price: priceId }],
        proration_behavior: 'create_prorations',
      })

      return NextResponse.json({ switched: true })
    }
  }

  // No existing active subscription — normal first-time checkout
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