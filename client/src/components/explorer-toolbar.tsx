import { ArrowLeft, ArrowRight, ArrowUp, Search, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { HelpDialog } from "@/components/help-dialog";
import { useTranslation } from "react-i18next";
import type { Project, Conversation } from "@shared/schema";

interface ExplorerToolbarProps {
  currentProject?: Project;
  currentConversation?: Conversation;
  onBack?: () => void;
  onForward?: () => void;
  onUp?: () => void;
  onSearch: () => void;
  onExport?: (format: "json" | "txt") => void;
  canGoBack: boolean;
  canGoForward: boolean;
}

export function ExplorerToolbar({
  currentProject,
  currentConversation,
  onBack,
  onForward,
  onUp,
  onSearch,
  onExport,
  canGoBack,
  canGoForward,
}: ExplorerToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 h-12 px-4 bg-background border-b border-border">
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={onBack}
          disabled={!canGoBack}
          data-testid="button-back"
          className="h-8 w-8"
          title={t('chat.toolbar.previous')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onForward}
          disabled={!canGoForward}
          data-testid="button-forward"
          className="h-8 w-8"
          title={t('chat.toolbar.next')}
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onUp}
          disabled={!currentConversation}
          data-testid="button-up"
          className="h-8 w-8"
          title={t('chat.toolbar.up')}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 flex items-center gap-2 px-3 h-8 bg-card rounded-sm border border-card-border">
        {currentProject && (
          <>
            <span className="text-sm text-foreground">{currentProject.name}</span>
            {currentConversation && (
              <>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-sm text-foreground">{currentConversation.name}</span>
              </>
            )}
          </>
        )}
        {!currentProject && (
          <span className="text-sm text-muted-foreground">{t('chat.toolbar.selectProject', { defaultValue: '프로젝트를 선택하세요' })}</span>
        )}
      </div>

      <Button
        size="icon"
        variant="ghost"
        onClick={onSearch}
        data-testid="button-search"
        className="h-8 w-8"
        title={t('chat.toolbar.search')}
      >
        <Search className="h-4 w-4" />
      </Button>

      {currentConversation && onExport && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              data-testid="button-export"
              className="h-8 w-8"
            >
              <Download className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onExport("json")}
              data-testid="export-json"
            >
              {t('chat.toolbar.exportJson')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onExport("txt")}
              data-testid="export-txt"
            >
              {t('chat.toolbar.exportText')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <LanguageToggle />
      <ThemeToggle />
      <HelpDialog />
    </div>
  );
}
