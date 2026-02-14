import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderTree, ArrowLeft, MapPin, Briefcase, Clock, Heart, Zap, Users, Coffee } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "react-i18next";
import { PrefetchLink } from "@/components/prefetch-link";

interface JobPosition {
  id: string;
  titleKey: string;
  departmentKey: string;
  locationKey: string;
  typeKey: string;
  descriptionKey: string;
}

const jobPositions: JobPosition[] = [
  {
    id: "1",
    titleKey: "careers.positions.seniorFrontend.title",
    departmentKey: "careers.departments.engineering",
    locationKey: "careers.locations.remote",
    typeKey: "careers.types.fullTime",
    descriptionKey: "careers.positions.seniorFrontend.description",
  },
  {
    id: "2",
    titleKey: "careers.positions.backendEngineer.title",
    departmentKey: "careers.departments.engineering",
    locationKey: "careers.locations.remote",
    typeKey: "careers.types.fullTime",
    descriptionKey: "careers.positions.backendEngineer.description",
  },
  {
    id: "3",
    titleKey: "careers.positions.mlEngineer.title",
    departmentKey: "careers.departments.ai",
    locationKey: "careers.locations.remote",
    typeKey: "careers.types.fullTime",
    descriptionKey: "careers.positions.mlEngineer.description",
  },
  {
    id: "4",
    titleKey: "careers.positions.productDesigner.title",
    departmentKey: "careers.departments.design",
    locationKey: "careers.locations.remote",
    typeKey: "careers.types.fullTime",
    descriptionKey: "careers.positions.productDesigner.description",
  },
];

const benefits = [
  { icon: Heart, titleKey: "careers.benefits.health.title", descriptionKey: "careers.benefits.health.description" },
  { icon: Zap, titleKey: "careers.benefits.learning.title", descriptionKey: "careers.benefits.learning.description" },
  { icon: Users, titleKey: "careers.benefits.team.title", descriptionKey: "careers.benefits.team.description" },
  { icon: Coffee, titleKey: "careers.benefits.flexibility.title", descriptionKey: "careers.benefits.flexibility.description" },
];

export default function Careers() {
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
          <div className="text-center space-y-4 mb-16">
            <h1 className="text-4xl lg:text-5xl font-bold" data-testid="text-careers-title">
              {t("careers.title")}
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto" data-testid="text-careers-subtitle">
              {t("careers.subtitle")}
            </p>
          </div>

          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-8 text-center">{t("careers.benefits.title")}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {benefits.map((benefit, index) => {
                const IconComponent = benefit.icon;
                return (
                  <Card key={index} className="text-center hover-elevate" data-testid={`card-benefit-${index}`}>
                    <CardContent className="py-6">
                      <div className="mx-auto p-3 rounded-full bg-primary/10 w-fit mb-4">
                        <IconComponent className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-2">{t(benefit.titleKey)}</h3>
                      <p className="text-sm text-muted-foreground">{t(benefit.descriptionKey)}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-8 text-center">{t("careers.openPositions")}</h2>
            <div className="space-y-4">
              {jobPositions.map((job) => (
                <Card key={job.id} className="hover-elevate" data-testid={`card-job-${job.id}`}>
                  <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <CardTitle className="text-xl">{t(job.titleKey)}</CardTitle>
                        <CardDescription className="mt-1">{t(job.descriptionKey)}</CardDescription>
                      </div>
                      <a href={`mailto:info@wisequery.app?subject=${encodeURIComponent(t(job.titleKey))}`}>
                        <Button data-testid={`button-apply-${job.id}`}>
                          {t("careers.applyNow")}
                        </Button>
                      </a>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        {t(job.departmentKey)}
                      </Badge>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {t(job.locationKey)}
                      </Badge>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t(job.typeKey)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="mt-16 text-center">
            <Card className="bg-primary/5" data-testid="card-general-application">
              <CardContent className="py-12">
                <h2 className="text-2xl font-bold mb-4">{t("careers.noFit.title")}</h2>
                <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                  {t("careers.noFit.description")}
                </p>
                <a href="mailto:info@wisequery.app?subject=General Application">
                  <Button variant="outline" data-testid="button-general-apply">
                    {t("careers.noFit.sendResume")}
                  </Button>
                </a>
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
