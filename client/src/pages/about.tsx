import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FolderTree, ArrowLeft, Target, Users, Lightbulb, Heart } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "react-i18next";
import { PrefetchLink } from "@/components/prefetch-link";

export default function About() {
  const { t } = useTranslation();

  const values = [
    {
      icon: Target,
      titleKey: "about.values.mission.title",
      descriptionKey: "about.values.mission.description",
    },
    {
      icon: Lightbulb,
      titleKey: "about.values.innovation.title",
      descriptionKey: "about.values.innovation.description",
    },
    {
      icon: Users,
      titleKey: "about.values.userFirst.title",
      descriptionKey: "about.values.userFirst.description",
    },
    {
      icon: Heart,
      titleKey: "about.values.trust.title",
      descriptionKey: "about.values.trust.description",
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
              <Button variant="ghost" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("common.back_home")}
              </Button>
            </PrefetchLink>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-6 lg:px-12 py-12 lg:py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h1 className="text-4xl lg:text-5xl font-bold" data-testid="text-about-title">
              {t("about.title")}
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto" data-testid="text-about-subtitle">
              {t("about.subtitle")}
            </p>
          </div>

          <section className="mb-16">
            <Card data-testid="card-company-story">
              <CardContent className="py-8">
                <h2 className="text-2xl font-bold mb-4">{t("about.story.title")}</h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>{t("about.story.paragraph1")}</p>
                  <p>{t("about.story.paragraph2")}</p>
                  <p>{t("about.story.paragraph3")}</p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-8 text-center">{t("about.values.title")}</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {values.map((value, index) => {
                const IconComponent = value.icon;
                return (
                  <Card key={index} className="hover-elevate" data-testid={`card-value-${index}`}>
                    <CardContent className="py-6">
                      <div className="flex items-start gap-4">
                        <div className="p-3 rounded-lg bg-primary/10">
                          <IconComponent className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold mb-2">{t(value.titleKey)}</h3>
                          <p className="text-sm text-muted-foreground">{t(value.descriptionKey)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="text-center">
            <Card className="bg-primary/5" data-testid="card-cta">
              <CardContent className="py-12">
                <h2 className="text-2xl font-bold mb-4">{t("about.cta.title")}</h2>
                <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                  {t("about.cta.description")}
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <a href="/login">
                    <Button data-testid="button-get-started">
                      {t("about.cta.getStarted")}
                    </Button>
                  </a>
                  <a href="/contact">
                    <Button variant="outline" data-testid="button-contact-us">
                      {t("about.cta.contactUs")}
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          </section>
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
