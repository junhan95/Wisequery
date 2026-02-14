import { useEffect, useRef } from "react";
import { User, Bot, File as FileIcon, Download } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { useTranslation } from "react-i18next";
import type { Message } from "@shared/schema";
import type { SearchResult } from "@shared/schema";

interface ChatInterfaceProps {
  messages: Message[];
  streamingMessage?: { role: string; content: string } | null;
  contextSources?: SearchResult[];
  isLoading: boolean;
  optimisticUserMessage?: { content: string; timestamp: Date } | null;
  highlightedMessageId?: string | null;
  highlightKey?: number;
}

export function ChatInterface({
  messages,
  streamingMessage,
  contextSources,
  isLoading,
  optimisticUserMessage,
  highlightedMessageId,
  highlightKey = 0,
}: ChatInterfaceProps) {
  const { t, i18n } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const highlightedMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightedMessageId && highlightedMessageRef.current) {
      // Scroll to highlighted message
      highlightedMessageRef.current.scrollIntoView({ behavior: "auto", block: "center" });
    }
  }, [highlightedMessageId, highlightKey, messages]);

  useEffect(() => {
    if (!highlightedMessageId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages, streamingMessage, highlightedMessageId]);

  const formatTime = (date: Date) => {
    const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  // @{파일명} 형식을 [파일명] 형식으로 변환하여 UI에서 깔끔하게 표시
  const formatMessageContent = (content: string) => {
    return content.replace(/@\{([^}]+)\}/g, '[$1]');
  };

  if (messages.length === 0 && !optimisticUserMessage && !streamingMessage) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <Bot className="h-12 w-12 text-muted-foreground mx-auto" />
          <h3 className="text-lg font-semibold text-foreground">{t('chat.messages.startConversation', { defaultValue: '대화를 시작하세요' })}</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {t('chat.messages.startHint', { defaultValue: 'AI와 대화하며 질문하세요. 모든 대화 내용은 프로젝트 내에서 검색 가능합니다.' })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, index) => {
        const isUser = message.role === "user";
        const isHighlightedMessage = message.id === highlightedMessageId;

        return (
          <div 
            key={message.id} 
            className="space-y-2"
            ref={isHighlightedMessage ? highlightedMessageRef : null}
          >
            <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
              {!isUser && (
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}

              <div
                className={`flex flex-col gap-1 ${
                  isUser ? "items-end max-w-2xl" : "items-start flex-1"
                }`}
              >
                <span className="text-xs text-muted-foreground font-mono">
                  {formatTime(message.createdAt)}
                </span>
                <div
                  className={`px-4 py-3 transition-all duration-300 ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm"
                      : "bg-card border border-card-border rounded-2xl rounded-tl-sm"
                  } ${
                    isHighlightedMessage
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                      : ""
                  }`}
                  data-testid={`message-${message.id}`}
                >
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {message.attachments.map((attachment, idx) => (
                        <div key={idx}>
                          {attachment.mimeType?.startsWith("image/") ? (
                            <img
                              src={attachment.url}
                              alt={attachment.originalName}
                              className="max-w-sm rounded-md border border-border"
                              data-testid={`message-attachment-image-${idx}`}
                            />
                          ) : (
                            <a
                              href={attachment.url}
                              download={attachment.originalName}
                              className={`flex items-center gap-2 p-2 rounded-md border ${
                                isUser
                                  ? "border-primary-foreground/20 hover:bg-primary-foreground/10"
                                  : "border-border hover:bg-muted"
                              }`}
                              data-testid={`message-attachment-file-${idx}`}
                            >
                              <FileIcon className="h-4 w-4" />
                              <span className="text-sm flex-1 truncate">{attachment.originalName}</span>
                              <Download className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {message.content && (
                    isUser ? (
                      <p className="text-base whitespace-pre-wrap break-words">{formatMessageContent(message.content)}</p>
                    ) : (
                      <MarkdownRenderer content={message.content} />
                    )
                  )}
                </div>
              </div>

              {isUser && (
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-secondary text-secondary-foreground">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          </div>
        );
      })}

      {optimisticUserMessage && (
        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex gap-3 justify-end">
            <div className="flex flex-col gap-1 items-end max-w-2xl">
              <span className="text-xs text-muted-foreground font-mono">
                {formatTime(optimisticUserMessage.timestamp)}
              </span>
              <div
                className="px-4 py-3 bg-primary text-primary-foreground rounded-2xl rounded-tr-sm"
                data-testid="optimistic-user-message"
              >
                <p className="text-base whitespace-pre-wrap break-words">
                  {formatMessageContent(optimisticUserMessage.content)}
                </p>
              </div>
            </div>
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-secondary text-secondary-foreground">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      )}

      {streamingMessage && (
        <div className="space-y-2 animate-in fade-in duration-200">
          <div className="flex gap-3 justify-start">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>

            <div className="flex flex-col gap-1 items-start flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono">
                  {formatTime(new Date())}
                </span>
                <span className="text-xs text-primary font-medium animate-pulse">
                  작성 중...
                </span>
              </div>
              <div
                className="px-4 py-3 bg-card border border-card-border rounded-2xl rounded-tl-sm transition-all duration-200"
                data-testid="streaming-message"
              >
                <MarkdownRenderer content={streamingMessage.content} />
                <span className="inline-block w-0.5 h-5 ml-0.5 bg-primary animate-blink" />
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading && !streamingMessage && (
        <div className="flex gap-3 justify-start">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1 items-start">
            <span className="text-xs text-primary font-medium animate-pulse">
              답변 준비 중...
            </span>
            <div className="flex items-center gap-2 px-4 py-3 bg-card border border-card-border rounded-2xl rounded-tl-sm">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-75" />
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-150" />
              </div>
              <span className="text-sm text-muted-foreground">생각 중...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
