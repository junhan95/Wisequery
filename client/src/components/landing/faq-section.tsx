import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function FAQSection() {
  const { t } = useTranslation();

  return (
    <section className="py-20 lg:py-32 bg-muted/30" data-testid="section-faq">
      <div className="container mx-auto px-6 lg:px-12">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl font-semibold" data-testid="text-faq-title">
            {t('landing.faq.title')}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('landing.faq.subtitle')}
          </p>
        </div>
        
        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="item-1" className="bg-background border rounded-lg px-6">
              <AccordionTrigger className="text-left" data-testid="faq-item-1">
                {t('landing.faq.q1.question')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t('landing.faq.q1.answer')}
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="item-2" className="bg-background border rounded-lg px-6">
              <AccordionTrigger className="text-left" data-testid="faq-item-2">
                {t('landing.faq.q2.question')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t('landing.faq.q2.answer')}
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="item-3" className="bg-background border rounded-lg px-6">
              <AccordionTrigger className="text-left" data-testid="faq-item-3">
                {t('landing.faq.q3.question')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t('landing.faq.q3.answer')}
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="item-4" className="bg-background border rounded-lg px-6">
              <AccordionTrigger className="text-left" data-testid="faq-item-4">
                {t('landing.faq.q4.question')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t('landing.faq.q4.answer')}
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="item-5" className="bg-background border rounded-lg px-6">
              <AccordionTrigger className="text-left" data-testid="faq-item-5">
                {t('landing.faq.q5.question')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t('landing.faq.q5.answer')}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </section>
  );
}
