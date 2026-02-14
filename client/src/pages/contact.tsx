import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FolderTree, ArrowLeft, Mail, MessageSquare, HelpCircle, Building } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { PrefetchLink } from "@/components/prefetch-link";

const createContactSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(2, t("contact.form.validation.nameMin")),
    email: z.string().email(t("contact.form.validation.emailInvalid")),
    subject: z.string().min(5, t("contact.form.validation.subjectMin")),
    message: z.string().min(20, t("contact.form.validation.messageMin")),
  });

type ContactFormData = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

const contactOptions = [
  {
    icon: HelpCircle,
    titleKey: "contact.options.support.title",
    descriptionKey: "contact.options.support.description",
    email: "support@wisequery.app",
  },
  {
    icon: MessageSquare,
    titleKey: "contact.options.sales.title",
    descriptionKey: "contact.options.sales.description",
    email: "sales@wisequery.app",
  },
  {
    icon: Building,
    titleKey: "contact.options.partnership.title",
    descriptionKey: "contact.options.partnership.description",
    email: "partnership@wisequery.app",
  },
];

export default function Contact() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const contactSchema = createContactSchema(t);

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: "",
      message: "",
    },
  });

  const onSubmit = (data: ContactFormData) => {
    const mailtoLink = `mailto:info@wisequery.app?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(
      `Name: ${data.name}\nEmail: ${data.email}\n\n${data.message}`
    )}`;
    
    toast({
      title: t("contact.form.success.title"),
      description: t("contact.form.success.description"),
    });
    
    window.location.href = mailtoLink;
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
            <h1 className="text-4xl lg:text-5xl font-bold" data-testid="text-contact-title">
              {t("contact.title")}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-contact-subtitle">
              {t("contact.subtitle")}
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6 mb-12">
            {contactOptions.map((option, index) => {
              const IconComponent = option.icon;
              return (
                <Card key={index} className="hover-elevate" data-testid={`card-contact-option-${index}`}>
                  <CardContent className="py-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <IconComponent className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1">{t(option.titleKey)}</h3>
                        <p className="text-sm text-muted-foreground mb-3">{t(option.descriptionKey)}</p>
                        <a
                          href={`mailto:${option.email}`}
                          className="text-sm text-primary hover:underline flex items-center gap-1"
                          data-testid={`link-email-${index}`}
                        >
                          <Mail className="h-4 w-4" />
                          {option.email}
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card data-testid="card-contact-form">
            <CardHeader>
              <CardTitle>{t("contact.form.title")}</CardTitle>
              <CardDescription>{t("contact.form.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("contact.form.name")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("contact.form.namePlaceholder")} {...field} data-testid="input-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("contact.form.email")}</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder={t("contact.form.emailPlaceholder")} {...field} data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("contact.form.subject")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("contact.form.subjectPlaceholder")} {...field} data-testid="input-subject" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("contact.form.message")}</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={t("contact.form.messagePlaceholder")}
                            className="min-h-[150px]"
                            {...field}
                            data-testid="textarea-message"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full md:w-auto" data-testid="button-submit">
                    {t("contact.form.submit")}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <div className="mt-12 text-center">
            <p className="text-muted-foreground">
              {t("contact.generalInquiry")}{" "}
              <a href="mailto:info@wisequery.app" className="text-primary hover:underline" data-testid="link-general-email">
                info@wisequery.app
              </a>
            </p>
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
