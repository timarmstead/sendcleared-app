import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Stripe from 'stripe'

const PLAN_BY_PRICE: Record<string, string> = {
  [process.env.STRIPE_PRICE_FREELANCER!]: 'freelancer',
  [process.env.STRIPE_PRICE_AGENCY!]: 'agency',
  [process.env.STRIPE_PRICE_STUDIO!]: 'studio',
}

async function getTeamIdForUser(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.team_id ?? null
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.client_reference_id || session.metadata?.user_id
      const customerId = session.customer as string
      const subscriptionId = session.subscription as string

      if (userId && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const priceId = subscription.items.data[0]?.price.id
        const plan = PLAN_BY_PRICE[priceId] || 'free'
        const teamId = await getTeamIdForUser(userId)

        if (!teamId) {
          console.error('No team found for user during checkout completion:', userId)
        }

        await supabaseAdmin
          .from('subscriptions')
          .upsert({
            user_id: userId,
            team_id: teamId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan,
            status: subscription.status,
            current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
      }
      break
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const priceId = subscription.items.data[0]?.price.id
      const plan = subscription.status === 'canceled' ? 'free' : (PLAN_BY_PRICE[priceId] || 'free')

      // Fetch the existing row first so we can backfill team_id if it's
      // missing (e.g. rows created before team_id was tracked), rather than
      // assuming it's already correctly set.
      const { data: existing } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id, team_id')
        .eq('stripe_subscription_id', subscription.id)
        .maybeSingle()

      let teamId = existing?.team_id ?? null
      if (!teamId && existing?.user_id) {
        teamId = await getTeamIdForUser(existing.user_id)
      }

      await supabaseAdmin
        .from('subscriptions')
        .update({
          team_id: teamId,
          plan,
          status: subscription.status,
          current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscription.id)
      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true })
}