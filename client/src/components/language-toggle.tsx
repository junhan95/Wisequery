import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

export function LanguageToggle() {
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ko' : 'en';
    i18n.changeLanguage(newLang);
    localStorage.setItem('language', newLang);
  };

  const getTooltip = () => {
    const targetLang = i18n.language === 'en' ? t('common.language.korean') : t('common.language.english');
    return t('common.language.switchTo', { language: targetLang });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      data-testid="button-language-toggle"
      title={getTooltip()}
      className="gap-1"
    >
      <Languages className="h-4 w-4" />
      <span className="text-xs font-medium">{i18n.language.toUpperCase()}</span>
    </Button>
  );
}
