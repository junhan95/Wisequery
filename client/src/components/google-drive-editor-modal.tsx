import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, CheckCircle2, AlertCircle, Loader2, FileText, FileSpreadsheet, Presentation } from "lucide-react";
import type { File as FileType } from "@shared/schema";

interface GoogleDriveEditorModalProps {
  file: FileType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

interface GoogleDriveStatus {
  hasActiveSession: boolean;
  editUrl?: string;
  googleDriveFileId?: string;
  status?: string;
  expiresAt?: string;
  lastSyncedAt?: string;
  isExpired?: boolean;
}

interface GoogleDriveUploadResponse {
  success: boolean;
  editUrl: string;
  googleDriveFileId: string;
  expiresAt: string;
  isExisting: boolean;
}

interface GoogleDriveSyncResponse {
  success: boolean;
  fileId: string;
  size: number;
  synced: boolean;
}

export function GoogleDriveEditorModal({
  file,
  open,
  onOpenChange,
  projectId,
}: GoogleDriveEditorModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editUrl, setEditUrl] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setEditUrl(null);
      setIsEditorOpen(false);
    }
    onOpenChange(newOpen);
  };

  const statusQuery = useQuery<GoogleDriveStatus>({
    queryKey: ["/api/files", file?.id, "google-drive", "status"],
    enabled: !!file && open && !!projectId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (): Promise<GoogleDriveUploadResponse> => {
      if (!projectId || !file) {
        throw new Error("Project or file not selected");
      }
      const response = await apiRequest("POST", `/api/files/${file.id}/google-drive/upload`);
      return response.json();
    },
    onSuccess: (data) => {
      setEditUrl(data.editUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/files", file?.id, "google-drive", "status"] });
      toast({ title: t("googleDrive.uploadSuccess") });
    },
    onError: (error: any) => {
      toast({
        title: t("googleDrive.uploadError"),
        description: error.message || t("googleDrive.uploadErrorDesc"),
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (): Promise<GoogleDriveSyncResponse> => {
      if (!projectId || !file) {
        throw new Error("Project or file not selected");
      }
      const response = await apiRequest("POST", `/api/files/${file.id}/google-drive/sync`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files", file?.id, "content"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files", file?.id, "google-drive", "status"] });
      toast({ title: t("googleDrive.syncSuccess") });
    },
    onError: (error: any) => {
      toast({
        title: t("googleDrive.syncError"),
        description: error.message || t("googleDrive.syncErrorDesc"),
        variant: "destructive",
      });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || !file) {
        throw new Error("Project or file not selected");
      }
      await apiRequest("DELETE", `/api/files/${file.id}/google-drive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files", file?.id, "google-drive", "status"] });
      handleOpenChange(false);
      toast({ title: t("googleDrive.cleanupSuccess") });
    },
    onError: (error: any) => {
      toast({
        title: t("googleDrive.cleanupError"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleOpenEditor = () => {
    if (!projectId || !file) {
      toast({
        title: t("common.error"),
        description: t("googleDrive.uploadErrorDesc"),
        variant: "destructive",
      });
      return;
    }
    if (statusQuery.data?.hasActiveSession && statusQuery.data.editUrl) {
      window.open(statusQuery.data.editUrl, "_blank");
      setIsEditorOpen(true);
    } else if (editUrl) {
      window.open(editUrl, "_blank");
      setIsEditorOpen(true);
    } else {
      uploadMutation.mutate();
    }
  };

  const handleSyncAndClose = async () => {
    if (!projectId || !file) {
      toast({
        title: t("common.error"),
        description: t("googleDrive.syncErrorDesc"),
        variant: "destructive",
      });
      return;
    }
    await syncMutation.mutateAsync();
    await cleanupMutation.mutateAsync();
  };

  const canOperate = !!projectId && !!file;

  const getFileTypeIcon = (mimeType: string) => {
    if (mimeType?.includes("word") || mimeType?.includes("document")) {
      return <FileText className="h-12 w-12 text-blue-500" />;
    }
    if (mimeType?.includes("spreadsheet") || mimeType?.includes("excel")) {
      return <FileSpreadsheet className="h-12 w-12 text-green-500" />;
    }
    if (mimeType?.includes("presentation") || mimeType?.includes("powerpoint")) {
      return <Presentation className="h-12 w-12 text-orange-500" />;
    }
    return <FileText className="h-12 w-12 text-gray-500" />;
  };

  const getEditorName = (mimeType: string) => {
    if (mimeType?.includes("word") || mimeType?.includes("document")) {
      return t("googleDrive.editorDocs");
    }
    if (mimeType?.includes("spreadsheet") || mimeType?.includes("excel")) {
      return t("googleDrive.editorSheets");
    }
    if (mimeType?.includes("presentation") || mimeType?.includes("powerpoint")) {
      return t("googleDrive.editorSlides");
    }
    return t("googleDrive.editorDrive");
  };

  const hasActiveSession = statusQuery.data?.hasActiveSession || editUrl;

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getFileTypeIcon(file.mimeType)}
            <span>{t("googleDrive.editTitle")}</span>
          </DialogTitle>
          <DialogDescription className="truncate">
            {file.originalName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto max-h-[50vh]">
          {statusQuery.isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : hasActiveSession ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border p-4 bg-muted/50">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium">{t("googleDrive.sessionActive")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("googleDrive.editInstructions", { editor: getEditorName(file.mimeType) })}
                  </p>
                </div>
              </div>
              
              {isEditorOpen && (
                <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950 p-4">
                  <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    {t("googleDrive.syncReminder")}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("googleDrive.instructions", { editor: getEditorName(file.mimeType) })}
              </p>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                <li>{t("googleDrive.step1")}</li>
                <li>{t("googleDrive.step2", { editor: getEditorName(file.mimeType) })}</li>
                <li>{t("googleDrive.step3")}</li>
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {hasActiveSession ? (
            <>
              <Button
                onClick={handleOpenEditor}
                disabled={!canOperate}
                className="gap-2"
                data-testid="button-open-editor"
              >
                <ExternalLink className="h-4 w-4" />
                {t("googleDrive.openEditor")}
              </Button>
              <Button
                variant="outline"
                onClick={handleSyncAndClose}
                disabled={!canOperate || syncMutation.isPending || cleanupMutation.isPending}
                className="gap-2"
                data-testid="button-sync-close"
              >
                {(syncMutation.isPending || cleanupMutation.isPending) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t("googleDrive.syncAndClose")}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                data-testid="button-cancel-gdrive"
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleOpenEditor}
                disabled={!canOperate || uploadMutation.isPending}
                className="gap-2"
                data-testid="button-start-editing"
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                {t("googleDrive.startEditing")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
