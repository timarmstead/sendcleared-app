import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { stripe } from '@/lib/stripe'
import { resend } from '@/lib/resend'

const PRICE_MAP: Record<string, string> = {
  freelancer: process.env.STRIPE_PRICE_FREELANCER!,
  agency: process.env.STRIPE_PRICE_AGENCY!,
  studio: process.env.STRIPE_PRICE_STUDIO!,
}

const PLAN_DISPLAY: Record<string, { name: string; price: string }> = {
  freelancer: { name: 'Freelancer', price: '$19' },
  agency: { name: 'Agency', price: '$49' },
  studio: { name: 'Studio', price: '$99' },
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
    .select('stripe_customer_id, stripe_subscription_id, status, plan')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingSub?.status === 'active' && existingSub.stripe_subscription_id) {
    const currentSubscription = await stripe.subscriptions.retrieve(existingSub.stripe_subscription_id)
    const currentItemId = currentSubscription.items.data[0]?.id

    if (currentItemId) {
      const updatedSubscription = await stripe.subscriptions.update(existingSub.stripe_subscription_id, {
        items: [{ id: currentItemId, price: priceId }],
        proration_behavior: 'create_prorations',
      })

      const oldPlanDisplay = PLAN_DISPLAY[existingSub.plan]?.name || existingSub.plan
      const newPlanDisplay = PLAN_DISPLAY[plan]?.name || plan
      const newPrice = PLAN_DISPLAY[plan]?.price || ''
      const renewalDate = new Date(updatedSubscription.items.data[0].current_period_end * 1000)
        .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

      try {
        await resend.emails.send({
          from: 'SendCleared <notifications@sendcleared.com>',
          to: user.email!,
          subject: `Your SendCleared plan has changed to ${newPlanDisplay}`,
          html: `
            <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto">
              <h2 style="color:#134e8e">Your plan has changed</h2>
              <p>Your SendCleared subscription has been updated from <strong>${oldPlanDisplay}</strong> to <strong>${newPlanDisplay}</strong>.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr>
                  <td style="padding:8px 0;color:#5a5a56;font-size:13px">New plan</td>
                  <td style="padding:8px 0;text-align:right;font-weight:600">${newPlanDisplay}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#5a5a56;font-size:13px;border-top:1px solid #eee">Price</td>
                  <td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #eee">${newPrice}/mo</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#5a5a56;font-size:13px;border-top:1px solid #eee">Next renewal</td>
                  <td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #eee">${renewalDate}</td>
                </tr>
              </table>
              <p style="font-size:13px;color:#5a5a56">If you were charged or credited a prorated amount for this change, you'll see a separate receipt from Stripe for that.</p>
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing"
                 style="display:inline-block;background:#f26600;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;margin-top:10px">
                View billing
              </a>
            </div>
          `,
        })
      } catch (err) {
        console.error('Failed to send plan-change email:', err)
      }

      return NextResponse.json({ switched: true })
    }
  }

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