import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Check, Crown, Users, Zap, ArrowLeft, Sparkles, X, Building2, FolderTree } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { PrefetchLink } from "@/components/prefetch-link";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Subscription {
  plan: string;
  stripeStatus: string | null;
  stripeCurrentPeriodEnd: string | null;
}

interface SubscriptionData {
  subscription: Subscription;
  usage: {
    projects: number;
    conversations: number;
    aiQueries: number;
    storageGB: number;
  };
  limits: {
    projects: number;
    conversations: number;
    aiQueries: number;
    storageGB: number;
    imageGeneration: boolean;
  };
}

function formatStorage(gb: number): string {
  if (gb < 1) {
    return `${Math.round(gb * 1024)} MB`;
  }
  return `${gb.toFixed(2)} GB`;
}

export default function Pricing() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");

  const { data: subscriptionData, isLoading: subLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
    enabled: isAuthenticated,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (params: { plan: string; period: "monthly" | "yearly" }) => {
      const response = await apiRequest("POST", "/api/create-checkout-session", params);
      return response;
    },
    onSuccess: (data: { url: string }) => {
      window.location.href = data.url;
    },
    onError: () => {
      toast({
        title: t("pricing.error.checkout_failed"),
        description: t("pricing.error.try_again"),
        variant: "destructive",
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/customer-portal", {});
      return response;
    },
    onSuccess: (data: { url: string }) => {
      window.location.href = data.url;
    },
    onError: () => {
      toast({
        title: t("pricing.error.portal_failed"),
        description: t("pricing.error.try_again"),
        variant: "destructive",
      });
    },
  });

  const handleCheckout = (plan: string) => {
    if (plan === "custom") {
      setLocation("/contact");
      return;
    }
    if (!isAuthenticated) {
      window.location.href = "/login";
      return;
    }
    checkoutMutation.mutate({ plan, period: billingPeriod });
  };

  const handleManageSubscription = () => {
    portalMutation.mutate();
  };

  const currentPlan = subscriptionData?.subscription?.plan || "free";
  const isActive = subscriptionData?.subscription?.stripeStatus === "active";

  const plans = [
    {
      id: "free",
      name: t("pricing.plans.free.name"),
      monthlyPrice: 0,
      yearlyPrice: 0,
      tagline: t("pricing.plans.free.tagline"),
      description: t("pricing.plans.free.description"),
      icon: Zap,
      features: [
        t("pricing.plans.free.features.projects"),
        t("pricing.plans.free.features.conversations"),
        t("pricing.plans.free.features.storage"),
        t("pricing.plans.free.features.rag"),
        t("pricing.plans.free.features.retention"),
      ],
      cta: t("pricing.plans.free.cta"),
      highlighted: false,
    },
    {
      id: "basic",
      name: t("pricing.plans.basic.name"),
      monthlyPrice: 25,
      yearlyPrice: 20,
      tagline: t("pricing.plans.basic.tagline"),
      description: t("pricing.plans.basic.description"),
      icon: Sparkles,
      features: [
        t("pricing.plans.basic.features.projects"),
        t("pricing.plans.basic.features.conversations"),
        t("pricing.plans.basic.features.storage"),
        t("pricing.plans.basic.features.rag"),
        t("pricing.plans.basic.features.retention"),
      ],
      cta: t("pricing.plans.basic.cta"),
      highlighted: true,
    },
    {
      id: "pro",
      name: t("pricing.plans.pro.name"),
      monthlyPrice: 40,
      yearlyPrice: 35,
      tagline: t("pricing.plans.pro.tagline"),
      description: t("pricing.plans.pro.description"),
      icon: Crown,
      features: [
        t("pricing.plans.pro.features.projects"),
        t("pricing.plans.pro.features.conversations"),
        t("pricing.plans.pro.features.storage"),
        t("pricing.plans.pro.features.rag"),
        t("pricing.plans.pro.features.image_gen"),
        t("pricing.plans.pro.features.priority_support"),
        t("pricing.plans.pro.features.retention"),
      ],
      cta: t("pricing.plans.pro.cta"),
      highlighted: false,
    },
    {
      id: "custom",
      name: t("pricing.plans.custom.name"),
      monthlyPrice: -1,
      yearlyPrice: -1,
      tagline: t("pricing.plans.custom.tagline"),
      description: t("pricing.plans.custom.description"),
      icon: Building2,
      features: [
        t("pricing.plans.custom.features.everything_pro"),
        t("pricing.plans.custom.features.custom_limits"),
        t("pricing.plans.custom.features.custom_integrations"),
        t("pricing.plans.custom.features.dedicated_support"),
        t("pricing.plans.custom.features.sla_guarantee"),
        t("pricing.plans.custom.features.retention"),
      ],
      cta: t("pricing.plans.custom.cta"),
      highlighted: false,
    },
  ];

  const comparisonFeatures = [
    { key: "projects", label: t("pricing.comparison.features.projects") },
    { key: "conversations", label: t("pricing.comparison.features.conversations") },
    { key: "storage", label: t("pricing.comparison.features.storage") },
    { key: "data_retention", label: t("pricing.comparison.features.data_retention") },
    { key: "rag_search", label: t("pricing.comparison.features.rag_search") },
    { key: "image_generation", label: t("pricing.comparison.features.image_generation") },
    { key: "support", label: t("pricing.comparison.features.support") },
    { key: "api_access", label: t("pricing.comparison.features.api_access") },
  ];

  const comparisonPlans = ["free", "basic", "pro", "custom"] as const;

  if (authLoading || (isAuthenticated && subLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-6 lg:px-12">
          <PrefetchLink
            href="/"
            className="flex items-center gap-2 hover-elevate px-2 py-1 rounded-md"
            data-testid="link-logo-home"
          >
            <FolderTree className="h-6 w-6" />
            <span className="text-xl font-semibold">{t("landing.nav.appName")}</span>
          </PrefetchLink>
          <nav className="flex items-center gap-4">
            <ThemeToggle />
            <LanguageToggle />
            <PrefetchLink href="/?scrollToBottom=true" data-testid="link-back-home">
              <Button variant="ghost" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("common.back_home")}
              </Button>
            </PrefetchLink>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-6 lg:px-12 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">{t("pricing.title")}</h1>
          <p className="text-xl text-muted-foreground mb-8">{t("pricing.subtitle")}</p>

          {/* Billing Period Toggle */}
          <div className="inline-flex items-center rounded-full border p-1 bg-muted/50">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${billingPeriod === "monthly"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
                }`}
              data-testid="toggle-monthly"
            >
              {t("pricing.per_month")}
            </button>
            <button
              onClick={() => setBillingPeriod("yearly")}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${billingPeriod === "yearly"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
                }`}
              data-testid="toggle-yearly"
            >
              {t("pricing.per_year")}
            </button>
          </div>
        </div>

        {isAuthenticated && subscriptionData && (
          <Card className="mb-12 max-w-3xl mx-auto">
            <CardHeader>
              <CardTitle>{t("pricing.current_plan.title")}</CardTitle>
              <CardDescription>{t("pricing.current_plan.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("pricing.current_plan.your_plan")}</p>
                  <p className="text-2xl font-bold capitalize">{currentPlan}</p>
                </div>
                {currentPlan !== "free" && (
                  <Badge variant={isActive ? "default" : "secondary"} data-testid="badge-subscription-status">
                    {isActive ? t("pricing.current_plan.active") : t("pricing.current_plan.inactive")}
                  </Badge>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-muted-foreground">{t("pricing.current_plan.projects")}</span>
                    <span className="text-sm font-medium" data-testid="text-projects-usage">
                      {subscriptionData.usage.projects} / {subscriptionData.limits.projects === -1 ? "∞" : subscriptionData.limits.projects}
                    </span>
                  </div>
                  <Progress
                    value={
                      subscriptionData.limits.projects === -1
                        ? 0
                        : (subscriptionData.usage.projects / subscriptionData.limits.projects) * 100
                    }
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-muted-foreground">{t("pricing.current_plan.ai_queries")}</span>
                    <span className="text-sm font-medium" data-testid="text-ai-queries-usage">
                      {subscriptionData.usage.aiQueries} / {subscriptionData.limits.aiQueries === -1 ? "∞" : subscriptionData.limits.aiQueries}
                    </span>
                  </div>
                  <Progress
                    value={
                      subscriptionData.limits.aiQueries === -1
                        ? 0
                        : (subscriptionData.usage.aiQueries / subscriptionData.limits.aiQueries) * 100
                    }
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-muted-foreground">{t("pricing.current_plan.storage")}</span>
                    <span className="text-sm font-medium" data-testid="text-storage-usage">
                      {formatStorage(subscriptionData.usage.storageGB)} / {subscriptionData.limits.storageGB === -1 ? "∞" : `${subscriptionData.limits.storageGB} GB`}
                    </span>
                  </div>
                  <Progress
                    value={
                      subscriptionData.limits.storageGB === -1
                        ? 0
                        : (subscriptionData.usage.storageGB / subscriptionData.limits.storageGB) * 100
                    }
                  />
                </div>
              </div>

              {currentPlan !== "free" && (
                <Button
                  variant="outline"
                  onClick={handleManageSubscription}
                  disabled={portalMutation.isPending}
                  className="w-full"
                  data-testid="button-manage-subscription"
                >
                  {portalMutation.isPending ? t("common.loading") : t("pricing.current_plan.manage")}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const isCurrent = currentPlan === plan.id;
            const canUpgrade =
              (currentPlan === "free" && plan.id !== "free") ||
              (currentPlan === "basic" && (plan.id === "pro" || plan.id === "custom")) ||
              (currentPlan === "pro" && plan.id === "custom");

            return (
              <Card
                key={plan.id}
                className={plan.highlighted ? "border-primary shadow-lg" : ""}
                data-testid={`card-plan-${plan.id}`}
              >
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {plan.highlighted && (
                      <Badge data-testid="badge-popular">{t("pricing.popular")}</Badge>
                    )}
                  </div>

                  {/* Price Display */}
                  <div className="mt-2">
                    {plan.monthlyPrice === -1 ? (
                      <div>
                        <span className="text-3xl font-bold">{t("pricing.custom_pricing")}</span>
                      </div>
                    ) : plan.monthlyPrice === 0 ? (
                      <div>
                        <span className="text-3xl font-bold">{t("pricing.free")}</span>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-baseline gap-2">
                          {billingPeriod === "yearly" && plan.yearlyPrice < plan.monthlyPrice && (
                            <span className="text-xl text-muted-foreground line-through">
                              ${plan.monthlyPrice}
                            </span>
                          )}
                          <span className="text-3xl font-bold">
                            ${billingPeriod === "yearly" ? plan.yearlyPrice : plan.monthlyPrice}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            {t("pricing.per_month_label")}
                          </span>
                        </div>
                        {billingPeriod === "yearly" && plan.yearlyPrice < plan.monthlyPrice && (
                          <div className="text-sm text-green-600 dark:text-green-400 mt-1">
                            {t("pricing.save_yearly", {
                              amount: (plan.monthlyPrice - plan.yearlyPrice) * 12
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <CardDescription className="mt-3">{plan.description}</CardDescription>
                </CardHeader>

                <CardContent className="pb-4">
                  {/* CTA Button */}
                  {isCurrent ? (
                    <Button
                      variant="outline"
                      disabled
                      className="w-full mb-6"
                      data-testid={`button-current-plan-${plan.id}`}
                    >
                      {t("pricing.current_plan_button")}
                    </Button>
                  ) : canUpgrade ? (
                    <Button
                      variant={plan.highlighted ? "default" : "outline"}
                      onClick={() => handleCheckout(plan.id)}
                      disabled={checkoutMutation.isPending}
                      className="w-full mb-6"
                      data-testid={`button-upgrade-${plan.id}`}
                    >
                      {checkoutMutation.isPending ? t("common.loading") : plan.cta}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => handleCheckout(plan.id)}
                      disabled={plan.id === "free" || checkoutMutation.isPending}
                      className="w-full mb-6"
                      data-testid={`button-action-${plan.id}`}
                    >
                      {plan.cta}
                    </Button>
                  )}

                  {/* Features List */}
                  <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-20 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">{t("pricing.comparison.title")}</h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]"></TableHead>
                  {comparisonPlans.map((planId) => (
                    <TableHead key={planId} className="text-center capitalize">
                      {t(`pricing.plans.${planId}.name`)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonFeatures.map((feature) => (
                  <TableRow key={feature.key}>
                    <TableCell className="font-medium">{feature.label}</TableCell>
                    {comparisonPlans.map((planId) => {
                      const value = t(`pricing.comparison.values.${planId}.${feature.key}`);
                      const isYes = value.toLowerCase() === "yes" || value === "가능";
                      const isNo = value.toLowerCase() === "no" || value === "불가";
                      return (
                        <TableCell key={planId} className="text-center">
                          {isYes ? (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          ) : isNo ? (
                            <X className="h-5 w-5 text-muted-foreground mx-auto" />
                          ) : (
                            <span className="text-sm">{value}</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <div className="mt-16 text-center text-sm text-muted-foreground">
          <p>{t("pricing.footer.secure_payments")}</p>
          <p className="mt-2">{t("pricing.footer.cancel_anytime")}</p>
        </div>
      </main>
    </div>
  );
}
