import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderTree, ArrowLeft, Sparkles, Bug, Zap, Shield } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "react-i18next";
import { PrefetchLink } from "@/components/prefetch-link";

interface ChangelogEntry {
  version: string;
  date: string;
  type: "feature" | "improvement" | "bugfix" | "security";
  titleKey: string;
  descriptionKey: string;
}

const changelogData: ChangelogEntry[] = [
  {
    version: "1.6.0",
    date: "2025-12-11",
    type: "feature",
    titleKey: "changelog.entries.chatGptMarkdown.title",
    descriptionKey: "changelog.entries.chatGptMarkdown.description",
  },
  {
    version: "1.5.5",
    date: "2025-12-11",
    type: "improvement",
    titleKey: "changelog.entries.aiLatencyOptimization.title",
    descriptionKey: "changelog.entries.aiLatencyOptimization.description",
  },
  {
    version: "1.5.2",
    date: "2025-12-10",
    type: "feature",
    titleKey: "changelog.entries.passwordReset.title",
    descriptionKey: "changelog.entries.passwordReset.description",
  },
  {
    version: "1.5.0",
    date: "2025-12-10",
    type: "feature",
    titleKey: "changelog.entries.autoRagPipeline.title",
    descriptionKey: "changelog.entries.autoRagPipeline.description",
  },
  {
    version: "1.4.0",
    date: "2025-12-08",
    type: "feature",
    titleKey: "changelog.entries.propertiesDialog.title",
    descriptionKey: "changelog.entries.propertiesDialog.description",
  },
  {
    version: "1.3.5",
    date: "2025-12-05",
    type: "feature",
    titleKey: "changelog.entries.dataRetention.title",
    descriptionKey: "changelog.entries.dataRetention.description",
  },
  {
    version: "1.3.0",
    date: "2025-12-01",
    type: "feature",
    titleKey: "changelog.entries.multiFileSelect.title",
    descriptionKey: "changelog.entries.multiFileSelect.description",
  },
  {
    version: "1.2.5",
    date: "2025-11-28",
    type: "improvement",
    titleKey: "changelog.entries.folderContextMenu.title",
    descriptionKey: "changelog.entries.folderContextMenu.description",
  },
  {
    version: "1.2.1",
    date: "2025-11-25",
    type: "bugfix",
    titleKey: "changelog.entries.languageToggleFix.title",
    descriptionKey: "changelog.entries.languageToggleFix.description",
  },
  {
    version: "1.2.0",
    date: "2025-11-20",
    type: "feature",
    titleKey: "changelog.entries.customAuth.title",
    descriptionKey: "changelog.entries.customAuth.description",
  },
  {
    version: "1.1.5",
    date: "2025-11-15",
    type: "improvement",
    titleKey: "changelog.entries.ragEnhancement.title",
    descriptionKey: "changelog.entries.ragEnhancement.description",
  },
  {
    version: "1.1.4",
    date: "2025-11-01",
    type: "bugfix",
    titleKey: "changelog.entries.streamingFix.title",
    descriptionKey: "changelog.entries.streamingFix.description",
  },
  {
    version: "1.1.3",
    date: "2025-10-20",
    type: "feature",
    titleKey: "changelog.entries.imageUpload.title",
    descriptionKey: "changelog.entries.imageUpload.description",
  },
  {
    version: "1.1.2",
    date: "2025-10-10",
    type: "security",
    titleKey: "changelog.entries.securityUpdate.title",
    descriptionKey: "changelog.entries.securityUpdate.description",
  },
  {
    version: "1.1.1",
    date: "2025-10-01",
    type: "improvement",
    titleKey: "changelog.entries.i18nSupport.title",
    descriptionKey: "changelog.entries.i18nSupport.description",
  },
  {
    version: "1.1.0",
    date: "2025-09-15",
    type: "feature",
    titleKey: "changelog.entries.stripeIntegration.title",
    descriptionKey: "changelog.entries.stripeIntegration.description",
  },
  {
    version: "1.0.0",
    date: "2025-09-01",
    type: "feature",
    titleKey: "changelog.entries.initialRelease.title",
    descriptionKey: "changelog.entries.initialRelease.description",
  },
];

function getTypeIcon(type: ChangelogEntry["type"]) {
  switch (type) {
    case "feature":
      return <Sparkles className="h-4 w-4" />;
    case "improvement":
      return <Zap className="h-4 w-4" />;
    case "bugfix":
      return <Bug className="h-4 w-4" />;
    case "security":
      return <Shield className="h-4 w-4" />;
  }
}

function getTypeBadgeVariant(type: ChangelogEntry["type"]) {
  switch (type) {
    case "feature":
      return "default";
    case "improvement":
      return "secondary";
    case "bugfix":
      return "outline";
    case "security":
      return "destructive";
  }
}

export default function Changelog() {
  const { t, i18n } = useTranslation();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(i18n.language === "ko" ? "ko-KR" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };

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
        <div className="max-w-3xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <h1 className="text-4xl lg:text-5xl font-bold" data-testid="text-changelog-title">
              {t("changelog.title")}
            </h1>
            <p className="text-lg text-muted-foreground" data-testid="text-changelog-subtitle">
              {t("changelog.subtitle")}
            </p>
          </div>

          <div className="space-y-6">
            {changelogData.map((entry, index) => (
              <Card key={index} className="hover-elevate" data-testid={`card-changelog-${entry.version}`}>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono">
                        v{entry.version}
                      </Badge>
                      <Badge variant={getTypeBadgeVariant(entry.type) as any}>
                        {getTypeIcon(entry.type)}
                        <span className="ml-1">{t(`changelog.types.${entry.type}`)}</span>
                      </Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">{formatDate(entry.date)}</span>
                  </div>
                  <CardTitle className="text-xl mt-3">{t(entry.titleKey)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {t(entry.descriptionKey)}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
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
