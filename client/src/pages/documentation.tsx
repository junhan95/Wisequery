import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTree, ArrowLeft, BookOpen, Rocket, Settings, Search, MessageSquare, CreditCard, Shield, HelpCircle } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "react-i18next";
import { PrefetchLink } from "@/components/prefetch-link";

interface DocSection {
  icon: typeof BookOpen;
  titleKey: string;
  descriptionKey: string;
  articles: { titleKey: string; descriptionKey: string }[];
}

const docSections: DocSection[] = [
  {
    icon: Rocket,
    titleKey: "docs.sections.gettingStarted.title",
    descriptionKey: "docs.sections.gettingStarted.description",
    articles: [
      { titleKey: "docs.sections.gettingStarted.articles.quickStart.title", descriptionKey: "docs.sections.gettingStarted.articles.quickStart.description" },
      { titleKey: "docs.sections.gettingStarted.articles.createProject.title", descriptionKey: "docs.sections.gettingStarted.articles.createProject.description" },
      { titleKey: "docs.sections.gettingStarted.articles.firstConversation.title", descriptionKey: "docs.sections.gettingStarted.articles.firstConversation.description" },
    ],
  },
  {
    icon: MessageSquare,
    titleKey: "docs.sections.conversations.title",
    descriptionKey: "docs.sections.conversations.description",
    articles: [
      { titleKey: "docs.sections.conversations.articles.createManage.title", descriptionKey: "docs.sections.conversations.articles.createManage.description" },
      { titleKey: "docs.sections.conversations.articles.aiInstructions.title", descriptionKey: "docs.sections.conversations.articles.aiInstructions.description" },
      { titleKey: "docs.sections.conversations.articles.fileAttachments.title", descriptionKey: "docs.sections.conversations.articles.fileAttachments.description" },
    ],
  },
  {
    icon: Search,
    titleKey: "docs.sections.search.title",
    descriptionKey: "docs.sections.search.description",
    articles: [
      { titleKey: "docs.sections.search.articles.semanticSearch.title", descriptionKey: "docs.sections.search.articles.semanticSearch.description" },
      { titleKey: "docs.sections.search.articles.ragSystem.title", descriptionKey: "docs.sections.search.articles.ragSystem.description" },
      { titleKey: "docs.sections.search.articles.crossProject.title", descriptionKey: "docs.sections.search.articles.crossProject.description" },
    ],
  },
  {
    icon: Settings,
    titleKey: "docs.sections.settings.title",
    descriptionKey: "docs.sections.settings.description",
    articles: [
      { titleKey: "docs.sections.settings.articles.projectManagement.title", descriptionKey: "docs.sections.settings.articles.projectManagement.description" },
      { titleKey: "docs.sections.settings.articles.exportData.title", descriptionKey: "docs.sections.settings.articles.exportData.description" },
      { titleKey: "docs.sections.settings.articles.darkMode.title", descriptionKey: "docs.sections.settings.articles.darkMode.description" },
    ],
  },
  {
    icon: CreditCard,
    titleKey: "docs.sections.billing.title",
    descriptionKey: "docs.sections.billing.description",
    articles: [
      { titleKey: "docs.sections.billing.articles.plans.title", descriptionKey: "docs.sections.billing.articles.plans.description" },
      { titleKey: "docs.sections.billing.articles.upgrade.title", descriptionKey: "docs.sections.billing.articles.upgrade.description" },
      { titleKey: "docs.sections.billing.articles.manage.title", descriptionKey: "docs.sections.billing.articles.manage.description" },
    ],
  },
  {
    icon: Shield,
    titleKey: "docs.sections.security.title",
    descriptionKey: "docs.sections.security.description",
    articles: [
      { titleKey: "docs.sections.security.articles.dataPrivacy.title", descriptionKey: "docs.sections.security.articles.dataPrivacy.description" },
      { titleKey: "docs.sections.security.articles.authentication.title", descriptionKey: "docs.sections.security.articles.authentication.description" },
      { titleKey: "docs.sections.security.articles.encryption.title", descriptionKey: "docs.sections.security.articles.encryption.description" },
    ],
  },
];

export default function Documentation() {
  const { t } = useTranslation();

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
              <Button variant="ghost" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("common.back_home")}
              </Button>
            </PrefetchLink>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-6 lg:px-12 py-12 lg:py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <div className="flex items-center justify-center gap-3">
              <BookOpen className="h-10 w-10 text-primary" />
              <h1 className="text-4xl lg:text-5xl font-bold" data-testid="text-docs-title">
                {t("docs.title")}
              </h1>
            </div>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-docs-subtitle">
              {t("docs.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {docSections.map((section, index) => {
              const IconComponent = section.icon;
              return (
                <Card key={index} className="hover-elevate" data-testid={`card-docs-section-${index}`}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <IconComponent className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{t(section.titleKey)}</CardTitle>
                    </div>
                    <CardDescription className="mt-2">
                      {t(section.descriptionKey)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {section.articles.map((article, articleIndex) => (
                        <li key={articleIndex}>
                          <a
                            href="#"
                            className="block p-3 rounded-lg hover-elevate border bg-background"
                            data-testid={`link-article-${index}-${articleIndex}`}
                          >
                            <div className="font-medium text-sm">{t(article.titleKey)}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {t(article.descriptionKey)}
                            </div>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="mt-12" data-testid="card-help">
            <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 py-8">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <HelpCircle className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{t("docs.help.title")}</h3>
                  <p className="text-sm text-muted-foreground">{t("docs.help.description")}</p>
                </div>
              </div>
              <a href="mailto:support@wisequery.app">
                <Button data-testid="button-contact-support">
                  {t("docs.help.contactSupport")}
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-6 lg:px-12">
          <p className="text-center text-sm text-muted-foreground">
            {t("landing.footer.copyright")}
          </p>
        </div>
      </footer>
    </div>
  );
}
