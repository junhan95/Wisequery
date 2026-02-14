import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTree, ArrowLeft, Shield, Lock, Server, Eye, AlertTriangle, RefreshCw } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "react-i18next";
import { PrefetchLink } from "@/components/prefetch-link";

export default function Security() {
  const { t } = useTranslation();

  const securityFeatures = [
    {
      icon: Lock,
      titleKey: "security.features.encryption.title",
      descriptionKey: "security.features.encryption.description",
    },
    {
      icon: Server,
      titleKey: "security.features.infrastructure.title",
      descriptionKey: "security.features.infrastructure.description",
    },
    {
      icon: Shield,
      titleKey: "security.features.access.title",
      descriptionKey: "security.features.access.description",
    },
    {
      icon: Eye,
      titleKey: "security.features.monitoring.title",
      descriptionKey: "security.features.monitoring.description",
    },
    {
      icon: AlertTriangle,
      titleKey: "security.features.incident.title",
      descriptionKey: "security.features.incident.description",
    },
    {
      icon: RefreshCw,
      titleKey: "security.features.updates.title",
      descriptionKey: "security.features.updates.description",
    },
  ];

  const sections = [
    {
      titleKey: "security.sections.dataProtection.title",
      contentKey: "security.sections.dataProtection.content",
    },
    {
      titleKey: "security.sections.authentication.title",
      contentKey: "security.sections.authentication.content",
    },
    {
      titleKey: "security.sections.aiSecurity.title",
      contentKey: "security.sections.aiSecurity.content",
    },
    {
      titleKey: "security.sections.compliance.title",
      contentKey: "security.sections.compliance.content",
    },
    {
      titleKey: "security.sections.vulnerability.title",
      contentKey: "security.sections.vulnerability.content",
    },
  ];

  return (
    <div className="min-h-screen">
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
              <Button variant="ghost" data-testid="button-security-back-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("common.back_home")}
              </Button>
            </PrefetchLink>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-6 lg:px-12 py-12 lg:py-20">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold mb-4" data-testid="text-security-title">
              {t("security.title")}
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {t("security.subtitle")}
            </p>
          </div>

          <Card className="mb-12">
            <CardContent className="pt-6">
              <p className="text-muted-foreground leading-relaxed">
                {t("security.intro")}
              </p>
            </CardContent>
          </Card>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-center">
              {t("security.featuresTitle")}
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {securityFeatures.map((feature, index) => (
                <Card key={index} className="hover-elevate">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <feature.icon className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{t(feature.titleKey)}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm">
                      {t(feature.descriptionKey)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-2xl font-bold mb-6 text-center">
              {t("security.practicesTitle")}
            </h2>
            {sections.map((section, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-xl">{t(section.titleKey)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                    {t(section.contentKey)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>

          <div className="mt-12 text-center">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <h3 className="text-xl font-semibold mb-2">
                  {t("security.report.title")}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {t("security.report.description")}
                </p>
                <a href="mailto:security@wisequery.app">
                  <Button data-testid="button-report-vulnerability">
                    {t("security.report.button")}
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
