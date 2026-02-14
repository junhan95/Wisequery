import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Crown, Check } from "lucide-react";

interface UpgradeLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limitType: "projects" | "conversations" | "aiQueries" | "storage";
  currentCount: number | string;
  maxLimit: number | string;
  currentPlan?: string;
}

export function UpgradeLimitDialog({
  open,
  onOpenChange,
  limitType,
  currentCount,
  maxLimit,
  currentPlan = "free",
}: UpgradeLimitDialogProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const handleUpgrade = () => {
    onOpenChange(false);
    setLocation("/pricing");
  };

  const getUpgradeSuggestion = () => {
    if (currentPlan === "free") {
      return t("dialogs.upgradeLimitDialog.upgradeToBasic");
    } else if (currentPlan === "basic") {
      return t("dialogs.upgradeLimitDialog.upgradeToPro");
    } else {
      return t("dialogs.upgradeLimitDialog.upgradeToCustom");
    }
  };

  const getBenefits = () => {
    if (currentPlan === "free") {
      return [
        t("dialogs.upgradeLimitDialog.benefits.moreProjects"),
        t("dialogs.upgradeLimitDialog.benefits.unlimitedConversations"),
        t("dialogs.upgradeLimitDialog.benefits.moreStorage"),
      ];
    } else if (currentPlan === "basic") {
      return [
        t("dialogs.upgradeLimitDialog.benefits.unlimitedProjects"),
        t("dialogs.upgradeLimitDialog.benefits.moreStorage"),
        t("dialogs.upgradeLimitDialog.benefits.imageGeneration"),
        t("dialogs.upgradeLimitDialog.benefits.prioritySupport"),
      ];
    } else {
      return [
        t("dialogs.upgradeLimitDialog.benefits.unlimitedProjects"),
        t("dialogs.upgradeLimitDialog.benefits.unlimitedConversations"),
        t("dialogs.upgradeLimitDialog.benefits.moreStorage"),
      ];
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="dialog-upgrade-limit">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <AlertDialogTitle data-testid="text-upgrade-dialog-title">
              {t("dialogs.upgradeLimitDialog.title")}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription data-testid="text-upgrade-dialog-description">
            {t(`dialogs.upgradeLimitDialog.${limitType}LimitReached`, {
              current: currentCount,
              max: maxLimit,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground" data-testid="text-upgrade-dialog-suggestion">
            {getUpgradeSuggestion()}
          </p>
          <p className="text-sm text-muted-foreground mt-3" data-testid="text-upgrade-dialog-benefits">
            {t("dialogs.upgradeLimitDialog.upgradeMessage")}
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {getBenefits().map((benefit, index) => (
              <li key={index} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-upgrade-cancel">
            {t("dialogs.upgradeLimitDialog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleUpgrade}
            data-testid="button-upgrade-confirm"
          >
            <Crown className="mr-2 h-4 w-4" />
            {t("dialogs.upgradeLimitDialog.upgrade")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
