import { useState } from "react";
import { Search, MessageSquare, Folder, Calendar, Bot, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "react-i18next";
import type { SearchResult } from "@shared/schema";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearch: (query: string) => Promise<SearchResult[]>;
  onResultClick: (conversationId: string, messageId: string) => void;
}

export function SearchDialog({
  open,
  onOpenChange,
  onSearch,
  onResultClick,
}: SearchDialogProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const searchResults = await onSearch(query.trim());
      setResults(searchResults);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleResultClick = (conversationId: string, messageId: string) => {
    onResultClick(conversationId, messageId);
    onOpenChange(false);
    setQuery("");
    setResults([]);
  };

  const formatTime = (date: Date) => {
    const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    // Escape regex special characters in query
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escapedQuery})`, "gi"));
    return parts.map((part, index) => {
      if (part.toLowerCase() === query.toLowerCase()) {
        return <mark key={index} className="bg-yellow-200 dark:bg-yellow-900">{part}</mark>;
      }
      return part;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl h-[90vh] max-h-[600px] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('dialogs.search.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col space-y-4 min-h-0">
          <div className="flex gap-2 shrink-0">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('dialogs.search.placeholder')}
              data-testid="input-search"
              autoFocus
            />
            <Button
              onClick={handleSearch}
              disabled={!query.trim() || isSearching}
              data-testid="button-search-submit"
            >
              <Search className="h-4 w-4 mr-2" />
              {t('dialogs.search.searchButton')}
            </Button>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            {isSearching && (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-muted-foreground">{t('dialogs.search.searching')}</div>
              </div>
            )}

            {!isSearching && results.length === 0 && query && (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-muted-foreground">{t('dialogs.search.noResults')}</div>
              </div>
            )}

            {!isSearching && results.length > 0 && (
              <div className="space-y-6">
                {(() => {
                  const exactResults = results.filter(r => r.matchType === 'exact');
                  const semanticResults = results.filter(r => r.matchType === 'semantic');
                  
                  const renderResults = (resultsList: SearchResult[], startIndex: number) => {
                    return resultsList.map((result, index) => {
                      const isUserMessage = result.role === "user";
                      const RoleIcon = isUserMessage ? User : Bot;
                      const globalIndex = startIndex + index;
                      
                      return (
                        <button
                          key={globalIndex}
                          onClick={() => handleResultClick(result.conversationId, result.messageId)}
                          data-testid={`search-result-${globalIndex}`}
                          className="w-full text-left p-4 rounded-md hover-elevate border border-card-border bg-card"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-foreground truncate">
                                {result.conversationName}
                              </span>
                            </div>
                            <span className="text-xs text-primary font-mono shrink-0">
                              {Math.round(result.similarity * 100)}%
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                            <Folder className="h-3 w-3 shrink-0" />
                            <span className="truncate">{result.projectName}</span>
                            <span>•</span>
                            <Calendar className="h-3 w-3 shrink-0" />
                            <span className="truncate">{formatTime(new Date(result.createdAt))}</span>
                          </div>

                          <div className="space-y-2">
                            {/* Main matched message */}
                            <div className="flex gap-2">
                              <RoleIcon className={`h-4 w-4 shrink-0 mt-0.5 ${isUserMessage ? 'text-blue-500' : 'text-primary'}`} />
                              <p className="text-sm text-foreground line-clamp-3 flex-1">
                                {highlightText(result.messageContent, query)}
                              </p>
                            </div>

                            {/* Paired message (question-answer pair) */}
                            {result.pairedMessage && (
                              <div className="flex gap-2 pl-6 border-l-2 border-muted">
                                {result.pairedMessage.role === "user" ? (
                                  <User className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
                                ) : (
                                  <Bot className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                                )}
                                <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
                                  {highlightText(result.pairedMessage.content, query)}
                                </p>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    });
                  };

                  return (
                    <>
                      {exactResults.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-foreground px-1">
                            {t('dialogs.search.exactMatches')} ({exactResults.length})
                          </h3>
                          <div className="space-y-3">
                            {renderResults(exactResults, 0)}
                          </div>
                        </div>
                      )}
                      
                      {semanticResults.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-foreground px-1">
                            {t('dialogs.search.relatedConversations')} ({semanticResults.length})
                          </h3>
                          <div className="space-y-3">
                            {renderResults(semanticResults, exactResults.length)}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
