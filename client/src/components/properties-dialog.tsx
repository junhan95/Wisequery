import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  File as FileIcon,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  Presentation,
  Folder as FolderIcon,
} from "lucide-react";
import type { File as FileType, Folder, Project } from "@shared/schema";

interface PropertiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: FileType | Folder | null;
  itemType: "file" | "folder";
  project?: Project;
  parentFolder?: Folder | null;
  folderStats?: {
    fileCount: number;
    folderCount: number;
    totalSize: number;
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatFileSizeDetailed(bytes: number): string {
  const formatted = formatFileSize(bytes);
  return `${formatted} (${bytes.toLocaleString()} ${bytes === 1 ? 'byte' : 'bytes'})`;
}

function getFileIcon(mimeType: string, fileName?: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.startsWith("video/")) return FileVideo;
  if (mimeType.startsWith("audio/")) return FileAudio;
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed")) return FileArchive;
  if (mimeType.includes("javascript") || mimeType.includes("typescript") || mimeType.includes("json") || mimeType.includes("xml") || mimeType.includes("html") || mimeType.includes("css")) return FileCode;
  
  const ext = fileName?.split('.').pop()?.toLowerCase();
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || ext === "xlsx" || ext === "xls" || ext === "csv") return FileSpreadsheet;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint") || ext === "pptx" || ext === "ppt") return Presentation;
  if (mimeType.includes("word") || mimeType.includes("document") || ext === "docx" || ext === "doc") return FileText;
  if (mimeType.includes("pdf") || ext === "pdf") return FileText;
  if (mimeType.startsWith("text/")) return FileText;
  
  return FileIcon;
}

function getFileTypeName(mimeType: string, fileName?: string, t?: (key: string) => string): string {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  
  if (mimeType.startsWith("image/")) {
    const subtype = mimeType.split("/")[1]?.toUpperCase() || "IMAGE";
    return `${subtype} ${t?.("properties.imageFile") || "Image"}`;
  }
  if (mimeType.startsWith("video/")) {
    const subtype = mimeType.split("/")[1]?.toUpperCase() || "VIDEO";
    return `${subtype} ${t?.("properties.videoFile") || "Video"}`;
  }
  if (mimeType.startsWith("audio/")) {
    const subtype = mimeType.split("/")[1]?.toUpperCase() || "AUDIO";
    return `${subtype} ${t?.("properties.audioFile") || "Audio"}`;
  }
  if (mimeType.includes("pdf") || ext === "pdf") return "PDF";
  if (mimeType.includes("word") || ext === "docx" || ext === "doc") return "Microsoft Word";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || ext === "xlsx" || ext === "xls") return "Microsoft Excel";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint") || ext === "pptx" || ext === "ppt") return "Microsoft PowerPoint";
  if (mimeType.includes("zip")) return "ZIP";
  if (mimeType.includes("json")) return "JSON";
  if (mimeType.startsWith("text/")) return t?.("properties.textFile") || "Text File";
  
  if (ext) {
    return `${ext.toUpperCase()} ${t?.("properties.file") || "File"}`;
  }
  
  return t?.("properties.file") || "File";
}

function formatDate(date: Date | string, locale: string): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

export function PropertiesDialog({
  open,
  onOpenChange,
  item,
  itemType,
  project,
  parentFolder,
  folderStats,
}: PropertiesDialogProps) {
  const { t, i18n } = useTranslation();

  if (!item) return null;

  const isFile = itemType === "file";
  const file = isFile ? (item as FileType) : null;
  const folder = !isFile ? (item as Folder) : null;

  const name = isFile ? file!.originalName : folder!.name;
  const createdAt = isFile ? file!.createdAt : folder!.createdAt;

  const IconComponent = isFile 
    ? getFileIcon(file!.mimeType, file!.originalName)
    : FolderIcon;

  const typeName = isFile 
    ? getFileTypeName(file!.mimeType, file!.originalName, t)
    : t("properties.fileFolder");

  const locationPath = parentFolder 
    ? `${project?.name || ""} > ${parentFolder.name}`
    : project?.name || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[425px]" data-testid="properties-dialog">
        <DialogHeader>
          <DialogTitle className="truncate">{name} {t("properties.title")}</DialogTitle>
        </DialogHeader>
        
        <div className="py-4 overflow-y-auto max-h-[60vh]">
          <div className="flex items-center gap-3 mb-4">
            <IconComponent 
              className={`h-12 w-12 flex-shrink-0 ${isFile ? 'text-muted-foreground' : 'text-amber-500'}`} 
            />
            <span className="text-lg font-medium truncate" title={name}>
              {name}
            </span>
          </div>

          <Separator className="my-4" />

          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <span className="text-muted-foreground">{t("properties.type")}:</span>
              <span>{typeName}</span>
            </div>

            <div className="grid grid-cols-[100px_1fr] gap-2">
              <span className="text-muted-foreground">{t("properties.location")}:</span>
              <span className="truncate" title={locationPath}>{locationPath || "/"}</span>
            </div>

            <div className="grid grid-cols-[100px_1fr] gap-2">
              <span className="text-muted-foreground">{t("properties.size")}:</span>
              <span>
                {isFile 
                  ? formatFileSizeDetailed(file!.size)
                  : folderStats 
                    ? formatFileSizeDetailed(folderStats.totalSize)
                    : "-"
                }
              </span>
            </div>

            {!isFile && folderStats && (
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="text-muted-foreground">{t("properties.contents")}:</span>
                <span>
                  {t("properties.contentsDetail", { 
                    fileCount: folderStats.fileCount, 
                    folderCount: folderStats.folderCount 
                  })}
                </span>
              </div>
            )}

            <Separator className="my-2" />

            <div className="grid grid-cols-[100px_1fr] gap-2">
              <span className="text-muted-foreground">{t("properties.created")}:</span>
              <span>{formatDate(createdAt, i18n.language)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} data-testid="properties-close-btn">
            {t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
