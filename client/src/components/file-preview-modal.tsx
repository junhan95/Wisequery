import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Download,
  X,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  File as FileIcon,
  ExternalLink,
} from "lucide-react";
import type { File as FileType } from "@shared/schema";

interface FilePreviewModalProps {
  file: FileType | null;
  open: boolean;
  onClose: () => void;
}

function getFileCategory(mimeType: string | null | undefined): "image" | "video" | "audio" | "text" | "pdf" | "other" {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.includes("pdf")) return "pdf";
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    mimeType.includes("json") ||
    mimeType.includes("xml") ||
    mimeType.includes("html") ||
    mimeType.includes("css")
  ) {
    return "text";
  }
  return "other";
}

function getLanguageFromMime(mimeType: string): string {
  if (mimeType.includes("javascript")) return "javascript";
  if (mimeType.includes("typescript")) return "typescript";
  if (mimeType.includes("json")) return "json";
  if (mimeType.includes("html")) return "html";
  if (mimeType.includes("css")) return "css";
  if (mimeType.includes("xml")) return "xml";
  if (mimeType.includes("python")) return "python";
  if (mimeType.includes("markdown")) return "markdown";
  return "plaintext";
}

export function FilePreviewModal({ file, open, onClose }: FilePreviewModalProps) {
  const { t } = useTranslation();
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !open) {
      setTextContent(null);
      setError(null);
      return;
    }

    const category = getFileCategory(file.mimeType);
    
    if (category === "text") {
      setIsLoading(true);
      setError(null);
      
      fetch(`/api/files/${file.id}/content`, { credentials: "include" })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load content");
          return res.json();
        })
        .then((data) => {
          setTextContent(data.content);
        })
        .catch((err) => {
          setError(err.message);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [file, open]);

  const handleDownload = () => {
    if (!file) return;
    window.open(`/api/files/${file.id}/download`, "_blank");
  };

  const handleOpenInNewTab = () => {
    if (!file) return;
    window.open(`/api/files/${file.id}/view`, "_blank");
  };

  if (!file) return null;

  const category = getFileCategory(file.mimeType);

  const renderPreview = () => {
    switch (category) {
      case "image":
        return (
          <div className="flex items-center justify-center p-4 bg-muted/20 rounded-lg">
            <img
              src={`/api/files/${file.id}/view`}
              alt={file.originalName}
              className="max-w-full max-h-[60vh] object-contain rounded"
              data-testid="preview-image"
            />
          </div>
        );

      case "video":
        return (
          <div className="flex items-center justify-center p-4 bg-black rounded-lg">
            <video
              src={`/api/files/${file.id}/view`}
              controls
              className="max-w-full max-h-[60vh] rounded"
              data-testid="preview-video"
            >
              {t("filePreview.videoNotSupported")}
            </video>
          </div>
        );

      case "audio":
        return (
          <div className="flex flex-col items-center justify-center p-8 bg-muted/20 rounded-lg gap-4">
            <FileAudio className="h-16 w-16 text-muted-foreground" />
            <audio
              src={`/api/files/${file.id}/view`}
              controls
              className="w-full max-w-md"
              data-testid="preview-audio"
            >
              {t("filePreview.audioNotSupported")}
            </audio>
          </div>
        );

      case "pdf":
        return (
          <div className="flex flex-col items-center justify-center p-8 bg-muted/20 rounded-lg gap-4">
            <FileText className="h-16 w-16 text-red-500" />
            <p className="text-muted-foreground text-center">
              {t("filePreview.pdfHint")}
            </p>
            <Button onClick={handleOpenInNewTab} data-testid="button-open-pdf">
              <ExternalLink className="h-4 w-4 mr-2" />
              {t("filePreview.openInNewTab")}
            </Button>
          </div>
        );

      case "text":
        if (isLoading) {
          return (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          );
        }
        if (error) {
          return (
            <div className="flex flex-col items-center justify-center p-8 text-destructive gap-2">
              <FileText className="h-12 w-12" />
              <p>{error}</p>
            </div>
          );
        }
        return (
          <ScrollArea className="h-[60vh] w-full rounded-lg border bg-muted/20">
            <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words" data-testid="preview-text">
              {textContent}
            </pre>
          </ScrollArea>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center p-8 bg-muted/20 rounded-lg gap-4">
            <FileIcon className="h-16 w-16 text-muted-foreground" />
            <p className="text-muted-foreground text-center">
              {t("filePreview.cannotPreview")}
            </p>
            <Button onClick={handleDownload} data-testid="button-download-file">
              <Download className="h-4 w-4 mr-2" />
              {t("filePreview.download")}
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="w-[95vw] max-w-4xl h-[90vh] max-h-[700px] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 pr-8">
            {category === "image" && <FileImage className="h-5 w-5 text-blue-500" />}
            {category === "video" && <FileVideo className="h-5 w-5 text-purple-500" />}
            {category === "audio" && <FileAudio className="h-5 w-5 text-green-500" />}
            {category === "pdf" && <FileText className="h-5 w-5 text-red-500" />}
            {category === "text" && <FileText className="h-5 w-5 text-yellow-500" />}
            {category === "other" && <FileIcon className="h-5 w-5 text-muted-foreground" />}
            <span className="truncate">{file.originalName}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("filePreview.previewOf", { name: file.originalName })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden min-h-0">
          {renderPreview()}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-4 border-t shrink-0">
          {category !== "other" && (
            <Button variant="outline" onClick={handleOpenInNewTab} data-testid="button-open-new-tab">
              <ExternalLink className="h-4 w-4 mr-2" />
              {t("filePreview.openInNewTab")}
            </Button>
          )}
          <Button variant="outline" onClick={handleDownload} data-testid="button-download">
            <Download className="h-4 w-4 mr-2" />
            {t("filePreview.download")}
          </Button>
          <Button variant="ghost" onClick={onClose} data-testid="button-close-preview">
            <X className="h-4 w-4 mr-2" />
            {t("common.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
