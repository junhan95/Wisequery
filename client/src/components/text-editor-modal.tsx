import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Save, X, Loader2 } from "lucide-react";
import type { File as FileType } from "@shared/schema";

interface TextEditorModalProps {
  file: FileType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
}

export function TextEditorModal({ file, open, onOpenChange, projectId }: TextEditorModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [originalContent, setOriginalContent] = useState("");

  const { data: fileContent, isLoading } = useQuery({
    queryKey: ["/api/files", file?.id, "content"],
    queryFn: async () => {
      if (!file?.id) return null;
      const response = await fetch(`/api/files/${file.id}/content`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load file content");
      }
      return response.json();
    },
    enabled: open && !!file?.id,
  });

  useEffect(() => {
    if (fileContent?.content !== undefined) {
      setContent(fileContent.content);
      setOriginalContent(fileContent.content);
      setHasChanges(false);
    }
  }, [fileContent]);

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(newContent !== originalContent);
  };

  const saveContentMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const response = await apiRequest("PUT", `/api/files/${id}/content`, { content });
      return response.json();
    },
    onSuccess: (_, variables) => {
      toast({ title: t("textEditor.saved") });
      setOriginalContent(variables.content);
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["/api/files", file?.id, "content"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "files"] });
      }
    },
    onError: (error: Error) => {
      toast({ 
        title: t("textEditor.saveFailed"), 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleSave = () => {
    if (file?.id && hasChanges) {
      saveContentMutation.mutate({ id: file.id, content });
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      const confirmClose = window.confirm(t("textEditor.unsavedChanges"));
      if (!confirmClose) return;
    }
    setContent("");
    setOriginalContent("");
    setHasChanges(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="w-[95vw] max-w-4xl h-[90vh] max-h-[700px] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {file?.originalName || t("textEditor.title")}
            {hasChanges && <span className="text-xs text-muted-foreground">({t("textEditor.modified")})</span>}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              className="h-full w-full resize-none font-mono text-sm"
              placeholder={t("textEditor.placeholder")}
              data-testid="textarea-editor"
            />
          )}
        </div>

        <DialogFooter className="gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={handleClose}
            data-testid="button-editor-cancel"
          >
            <X className="h-4 w-4 mr-2" />
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saveContentMutation.isPending}
            data-testid="button-editor-save"
          >
            {saveContentMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
