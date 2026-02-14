import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderTree, ArrowLeft, Calendar, Clock, ArrowRight } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "react-i18next";
import { PrefetchLink } from "@/components/prefetch-link";

interface BlogPost {
  id: string;
  titleKey: string;
  excerptKey: string;
  categoryKey: string;
  date: string;
  readTime: number;
}

const blogPosts: BlogPost[] = [
  {
    id: "1",
    titleKey: "blog.posts.ragExplained.title",
    excerptKey: "blog.posts.ragExplained.excerpt",
    categoryKey: "blog.categories.technology",
    date: "2024-12-01",
    readTime: 8,
  },
  {
    id: "2",
    titleKey: "blog.posts.productivityTips.title",
    excerptKey: "blog.posts.productivityTips.excerpt",
    categoryKey: "blog.categories.productivity",
    date: "2024-11-25",
    readTime: 5,
  },
  {
    id: "3",
    titleKey: "blog.posts.aiKnowledge.title",
    excerptKey: "blog.posts.aiKnowledge.excerpt",
    categoryKey: "blog.categories.aiInsights",
    date: "2024-11-18",
    readTime: 6,
  },
  {
    id: "4",
    titleKey: "blog.posts.teamCollaboration.title",
    excerptKey: "blog.posts.teamCollaboration.excerpt",
    categoryKey: "blog.categories.teamwork",
    date: "2024-11-10",
    readTime: 7,
  },
  {
    id: "5",
    titleKey: "blog.posts.securityBestPractices.title",
    excerptKey: "blog.posts.securityBestPractices.excerpt",
    categoryKey: "blog.categories.security",
    date: "2024-11-01",
    readTime: 4,
  },
  {
    id: "6",
    titleKey: "blog.posts.gettingStarted.title",
    excerptKey: "blog.posts.gettingStarted.excerpt",
    categoryKey: "blog.categories.tutorial",
    date: "2024-10-20",
    readTime: 10,
  },
];

export default function Blog() {
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
        <div className="max-w-5xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <h1 className="text-4xl lg:text-5xl font-bold" data-testid="text-blog-title">
              {t("blog.title")}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-blog-subtitle">
              {t("blog.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {blogPosts.map((post) => (
              <Card key={post.id} className="hover-elevate flex flex-col" data-testid={`card-blog-post-${post.id}`}>
                <CardHeader className="flex-1">
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <Badge variant="secondary">{t(post.categoryKey)}</Badge>
                  </div>
                  <CardTitle className="text-lg leading-tight">{t(post.titleKey)}</CardTitle>
                  <CardDescription className="mt-2">{t(post.excerptKey)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground mb-4 gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(post.date)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{t("blog.readTime", { minutes: post.readTime })}</span>
                    </div>
                  </div>
                  <Button variant="ghost" className="w-full" data-testid={`button-read-more-${post.id}`}>
                    {t("blog.readMore")}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-muted-foreground mb-4">{t("blog.moreComingSoon")}</p>
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
