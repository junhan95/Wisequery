import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTree, ArrowLeft } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "react-i18next";
import { PrefetchLink } from "@/components/prefetch-link";

export default function Terms() {
  const { t } = useTranslation();

  const sections = [
    {
      titleKey: "terms.sections.acceptance.title",
      contentKey: "terms.sections.acceptance.content",
    },
    {
      titleKey: "terms.sections.description.title",
      contentKey: "terms.sections.description.content",
    },
    {
      titleKey: "terms.sections.accounts.title",
      contentKey: "terms.sections.accounts.content",
    },
    {
      titleKey: "terms.sections.usage.title",
      contentKey: "terms.sections.usage.content",
    },
    {
      titleKey: "terms.sections.content.title",
      contentKey: "terms.sections.content.content",
    },
    {
      titleKey: "terms.sections.intellectual.title",
      contentKey: "terms.sections.intellectual.content",
    },
    {
      titleKey: "terms.sections.payment.title",
      contentKey: "terms.sections.payment.content",
    },
    {
      titleKey: "terms.sections.termination.title",
      contentKey: "terms.sections.termination.content",
    },
    {
      titleKey: "terms.sections.disclaimer.title",
      contentKey: "terms.sections.disclaimer.content",
    },
    {
      titleKey: "terms.sections.limitation.title",
      contentKey: "terms.sections.limitation.content",
    },
    {
      titleKey: "terms.sections.governing.title",
      contentKey: "terms.sections.governing.content",
    },
    {
      titleKey: "terms.sections.changes.title",
      contentKey: "terms.sections.changes.content",
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
              <Button variant="ghost" data-testid="button-terms-back-home">
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
            <h1 className="text-4xl font-bold mb-4" data-testid="text-terms-title">
              {t("terms.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("terms.lastUpdated")}: {t("terms.updateDate")}
            </p>
          </div>

          <Card className="mb-8">
            <CardContent className="pt-6">
              <p className="text-muted-foreground leading-relaxed">
                {t("terms.intro")}
              </p>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {sections.map((section, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-xl">
                    {index + 1}. {t(section.titleKey)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                    {t(section.contentKey)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-muted-foreground mb-4">
              {t("terms.questions")}
            </p>
            <PrefetchLink href="/contact">
              <Button data-testid="button-terms-contact">
                {t("common.contactUs")}
              </Button>
            </PrefetchLink>
          </div>
        </div>
      </main>
    </div>
  );
}
