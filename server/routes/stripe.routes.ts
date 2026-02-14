import { Router } from "express";
import { isAuthenticated } from "../sessionAuth";
import { storage } from "../storage";
import {
    stripe,
    getOrCreateStripeCustomer,
    createCheckoutSession,
    createCustomerPortalSession,
    constructWebhookEvent,
    PLAN_LIMITS,
} from "../stripe";

const router = Router();

// Get subscription
router.get("/subscription", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user?.claims?.sub;
        if (!userId) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const subscription = await storage.getSubscription(userId);
        const plan = (subscription?.plan || "free") as keyof typeof PLAN_LIMITS;
        const planLimits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

        const projectCount = (await storage.getProjects(userId)).length;
        const conversationCount = (await storage.getConversations(userId)).length;
        const aiQueryCount = await storage.getAIQueryCount(userId);

        const files = await storage.getFilesByUser(userId);
        const storageUsedBytes = files.reduce((total, file) => total + (file.size || 0), 0);
        const storageUsedGB = storageUsedBytes / (1024 * 1024 * 1024);

        res.json({
            subscription: subscription || { plan: "free", stripeStatus: null },
            usage: {
                projects: projectCount,
                conversations: conversationCount,
                aiQueries: aiQueryCount,
                storageGB: Math.round(storageUsedGB * 100) / 100,
            },
            limits: {
                projects: planLimits.projects,
                conversations: planLimits.conversations,
                aiQueries: planLimits.conversations,
                storageGB: planLimits.storageGB,
                imageGeneration: planLimits.imageGeneration,
            },
        });
    } catch (error) {
        console.error("Error fetching subscription:", error);
        res.status(500).json({ error: "Failed to fetch subscription" });
    }
});

// Create checkout session
router.post("/create-checkout-session", isAuthenticated, async (req, res) => {
    try {
        const authUser = req.user as any;
        const userId = authUser?.claims?.sub;
        const email = authUser?.claims?.email;
        const name = authUser?.claims?.name || `${authUser?.claims?.first_name || ""} ${authUser?.claims?.last_name || ""}`.trim();

        if (!userId || !email) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const { plan, period = "monthly" } = req.body;
        if (plan !== "basic" && plan !== "pro") {
            return res.status(400).json({ error: "Invalid plan" });
        }
        if (period !== "monthly" && period !== "yearly") {
            return res.status(400).json({ error: "Invalid billing period" });
        }

        const user = await storage.getUser(userId);
        let stripeCustomerId = user?.stripeCustomerId;

        if (!stripeCustomerId) {
            const customer = await getOrCreateStripeCustomer(userId, email, name);
            stripeCustomerId = customer.id;
            await storage.updateUserStripeCustomerId(userId, stripeCustomerId);
        }

        const session = await createCheckoutSession(
            stripeCustomerId,
            plan,
            period,
            `${req.headers.origin || "http://localhost:5000"}/pricing?success=true`,
            `${req.headers.origin || "http://localhost:5000"}/pricing?canceled=true`
        );

        res.json({ url: session.url });
    } catch (error) {
        console.error("Error creating checkout session:", error);
        res.status(500).json({ error: "Failed to create checkout session" });
    }
});

// Customer portal
router.post("/customer-portal", isAuthenticated, async (req, res) => {
    try {
        const authUser = req.user as any;
        const userId = authUser?.claims?.sub;
        if (!userId) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const user = await storage.getUser(userId);
        if (!user?.stripeCustomerId) {
            return res.status(400).json({ error: "No Stripe customer found" });
        }

        const session = await createCustomerPortalSession(
            user.stripeCustomerId,
            `${req.headers.origin || "http://localhost:5000"}/pricing`
        );

        res.json({ url: session.url });
    } catch (error) {
        console.error("Error creating customer portal session:", error);
        res.status(500).json({ error: "Failed to create customer portal session" });
    }
});

// Stripe webhook
router.post("/webhooks/stripe", async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
        return res.status(400).send("Webhook signature or secret missing");
    }

    let event;
    try {
        event = constructWebhookEvent(req.body, sig as string, webhookSecret);
    } catch (err: any) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as any;
                const customerId = session.customer;
                const subscriptionId = session.subscription;

                const customers = await stripe.customers.list({ limit: 1, email: session.customer_email });
                if (customers.data.length > 0) {
                    const customer = customers.data[0];
                    const userId = customer.metadata.userId;

                    if (userId && subscriptionId) {
                        const subscription = await stripe.subscriptions.retrieve(subscriptionId as string);
                        const priceId = subscription.items.data[0]?.price.id;

                        let plan = "free";
                        if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
                            plan = "pro";
                        } else if (priceId === process.env.STRIPE_TEAM_PRICE_ID) {
                            plan = "team";
                        }

                        const periodEnd = (subscription as any).current_period_end;

                        const existingSub = await storage.getSubscription(userId);
                        if (existingSub) {
                            await storage.updateSubscription(userId, {
                                plan,
                                stripeSubscriptionId: subscriptionId as string,
                                stripeStatus: subscription.status,
                                stripePriceId: priceId,
                                stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
                            });
                        } else {
                            await storage.createSubscription(
                                {
                                    plan,
                                    stripeSubscriptionId: subscriptionId as string,
                                    stripeStatus: subscription.status,
                                    stripePriceId: priceId,
                                    stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
                                },
                                userId
                            );
                        }
                    }
                }
                break;
            }

            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
                const subscription = event.data.object as any;
                const customerId = subscription.customer;

                const customers = await stripe.customers.retrieve(customerId);
                const userId = (customers as any).metadata?.userId;

                if (userId) {
                    const existingSub = await storage.getSubscription(userId);
                    if (existingSub) {
                        if (event.type === "customer.subscription.deleted") {
                            await storage.updateSubscription(userId, {
                                plan: "free",
                                stripeStatus: "canceled",
                                stripeSubscriptionId: null,
                                stripePriceId: null,
                                stripeCurrentPeriodEnd: null,
                            });
                        } else {
                            const priceId = subscription.items.data[0]?.price.id;
                            let plan = "free";
                            if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
                                plan = "pro";
                            } else if (priceId === process.env.STRIPE_TEAM_PRICE_ID) {
                                plan = "team";
                            }

                            const periodEnd = (subscription as any).current_period_end;
                            await storage.updateSubscription(userId, {
                                plan,
                                stripeStatus: subscription.status,
                                stripePriceId: priceId,
                                stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
                            });
                        }
                    }
                }
                break;
            }

            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error("Webhook handler error:", error);
        res.status(500).json({ error: "Webhook handler failed" });
    }
});

export default router;
