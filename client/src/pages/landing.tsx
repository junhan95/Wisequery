import { lazy, Suspense, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  FolderTree,
  Brain,
  Search,
  Bolt,
  Shield,
  GitBranch,
  Star,
  BookOpen,
  Briefcase,
  GraduationCap,
  Upload,
  FileText,
  Table2,
  FileSpreadsheet,
  Globe,
  Lock,
  Clock,
  Users,
  Sparkles,
  ArrowRight,
  Zap,
  FileSpreadsheetIcon,
  Presentation,
  Languages,
  FolderKanban,
  TrendingUp,
  Filter,
  Layers,
  RefreshCw
} from "lucide-react";
import { SiGoogledocs } from "react-icons/si";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "react-i18next";
import { PrefetchLink } from "@/components/prefetch-link";
import { useSearch, useLocation } from "wouter";
import { SectionSkeleton } from "@/components/landing/section-skeleton";

const FAQSection = lazy(() => import("@/components/landing/faq-section"));

export default function Landing() {
  const { t } = useTranslation();
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get('scrollToBottom') === 'true') {
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
        setLocation('/', { replace: true });
      }, 50);
    }
  }, [searchString, setLocation]);

  return (
    <div className="min-h-screen">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-6 lg:px-12">
          <a
            href="#"
            className="flex items-center gap-2 hover-elevate px-2 py-1 rounded-md"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            data-testid="link-logo-home"
          >
            <FolderTree className="h-6 w-6" />
            <span className="text-xl font-semibold">{t('landing.nav.appName')}</span>
          </a>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-medium hover-elevate px-3 py-2 rounded-md" data-testid="link-features">
              {t('landing.nav.features')}
            </a>
            <a href="#how-it-works" className="text-sm font-medium hover-elevate px-3 py-2 rounded-md" data-testid="link-how-it-works">
              {t('landing.nav.howItWorks')}
            </a>
            <a href="#pricing" className="text-sm font-medium hover-elevate px-3 py-2 rounded-md" data-testid="link-pricing">
              {t('landing.nav.pricing')}
            </a>
            <ThemeToggle />
            <LanguageToggle />
            <PrefetchLink href="/login" data-testid="link-sign-in">
              <Button variant="ghost" data-testid="button-sign-in">{t('landing.nav.signIn')}</Button>
            </PrefetchLink>
            <PrefetchLink href="/login" data-testid="link-get-started">
              <Button data-testid="button-get-started">{t('landing.nav.getStarted')}</Button>
            </PrefetchLink>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 lg:py-32" data-testid="section-hero">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl lg:text-6xl font-bold tracking-tight" data-testid="text-hero-title">
                  {t('landing.hero.title')}
                </h1>
                <p className="text-lg lg:text-xl text-muted-foreground max-w-xl" data-testid="text-hero-subtitle">
                  {t('landing.hero.subtitle')}
                </p>
              </div>
              <div className="flex flex-wrap gap-4">
                <PrefetchLink href="/login" data-testid="link-hero-cta-primary">
                  <Button size="lg" className="text-lg px-8" data-testid="button-start-free">
                    {t('landing.hero.startTrial')}
                  </Button>
                </PrefetchLink>
                <a href="#how-it-works" data-testid="link-hero-cta-secondary">
                  <Button size="lg" variant="outline" className="text-lg px-8" data-testid="button-watch-demo">
                    {t('landing.hero.watchDemo')}
                  </Button>
                </a>
              </div>
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>{t('landing.hero.noCreditCard')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>{t('landing.hero.freeForever')}</span>
                </div>
              </div>
            </div>
            <div className="relative" data-testid="container-hero-image">
              <div className="bg-card border rounded-lg p-6 shadow-lg">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FolderTree className="h-4 w-4" />
                    <span>{t('landing.hero.demoProject')}</span>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-muted/50 rounded-lg p-3 text-sm">
                      {t('landing.hero.demoQuestion')}
                    </div>
                    <div className="bg-primary/10 rounded-lg p-4 space-y-2">
                      <p className="text-sm">{t('landing.hero.demoAnswer')}</p>
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          <GitBranch className="h-3 w-3 mr-1" />
                          {t('landing.hero.demoContext')}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Banner */}
      <section className="py-8 border-y bg-muted/30" data-testid="section-social-proof">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6 text-primary" />
              <div>
                <div className="text-2xl font-bold">{t('landing.socialProof.users')}</div>
                <div className="text-sm text-muted-foreground">{t('landing.socialProof.usersLabel')}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-primary" />
              <div>
                <div className="text-2xl font-bold">{t('landing.socialProof.documents')}</div>
                <div className="text-sm text-muted-foreground">{t('landing.socialProof.documentsLabel')}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-primary" />
              <div>
                <div className="text-2xl font-bold">{t('landing.socialProof.queries')}</div>
                <div className="text-sm text-muted-foreground">{t('landing.socialProof.queriesLabel')}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <span className="text-lg font-semibold">{t('landing.socialProof.rating')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* What's New Section */}
      <section className="py-20 lg:py-32 bg-gradient-to-b from-primary/5 to-transparent" data-testid="section-whats-new">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center space-y-4 mb-16">
            <Badge variant="secondary" className="px-4 py-1 text-sm" data-testid="badge-whats-new">
              <Sparkles className="h-3 w-3 mr-1" />
              {t('landing.whatsNew.badge')}
            </Badge>
            <h2 className="text-4xl font-semibold" data-testid="text-whats-new-title">
              {t('landing.whatsNew.title')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('landing.whatsNew.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="hover-elevate relative overflow-visible" data-testid="card-google-docs">
              <Badge className="absolute -top-3 left-4">{t('landing.whatsNew.googleDocs.badge')}</Badge>
              <CardHeader>
                <SiGoogledocs className="h-10 w-10 mb-4 text-blue-500" />
                <CardTitle className="text-lg">{t('landing.whatsNew.googleDocs.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {t('landing.whatsNew.googleDocs.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate" data-testid="card-office-support">
              <CardHeader>
                <FileSpreadsheet className="h-10 w-10 mb-4 text-green-600" />
                <CardTitle className="text-lg">{t('landing.whatsNew.officeSupport.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {t('landing.whatsNew.officeSupport.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate" data-testid="card-multilingual">
              <CardHeader>
                <Languages className="h-10 w-10 mb-4 text-purple-500" />
                <CardTitle className="text-lg">{t('landing.whatsNew.multilingual.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {t('landing.whatsNew.multilingual.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate" data-testid="card-folder-system">
              <CardHeader>
                <FolderKanban className="h-10 w-10 mb-4 text-orange-500" />
                <CardTitle className="text-lg">{t('landing.whatsNew.folderSystem.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {t('landing.whatsNew.folderSystem.description')}
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Document Upload Highlight Section */}
      <section className="py-20 lg:py-32" data-testid="section-document-highlight">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-semibold" data-testid="text-document-title">
              {t('landing.documents.title')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('landing.documents.subtitle')}
            </p>
          </div>

          {/* Supported File Formats */}
          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <Badge variant="secondary" className="px-4 py-2 text-sm">
              <FileText className="h-4 w-4 mr-2" />
              PDF
            </Badge>
            <Badge variant="secondary" className="px-4 py-2 text-sm">
              <FileText className="h-4 w-4 mr-2" />
              Word (.docx)
            </Badge>
            <Badge variant="secondary" className="px-4 py-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Excel (.xlsx)
            </Badge>
            <Badge variant="secondary" className="px-4 py-2 text-sm">
              <Table2 className="h-4 w-4 mr-2" />
              CSV
            </Badge>
            <Badge variant="secondary" className="px-4 py-2 text-sm">
              <FileText className="h-4 w-4 mr-2" />
              Text (.txt)
            </Badge>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="hover-elevate text-center" data-testid="card-upload-feature">
              <CardHeader>
                <Upload className="h-12 w-12 mx-auto mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.documents.upload.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.documents.upload.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate text-center" data-testid="card-chunk-feature">
              <CardHeader>
                <Zap className="h-12 w-12 mx-auto mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.documents.chunk.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.documents.chunk.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate text-center" data-testid="card-search-feature">
              <CardHeader>
                <Search className="h-12 w-12 mx-auto mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.documents.search.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.documents.search.description')}
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 lg:py-32 bg-muted/30" data-testid="section-how-it-works">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-semibold" data-testid="text-how-it-works-title">
              {t('landing.howItWorks.title')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('landing.howItWorks.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Step 1 */}
            <div className="text-center space-y-4" data-testid="step-1">
              <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto">
                1
              </div>
              <h3 className="text-xl font-semibold">{t('landing.howItWorks.step1.title')}</h3>
              <p className="text-muted-foreground">{t('landing.howItWorks.step1.description')}</p>
            </div>

            {/* Arrow */}
            <div className="hidden md:flex items-center justify-center">
              <ArrowRight className="h-8 w-8 text-muted-foreground" />
            </div>

            {/* Step 2 */}
            <div className="text-center space-y-4" data-testid="step-2">
              <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto">
                2
              </div>
              <h3 className="text-xl font-semibold">{t('landing.howItWorks.step2.title')}</h3>
              <p className="text-muted-foreground">{t('landing.howItWorks.step2.description')}</p>
            </div>
          </div>

          <div className="flex justify-center mt-8">
            <ArrowRight className="h-8 w-8 text-muted-foreground rotate-90" />
          </div>

          <div className="max-w-md mx-auto mt-8">
            {/* Step 3 */}
            <div className="text-center space-y-4" data-testid="step-3">
              <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto">
                3
              </div>
              <h3 className="text-xl font-semibold">{t('landing.howItWorks.step3.title')}</h3>
              <p className="text-muted-foreground">{t('landing.howItWorks.step3.description')}</p>
            </div>
          </div>

          <div className="text-center mt-12">
            <PrefetchLink href="/login" data-testid="link-try-now">
              <Button size="lg" className="text-lg px-8">
                {t('landing.howItWorks.cta')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </PrefetchLink>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 lg:py-32" data-testid="section-features">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-semibold" data-testid="text-features-title">
              {t('landing.features.title')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('landing.features.subtitle')}
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card className="hover-elevate" data-testid="card-feature-organization">
              <CardHeader>
                <FolderTree className="h-12 w-12 mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.features.explorer.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.features.explorer.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate" data-testid="card-feature-rag">
              <CardHeader>
                <Brain className="h-12 w-12 mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.features.rag.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.features.rag.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate" data-testid="card-feature-search">
              <CardHeader>
                <Search className="h-12 w-12 mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.features.search.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.features.search.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate" data-testid="card-feature-speed">
              <CardHeader>
                <Bolt className="h-12 w-12 mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.features.streaming.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.features.streaming.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate" data-testid="card-feature-security">
              <CardHeader>
                <Shield className="h-12 w-12 mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.features.security.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.features.security.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate" data-testid="card-feature-multimodal">
              <CardHeader>
                <GitBranch className="h-12 w-12 mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.features.multimodal.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.features.multimodal.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate" data-testid="card-feature-multilingual">
              <CardHeader>
                <Globe className="h-12 w-12 mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.features.multilingual.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.features.multilingual.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate" data-testid="card-feature-dragdrop">
              <CardHeader>
                <Upload className="h-12 w-12 mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.features.dragdrop.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.features.dragdrop.description')}
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section id="use-cases" className="py-20 lg:py-32 bg-muted/30" data-testid="section-use-cases">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-semibold" data-testid="text-use-cases-title">
              {t('landing.useCases.title')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('landing.useCases.subtitle')}
            </p>
          </div>
          <div className="space-y-20">
            <div className="grid lg:grid-cols-2 gap-12 items-center" data-testid="use-case-knowledge">
              <div className="space-y-4">
                <h3 className="text-3xl font-semibold">{t('landing.useCases.knowledge.title')}</h3>
                <p className="text-lg text-muted-foreground">
                  {t('landing.useCases.knowledge.description')}
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span>{t('landing.useCases.knowledge.benefit1')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span>{t('landing.useCases.knowledge.benefit2')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span>{t('landing.useCases.knowledge.benefit3')}</span>
                  </li>
                </ul>
              </div>
              <div className="bg-muted/50 rounded-lg p-8 border">
                <div className="space-y-3 text-sm">
                  <div className="font-medium text-muted-foreground">{t('landing.useCases.knowledge.projectsLabel')}</div>
                  <div className="pl-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      <span>{t('landing.useCases.knowledge.researchPapers')}</span>
                    </div>
                    <div className="pl-6 space-y-1 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        {t('landing.useCases.knowledge.mlSurvey')}
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        {t('landing.useCases.knowledge.ragReview')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      <span>{t('landing.useCases.knowledge.clientProjects')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4" />
                      <span>{t('landing.useCases.knowledge.courseNotes')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 items-center" data-testid="use-case-development">
              <div className="order-2 lg:order-1 bg-muted/50 rounded-lg p-8 border">
                <div className="space-y-4">
                  <div className="text-sm font-medium text-muted-foreground">{t('landing.useCases.development.demoLabel')}</div>
                  <div className="bg-background rounded p-3 text-sm">
                    "{t('landing.useCases.development.demoQuery')}"
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <GitBranch className="h-3 w-3" />
                    <span>{t('landing.useCases.development.demoContext')}</span>
                  </div>
                  <div className="bg-primary/10 rounded p-3 text-sm">
                    {t('landing.useCases.development.demoAnswer')}
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2 space-y-4">
                <h3 className="text-3xl font-semibold">{t('landing.useCases.development.title')}</h3>
                <p className="text-lg text-muted-foreground">
                  {t('landing.useCases.development.description')}
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span>{t('landing.useCases.development.benefit1')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span>{t('landing.useCases.development.benefit2')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span>{t('landing.useCases.development.benefit3')}</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 items-center" data-testid="use-case-team">
              <div className="space-y-4">
                <h3 className="text-3xl font-semibold">{t('landing.useCases.team.title')}</h3>
                <p className="text-lg text-muted-foreground">
                  {t('landing.useCases.team.description')}
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span>{t('landing.useCases.team.benefit1')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span>{t('landing.useCases.team.benefit2')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span>{t('landing.useCases.team.benefit3')}</span>
                  </li>
                </ul>
              </div>
              <div className="bg-muted/50 rounded-lg p-8 border">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{t('landing.useCases.team.teamLabel')}</div>
                    <Badge variant="secondary">5 {t('landing.useCases.team.members')}</Badge>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs">JD</div>
                      <div>
                        <div className="font-medium">John Doe</div>
                        <div className="text-muted-foreground text-xs">12 {t('landing.useCases.team.projects')}, 84 {t('landing.useCases.team.conversations')}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs">SK</div>
                      <div>
                        <div className="font-medium">Sarah Kim</div>
                        <div className="text-muted-foreground text-xs">8 {t('landing.useCases.team.projects')}, 56 {t('landing.useCases.team.conversations')}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Success Stories Section */}
      <section className="py-20 lg:py-32" data-testid="section-success-stories">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-semibold" data-testid="text-success-stories-title">
              {t('landing.successStories.title')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('landing.successStories.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="hover-elevate" data-testid="card-success-consulting">
              <CardHeader>
                <Badge variant="secondary" className="w-fit mb-2">{t('landing.successStories.consulting.industry')}</Badge>
                <CardTitle className="text-xl">{t('landing.successStories.consulting.title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-primary">{t('landing.successStories.consulting.metric')}</span>
                  <span className="text-muted-foreground">{t('landing.successStories.consulting.metricLabel')}</span>
                </div>
                <p className="text-muted-foreground italic text-sm">
                  {t('landing.successStories.consulting.description')}
                </p>
                <div className="text-xs text-muted-foreground border-t pt-3">
                  {t('landing.successStories.consulting.beforeAfter')}
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate" data-testid="card-success-research">
              <CardHeader>
                <Badge variant="secondary" className="w-fit mb-2">{t('landing.successStories.research.industry')}</Badge>
                <CardTitle className="text-xl">{t('landing.successStories.research.title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-primary">{t('landing.successStories.research.metric')}</span>
                  <span className="text-muted-foreground">{t('landing.successStories.research.metricLabel')}</span>
                </div>
                <p className="text-muted-foreground italic text-sm">
                  {t('landing.successStories.research.description')}
                </p>
                <div className="text-xs text-muted-foreground border-t pt-3">
                  {t('landing.successStories.research.beforeAfter')}
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate" data-testid="card-success-product">
              <CardHeader>
                <Badge variant="secondary" className="w-fit mb-2">{t('landing.successStories.product.industry')}</Badge>
                <CardTitle className="text-xl">{t('landing.successStories.product.title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-primary">{t('landing.successStories.product.metric')}</span>
                  <span className="text-muted-foreground">{t('landing.successStories.product.metricLabel')}</span>
                </div>
                <p className="text-muted-foreground italic text-sm">
                  {t('landing.successStories.product.description')}
                </p>
                <div className="text-xs text-muted-foreground border-t pt-3">
                  {t('landing.successStories.product.beforeAfter')}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* RAG Engine Section */}
      <section className="py-20 lg:py-32 bg-muted/30" data-testid="section-rag-engine">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-semibold" data-testid="text-rag-engine-title">
              {t('landing.ragEngine.title')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('landing.ragEngine.subtitle')}
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16">
            <div className="space-y-8">
              <h3 className="text-2xl font-semibold">{t('landing.ragEngine.howItWorks')}</h3>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">1</div>
                  <div>
                    <h4 className="font-semibold">{t('landing.ragEngine.step1.title')}</h4>
                    <p className="text-muted-foreground text-sm">{t('landing.ragEngine.step1.description')}</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">2</div>
                  <div>
                    <h4 className="font-semibold">{t('landing.ragEngine.step2.title')}</h4>
                    <p className="text-muted-foreground text-sm">{t('landing.ragEngine.step2.description')}</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">3</div>
                  <div>
                    <h4 className="font-semibold">{t('landing.ragEngine.step3.title')}</h4>
                    <p className="text-muted-foreground text-sm">{t('landing.ragEngine.step3.description')}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card className="hover-elevate" data-testid="card-rag-cross-project">
                <CardHeader className="pb-2">
                  <Layers className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-base">{t('landing.ragEngine.features.crossProject')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs">
                    {t('landing.ragEngine.features.crossProjectDesc')}
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="hover-elevate" data-testid="card-rag-filter">
                <CardHeader className="pb-2">
                  <Filter className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-base">{t('landing.ragEngine.features.attributeFilter')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs">
                    {t('landing.ragEngine.features.attributeFilterDesc')}
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="hover-elevate" data-testid="card-rag-hybrid">
                <CardHeader className="pb-2">
                  <TrendingUp className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-base">{t('landing.ragEngine.features.hybridSearch')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs">
                    {t('landing.ragEngine.features.hybridSearchDesc')}
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="hover-elevate" data-testid="card-rag-sync">
                <CardHeader className="pb-2">
                  <RefreshCw className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-base">{t('landing.ragEngine.features.realtimeSync')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs">
                    {t('landing.ragEngine.features.realtimeSyncDesc')}
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Data Security Section */}
      <section className="py-20 lg:py-32" data-testid="section-data-security">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-semibold" data-testid="text-security-title">
              {t('landing.dataSecurity.title')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('landing.dataSecurity.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="hover-elevate text-center" data-testid="card-security-encryption">
              <CardHeader>
                <Lock className="h-12 w-12 mx-auto mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.dataSecurity.encryption.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.dataSecurity.encryption.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate text-center" data-testid="card-security-retention">
              <CardHeader>
                <Clock className="h-12 w-12 mx-auto mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.dataSecurity.retention.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.dataSecurity.retention.description')}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="hover-elevate text-center" data-testid="card-security-isolation">
              <CardHeader>
                <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
                <CardTitle className="text-xl">{t('landing.dataSecurity.isolation.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('landing.dataSecurity.isolation.description')}
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 lg:py-32 bg-muted/30" data-testid="section-testimonials">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-semibold" data-testid="text-testimonials-title">
              {t('landing.testimonials.title')}
            </h2>
            <div className="flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              ))}
              <span className="ml-2 text-lg font-medium">{t('landing.testimonials.rating')}</span>
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card data-testid="testimonial-1">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-semibold">
                    AJ
                  </div>
                  <div>
                    <div className="font-semibold">{t('landing.testimonials.alex.name')}</div>
                    <div className="text-sm text-muted-foreground">{t('landing.testimonials.alex.role')}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground italic">
                  "{t('landing.testimonials.alex.quote')}"
                </p>
              </CardContent>
              <CardFooter>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
              </CardFooter>
            </Card>

            <Card data-testid="testimonial-2">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-semibold">
                    MC
                  </div>
                  <div>
                    <div className="font-semibold">{t('landing.testimonials.maria.name')}</div>
                    <div className="text-sm text-muted-foreground">{t('landing.testimonials.maria.role')}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground italic">
                  "{t('landing.testimonials.maria.quote')}"
                </p>
              </CardContent>
              <CardFooter>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
              </CardFooter>
            </Card>

            <Card data-testid="testimonial-3">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-semibold">
                    DP
                  </div>
                  <div>
                    <div className="font-semibold">{t('landing.testimonials.david.name')}</div>
                    <div className="text-sm text-muted-foreground">{t('landing.testimonials.david.role')}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground italic">
                  "{t('landing.testimonials.david.quote')}"
                </p>
              </CardContent>
              <CardFooter>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 lg:py-32" data-testid="section-pricing">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-semibold" data-testid="text-pricing-title">
              {t('landing.pricing.title')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('landing.pricing.subtitle')}
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <Card data-testid="pricing-free">
              <CardHeader>
                <CardTitle className="text-xl">{t('landing.pricing.free.title')}</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{t('landing.pricing.free.price')}</span>
                  <span className="text-muted-foreground">{t('landing.pricing.free.period')}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.free.feature1')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.free.feature2')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.free.feature3')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.free.feature4')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <span className="text-sm text-muted-foreground">{t('landing.pricing.free.retention')}</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <PrefetchLink href="/pricing" className="w-full" data-testid="link-pricing-free">
                  <Button variant="outline" className="w-full" data-testid="button-pricing-free">
                    {t('landing.pricing.free.cta')}
                  </Button>
                </PrefetchLink>
              </CardFooter>
            </Card>

            <Card className="border-primary relative" data-testid="pricing-basic">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">{t('landing.pricing.basic.badge')}</Badge>
              <CardHeader>
                <CardTitle className="text-xl">{t('landing.pricing.basic.title')}</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{t('landing.pricing.basic.price')}</span>
                  <span className="text-muted-foreground">{t('landing.pricing.basic.period')}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.basic.feature1')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.basic.feature2')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.basic.feature3')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.basic.feature4')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <span className="text-sm text-muted-foreground">{t('landing.pricing.basic.retention')}</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <PrefetchLink href="/pricing" className="w-full" data-testid="link-pricing-basic">
                  <Button className="w-full" data-testid="button-pricing-basic">
                    {t('landing.pricing.basic.cta')}
                  </Button>
                </PrefetchLink>
              </CardFooter>
            </Card>

            <Card data-testid="pricing-pro">
              <CardHeader>
                <CardTitle className="text-xl">{t('landing.pricing.pro.title')}</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{t('landing.pricing.pro.price')}</span>
                  <span className="text-muted-foreground">{t('landing.pricing.pro.period')}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.pro.feature1')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.pro.feature2')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.pro.feature3')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.pro.feature4')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.pro.feature5')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.pro.feature6')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <span className="text-sm text-muted-foreground">{t('landing.pricing.pro.retention')}</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <PrefetchLink href="/pricing" className="w-full" data-testid="link-pricing-pro">
                  <Button variant="outline" className="w-full" data-testid="button-pricing-pro">
                    {t('landing.pricing.pro.cta')}
                  </Button>
                </PrefetchLink>
              </CardFooter>
            </Card>

            <Card data-testid="pricing-custom">
              <CardHeader>
                <CardTitle className="text-xl">{t('landing.pricing.custom.title')}</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{t('landing.pricing.custom.price')}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.custom.feature1')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.custom.feature2')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.custom.feature3')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.custom.feature4')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                    <span className="text-sm">{t('landing.pricing.custom.feature5')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <span className="text-sm text-muted-foreground">{t('landing.pricing.custom.retention')}</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <PrefetchLink href="/contact" className="w-full" data-testid="link-pricing-custom">
                  <Button variant="outline" className="w-full" data-testid="button-pricing-custom">
                    {t('landing.pricing.custom.cta')}
                  </Button>
                </PrefetchLink>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ Section - Lazy Loaded */}
      <Suspense fallback={<SectionSkeleton />}>
        <FAQSection />
      </Suspense>

      {/* Final CTA Section */}
      <section className="py-20 lg:py-32" data-testid="section-final-cta">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h2 className="text-4xl lg:text-5xl font-bold" data-testid="text-final-cta-title">
              {t('landing.finalCta.title')}
            </h2>
            <p className="text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto">
              {t('landing.finalCta.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <PrefetchLink href="/login" data-testid="link-final-cta-primary">
                <Button size="lg" className="text-lg px-12 py-6 h-auto" data-testid="button-final-cta">
                  {t('landing.finalCta.button')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </PrefetchLink>
            </div>
            <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span>{t('landing.hero.noCreditCard')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span>{t('landing.finalCta.setupTime')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span>{t('landing.finalCta.cancelAnytime')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 lg:py-16" data-testid="section-footer">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FolderTree className="h-6 w-6" />
                <span className="text-xl font-semibold">{t('landing.nav.appName')}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('landing.footer.tagline')}
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t('landing.footer.product')}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover-elevate px-2 py-1 rounded-md inline-block" data-testid="link-footer-features">{t('landing.footer.features')}</a></li>
                <li><PrefetchLink href="/pricing" className="hover-elevate px-2 py-1 rounded-md inline-block" data-testid="link-footer-pricing">{t('landing.footer.pricing')}</PrefetchLink></li>
                <li><PrefetchLink href="/changelog" className="hover-elevate px-2 py-1 rounded-md inline-block" data-testid="link-footer-changelog">{t('landing.footer.changelog')}</PrefetchLink></li>
                <li><PrefetchLink href="/docs" className="hover-elevate px-2 py-1 rounded-md inline-block" data-testid="link-footer-docs">{t('landing.footer.documentation')}</PrefetchLink></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t('landing.footer.company')}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><PrefetchLink href="/about" className="hover-elevate px-2 py-1 rounded-md inline-block" data-testid="link-footer-about">{t('landing.footer.about')}</PrefetchLink></li>
                <li><PrefetchLink href="/blog" className="hover-elevate px-2 py-1 rounded-md inline-block" data-testid="link-footer-blog">{t('landing.footer.blog')}</PrefetchLink></li>
                <li><PrefetchLink href="/careers" className="hover-elevate px-2 py-1 rounded-md inline-block" data-testid="link-footer-careers">{t('landing.footer.careers')}</PrefetchLink></li>
                <li><PrefetchLink href="/contact" className="hover-elevate px-2 py-1 rounded-md inline-block" data-testid="link-footer-contact">{t('landing.footer.contact')}</PrefetchLink></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t('landing.footer.legal')}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><PrefetchLink href="/privacy" className="hover-elevate px-2 py-1 rounded-md inline-block" data-testid="link-footer-privacy">{t('landing.footer.privacy')}</PrefetchLink></li>
                <li><PrefetchLink href="/terms" className="hover-elevate px-2 py-1 rounded-md inline-block" data-testid="link-footer-terms">{t('landing.footer.terms')}</PrefetchLink></li>
                <li><PrefetchLink href="/security" className="hover-elevate px-2 py-1 rounded-md inline-block" data-testid="link-footer-security">{t('landing.footer.security')}</PrefetchLink></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t">
            <p className="text-center text-sm text-muted-foreground">
              {t('landing.footer.copyright')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
