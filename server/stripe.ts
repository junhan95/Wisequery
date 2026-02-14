import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("WARNING: STRIPE_SECRET_KEY is not set. Stripe payment features will be disabled.");
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-11-17.clover",
    typescript: true,
  })
  : null as any;

export const STRIPE_PLANS = {
  FREE: "free",
  BASIC: "basic",
  PRO: "pro",
  CUSTOM: "custom",
} as const;

export type StripePlan = typeof STRIPE_PLANS[keyof typeof STRIPE_PLANS];

export const PLAN_LIMITS = {
  [STRIPE_PLANS.FREE]: {
    projects: 3,
    conversations: 30,
    storageGB: 10,
    imageGeneration: false,
  },
  [STRIPE_PLANS.BASIC]: {
    projects: 10,
    conversations: -1,
    storageGB: 50,
    imageGeneration: false,
  },
  [STRIPE_PLANS.PRO]: {
    projects: -1,
    conversations: -1,
    storageGB: 100,
    imageGeneration: true,
  },
  [STRIPE_PLANS.CUSTOM]: {
    projects: -1,
    conversations: -1,
    storageGB: -1,
    imageGeneration: true,
  },
} as const;

const BASIC_MONTHLY_PRICE_ID = process.env.STRIPE_BASIC_MONTHLY_PRICE_ID;
const BASIC_YEARLY_PRICE_ID = process.env.STRIPE_BASIC_YEARLY_PRICE_ID;
const PRO_MONTHLY_PRICE_ID = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
const PRO_YEARLY_PRICE_ID = process.env.STRIPE_PRO_YEARLY_PRICE_ID;

if (!BASIC_MONTHLY_PRICE_ID || !PRO_MONTHLY_PRICE_ID) {
  console.warn("WARNING: Stripe price IDs not configured. Please set STRIPE_BASIC_MONTHLY_PRICE_ID, STRIPE_BASIC_YEARLY_PRICE_ID, STRIPE_PRO_MONTHLY_PRICE_ID, and STRIPE_PRO_YEARLY_PRICE_ID environment variables.");
}

export const STRIPE_PRICE_IDS = {
  basic: {
    monthly: BASIC_MONTHLY_PRICE_ID,
    yearly: BASIC_YEARLY_PRICE_ID,
  },
  pro: {
    monthly: PRO_MONTHLY_PRICE_ID,
    yearly: PRO_YEARLY_PRICE_ID,
  },
} as const;

export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  name?: string,
): Promise<Stripe.Customer> {
  const customers = await stripe.customers.list({
    email,
    limit: 1,
  });

  if (customers.data.length > 0) {
    return customers.data[0];
  }

  return await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: {
      userId,
    },
  });
}

export async function createCheckoutSession(
  customerId: string,
  plan: "basic" | "pro",
  period: "monthly" | "yearly",
  successUrl: string,
  cancelUrl: string,
): Promise<Stripe.Checkout.Session> {
  const planPrices = STRIPE_PRICE_IDS[plan];
  const priceId = planPrices[period];

  if (!priceId) {
    throw new Error(`Stripe price ID for ${plan} ${period} plan is not configured. Please set STRIPE_${plan.toUpperCase()}_${period.toUpperCase()}_PRICE_ID environment variable.`);
  }

  return await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });
}

export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<Stripe.BillingPortal.Session> {
  return await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

export async function getSubscriptionStatus(
  subscriptionId: string,
): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    console.error("Error retrieving subscription:", error);
    return null;
  }
}

export async function cancelSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  return await stripe.subscriptions.cancel(subscriptionId);
}

export function isWebhookSignatureValid(
  payload: string | Buffer,
  signature: string,
  secret: string,
): boolean {
  try {
    stripe.webhooks.constructEvent(payload, signature, secret);
    return true;
  } catch (error) {
    return false;
  }
}

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  secret: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, secret);
}
