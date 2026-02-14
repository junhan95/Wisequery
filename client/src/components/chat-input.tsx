import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, X, Image as ImageIcon, File, AtSign, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { File as FileType } from "@shared/schema";

interface FileAttachment {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface TaggedFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

interface ChatInputProps {
  onSend: (message: string, attachments?: FileAttachment[], taggedFiles?: TaggedFile[]) => void;
  disabled?: boolean;
  placeholder?: string;
  taggedFiles?: TaggedFile[];
  onRemoveTaggedFile?: (fileId: string) => void;
  isStreaming?: boolean;
  onStopGeneration?: () => void;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder,
  taggedFiles = [],
  onRemoveTaggedFile,
  isStreaming = false,
  onStopGeneration,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleSubmit = () => {
    if ((message.trim() || attachments.length > 0 || taggedFiles.length > 0) && !disabled) {
      onSend(
        message.trim(), 
        attachments.length > 0 ? attachments : undefined,
        taggedFiles.length > 0 ? taggedFiles : undefined
      );
      setMessage("");
      setAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload file");
      }

      const fileInfo: FileAttachment = await response.json();
      setAttachments([...attachments, fileInfo]);
      toast({
        title: t('chat.input.uploadSuccess'),
        description: fileInfo.originalName,
      });
    } catch (error) {
      console.error("File upload error:", error);
      toast({
        variant: "destructive",
        title: t('chat.input.uploadError'),
        description: t('chat.input.uploadError'),
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  return (
    <div className="border-t border-border bg-background p-4">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,.pdf,.txt,.csv,.json"
        data-testid="input-file"
      />
      
      {taggedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {taggedFiles.map((file) => (
            <Badge
              key={file.id}
              variant="secondary"
              className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 text-primary border border-primary/30"
              data-testid={`tagged-file-${file.id}`}
            >
              <AtSign className="h-3 w-3" />
              <span className="text-sm font-medium truncate max-w-[150px]">
                {file.originalName}
              </span>
              {onRemoveTaggedFile && (
                <span
                  role="button"
                  tabIndex={0}
                  className="ml-1 cursor-pointer rounded-full hover-elevate p-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveTaggedFile(file.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRemoveTaggedFile(file.id);
                    }
                  }}
                  data-testid={`button-remove-tagged-${file.id}`}
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </Badge>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-muted rounded-md px-3 py-2"
              data-testid={`attachment-${index}`}
            >
              {attachment.mimeType.startsWith("image/") ? (
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <File className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm truncate max-w-[200px]">
                {attachment.originalName}
              </span>
              <span
                role="button"
                tabIndex={0}
                className="cursor-pointer rounded-full hover-elevate p-1"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAttachment(index);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    removeAttachment(index);
                  }
                }}
                data-testid={`button-remove-attachment-${index}`}
              >
                <X className="h-3 w-3" />
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          data-testid="button-attach"
          className="shrink-0"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || t('chat.input.placeholder')}
          disabled={disabled}
          data-testid="input-message"
          className="min-h-[44px] max-h-32 resize-none"
          rows={1}
        />
        {isStreaming ? (
          <Button
            onClick={onStopGeneration}
            data-testid="button-stop"
            size="icon"
            variant="destructive"
            className="shrink-0"
            title={t('chat.input.stop', { defaultValue: '응답 중지' })}
          >
            <Square className="h-4 w-4 fill-current" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={(!message.trim() && attachments.length === 0 && taggedFiles.length === 0) || disabled}
            data-testid="button-send"
            size="icon"
            className="shrink-0"
            title={t('chat.input.send')}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {t('chat.input.hint', { defaultValue: 'Enter로 전송, Shift+Enter로 줄바꿈' })}
      </p>
    </div>
  );
}
