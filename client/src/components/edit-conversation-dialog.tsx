import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, Upload, FileText, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation, File as ConversationFile } from "@shared/schema";

interface EditConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (data: {
    id: string;
    name: string;
    description?: string;
    instructions?: string;
    newFiles?: File[];
    deleteFileIds?: string[];
  }) => Promise<void>;
  conversation: Conversation;
}

export function EditConversationDialog({
  open,
  onOpenChange,
  onUpdate,
  conversation,
}: EditConversationDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(conversation.name);
  const [description, setDescription] = useState(conversation.description || "");
  const [instructions, setInstructions] = useState(conversation.instructions || "");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [deleteFileIds, setDeleteFileIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch existing files
  const { data: existingFiles = [], refetch: refetchFiles } = useQuery<ConversationFile[]>({
    queryKey: ["/api/conversations", conversation.id, "files"],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${conversation.id}/files`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch files");
      }
      return res.json();
    },
    enabled: open,
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setName(conversation.name);
      setDescription(conversation.description || "");
      setInstructions(conversation.instructions || "");
      setNewFiles([]);
      setDeleteFileIds(new Set());
      refetchFiles();
    }
  }, [open, conversation, refetchFiles]);

  const handleSubmit = async () => {
    if (name.trim() && !isSubmitting) {
      setIsSubmitting(true);
      try {
        const payload: {
          id: string;
          name: string;
          description: string;
          instructions: string;
          newFiles?: File[];
          deleteFileIds?: string[];
        } = {
          id: conversation.id,
          name: name.trim(),
          // Always include description and instructions (even if empty) so users can clear them
          description: description.trim(),
          instructions: instructions.trim(),
        };

        if (newFiles.length > 0) {
          payload.newFiles = newFiles;
        }
        if (deleteFileIds.size > 0) {
          payload.deleteFileIds = Array.from(deleteFileIds);
        }

        await onUpdate(payload);
        // Close dialog only after successful update
        onOpenChange(false);
      } catch (error) {
        // Error toast is already handled in the mutation
        console.error("Failed to update conversation:", error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    setNewFiles((prev) => [...prev, ...selectedFiles]);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(event.dataTransfer.files);
    setNewFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeNewFile = (index: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleDeleteExistingFile = (fileId: string) => {
    setDeleteFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return `0 ${t('common.fileSize.bytes')}`;
    const k = 1024;
    const sizes = ['common.fileSize.bytes', 'common.fileSize.kb', 'common.fileSize.mb'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + t(sizes[i]);
  };

  const visibleExistingFiles = existingFiles.filter(f => !deleteFileIds.has(f.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl h-[90vh] max-h-[700px] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('dialogs.editConversation.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
          {/* Left Panel - Settings */}
          <div className="flex-1 overflow-y-auto space-y-4 lg:space-y-6 pr-2 min-h-0">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-conv-name">
                {t('dialogs.editConversation.nameLabel')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-conv-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('dialogs.editConversation.namePlaceholder')}
                data-testid="input-edit-conversation-name"
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="edit-conv-description">{t('dialogs.editConversation.descriptionLabel')}</Label>
              <Textarea
                id="edit-conv-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('dialogs.editConversation.descriptionPlaceholder')}
                rows={3}
                data-testid="input-edit-conversation-description"
              />
            </div>

            {/* Instructions */}
            <div className="space-y-2">
              <Label htmlFor="edit-conv-instructions">{t('dialogs.editConversation.instructionsLabel')}</Label>
              <Textarea
                id="edit-conv-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={t('dialogs.editConversation.instructionsPlaceholder')}
                rows={8}
                data-testid="input-edit-conversation-instructions"
              />
              <p className="text-xs text-muted-foreground">
                {t('dialogs.editConversation.instructionsExample')}
              </p>
            </div>

            {/* Knowledge / Files */}
            <div className="space-y-2">
              <Label>{t('dialogs.editConversation.knowledgeLabel')}</Label>
              
              {/* Existing Files */}
              {existingFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{t('dialogs.editConversation.existingFiles')}</p>
                  {existingFiles.map((file) => (
                    <div
                      key={file.id}
                      className={cn(
                        "flex items-center gap-2 p-2 border rounded-md transition-opacity",
                        deleteFileIds.has(file.id) 
                          ? "bg-destructive/10 border-destructive/30 opacity-50" 
                          : "bg-muted/30"
                      )}
                      data-testid={`existing-file-item-${file.id}`}
                    >
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{file.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.mimeType}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => window.open(`/api/files/${file.id}/download`, '_blank')}
                        data-testid={`button-download-file-${file.id}`}
                        disabled={deleteFileIds.has(file.id)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleDeleteExistingFile(file.id)}
                        data-testid={`button-delete-file-${file.id}`}
                      >
                        {deleteFileIds.has(file.id) ? (
                          <X className="w-4 h-4" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* New Files Upload */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-md p-6 transition-colors",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <div className="flex flex-col items-center justify-center gap-2 text-center">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-upload-new-file"
                    >
                      {t('dialogs.editConversation.addNewFile')}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      multiple
                      onChange={handleFileSelect}
                      accept=".txt,.md,.json,.csv,.pdf,text/*"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('dialogs.editConversation.dragOrDrop')}
                  </p>
                </div>
              </div>

              {/* New File List */}
              {newFiles.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-xs text-muted-foreground">{t('dialogs.editConversation.newFiles')}</p>
                  {newFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 border rounded-md bg-primary/5"
                      data-testid={`new-file-item-${index}`}
                    >
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeNewFile(index)}
                        data-testid={`button-remove-new-file-${index}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Preview */}
          <div className="hidden lg:block w-[400px] border-l pl-6 overflow-y-auto shrink-0">
            <h3 className="font-semibold mb-4">{t('dialogs.editConversation.preview')}</h3>
            <div className="space-y-4">
              {/* Preview Name */}
              <div>
                <h4 className="text-2xl font-bold mb-2">
                  {name || t('dialogs.editConversation.noName')}
                </h4>
                {description && (
                  <p className="text-sm text-muted-foreground">{description}</p>
                )}
              </div>

              {/* Preview Instructions */}
              {instructions && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t('dialogs.editConversation.instructionsLabel')}
                  </Label>
                  <div className="mt-1 p-3 bg-muted/30 rounded-md text-sm whitespace-pre-wrap">
                    {instructions}
                  </div>
                </div>
              )}

              {/* Preview Files */}
              {(visibleExistingFiles.length > 0 || newFiles.length > 0) && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t('dialogs.editConversation.attachedFiles', { count: visibleExistingFiles.length + newFiles.length })}
                  </Label>
                  <div className="mt-1 space-y-1">
                    {visibleExistingFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-2 p-2 bg-muted/30 rounded text-xs"
                      >
                        <FileText className="w-3 h-3 text-muted-foreground" />
                        <span className="truncate">{file.filename}</span>
                      </div>
                    ))}
                    {newFiles.map((file, index) => (
                      <div
                        key={`new-${index}`}
                        className="flex items-center gap-2 p-2 bg-primary/10 rounded text-xs"
                      >
                        <FileText className="w-3 h-3 text-primary" />
                        <span className="truncate">{file.name}</span>
                        <span className="text-primary">{t('dialogs.editConversation.newFileIndicator')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!name && !description && !instructions && visibleExistingFiles.length === 0 && newFiles.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {t('dialogs.editConversation.previewEmpty')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            data-testid="button-cancel-edit-conversation"
          >
            {t('dialogs.editConversation.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || isSubmitting}
            data-testid="button-confirm-edit-conversation"
          >
            {isSubmitting ? t('dialogs.editConversation.saving') : t('dialogs.editConversation.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
