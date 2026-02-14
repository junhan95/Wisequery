import { useState, useEffect, useRef } from "react";
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
import { X, Upload, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: {
    name: string;
    description?: string;
    instructions?: string;
    files?: File[];
  }) => void;
  projectId: string;
}

export function CreateConversationDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateConversationDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setInstructions("");
      setFiles([]);
    }
  }, [open]);

  const handleSubmit = () => {
    if (name.trim()) {
      onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        files: files.length > 0 ? files : undefined,
      });
      onOpenChange(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    setFiles((prev) => [...prev, ...selectedFiles]);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(event.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return `0 ${t('common.fileSize.bytes')}`;
    const k = 1024;
    const sizes = ['common.fileSize.bytes', 'common.fileSize.kb', 'common.fileSize.mb'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + t(sizes[i]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl h-[90vh] max-h-[700px] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('dialogs.createConversation.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
          {/* Left Panel - Settings */}
          <div className="flex-1 overflow-y-auto space-y-4 lg:space-y-6 pr-2 min-h-0">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="conv-name">
                {t('dialogs.createConversation.nameLabel')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="conv-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('dialogs.createConversation.namePlaceholder')}
                data-testid="input-conversation-name"
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="conv-description">{t('dialogs.createConversation.descriptionLabel')}</Label>
              <Textarea
                id="conv-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('dialogs.createConversation.descriptionPlaceholder')}
                rows={3}
                data-testid="input-conversation-description"
              />
            </div>

            {/* Instructions */}
            <div className="space-y-2">
              <Label htmlFor="conv-instructions">{t('dialogs.createConversation.instructionsLabel')}</Label>
              <Textarea
                id="conv-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={t('dialogs.createConversation.instructionsPlaceholder')}
                rows={8}
                data-testid="input-conversation-instructions"
              />
              <p className="text-xs text-muted-foreground">
                {t('dialogs.createConversation.instructionsExample')}
              </p>
            </div>

            {/* Knowledge / Files */}
            <div className="space-y-2">
              <Label>{t('dialogs.createConversation.knowledgeLabel')}</Label>
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
                      data-testid="button-upload-file"
                    >
                      {t('dialogs.createConversation.addFile')}
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
                    {t('dialogs.createConversation.dragOrDrop')}
                  </p>
                </div>
              </div>

              {/* File List */}
              {files.length > 0 && (
                <div className="space-y-2 mt-4">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 border rounded-md bg-muted/30"
                      data-testid={`file-item-${index}`}
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
                        onClick={() => removeFile(index)}
                        data-testid={`button-remove-file-${index}`}
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
            <h3 className="font-semibold mb-4">{t('dialogs.createConversation.preview')}</h3>
            <div className="space-y-4">
              {/* Preview Name */}
              <div>
                <h4 className="text-2xl font-bold mb-2">
                  {name || t('dialogs.createConversation.noName')}
                </h4>
                {description && (
                  <p className="text-sm text-muted-foreground">{description}</p>
                )}
              </div>

              {/* Preview Instructions */}
              {instructions && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t('dialogs.createConversation.instructionsLabel')}
                  </Label>
                  <div className="mt-1 p-3 bg-muted/30 rounded-md text-sm whitespace-pre-wrap">
                    {instructions}
                  </div>
                </div>
              )}

              {/* Preview Files */}
              {files.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t('dialogs.createConversation.attachedFiles', { count: files.length })}
                  </Label>
                  <div className="mt-1 space-y-1">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-2 bg-muted/30 rounded text-xs"
                      >
                        <FileText className="w-3 h-3 text-muted-foreground" />
                        <span className="truncate">{file.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!name && !description && !instructions && files.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {t('dialogs.createConversation.previewEmpty')}
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
            data-testid="button-cancel-create-conversation"
          >
            {t('dialogs.createConversation.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim()}
            data-testid="button-confirm-create-conversation"
          >
            {t('dialogs.createConversation.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
