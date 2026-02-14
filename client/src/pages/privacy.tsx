import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTree, ArrowLeft } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "react-i18next";
import { PrefetchLink } from "@/components/prefetch-link";

export default function Privacy() {
  const { t } = useTranslation();

  const sections = [
    {
      titleKey: "privacy.sections.collection.title",
      contentKey: "privacy.sections.collection.content",
    },
    {
      titleKey: "privacy.sections.usage.title",
      contentKey: "privacy.sections.usage.content",
    },
    {
      titleKey: "privacy.sections.storage.title",
      contentKey: "privacy.sections.storage.content",
    },
    {
      titleKey: "privacy.sections.retention.title",
      contentKey: "privacy.sections.retention.content",
    },
    {
      titleKey: "privacy.sections.sharing.title",
      contentKey: "privacy.sections.sharing.content",
    },
    {
      titleKey: "privacy.sections.cookies.title",
      contentKey: "privacy.sections.cookies.content",
    },
    {
      titleKey: "privacy.sections.rights.title",
      contentKey: "privacy.sections.rights.content",
    },
    {
      titleKey: "privacy.sections.children.title",
      contentKey: "privacy.sections.children.content",
    },
    {
      titleKey: "privacy.sections.changes.title",
      contentKey: "privacy.sections.changes.content",
    },
    {
      titleKey: "privacy.sections.contact.title",
      contentKey: "privacy.sections.contact.content",
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
              <Button variant="ghost" data-testid="button-privacy-back-home">
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
            <h1 className="text-4xl font-bold mb-4" data-testid="text-privacy-title">
              {t("privacy.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("privacy.lastUpdated")}: {t("privacy.updateDate")}
            </p>
          </div>

          <Card className="mb-8">
            <CardContent className="pt-6">
              <p className="text-muted-foreground leading-relaxed">
                {t("privacy.intro")}
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
              {t("privacy.questions")}
            </p>
            <PrefetchLink href="/contact">
              <Button data-testid="button-privacy-contact">
                {t("common.contactUs")}
              </Button>
            </PrefetchLink>
          </div>
        </div>
      </main>
    </div>
  );
}
