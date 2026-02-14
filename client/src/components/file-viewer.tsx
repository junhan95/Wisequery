import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutGrid,
  List,
  TableProperties,
  Upload,
  Download,
  File as FileIcon,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  Presentation,
  Scissors,
  Copy,
  ClipboardPaste,
  Pencil,
  Trash2,
  MessageSquarePlus,
  FolderOpen,
  Folder as FolderIcon,
  ArrowUp,
  ZoomIn,
  ZoomOut,
  Settings,
  RefreshCw,
  Eye,
} from "lucide-react";
import type { File as FileType, Project, Folder, Conversation } from "@shared/schema";
import { FilePreviewModal } from "./file-preview-modal";
import { PropertiesDialog } from "./properties-dialog";
import { TextEditorModal } from "./text-editor-modal";
import { GoogleDriveEditorModal } from "./google-drive-editor-modal";
import { UpgradeLimitDialog } from "./upgrade-limit-dialog";
import { MessageSquare, Info, ArrowDownAZ, ArrowUpAZ, Check } from "lucide-react";
import { SiGoogledocs, SiGooglesheets, SiGoogleslides } from "react-icons/si";

type ViewMode = "largeIcons" | "list" | "details";
type SortBy = "name" | "date" | "type";
type SortOrder = "asc" | "desc";
type SelectedItemType = { type: "file"; id: string } | { type: "folder"; id: string } | { type: "conversation"; id: string } | null;

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

type SelectedItems = {
  files: Set<string>;
  folders: Set<string>;
  conversations: Set<string>;
};

interface FileViewerProps {
  selectedProjectId: string | null;
  selectedFolderId: string | null;
  projects: Project[];
  folders: Folder[];
  conversations?: Conversation[];
  onFolderNavigate?: (folderId: string | null, projectId: string) => void;
  onConversationSelect?: (conversationId: string) => void;
  onAttachFile?: (file: FileType) => void;
  onTagConversation?: (conversation: Conversation) => void;
  onConversationSettings?: (conversationId: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

const ICON_SIZES = [64, 96, 128, 160, 192, 256];
const DEFAULT_ICON_SIZE_INDEX = 2;

function getFileType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("zip") || mimeType.includes("archive")) return "Archive";
  if (mimeType.includes("javascript")) return "JavaScript";
  if (mimeType.includes("typescript")) return "TypeScript";
  if (mimeType.includes("json")) return "JSON";
  if (mimeType.includes("html")) return "HTML";
  if (mimeType.includes("css")) return "CSS";
  if (mimeType.startsWith("text/")) return "Text";
  return "File";
}

// Draggable wrapper for file items
function DraggableFileItem({ 
  fileId, 
  isDragging,
  isMultiSelected,
  isDndActiveRef,
  lastDragEndTimeRef,
  children 
}: { 
  fileId: string; 
  isDragging: boolean;
  isMultiSelected: boolean;
  isDndActiveRef: React.MutableRefObject<boolean>;
  lastDragEndTimeRef: React.MutableRefObject<number>;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `draggable-file-${fileId}`,
  });
  
  // Ghost styling for dragged items - NO pointer-events:none so drop targets still work
  const ghostStyles: React.CSSProperties = isDragging ? {
    opacity: 0.25,
    border: '2px dashed hsl(var(--primary) / 0.5)',
    borderRadius: '0.5rem',
  } : {};
  
  // Don't apply transform to original - DragOverlay handles visual drag
  const style: React.CSSProperties = ghostStyles;
  
  // Prevent click from clearing selection when multi-selected or during/after drag
  const handleClick = (e: React.MouseEvent) => {
    const timeSinceLastDrag = Date.now() - lastDragEndTimeRef.current;
    // Use refs directly to get latest values
    if (isMultiSelected || isDndActiveRef.current || timeSinceLastDrag < 500) {
      e.stopPropagation();
    }
  };
  
  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes}
      {...listeners}
      onClickCapture={handleClick}
    >
      {children}
    </div>
  );
}

// Droppable wrapper for folder items
function DroppableFolderItem({ 
  folderId, 
  isOver,
  children 
}: { 
  folderId: string; 
  isOver: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({
    id: `droppable-folder-${folderId}`,
  });
  
  return (
    <div 
      ref={setNodeRef} 
      className={isOver ? "ring-2 ring-primary rounded-lg" : ""}
    >
      {children}
    </div>
  );
}

// Draggable wrapper for folder items
function DraggableFolderItem({ 
  folderId, 
  isDragging,
  isMultiSelected,
  isDndActiveRef,
  lastDragEndTimeRef,
  children 
}: { 
  folderId: string; 
  isDragging: boolean;
  isMultiSelected: boolean;
  isDndActiveRef: React.MutableRefObject<boolean>;
  lastDragEndTimeRef: React.MutableRefObject<number>;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `draggable-folder-${folderId}`,
  });
  
  // Ghost styling - NO pointer-events:none so drop targets still work
  const ghostStyles: React.CSSProperties = isDragging ? {
    opacity: 0.25,
    border: '2px dashed hsl(var(--primary) / 0.5)',
    borderRadius: '0.5rem',
  } : {};
  
  // Don't apply transform to original - DragOverlay handles visual drag
  const style: React.CSSProperties = ghostStyles;
  
  // Prevent click from clearing selection when multi-selected or during/after drag
  const handleClick = (e: React.MouseEvent) => {
    const timeSinceLastDrag = Date.now() - lastDragEndTimeRef.current;
    if (isMultiSelected || isDndActiveRef.current || timeSinceLastDrag < 500) {
      e.stopPropagation();
    }
  };
  
  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes}
      {...listeners}
      onClickCapture={handleClick}
    >
      {children}
    </div>
  );
}

// Draggable wrapper for conversation items
function DraggableConversationItem({ 
  conversationId, 
  isDragging,
  isMultiSelected,
  isDndActiveRef,
  lastDragEndTimeRef,
  children 
}: { 
  conversationId: string; 
  isDragging: boolean;
  isMultiSelected: boolean;
  isDndActiveRef: React.MutableRefObject<boolean>;
  lastDragEndTimeRef: React.MutableRefObject<number>;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `draggable-conversation-${conversationId}`,
  });
  
  // Ghost styling - NO pointer-events:none so drop targets still work
  const ghostStyles: React.CSSProperties = isDragging ? {
    opacity: 0.25,
    border: '2px dashed hsl(var(--primary) / 0.5)',
    borderRadius: '0.5rem',
  } : {};
  
  // Don't apply transform to original - DragOverlay handles visual drag
  const style: React.CSSProperties = ghostStyles;
  
  // Prevent click from clearing selection when multi-selected or during/after drag
  const handleClick = (e: React.MouseEvent) => {
    const timeSinceLastDrag = Date.now() - lastDragEndTimeRef.current;
    if (isMultiSelected || isDndActiveRef.current || timeSinceLastDrag < 500) {
      e.stopPropagation();
    }
  };
  
  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes}
      {...listeners}
      onClickCapture={handleClick}
    >
      {children}
    </div>
  );
}

export function FileViewer({
  selectedProjectId,
  selectedFolderId,
  projects,
  folders,
  conversations = [],
  onFolderNavigate,
  onConversationSelect,
  onAttachFile,
  onTagConversation,
  onConversationSettings,
}: FileViewerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [viewMode, setViewMode] = useState<ViewMode>("largeIcons");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [selectedItem, setSelectedItem] = useState<SelectedItemType>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const dragCounter = useRef(0);
  const [clipboardFiles, setClipboardFiles] = useState<{ files: FileType[]; action: "cut" | "copy" } | null>(null);
  const [renameFileId, setRenameFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [originalRenameValue, setOriginalRenameValue] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileType | null>(null);
  const [editorFile, setEditorFile] = useState<FileType | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [googleDriveFile, setGoogleDriveFile] = useState<FileType | null>(null);
  const [googleDriveEditorOpen, setGoogleDriveEditorOpen] = useState(false);
  const [officeFileDialogOpen, setOfficeFileDialogOpen] = useState(false);
  const [officeDialogFile, setOfficeDialogFile] = useState<FileType | null>(null);
  const [propertiesItem, setPropertiesItem] = useState<{ item: FileType | Folder; type: "file" | "folder" } | null>(null);
  const [folderUploadWarningOpen, setFolderUploadWarningOpen] = useState(false);
  const [excessFileWarningOpen, setExcessFileWarningOpen] = useState(false);
  const MAX_UPLOAD_FILES = 3;
  
  const [clipboardConversation, setClipboardConversation] = useState<{ conversation: Conversation; action: "cut" | "copy" } | null>(null);
  const [clipboardConversations, setClipboardConversations] = useState<{ conversations: Conversation[]; action: "cut" | "copy" } | null>(null);
  const [clipboardFolders, setClipboardFolders] = useState<{ folders: Folder[]; action: "cut" | "copy" } | null>(null);
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState("");
  const [originalRenameFolderValue, setOriginalRenameFolderValue] = useState("");
  const [renameConversationId, setRenameConversationId] = useState<string | null>(null);
  const [renameConversationValue, setRenameConversationValue] = useState("");
  const [originalRenameConversationValue, setOriginalRenameConversationValue] = useState("");
  const [deleteConversationDialogOpen, setDeleteConversationDialogOpen] = useState(false);
  const [deleteConversationId, setDeleteConversationId] = useState<string | null>(null);
  const [multiDeleteDialogOpen, setMultiDeleteDialogOpen] = useState(false);
  const [multiDeleteItems, setMultiDeleteItems] = useState<SelectedItems>({
    files: new Set(),
    folders: new Set(),
    conversations: new Set(),
  });
  const [iconSizeIndex, setIconSizeIndex] = useState(DEFAULT_ICON_SIZE_INDEX);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  
  // Multi-selection state
  const [selectedItems, setSelectedItems] = useState<SelectedItems>({
    files: new Set(),
    folders: new Set(),
    conversations: new Set(),
  });
  // Ref to hold stable selection state for drag operations (avoids timing issues)
  const selectedItemsRef = useRef<SelectedItems>(selectedItems);
  // Keep ref in sync with state
  useEffect(() => {
    selectedItemsRef.current = selectedItems;
  }, [selectedItems]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragThreshold = 5; // Pixels to move before starting selection
  const isPotentialDragRef = useRef(false);
  const dragStartPosRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const lastDndDragEndTimeRef = useRef<number>(0); // Track when last dnd drag ended
  const isDndDraggingRef = useRef(false); // Track if dnd drag is in progress
  
  // Context menu state - track which item's context menu is open
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuTarget, setContextMenuTarget] = useState<{
    type: "file" | "folder" | "conversation" | null;
    id: string | null;
  }>({ type: null, id: null });
  const contextMenuTriggerRef = useRef<HTMLDivElement>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  const iconSize = ICON_SIZES[iconSizeIndex];

  // DnD states for file/folder/conversation drag and drop
  const [dndDraggingFileIds, setDndDraggingFileIds] = useState<string[]>([]);
  const [dndDraggingFolderIds, setDndDraggingFolderIds] = useState<string[]>([]);
  const [dndDraggingConversationIds, setDndDraggingConversationIds] = useState<string[]>([]);
  const [dndOverFolderId, setDndOverFolderId] = useState<string | null>(null);

  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleWheelZoom = useCallback((e: WheelEvent) => {
    if (viewMode !== "largeIcons") return;
    
    e.preventDefault();
    e.stopPropagation();
    
    if (e.deltaY < 0) {
      setIconSizeIndex((prev) => Math.min(prev + 1, ICON_SIZES.length - 1));
    } else {
      setIconSizeIndex((prev) => Math.max(prev - 1, 0));
    }
  }, [viewMode]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || viewMode !== "largeIcons") return;

    container.addEventListener("wheel", handleWheelZoom, { passive: false, capture: true });
    return () => {
      container.removeEventListener("wheel", handleWheelZoom, { capture: true });
    };
  }, [viewMode, handleWheelZoom]);

  const { data: files = [] } = useQuery<FileType[]>({
    queryKey: ["/api/projects", selectedProjectId, "files"],
    queryFn: async () => {
      if (!selectedProjectId) return [];
      const response = await fetch(`/api/projects/${selectedProjectId}/files`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch files");
      return response.json();
    },
    enabled: !!selectedProjectId,
  });

  // Subscription data for storage limit checking
  interface SubscriptionData {
    subscription: { plan: string; stripeStatus: string | null };
    usage: { projects: number; conversations: number; aiQueries: number; storageGB: number };
    limits: { projects: number; conversations: number; aiQueries: number; storageGB: number };
  }

  const { data: subscriptionData } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
    staleTime: 60 * 1000,
  });

  const [storageLimitDialogOpen, setStorageLimitDialogOpen] = useState(false);

  const filteredFiles = files.filter((file) => {
    if (selectedFolderId) {
      return file.folderId === selectedFolderId;
    }
    return !file.folderId;
  });

  // Sort files based on sortBy and sortOrder
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "name":
        comparison = a.originalName.localeCompare(b.originalName);
        break;
      case "date":
        // Use updatedAt for "Date Modified" sorting
        const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : new Date(a.createdAt).getTime();
        const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : new Date(b.createdAt).getTime();
        comparison = aDate - bDate;
        break;
      case "type":
        comparison = getFileType(a.mimeType).localeCompare(getFileType(b.mimeType));
        break;
    }
    return sortOrder === "asc" ? comparison : -comparison;
  });

  const filteredFolders = folders.filter((folder) => {
    if (!selectedProjectId) return false;
    if (folder.projectId !== selectedProjectId) return false;
    if (selectedFolderId) {
      return folder.parentFolderId === selectedFolderId;
    }
    return !folder.parentFolderId;
  });

  const filteredConversations = conversations.filter((conv) => {
    if (!selectedProjectId) return false;
    if (conv.projectId !== selectedProjectId) return false;
    if (selectedFolderId) {
      return conv.folderId === selectedFolderId;
    }
    return !conv.folderId;
  });

  const currentFolder = selectedFolderId ? folders.find((f) => f.id === selectedFolderId) : null;

  const handleFolderDoubleClick = (folderId: string) => {
    if (onFolderNavigate && selectedProjectId) {
      onFolderNavigate(folderId, selectedProjectId);
    }
  };

  const handleConversationDoubleClick = (conversationId: string) => {
    // Double-click opens the conversation in chat panel
    if (onConversationSelect) {
      onConversationSelect(conversationId);
    }
  };

  const handleGoUp = () => {
    if (onFolderNavigate && currentFolder && selectedProjectId) {
      onFolderNavigate(currentFolder.parentFolderId || null, selectedProjectId);
    }
  };

  useEffect(() => {
    setSelectedItem(null);
    // Clear multi-selection when folder/project changes
    setSelectedItems({ files: new Set(), folders: new Set(), conversations: new Set() });
  }, [selectedProjectId, selectedFolderId]);

  // Helper to check if any items are multi-selected
  const hasMultiSelection = selectedItems.files.size + selectedItems.folders.size + selectedItems.conversations.size > 0;
  const multiSelectionCount = selectedItems.files.size + selectedItems.folders.size + selectedItems.conversations.size;

  // Helper to check if an item is in multi-selection
  const isItemMultiSelected = useCallback((type: "file" | "folder" | "conversation", id: string) => {
    if (type === "file") return selectedItems.files.has(id);
    if (type === "folder") return selectedItems.folders.has(id);
    return selectedItems.conversations.has(id);
  }, [selectedItems]);

  // Clear all selections
  const clearAllSelections = useCallback(() => {
    setSelectedItem(null);
    setSelectedItems({ files: new Set(), folders: new Set(), conversations: new Set() });
  }, []);

  // Toggle item in multi-selection (for Ctrl+click)
  const toggleItemSelection = useCallback((type: "file" | "folder" | "conversation", id: string) => {
    setSelectedItems(prev => {
      const key = type === "file" ? "files" : type === "folder" ? "folders" : "conversations";
      const newSet = new Set(prev[key]);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { ...prev, [key]: newSet };
    });
  }, []);

  // Get normalized selection rectangle for intersection calculation
  const getNormalizedRect = useCallback((rect: SelectionRect) => {
    return {
      left: Math.min(rect.startX, rect.endX),
      top: Math.min(rect.startY, rect.endY),
      right: Math.max(rect.startX, rect.endX),
      bottom: Math.max(rect.startY, rect.endY),
    };
  }, []);

  // Check if two rectangles intersect
  const rectsIntersect = useCallback((rect1: { left: number; top: number; right: number; bottom: number }, rect2: DOMRect) => {
    return !(
      rect1.right < rect2.left ||
      rect1.left > rect2.right ||
      rect1.bottom < rect2.top ||
      rect1.top > rect2.bottom
    );
  }, []);

  // Handle mouse down for rubber band selection
  const handleSelectionMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    
    // Ignore if drag just ended (prevent clearing selection on drop)
    const timeSinceLastDrag = Date.now() - lastDndDragEndTimeRef.current;
    if (isDndDraggingRef.current || timeSinceLastDrag < 300) {
      return;
    }
    
    const container = contentAreaRef.current;
    if (!container) return;

    const target = e.target as HTMLElement;
    const clickedOnItem = target.closest('[data-item-id]');
    
    // Store initial position for threshold check
    dragStartPosRef.current = { clientX: e.clientX, clientY: e.clientY };
    
    if (clickedOnItem) {
      // Mark as potential drag - will start selection if moved beyond threshold
      isPotentialDragRef.current = true;
    } else {
      // Clicking on empty space - start selection immediately
      isPotentialDragRef.current = false;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft;
      const y = e.clientY - rect.top + container.scrollTop;

      selectionStartRef.current = { x, y };
      setIsSelecting(true);
      setSelectionRect({ startX: x, startY: y, endX: x, endY: y });
      
      // Clear previous selections if not holding Ctrl/Cmd
      if (!e.ctrlKey && !e.metaKey) {
        clearAllSelections();
      }
    }
  }, [clearAllSelections]);

  // Calculate items within selection rectangle
  const calculateSelectedItems = useCallback((normalizedRect: { left: number; top: number; right: number; bottom: number }, container: HTMLDivElement, additive: boolean = false) => {
    const newFiles = new Set<string>();
    const newFolders = new Set<string>();
    const newConversations = new Set<string>();

    itemRefs.current.forEach((element, key) => {
      const itemRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      // Convert item rect to container-relative coordinates
      const relativeRect = new DOMRect(
        itemRect.left - containerRect.left + container.scrollLeft,
        itemRect.top - containerRect.top + container.scrollTop,
        itemRect.width,
        itemRect.height
      );

      if (rectsIntersect(normalizedRect, relativeRect)) {
        if (key.startsWith('file-')) {
          newFiles.add(key.replace('file-', ''));
        } else if (key.startsWith('folder-')) {
          newFolders.add(key.replace('folder-', ''));
        } else if (key.startsWith('conv-')) {
          newConversations.add(key.replace('conv-', ''));
        }
      }
    });

    setSelectedItems(prev => {
      if (additive) {
        // Merge with existing selection
        const mergedFiles = new Set(Array.from(prev.files).concat(Array.from(newFiles)));
        const mergedFolders = new Set(Array.from(prev.folders).concat(Array.from(newFolders)));
        const mergedConversations = new Set(Array.from(prev.conversations).concat(Array.from(newConversations)));
        return { files: mergedFiles, folders: mergedFolders, conversations: mergedConversations };
      }
      return { files: newFiles, folders: newFolders, conversations: newConversations };
    });
  }, [rectsIntersect]);

  // Handle mouse move for rubber band
  const handleSelectionMouseMove = useCallback((e: React.MouseEvent) => {
    const container = contentAreaRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();

    // Check if we should start selection after threshold
    if (isPotentialDragRef.current && dragStartPosRef.current) {
      const dx = Math.abs(e.clientX - dragStartPosRef.current.clientX);
      const dy = Math.abs(e.clientY - dragStartPosRef.current.clientY);
      
      if (dx > dragThreshold || dy > dragThreshold) {
        // Start selection from original position
        isPotentialDragRef.current = false;
        const startX = dragStartPosRef.current.clientX - containerRect.left + container.scrollLeft;
        const startY = dragStartPosRef.current.clientY - containerRect.top + container.scrollTop;
        const endX = e.clientX - containerRect.left + container.scrollLeft;
        const endY = e.clientY - containerRect.top + container.scrollTop;

        selectionStartRef.current = { x: startX, y: startY };
        const newRect = { startX, startY, endX, endY };
        setIsSelecting(true);
        setSelectionRect(newRect);
        
        // Clear previous selections if not holding Ctrl/Cmd
        const isAdditive = e.ctrlKey || e.metaKey;
        if (!isAdditive) {
          clearAllSelections();
        }
        
        // Immediately calculate selected items
        const normalizedRect = getNormalizedRect(newRect);
        calculateSelectedItems(normalizedRect, container, isAdditive);
      }
      return;
    }

    // Use ref for immediate check (state may not be updated yet)
    if (!selectionStartRef.current) return;

    const x = e.clientX - containerRect.left + container.scrollLeft;
    const y = e.clientY - containerRect.top + container.scrollTop;

    const newRect = { 
      startX: selectionStartRef.current.x, 
      startY: selectionStartRef.current.y, 
      endX: x, 
      endY: y 
    };
    setSelectionRect(newRect);

    // Calculate which items are within the selection rectangle
    const normalizedRect = getNormalizedRect(newRect);
    calculateSelectedItems(normalizedRect, container, e.ctrlKey || e.metaKey);
  }, [getNormalizedRect, clearAllSelections, calculateSelectedItems]);

  // Handle mouse up to finish selection
  const handleSelectionMouseUp = useCallback(() => {
    setIsSelecting(false);
    setSelectionRect(null);
    selectionStartRef.current = null;
    isPotentialDragRef.current = false;
    dragStartPosRef.current = null;
  }, []);

  // Global mouse up listener for when mouse leaves the container
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelecting || isPotentialDragRef.current) {
        setIsSelecting(false);
        setSelectionRect(null);
        selectionStartRef.current = null;
        isPotentialDragRef.current = false;
        dragStartPosRef.current = null;
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isSelecting]);

  const uploadFileMutation = useMutation({
    mutationFn: async ({ formData, projectId }: { formData: FormData; projectId: string }) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      try {
        const response = await fetch(`/api/projects/${projectId}/files`, {
          method: "POST",
          body: formData,
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error("Upload failed");
        return response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    },
  });

  const renameFileMutation = useMutation({
    mutationFn: async ({ id, name, projectId }: { id: string; name: string; projectId: string }) => {
      return await apiRequest("PATCH", `/api/files/${id}`, { originalName: name });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "files"] });
      toast({ title: t("fileViewer.fileRenamed") });
      setRenameFileId(null);
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      return await apiRequest("DELETE", `/api/files/${id}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trash"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      toast({ title: t("fileViewer.fileDeleted") });
      setDeleteDialogOpen(false);
      setDeleteFileId(null);
    },
  });

  const moveFileMutation = useMutation({
    mutationFn: async ({ id, folderId, targetProjectId, sourceProjectId }: { 
      id: string; 
      folderId: string | null; 
      targetProjectId?: string;
      sourceProjectId?: string;
    }) => {
      return await apiRequest("PATCH", `/api/files/${id}`, { folderId, targetProjectId });
    },
    onSuccess: (_data, variables) => {
      // Invalidate both source and target project file lists
      // targetProjectId = the destination project (may be different from selectedProjectId when moving to folder)
      const targetProject = variables.targetProjectId || selectedProjectId;
      const sourceProject = variables.sourceProjectId;
      
      // Always invalidate target project
      if (targetProject) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", targetProject, "files"] });
      }
      // Also invalidate source project if different
      if (sourceProject && sourceProject !== targetProject) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", sourceProject, "files"] });
      }
    },
  });

  const duplicateFileMutation = useMutation({
    mutationFn: async ({ id, targetProjectId, targetFolderId }: { 
      id: string; 
      targetProjectId?: string;
      targetFolderId?: string | null;
    }) => {
      return await apiRequest("POST", `/api/files/${id}/duplicate`, { targetProjectId, targetFolderId });
    },
    onSuccess: (_data, variables) => {
      // Invalidate the target project (where the file was duplicated to)
      const targetProject = variables.targetProjectId || selectedProjectId;
      if (targetProject) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", targetProject, "files"] });
      }
    },
  });

  const renameConversationMutation = useMutation({
    mutationFn: async ({ id, name, projectId }: { id: string; name: string; projectId: string }) => {
      return await apiRequest("PATCH", `/api/conversations/${id}`, { name });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "conversations"] });
      toast({ title: t("fileViewer.conversationRenamed") });
      setRenameConversationId(null);
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      return await apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trash"] });
      toast({ title: t("fileViewer.conversationDeleted") });
      setDeleteConversationDialogOpen(false);
      setDeleteConversationId(null);
    },
  });

  const moveConversationMutation = useMutation({
    mutationFn: async ({ id, folderId, projectId }: { id: string; folderId: string | null; projectId: string }) => {
      return await apiRequest("PATCH", `/api/conversations/${id}`, { folderId });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: t("fileViewer.conversationMoved") });
      setClipboardConversation(null);
    },
  });

  const moveFolderMutation = useMutation({
    mutationFn: async ({ id, parentFolderId, projectId, sourceProjectId }: { 
      id: string; 
      parentFolderId: string | null;
      projectId?: string;
      sourceProjectId?: string;
    }) => {
      return await apiRequest("PATCH", `/api/folders/${id}`, { parentFolderId, projectId });
    },
    onSuccess: (_data, variables) => {
      // Invalidate folder queries (this is global folders query)
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      
      // Determine target project: explicitly passed projectId or current selectedProjectId
      const targetProject = variables.projectId || selectedProjectId;
      const sourceProject = variables.sourceProjectId;
      
      // Always invalidate target project's data
      if (targetProject) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", targetProject, "conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", targetProject, "files"] });
      }
      // Also invalidate source project if different
      if (sourceProject && sourceProject !== targetProject) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", sourceProject, "conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", sourceProject, "files"] });
      }
      setClipboardFolders(null);
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async ({ name, projectId, parentFolderId }: { 
      name: string;
      projectId: string;
      parentFolderId: string | null;
    }) => {
      return await apiRequest("POST", `/api/folders`, { name, projectId, parentFolderId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setClipboardFolders(null);
    },
  });

  const renameFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return await apiRequest("PATCH", `/api/folders/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setRenameFolderId(null);
      setRenameFolderValue("");
      toast({ title: t("fileViewer.folderRenamed") });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      return await apiRequest("DELETE", `/api/folders/${id}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trash"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      toast({ title: t("fileViewer.folderDeleted") });
    },
  });

  // DnD handlers for file/folder/conversation drag and drop
  const handleDndDragStart = useCallback((event: DragStartEvent) => {
    const activeId = event.active.id as string;
    isDndDraggingRef.current = true; // Mark drag as in progress
    
    // Use ref for stable selection state (avoids timing issues with React state updates)
    const currentSelection = selectedItemsRef.current;
    
    // Handle file drag
    if (activeId.startsWith("draggable-file-")) {
      const fileId = activeId.replace("draggable-file-", "");
      // Check multi-selection first using ref for stability
      if (currentSelection.files.size > 0 && currentSelection.files.has(fileId)) {
        setDndDraggingFileIds(Array.from(currentSelection.files));
      } else {
        // Single file drag
        setDndDraggingFileIds([fileId]);
      }
      return;
    }
    
    // Handle folder drag
    if (activeId.startsWith("draggable-folder-")) {
      const folderId = activeId.replace("draggable-folder-", "");
      if (currentSelection.folders.size > 0 && currentSelection.folders.has(folderId)) {
        setDndDraggingFolderIds(Array.from(currentSelection.folders));
      } else {
        setDndDraggingFolderIds([folderId]);
      }
      return;
    }
    
    // Handle conversation drag
    if (activeId.startsWith("draggable-conversation-")) {
      const conversationId = activeId.replace("draggable-conversation-", "");
      if (currentSelection.conversations.size > 0 && currentSelection.conversations.has(conversationId)) {
        setDndDraggingConversationIds(Array.from(currentSelection.conversations));
      } else {
        setDndDraggingConversationIds([conversationId]);
      }
      return;
    }
  }, []); // No dependencies needed - using ref for stable access

  const handleDndDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    if (overId && overId.startsWith("droppable-folder-")) {
      setDndOverFolderId(overId.replace("droppable-folder-", ""));
    } else {
      setDndOverFolderId(null);
    }
  }, []);

  const handleDndDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    // Capture dragging IDs before resetting (critical for multi-item move)
    const fileIdsToMove = [...dndDraggingFileIds];
    const folderIdsToMove = [...dndDraggingFolderIds];
    const conversationIdsToMove = [...dndDraggingConversationIds];
    
    // Reset all drag states
    setDndDraggingFileIds([]);
    setDndDraggingFolderIds([]);
    setDndDraggingConversationIds([]);
    setDndOverFolderId(null);
    
    // Record when drag ended to ignore click events shortly after
    lastDndDragEndTimeRef.current = Date.now();
    isDndDraggingRef.current = false; // Mark drag as ended
    
    const activeId = String(active.id);
    
    // No drop target or no project selected - cancel drag, keep selection
    if (!over || !selectedProjectId) {
      // Keep selection intact when drag is cancelled
      return;
    }
    
    const overId = String(over.id);
    
    // Must drop on a folder - keep selection if dropped elsewhere
    if (!overId.startsWith("droppable-folder-")) {
      // Keep selection intact when not dropped on a valid folder
      return;
    }
    
    const targetFolderId = overId.replace("droppable-folder-", "");
    
    // Handle file drag
    if (activeId.startsWith("draggable-file-") && fileIdsToMove.length > 0) {
      const filesToMove = files.filter(f => fileIdsToMove.includes(f.id));
      const allAlreadyInFolder = filesToMove.every(f => f.folderId === targetFolderId);
      if (allAlreadyInFolder) {
        // Already in target folder, keep selection
        return;
      }
      
      Promise.all(
        fileIdsToMove.map(fileId => 
          moveFileMutation.mutateAsync({
            id: fileId,
            folderId: targetFolderId,
            sourceProjectId: selectedProjectId,
          })
        )
      ).then(() => {
        clearAllSelections();
        toast({ 
          title: fileIdsToMove.length > 1 
            ? t("fileViewer.multipleFilesMoved", { count: fileIdsToMove.length }) 
            : t("fileViewer.fileMoved") 
        });
      }).catch(() => {
        toast({ title: t("fileViewer.multiDeleteFailed"), variant: "destructive" });
      });
      return;
    }
    
    // Handle folder drag
    if (activeId.startsWith("draggable-folder-") && folderIdsToMove.length > 0) {
      // Don't allow dropping a folder into itself or its descendants
      const targetIsDescendant = folderIdsToMove.includes(targetFolderId);
      if (targetIsDescendant) {
        // Keep selection, just show error
        toast({ title: t("fileViewer.cannotMoveToDescendant"), variant: "destructive" });
        return;
      }
      
      const foldersToMove = folders.filter(f => folderIdsToMove.includes(f.id));
      const allAlreadyInFolder = foldersToMove.every(f => f.parentFolderId === targetFolderId);
      if (allAlreadyInFolder) {
        // Already in target folder, keep selection
        return;
      }
      
      Promise.all(
        folderIdsToMove.map(folderId => 
          moveFolderMutation.mutateAsync({
            id: folderId,
            parentFolderId: targetFolderId,
            sourceProjectId: selectedProjectId,
          })
        )
      ).then(() => {
        clearAllSelections();
        toast({ 
          title: folderIdsToMove.length > 1 
            ? t("fileViewer.multipleFoldersMoved", { count: folderIdsToMove.length }) 
            : t("fileViewer.folderMoved") 
        });
      }).catch(() => {
        toast({ title: t("fileViewer.multiDeleteFailed"), variant: "destructive" });
      });
      return;
    }
    
    // Handle conversation drag
    if (activeId.startsWith("draggable-conversation-") && conversationIdsToMove.length > 0) {
      const convsToMove = conversations.filter(c => conversationIdsToMove.includes(c.id));
      const allAlreadyInFolder = convsToMove.every(c => c.folderId === targetFolderId);
      if (allAlreadyInFolder) {
        // Already in target folder, keep selection
        return;
      }
      
      Promise.all(
        conversationIdsToMove.map(convId => 
          moveConversationMutation.mutateAsync({
            id: convId,
            folderId: targetFolderId,
            projectId: selectedProjectId,
          })
        )
      ).then(() => {
        clearAllSelections();
        toast({ 
          title: conversationIdsToMove.length > 1 
            ? t("fileViewer.multipleConversationsMoved", { count: conversationIdsToMove.length }) 
            : t("fileViewer.conversationMoved") 
        });
      }).catch(() => {
        toast({ title: t("fileViewer.multiDeleteFailed"), variant: "destructive" });
      });
      return;
    }
    
    // No matching drag type, keep selection
  }, [selectedProjectId, files, folders, conversations, moveFileMutation, moveFolderMutation, moveConversationMutation, toast, t, clearAllSelections, dndDraggingFileIds, dndDraggingFolderIds, dndDraggingConversationIds]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    // Use Array.from for cross-browser compatibility (DOMStringList doesn't have .includes in Firefox)
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const uploadWithRetry = useCallback(async (file: File, projectId: string, folderId: string | null, maxRetries: number = 3) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectId", projectId);
        if (folderId) {
          formData.append("folderId", folderId);
        }
        await uploadFileMutation.mutateAsync({ formData, projectId });
        return { success: true, fileName: file.name };
      } catch (error) {
        if (attempt === maxRetries - 1) {
          return { success: false, fileName: file.name, error };
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    return { success: false, fileName: file.name };
  }, [uploadFileMutation]);

  const uploadFilesWithConcurrencyLimit = useCallback(async (files: File[], projectId: string, folderId: string | null, concurrencyLimit: number = 3) => {
    const results: { success: boolean; fileName: string }[] = [];
    
    for (let i = 0; i < files.length; i += concurrencyLimit) {
      const batch = files.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(
        batch.map(file => uploadWithRetry(file, projectId, folderId))
      );
      results.push(...batchResults);
    }
    
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      toast({ 
        title: t("fileViewer.someUploadsFailed", { count: failures.length }), 
        variant: "destructive" 
      });
    } else if (results.length > 1) {
      toast({ title: t("fileViewer.allUploadsSuccess", { count: results.length }) });
    } else if (results.length === 1 && results[0].success) {
      toast({ title: t("fileViewer.uploadSuccess") });
    }
    
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "files"] });
    queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
  }, [uploadWithRetry, toast, t, queryClient]);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      if (!selectedProjectId) return;

      // Check for folder uploads using webkitGetAsEntry API (Chrome/Edge/Safari)
      const items = e.dataTransfer.items;
      let folderDetected = false;
      
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (entry?.isDirectory) {
            folderDetected = true;
            break;
          }
        }
      }

      // Fallback detection for Firefox and other browsers:
      // Check if any file has webkitRelativePath (indicates folder upload from input element)
      // or detect potential folder by checking DataTransferItem properties
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (!folderDetected && items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file') {
            // Firefox: folders appear as application/x-moz-file type
            if (item.type === 'application/x-moz-file') {
              folderDetected = true;
              break;
            }
            // In some browsers, folder items have kind='file' but getAsFile() returns null
            const file = item.getAsFile();
            if (!file) {
              folderDetected = true;
              break;
            }
          }
        }
      }
      
      // Additional check: if webkitRelativePath contains path separator
      if (!folderDetected) {
        for (const file of droppedFiles) {
          if (file.webkitRelativePath && file.webkitRelativePath.includes('/')) {
            folderDetected = true;
            break;
          }
        }
      }

      // Firefox fallback: If "Files" type exists but no actual files, likely a folder
      // Use Array.from() for cross-browser compatibility (DOMStringList doesn't have .includes in Firefox)
      const hasFilesType = Array.from(e.dataTransfer.types).includes('Files');
      if (!folderDetected && hasFilesType && droppedFiles.length === 0) {
        setFolderUploadWarningOpen(true);
        return;
      }

      if (folderDetected) {
        setFolderUploadWarningOpen(true);
        return;
      }

      if (droppedFiles.length === 0) return;

      // Check if more than MAX_UPLOAD_FILES files are being uploaded
      if (droppedFiles.length > MAX_UPLOAD_FILES) {
        setExcessFileWarningOpen(true);
        return;
      }

      // Check storage limit (skip for unlimited plans where limit is -1)
      const currentStorageGB = subscriptionData?.usage?.storageGB ?? 0;
      const storageLimit = subscriptionData?.limits?.storageGB ?? 10;
      const totalUploadSizeGB = droppedFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024 * 1024);
      if (storageLimit > 0 && currentStorageGB + totalUploadSizeGB > storageLimit) {
        setStorageLimitDialogOpen(true);
        return;
      }

      setIsUploading(true);
      const currentProjectId = selectedProjectId;
      try {
        await uploadFilesWithConcurrencyLimit(droppedFiles, currentProjectId, selectedFolderId);
      } finally {
        setIsUploading(false);
      }
    },
    [selectedProjectId, selectedFolderId, uploadFilesWithConcurrencyLimit, toast, t, subscriptionData]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedProjectId || !e.target.files) return;

      const selectedFiles = Array.from(e.target.files);
      if (selectedFiles.length === 0) return;

      // Check if more than MAX_UPLOAD_FILES files are being uploaded
      if (selectedFiles.length > MAX_UPLOAD_FILES) {
        setExcessFileWarningOpen(true);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      // Check storage limit (skip for unlimited plans where limit is -1)
      const currentStorageGB = subscriptionData?.usage?.storageGB ?? 0;
      const storageLimit = subscriptionData?.limits?.storageGB ?? 10;
      const totalUploadSizeGB = selectedFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024 * 1024);
      if (storageLimit > 0 && currentStorageGB + totalUploadSizeGB > storageLimit) {
        setStorageLimitDialogOpen(true);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      setIsUploading(true);
      const currentProjectId = selectedProjectId;
      try {
        await uploadFilesWithConcurrencyLimit(selectedFiles, currentProjectId, selectedFolderId);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [selectedProjectId, selectedFolderId, uploadFilesWithConcurrencyLimit, subscriptionData]
  );

  const handleCut = (file: FileType) => {
    setClipboardFiles({ files: [file], action: "cut" });
    toast({ title: t("fileViewer.fileCut") });
  };

  const handleCopy = (file: FileType) => {
    setClipboardFiles({ files: [file], action: "copy" });
    toast({ title: t("fileViewer.fileCopied") });
  };

  // Multi-selection handlers
  const handleMultiCut = () => {
    const fileIds = Array.from(selectedItems.files);
    const files = filteredFiles.filter(f => fileIds.includes(f.id));
    if (files.length > 0) {
      setClipboardFiles({ files, action: "cut" });
      toast({ title: t("fileViewer.multipleFilesCut", { count: files.length }) });
    }
  };

  const handleMultiCopy = () => {
    const fileIds = Array.from(selectedItems.files);
    const files = filteredFiles.filter(f => fileIds.includes(f.id));
    if (files.length > 0) {
      setClipboardFiles({ files, action: "copy" });
      toast({ title: t("fileViewer.multipleFilesCopied", { count: files.length }) });
    }
  };

  // Multi-selection folder handlers
  const handleMultiFolderCut = () => {
    const folderIds = Array.from(selectedItems.folders);
    const selectedFolders = filteredFolders.filter(f => folderIds.includes(f.id));
    if (selectedFolders.length > 0) {
      setClipboardFolders({ folders: selectedFolders, action: "cut" });
      setClipboardFiles(null);
      setClipboardConversation(null);
      toast({ title: t("fileViewer.multipleFilesCut", { count: selectedFolders.length }) });
    }
  };

  const handleMultiFolderCopy = () => {
    const folderIds = Array.from(selectedItems.folders);
    const selectedFolders = filteredFolders.filter(f => folderIds.includes(f.id));
    if (selectedFolders.length > 0) {
      setClipboardFolders({ folders: selectedFolders, action: "copy" });
      setClipboardFiles(null);
      setClipboardConversation(null);
      toast({ title: t("fileViewer.multipleFoldersCopied", { count: selectedFolders.length }) });
    }
  };

  // Multi-selection conversation handlers
  const handleMultiConversationCut = () => {
    const convIds = Array.from(selectedItems.conversations);
    const selectedConvs = filteredConversations.filter(c => convIds.includes(c.id));
    if (selectedConvs.length > 0) {
      // Store in a new clipboard state for conversations
      setClipboardConversations({ conversations: selectedConvs, action: "cut" });
      setClipboardFiles(null);
      setClipboardFolders(null);
      toast({ title: t("fileViewer.multipleFilesCut", { count: selectedConvs.length }) });
    }
  };

  const handleMultiConversationCopy = () => {
    const convIds = Array.from(selectedItems.conversations);
    const selectedConvs = filteredConversations.filter(c => convIds.includes(c.id));
    if (selectedConvs.length > 0) {
      setClipboardConversations({ conversations: selectedConvs, action: "copy" });
      setClipboardFiles(null);
      setClipboardFolders(null);
      toast({ title: t("fileViewer.multipleConversationsCopied", { count: selectedConvs.length }) });
    }
  };

  // Folder cut/copy/paste handlers
  const handleCutFolder = (folder: Folder) => {
    setClipboardFolders({ folders: [folder], action: "cut" });
    setClipboardFiles(null);
    setClipboardConversation(null);
    toast({ title: t("fileViewer.folderCut") });
  };

  const handleCopyFolder = (folder: Folder) => {
    setClipboardFolders({ folders: [folder], action: "copy" });
    setClipboardFiles(null);
    setClipboardConversation(null);
    toast({ title: t("fileViewer.folderCopied") });
  };

  const handlePasteFolder = async () => {
    if (!clipboardFolders || clipboardFolders.folders.length === 0 || !selectedProjectId) return;
    
    if (clipboardFolders.action === "cut") {
      const count = clipboardFolders.folders.length;
      for (const folder of clipboardFolders.folders) {
        // Prevent moving folder into itself or its descendants
        if (selectedFolderId === folder.id) {
          toast({ title: t("fileViewer.cannotMoveIntoSelf"), variant: "destructive" });
          return;
        }
        const isCrossProject = folder.projectId !== selectedProjectId;
        await moveFolderMutation.mutateAsync({
          id: folder.id,
          parentFolderId: selectedFolderId,
          projectId: isCrossProject ? selectedProjectId : undefined,
          sourceProjectId: folder.projectId
        });
      }
      toast({ title: count === 1 ? t("fileViewer.folderMoved") : t("fileViewer.multipleFoldersMoved", { count }) });
    } else if (clipboardFolders.action === "copy") {
      const count = clipboardFolders.folders.length;
      for (const folder of clipboardFolders.folders) {
        await createFolderMutation.mutateAsync({
          name: `${folder.name} (Copy)`,
          projectId: selectedProjectId,
          parentFolderId: selectedFolderId
        });
      }
      toast({ title: count === 1 ? t("fileViewer.folderCopied") : t("fileViewer.multipleFoldersCopied", { count }) });
    }
  };

  const handleMultiDelete = () => {
    // Capture the current selection before opening the dialog
    setMultiDeleteItems({
      files: new Set(selectedItems.files),
      folders: new Set(selectedItems.folders),
      conversations: new Set(selectedItems.conversations),
    });
    setContextMenuOpen(false);
    setMultiDeleteDialogOpen(true);
  };

  // Shared context menu handler
  const handleItemContextMenu = useCallback((
    e: React.MouseEvent, 
    type: "file" | "folder" | "conversation", 
    id: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    // If this item is not in multi-selection, select it
    const isInMultiSelection = 
      (type === "file" && selectedItems.files.has(id)) ||
      (type === "folder" && selectedItems.folders.has(id)) ||
      (type === "conversation" && selectedItems.conversations.has(id));
    
    if (!isInMultiSelection) {
      clearAllSelections();
      setSelectedItem({ type, id });
    }
    
    setContextMenuTarget({ type, id });
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuOpen(true);
  }, [selectedItems, clearAllSelections]);

  // Empty space context menu handler (for paste)
  const handleEmptySpaceContextMenu = useCallback((e: React.MouseEvent) => {
    // Check if clicked on an item - if so, let the item handler take over
    const target = e.target as HTMLElement;
    if (target.closest('[data-item-id]')) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    clearAllSelections();
    setContextMenuTarget({ type: null, id: null });
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuOpen(true);
  }, [clearAllSelections]);

  const confirmMultiDelete = async () => {
    if (!selectedProjectId) return;
    
    const totalCount = multiDeleteItems.files.size + multiDeleteItems.folders.size + multiDeleteItems.conversations.size;
    let successCount = 0;
    let failCount = 0;
    
    try {
      // Delete all selected files
      const fileIds = Array.from(multiDeleteItems.files);
      for (const fileId of fileIds) {
        try {
          await deleteFileMutation.mutateAsync({ id: fileId, projectId: selectedProjectId });
          successCount++;
        } catch {
          failCount++;
        }
      }
      // Delete all selected folders
      const folderIds = Array.from(multiDeleteItems.folders);
      for (const folderId of folderIds) {
        try {
          await deleteFolderMutation.mutateAsync({ id: folderId, projectId: selectedProjectId });
          successCount++;
        } catch {
          failCount++;
        }
      }
      // Delete all selected conversations
      const convIds = Array.from(multiDeleteItems.conversations);
      for (const convId of convIds) {
        try {
          await deleteConversationMutation.mutateAsync({ id: convId, projectId: selectedProjectId });
          successCount++;
        } catch {
          failCount++;
        }
      }
      
      // Show appropriate toast
      if (failCount === 0) {
        toast({ title: t("fileViewer.multiDeleteSuccess", { count: successCount }) });
      } else if (successCount > 0) {
        toast({ 
          title: t("fileViewer.multiDeletePartial", { success: successCount, fail: failCount }),
          variant: "destructive" 
        });
      } else {
        toast({ title: t("fileViewer.multiDeleteFailed"), variant: "destructive" });
      }
    } finally {
      setMultiDeleteDialogOpen(false);
      setMultiDeleteItems({ files: new Set(), folders: new Set(), conversations: new Set() });
      clearAllSelections();
    }
  };

  const handlePaste = async () => {
    if (!clipboardFiles || clipboardFiles.files.length === 0) return;
    
    if (clipboardFiles.action === "cut") {
      const count = clipboardFiles.files.length;
      for (const file of clipboardFiles.files) {
        // Pass targetProjectId when moving to project root of a different project
        const isCrossProject = selectedProjectId && file.projectId !== selectedProjectId;
        await moveFileMutation.mutateAsync({ 
          id: file.id, 
          folderId: selectedFolderId,
          targetProjectId: isCrossProject ? selectedProjectId : undefined,
          sourceProjectId: file.projectId
        });
      }
      setClipboardFiles(null);
      toast({ title: count === 1 ? t("fileViewer.fileMoved") : t("fileViewer.multipleFilesMoved", { count }) });
    } else if (clipboardFiles.action === "copy") {
      const count = clipboardFiles.files.length;
      for (const file of clipboardFiles.files) {
        await duplicateFileMutation.mutateAsync({ 
          id: file.id, 
          targetProjectId: selectedProjectId || undefined,
          targetFolderId: selectedFolderId
        });
      }
      setClipboardFiles(null);
      toast({ title: count === 1 ? t("fileViewer.fileCopied") : t("fileViewer.multipleFilesCopied", { count }) });
    }
  };

  // Paste files to a specific folder (for folder context menu)
  const handlePasteToFolder = async (targetFolderId: string) => {
    if (!clipboardFiles || clipboardFiles.files.length === 0 || !selectedProjectId) return;
    
    if (clipboardFiles.action === "cut") {
      const count = clipboardFiles.files.length;
      for (const file of clipboardFiles.files) {
        const isCrossProject = file.projectId !== selectedProjectId;
        await moveFileMutation.mutateAsync({ 
          id: file.id, 
          folderId: targetFolderId,
          targetProjectId: isCrossProject ? selectedProjectId : undefined,
          sourceProjectId: file.projectId
        });
      }
      setClipboardFiles(null);
      toast({ title: count === 1 ? t("fileViewer.fileMoved") : t("fileViewer.multipleFilesMoved", { count }) });
    } else if (clipboardFiles.action === "copy") {
      const count = clipboardFiles.files.length;
      for (const file of clipboardFiles.files) {
        await duplicateFileMutation.mutateAsync({ 
          id: file.id, 
          targetProjectId: selectedProjectId,
          targetFolderId: targetFolderId
        });
      }
      setClipboardFiles(null);
      toast({ title: count === 1 ? t("fileViewer.fileCopied") : t("fileViewer.multipleFilesCopied", { count }) });
    }
  };

  // Keyboard shortcut handler for file operations (Delete, Ctrl+C, Ctrl+X, Ctrl+V)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      
      // Only trigger if focus is within the file viewer area or body
      const contentArea = contentAreaRef.current;
      if (!contentArea || (!contentArea.contains(document.activeElement) && document.activeElement !== document.body)) {
        return;
      }

      const hasMultiSelection = selectedItems.files.size > 0 || 
                                selectedItems.folders.size > 0 || 
                                selectedItems.conversations.size > 0;
      const hasSingleSelection = selectedItem !== null;

      // Ctrl+C: Copy
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (hasMultiSelection && selectedItems.files.size > 0) {
          e.preventDefault();
          const fileIds = Array.from(selectedItems.files);
          const filesToCopy = sortedFiles.filter(f => fileIds.includes(f.id));
          if (filesToCopy.length > 0) {
            setClipboardFiles({ files: filesToCopy, action: "copy" });
            toast({ title: t("fileViewer.multipleFilesCopied", { count: filesToCopy.length }) });
          }
        } else if (hasSingleSelection && selectedItem?.type === "file") {
          e.preventDefault();
          const file = sortedFiles.find(f => f.id === selectedItem.id);
          if (file) {
            setClipboardFiles({ files: [file], action: "copy" });
            toast({ title: t("fileViewer.fileCopied") });
          }
        }
        return;
      }

      // Ctrl+X: Cut
      if ((e.ctrlKey || e.metaKey) && e.key === "x") {
        if (hasMultiSelection && selectedItems.files.size > 0) {
          e.preventDefault();
          const fileIds = Array.from(selectedItems.files);
          const filesToCut = sortedFiles.filter(f => fileIds.includes(f.id));
          if (filesToCut.length > 0) {
            setClipboardFiles({ files: filesToCut, action: "cut" });
            toast({ title: t("fileViewer.multipleFilesCut", { count: filesToCut.length }) });
          }
        } else if (hasSingleSelection && selectedItem?.type === "file") {
          e.preventDefault();
          const file = sortedFiles.find(f => f.id === selectedItem.id);
          if (file) {
            setClipboardFiles({ files: [file], action: "cut" });
            toast({ title: t("fileViewer.fileCut") });
          }
        }
        return;
      }

      // Ctrl+V: Paste
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (clipboardFiles && clipboardFiles.files.length > 0 && selectedProjectId) {
          e.preventDefault();
          handlePaste();
        }
        return;
      }
      
      // Delete or Backspace: Delete selected items
      if (e.key === "Delete" || e.key === "Backspace") {
        if (hasMultiSelection) {
          e.preventDefault();
          setMultiDeleteItems({
            files: new Set(selectedItems.files),
            folders: new Set(selectedItems.folders),
            conversations: new Set(selectedItems.conversations),
          });
          setMultiDeleteDialogOpen(true);
        } else if (hasSingleSelection && selectedItem) {
          e.preventDefault();
          if (selectedItem.type === "file") {
            setDeleteFileId(selectedItem.id);
            setDeleteDialogOpen(true);
          } else if (selectedItem.type === "folder") {
            setMultiDeleteItems({
              files: new Set(),
              folders: new Set([selectedItem.id]),
              conversations: new Set(),
            });
            setMultiDeleteDialogOpen(true);
          } else if (selectedItem.type === "conversation") {
            setDeleteConversationId(selectedItem.id);
            setDeleteConversationDialogOpen(true);
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedItems, selectedItem, clipboardFiles, selectedProjectId, sortedFiles, t, toast, handlePaste]);

  const handleRename = (file: FileType) => {
    setRenameFileId(file.id);
    setRenameValue(file.originalName);
    setOriginalRenameValue(file.originalName);
  };

  const handleRenameSubmit = () => {
    if (renameFileId && renameValue.trim() && selectedProjectId && renameValue.trim() !== originalRenameValue) {
      renameFileMutation.mutate({ id: renameFileId, name: renameValue.trim(), projectId: selectedProjectId });
    } else {
      setRenameFileId(null);
    }
  };

  const isTextFile = (file: FileType) => {
    const textMimeTypes = [
      "text/plain",
      "text/markdown",
      "text/html",
      "text/css",
      "text/javascript",
      "text/csv",
      "application/json",
      "application/xml",
      "text/xml",
    ];
    const textExtensions = [".txt", ".md", ".json", ".js", ".ts", ".jsx", ".tsx", ".css", ".html", ".xml", ".csv", ".yaml", ".yml", ".env", ".log"];
    const mimeMatch = textMimeTypes.some(t => file.mimeType?.startsWith(t));
    const extMatch = textExtensions.some(ext => file.originalName.toLowerCase().endsWith(ext));
    return mimeMatch || extMatch;
  };

  const isPdfFile = (file: FileType) => {
    return file.mimeType === "application/pdf" || file.originalName.toLowerCase().endsWith(".pdf");
  };

  const isOfficeFile = (file: FileType) => {
    const officeTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const officeExtensions = [".xls", ".xlsx", ".ppt", ".pptx", ".doc", ".docx"];
    const mimeMatch = officeTypes.includes(file.mimeType || "");
    const extMatch = officeExtensions.some(ext => file.originalName.toLowerCase().endsWith(ext));
    return mimeMatch || extMatch;
  };

  const handleOpenFile = (file: FileType) => {
    if (isTextFile(file)) {
      setEditorFile(file);
      setEditorOpen(true);
    } else if (isPdfFile(file)) {
      window.open(`/api/files/${file.id}/view`, "_blank");
    } else if (isOfficeFile(file)) {
      setOfficeDialogFile(file);
      setOfficeFileDialogOpen(true);
    } else {
      setPreviewFile(file);
    }
  };

  const handleOfficeDownload = () => {
    if (officeDialogFile) {
      window.open(`/api/files/${officeDialogFile.id}/download`, "_blank");
      setOfficeFileDialogOpen(false);
      setOfficeDialogFile(null);
    }
  };

  const handleOfficeGoogleEdit = () => {
    if (officeDialogFile) {
      setGoogleDriveFile(officeDialogFile);
      setGoogleDriveEditorOpen(true);
      setOfficeFileDialogOpen(false);
      setOfficeDialogFile(null);
    }
  };

  const handleDelete = (file: FileType) => {
    setDeleteFileId(file.id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deleteFileId && selectedProjectId) {
      deleteFileMutation.mutate({ id: deleteFileId, projectId: selectedProjectId });
    }
  };

  const handleAttachToChat = (file: FileType) => {
    if (onAttachFile) {
      onAttachFile(file);
      toast({ title: t("fileViewer.fileAttached") });
    }
  };

  const handleCutConversation = (conv: Conversation) => {
    setClipboardConversation({ conversation: conv, action: "cut" });
    toast({ title: t("fileViewer.conversationCut") });
  };

  const handleCopyConversation = (conv: Conversation) => {
    setClipboardConversation({ conversation: conv, action: "copy" });
    toast({ title: t("fileViewer.conversationCopied") });
  };

  const handlePasteConversation = () => {
    if (!clipboardConversation) return;
    
    if (clipboardConversation.action === "cut" && selectedProjectId) {
      moveConversationMutation.mutate({ 
        id: clipboardConversation.conversation.id, 
        folderId: selectedFolderId,
        projectId: selectedProjectId
      }, {
        onSuccess: () => {
          setClipboardConversation(null);
          toast({ title: t("fileViewer.conversationMoved") });
        }
      });
    } else if (clipboardConversation.action === "copy") {
      toast({ 
        title: t("fileViewer.copyNotSupported"),
        variant: "destructive" 
      });
    }
  };

  // Multi-conversation paste handler
  const handlePasteConversations = async () => {
    if (!clipboardConversations || clipboardConversations.conversations.length === 0 || !selectedProjectId) return;
    
    if (clipboardConversations.action === "cut") {
      const count = clipboardConversations.conversations.length;
      for (const conv of clipboardConversations.conversations) {
        await moveConversationMutation.mutateAsync({
          id: conv.id,
          folderId: selectedFolderId,
          projectId: selectedProjectId
        });
      }
      setClipboardConversations(null);
      toast({ title: count === 1 ? t("fileViewer.conversationMoved") : t("fileViewer.multipleConversationsMoved", { count }) });
    } else if (clipboardConversations.action === "copy") {
      toast({ 
        title: t("fileViewer.copyNotSupported"),
        variant: "destructive" 
      });
    }
  };

  const handleRenameConversation = (conv: Conversation) => {
    setRenameConversationId(conv.id);
    setRenameConversationValue(conv.name);
    setOriginalRenameConversationValue(conv.name);
  };

  const handleRenameConversationSubmit = () => {
    if (renameConversationId && renameConversationValue.trim() && selectedProjectId && renameConversationValue.trim() !== originalRenameConversationValue) {
      renameConversationMutation.mutate({ 
        id: renameConversationId, 
        name: renameConversationValue.trim(),
        projectId: selectedProjectId
      });
    } else {
      setRenameConversationId(null);
    }
  };

  const handleDeleteConversation = (conv: Conversation) => {
    setDeleteConversationId(conv.id);
    setDeleteConversationDialogOpen(true);
  };

  const confirmDeleteConversation = () => {
    if (deleteConversationId && selectedProjectId) {
      deleteConversationMutation.mutate({ id: deleteConversationId, projectId: selectedProjectId });
    }
  };

  const handleConversationSettings = (conv: Conversation) => {
    if (onConversationSettings) {
      onConversationSettings(conv.id);
    }
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  const handleFolderRenameSubmit = () => {
    if (renameFolderId && renameFolderValue.trim() && renameFolderValue.trim() !== originalRenameFolderValue) {
      renameFolderMutation.mutate({ id: renameFolderId, name: renameFolderValue.trim() });
    } else {
      setRenameFolderId(null);
    }
  };

  const renderFolder = (folder: Folder) => {
    const isSelected = selectedItem?.type === "folder" && selectedItem.id === folder.id;
    const isMultiSelected = isItemMultiSelected("folder", folder.id);
    const labelWidth = Math.max(80, iconSize);
    const isRenaming = renameFolderId === folder.id;

    if (viewMode === "largeIcons") {
      return (
        <div
          ref={(el) => {
            if (el) itemRefs.current.set(`folder-${folder.id}`, el);
            else itemRefs.current.delete(`folder-${folder.id}`);
          }}
          className={`flex flex-col items-center p-2 rounded-lg cursor-pointer transition-all duration-150 ${
            isSelected || isMultiSelected ? "bg-blue-500/20 ring-2 ring-blue-500" : "hover-elevate"
          }`}
          style={{ width: labelWidth + 16 }}
          onClick={(e) => handleFolderClick(e, folder)}
          onDoubleClick={() => handleFolderDoubleClick(folder.id)}
          data-testid={`folder-item-${folder.id}`}
          data-item-id={`folder-${folder.id}`}
        >
          <FolderIcon 
            className="text-amber-500 mb-1 transition-all duration-150" 
            style={{ width: iconSize * 0.75, height: iconSize * 0.75 }}
          />
          {isRenaming ? (
            <Input
              value={renameFolderValue}
              onChange={(e) => setRenameFolderValue(e.target.value)}
              onBlur={handleFolderRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFolderRenameSubmit();
                if (e.key === "Escape") setRenameFolderId(null);
              }}
              className="h-6 text-xs text-center"
              style={{ width: labelWidth }}
              autoFocus
              data-testid="input-rename-folder"
            />
          ) : (
            <span 
              className="text-xs text-center line-clamp-2 leading-tight" 
              style={{ width: labelWidth }}
              title={folder.name}
            >
              {folder.name}
            </span>
          )}
        </div>
      );
    }

    if (viewMode === "list") {
      return (
        <div
          ref={(el) => {
            if (el) itemRefs.current.set(`folder-${folder.id}`, el);
            else itemRefs.current.delete(`folder-${folder.id}`);
          }}
          className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer ${
            isSelected || isMultiSelected ? "bg-blue-500/20 ring-1 ring-blue-500" : "hover-elevate"
          }`}
          onClick={(e) => handleFolderClick(e, folder)}
          onDoubleClick={() => handleFolderDoubleClick(folder.id)}
          data-testid={`folder-item-${folder.id}`}
          data-item-id={`folder-${folder.id}`}
        >
          <FolderIcon className="h-4 w-4 text-amber-500 flex-shrink-0" />
          {isRenaming ? (
            <Input
              value={renameFolderValue}
              onChange={(e) => setRenameFolderValue(e.target.value)}
              onBlur={handleFolderRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFolderRenameSubmit();
                if (e.key === "Escape") setRenameFolderId(null);
              }}
              className="h-6 text-sm"
              autoFocus
              data-testid="input-rename-folder"
            />
          ) : (
            <span className="text-sm truncate" title={folder.name}>
              {folder.name}
            </span>
          )}
        </div>
      );
    }

    return (
      <div
        ref={(el) => {
          if (el) itemRefs.current.set(`folder-${folder.id}`, el);
          else itemRefs.current.delete(`folder-${folder.id}`);
        }}
        className={`grid grid-cols-[1fr_80px_80px_140px] gap-2 px-2 py-1 rounded cursor-pointer text-sm ${
          isSelected || isMultiSelected ? "bg-blue-500/20 ring-1 ring-blue-500" : "hover-elevate"
        }`}
        onClick={(e) => handleFolderClick(e, folder)}
        onDoubleClick={() => handleFolderDoubleClick(folder.id)}
        data-testid={`folder-item-${folder.id}`}
        data-item-id={`folder-${folder.id}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FolderIcon className="h-4 w-4 text-amber-500 flex-shrink-0" />
          {isRenaming ? (
            <Input
              value={renameFolderValue}
              onChange={(e) => setRenameFolderValue(e.target.value)}
              onBlur={handleFolderRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFolderRenameSubmit();
                if (e.key === "Escape") setRenameFolderId(null);
              }}
              className="h-6 text-sm"
              autoFocus
              data-testid="input-rename-folder"
            />
          ) : (
            <span className="truncate" title={folder.name}>
              {folder.name}
            </span>
          )}
        </div>
        <span className="text-muted-foreground text-right">-</span>
        <span className="text-muted-foreground">{t("fileViewer.folder")}</span>
        <span className="text-muted-foreground">
          {new Date(folder.createdAt).toLocaleDateString()}
        </span>
      </div>
    );
  };

  const renderConversation = (conv: Conversation) => {
    const isSelected = selectedItem?.type === "conversation" && selectedItem.id === conv.id;
    const isMultiSelected = isItemMultiSelected("conversation", conv.id);
    const isRenaming = renameConversationId === conv.id;
    const labelWidth = Math.max(80, iconSize);

    if (viewMode === "largeIcons") {
      return (
        <div
          ref={(el) => {
            if (el) itemRefs.current.set(`conv-${conv.id}`, el);
            else itemRefs.current.delete(`conv-${conv.id}`);
          }}
          className={`flex flex-col items-center p-2 rounded-lg cursor-pointer transition-all duration-150 ${
            isSelected || isMultiSelected ? "bg-blue-500/20 ring-2 ring-blue-500" : "hover-elevate"
          }`}
          style={{ width: labelWidth + 16 }}
          onClick={(e) => handleConversationClick(e, conv)}
          onDoubleClick={() => handleConversationDoubleClick(conv.id)}
          data-testid={`conversation-item-${conv.id}`}
          data-item-id={`conv-${conv.id}`}
        >
          <MessageSquare 
            className="text-primary mb-1 transition-all duration-150" 
            style={{ width: iconSize * 0.75, height: iconSize * 0.75 }}
          />
          {isRenaming ? (
            <Input
              value={renameConversationValue}
              onChange={(e) => setRenameConversationValue(e.target.value)}
              onBlur={handleRenameConversationSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameConversationSubmit();
                if (e.key === "Escape") setRenameConversationId(null);
              }}
              className="h-6 text-xs text-center"
              style={{ width: labelWidth }}
              autoFocus
              data-testid="input-rename-conversation"
            />
          ) : (
            <span 
              className="text-xs text-center line-clamp-2 leading-tight" 
              style={{ width: labelWidth }}
              title={conv.name}
            >
              {conv.name}
            </span>
          )}
        </div>
      );
    }

    if (viewMode === "list") {
      return (
        <div
          ref={(el) => {
            if (el) itemRefs.current.set(`conv-${conv.id}`, el);
            else itemRefs.current.delete(`conv-${conv.id}`);
          }}
          className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer ${
            isSelected || isMultiSelected ? "bg-blue-500/20 ring-1 ring-blue-500" : "hover-elevate"
          }`}
          onClick={(e) => handleConversationClick(e, conv)}
          onDoubleClick={() => handleConversationDoubleClick(conv.id)}
          data-testid={`conversation-item-${conv.id}`}
          data-item-id={`conv-${conv.id}`}
        >
          <MessageSquare className="h-4 w-4 text-primary flex-shrink-0" />
          {isRenaming ? (
            <Input
              value={renameConversationValue}
              onChange={(e) => setRenameConversationValue(e.target.value)}
              onBlur={handleRenameConversationSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameConversationSubmit();
                if (e.key === "Escape") setRenameConversationId(null);
              }}
              className="h-6 text-sm"
              autoFocus
              data-testid="input-rename-conversation"
            />
          ) : (
            <span className="text-sm truncate" title={conv.name}>
              {conv.name}
            </span>
          )}
        </div>
      );
    }

    return (
      <div
        ref={(el) => {
          if (el) itemRefs.current.set(`conv-${conv.id}`, el);
          else itemRefs.current.delete(`conv-${conv.id}`);
        }}
        className={`grid grid-cols-[1fr_80px_80px_140px] gap-2 px-2 py-1 rounded cursor-pointer text-sm ${
          isSelected || isMultiSelected ? "bg-blue-500/20 ring-1 ring-blue-500" : "hover-elevate"
        }`}
        onClick={(e) => handleConversationClick(e, conv)}
        onDoubleClick={() => handleConversationDoubleClick(conv.id)}
        data-testid={`conversation-item-${conv.id}`}
        data-item-id={`conv-${conv.id}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-4 w-4 text-primary flex-shrink-0" />
          {isRenaming ? (
            <Input
              value={renameConversationValue}
              onChange={(e) => setRenameConversationValue(e.target.value)}
              onBlur={handleRenameConversationSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameConversationSubmit();
                if (e.key === "Escape") setRenameConversationId(null);
              }}
              className="h-6 text-sm"
              autoFocus
              data-testid="input-rename-conversation"
            />
          ) : (
            <span className="truncate" title={conv.name}>
              {conv.name}
            </span>
          )}
        </div>
        <span className="text-muted-foreground text-right">-</span>
        <span className="text-muted-foreground">{t("fileViewer.conversation")}</span>
        <span className="text-muted-foreground">
          {new Date(conv.createdAt).toLocaleDateString()}
        </span>
      </div>
    );
  };

  const handleFileClick = (e: React.MouseEvent, file: FileType) => {
    // Ignore clicks during drag or immediately after (300ms threshold)
    if (isDndDraggingRef.current) {
      return;
    }
    const timeSinceLastDrag = Date.now() - lastDndDragEndTimeRef.current;
    if (timeSinceLastDrag < 300) {
      return;
    }
    
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      // Ctrl+click for file tagging (add to message input)
      if (onAttachFile) {
        onAttachFile(file);
      }
    } else if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      // Shift+click for multi-selection
      if (!hasMultiSelection) {
        // First shift-click: add current selected item (if any) and clicked item
        if (selectedItem) {
          toggleItemSelection(selectedItem.type, selectedItem.id);
        }
        toggleItemSelection("file", file.id);
        setSelectedItem(null);
      } else {
        // Subsequent shift-clicks: add to selection
        toggleItemSelection("file", file.id);
      }
    } else {
      // Normal click - if clicking an already multi-selected item, keep selection for DnD
      if (selectedItems.files.has(file.id) && selectedItems.files.size > 1) {
        // Keep multi-selection to allow drag of multiple files
        return;
      }
      // Otherwise select single item
      clearAllSelections();
      setSelectedItem({ type: "file", id: file.id });
    }
  };

  const handleConversationClick = (e: React.MouseEvent, conv: Conversation) => {
    // Ignore clicks during drag or immediately after (300ms threshold)
    if (isDndDraggingRef.current) {
      return;
    }
    const timeSinceLastDrag = Date.now() - lastDndDragEndTimeRef.current;
    if (timeSinceLastDrag < 300) {
      return;
    }
    
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      // Ctrl+click for conversation tagging (add to message input)
      if (onTagConversation) {
        onTagConversation(conv);
      }
    } else if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      // Shift+click for multi-selection
      if (!hasMultiSelection) {
        if (selectedItem) {
          toggleItemSelection(selectedItem.type, selectedItem.id);
        }
        toggleItemSelection("conversation", conv.id);
        setSelectedItem(null);
      } else {
        toggleItemSelection("conversation", conv.id);
      }
    } else {
      // Normal click - if clicking an already multi-selected item, keep selection for DnD
      if (selectedItems.conversations.has(conv.id) && selectedItems.conversations.size > 1) {
        return;
      }
      clearAllSelections();
      setSelectedItem({ type: "conversation", id: conv.id });
    }
  };

  const handleFolderClick = (e: React.MouseEvent, folder: Folder) => {
    // Ignore clicks during drag or immediately after (300ms threshold)
    if (isDndDraggingRef.current) {
      return;
    }
    const timeSinceLastDrag = Date.now() - lastDndDragEndTimeRef.current;
    if (timeSinceLastDrag < 300) {
      return;
    }
    
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      // Ctrl/Shift+click for multi-selection (folders don't have tagging)
      if (!hasMultiSelection) {
        if (selectedItem) {
          toggleItemSelection(selectedItem.type, selectedItem.id);
        }
        toggleItemSelection("folder", folder.id);
        setSelectedItem(null);
      } else {
        toggleItemSelection("folder", folder.id);
      }
    } else {
      // Normal click - if clicking an already multi-selected item, keep selection for DnD
      if (selectedItems.folders.has(folder.id) && selectedItems.folders.size > 1) {
        return;
      }
      clearAllSelections();
      setSelectedItem({ type: "folder", id: folder.id });
    }
  };

  const renderFile = (file: FileType) => {
    const IconComponent = getFileIcon(file.mimeType, file.originalName);
    const isSelected = selectedItem?.type === "file" && selectedItem.id === file.id;
    const isMultiSelected = isItemMultiSelected("file", file.id);
    const isRenaming = renameFileId === file.id;
    const isImage = isImageFile(file.mimeType);
    const labelWidth = Math.max(80, iconSize);

    if (viewMode === "largeIcons") {
      return (
        <div
          ref={(el) => {
            if (el) itemRefs.current.set(`file-${file.id}`, el);
            else itemRefs.current.delete(`file-${file.id}`);
          }}
          className={`flex flex-col items-center p-2 rounded-lg cursor-pointer transition-all duration-150 ${
            isSelected || isMultiSelected ? "bg-blue-500/20 ring-2 ring-blue-500" : "hover-elevate"
          }`}
          style={{ width: labelWidth + 16 }}
          onClick={(e) => handleFileClick(e, file)}
          onDoubleClick={() => handleOpenFile(file)}
          data-testid={`file-item-${file.id}`}
          data-item-id={`file-${file.id}`}
        >
          {isImage ? (
            <div 
              className="relative flex items-center justify-center mb-1 bg-muted/30 rounded overflow-hidden transition-all duration-150"
              style={{ width: iconSize, height: iconSize }}
            >
              <img
                src={`/api/files/${file.id}/view`}
                alt={file.originalName}
                className="max-w-full max-h-full object-contain"
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.parentElement?.classList.add('thumbnail-error');
                }}
              />
              <FileImage 
                className="absolute text-muted-foreground/50 thumbnail-fallback hidden"
                style={{ width: iconSize * 0.5, height: iconSize * 0.5 }}
              />
            </div>
          ) : (
            <IconComponent 
              className="text-muted-foreground mb-1 transition-all duration-150" 
              style={{ width: iconSize * 0.75, height: iconSize * 0.75 }}
            />
          )}
          {isRenaming ? (
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
                if (e.key === "Escape") setRenameFileId(null);
              }}
              className="h-6 text-xs text-center"
              style={{ width: labelWidth }}
              autoFocus
              data-testid="input-rename-file"
            />
          ) : (
            <span 
              className="text-xs text-center line-clamp-2 leading-tight" 
              style={{ width: labelWidth }}
              title={file.originalName}
            >
              {file.originalName}
            </span>
          )}
        </div>
      );
    }

    if (viewMode === "list") {
      return (
        <div
          ref={(el) => {
            if (el) itemRefs.current.set(`file-${file.id}`, el);
            else itemRefs.current.delete(`file-${file.id}`);
          }}
          className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer ${
            isSelected || isMultiSelected ? "bg-blue-500/20 ring-1 ring-blue-500" : "hover-elevate"
          }`}
          onClick={(e) => handleFileClick(e, file)}
          onDoubleClick={() => handleOpenFile(file)}
          data-testid={`file-item-${file.id}`}
          data-item-id={`file-${file.id}`}
        >
          <IconComponent className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          {isRenaming ? (
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
                if (e.key === "Escape") setRenameFileId(null);
              }}
              className="h-6 text-sm flex-1"
              autoFocus
              data-testid="input-rename-file"
            />
          ) : (
            <span className="text-sm truncate" title={file.originalName}>
              {file.originalName}
            </span>
          )}
        </div>
      );
    }

    return (
      <div
        ref={(el) => {
          if (el) itemRefs.current.set(`file-${file.id}`, el);
          else itemRefs.current.delete(`file-${file.id}`);
        }}
        className={`grid grid-cols-[1fr_80px_80px_140px] gap-2 px-2 py-1 rounded cursor-pointer text-sm ${
          isSelected || isMultiSelected ? "bg-blue-500/20 ring-1 ring-blue-500" : "hover-elevate"
        }`}
        onClick={(e) => handleFileClick(e, file)}
        onDoubleClick={() => handleOpenFile(file)}
        data-testid={`file-item-${file.id}`}
        data-item-id={`file-${file.id}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <IconComponent className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          {isRenaming ? (
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
                if (e.key === "Escape") setRenameFileId(null);
              }}
              className="h-6 text-sm"
              autoFocus
              data-testid="input-rename-file"
            />
          ) : (
            <span className="truncate" title={file.originalName}>
              {file.originalName}
            </span>
          )}
        </div>
        <span className="text-muted-foreground text-right">{formatFileSize(file.size)}</span>
        <span className="text-muted-foreground">{getFileType(file.mimeType)}</span>
        <span className="text-muted-foreground">
          {new Date(file.updatedAt || file.createdAt).toLocaleDateString()}
        </span>
      </div>
    );
  };


  return (
    <div 
      className={`flex flex-col h-full bg-background border-r transition-all duration-200 ${isDragging ? "ring-2 ring-primary ring-inset bg-primary/5" : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid="file-viewer-drop-zone"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="font-medium text-sm truncate">
            {currentFolder?.name || currentProject?.name || t("fileViewer.title")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                disabled={!selectedProjectId}
                onClick={() => {
                  if (selectedProjectId) {
                    queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "files"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "folders"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "conversations"] });
                  }
                }}
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("fileViewer.refresh")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={viewMode === "largeIcons" ? "secondary" : "ghost"}
                onClick={() => setViewMode("largeIcons")}
                data-testid="button-view-large-icons"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("fileViewer.viewMode.largeIcons")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={viewMode === "list" ? "secondary" : "ghost"}
                onClick={() => setViewMode("list")}
                data-testid="button-view-list"
              >
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("fileViewer.viewMode.list")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={viewMode === "details" ? "secondary" : "ghost"}
                onClick={() => setViewMode("details")}
                data-testid="button-view-details"
              >
                <TableProperties className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("fileViewer.viewMode.details")}</TooltipContent>
          </Tooltip>
          
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    data-testid="button-sort"
                  >
                    {sortOrder === "asc" ? (
                      <ArrowDownAZ className="h-4 w-4" />
                    ) : (
                      <ArrowUpAZ className="h-4 w-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("fileViewer.sort.title")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" data-testid="sort-dropdown-menu">
              <DropdownMenuItem
                onClick={() => { setSortBy("name"); }}
                data-testid="sort-by-name"
              >
                <Check className={`h-4 w-4 mr-2 ${sortBy === "name" ? "opacity-100" : "opacity-0"}`} />
                {t("fileViewer.sort.name")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => { setSortBy("date"); }}
                data-testid="sort-by-date"
              >
                <Check className={`h-4 w-4 mr-2 ${sortBy === "date" ? "opacity-100" : "opacity-0"}`} />
                {t("fileViewer.sort.date")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => { setSortBy("type"); }}
                data-testid="sort-by-type"
              >
                <Check className={`h-4 w-4 mr-2 ${sortBy === "type" ? "opacity-100" : "opacity-0"}`} />
                {t("fileViewer.sort.type")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => { setSortOrder(sortOrder === "asc" ? "desc" : "asc"); }}
                data-testid="toggle-sort-order"
              >
                {sortOrder === "asc" ? (
                  <ArrowDownAZ className="h-4 w-4 mr-2" />
                ) : (
                  <ArrowUpAZ className="h-4 w-4 mr-2" />
                )}
                {sortOrder === "asc" ? t("fileViewer.sort.ascending") : t("fileViewer.sort.descending")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {currentFolder && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/10">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleGoUp}
            className="gap-1"
            data-testid="button-go-up"
          >
            <ArrowUp className="h-3 w-3" />
            {t("fileViewer.goUp")}
          </Button>
          <span className="text-xs text-muted-foreground">{currentFolder.name}</span>
        </div>
      )}

      {viewMode === "details" && (filteredFiles.length > 0 || filteredFolders.length > 0) && (
        <div className="grid grid-cols-[1fr_80px_80px_140px] gap-2 px-2 py-1 border-b text-xs font-medium text-muted-foreground bg-muted/20">
          <span>{t("fileViewer.columns.name")}</span>
          <span className="text-right">{t("fileViewer.columns.size")}</span>
          <span>{t("fileViewer.columns.type")}</span>
          <span>{t("fileViewer.columns.dateModified")}</span>
        </div>
      )}

      <div 
        ref={scrollContainerRef} 
        className="flex-1 overflow-hidden"
        onContextMenu={handleEmptySpaceContextMenu}
      >
        <ScrollArea className="h-full">
          {!selectedProjectId ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">{t("fileViewer.noProjectSelected")}</p>
            </div>
          ) : (
            <div
              className={`min-h-full p-2 ${isDragging ? "bg-primary/10 border-2 border-dashed border-primary rounded-lg" : ""}`}
            >
              {isUploading ? (
                <div className="flex flex-col items-center justify-center h-40">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2" />
                  <p className="text-sm text-muted-foreground">{t("fileViewer.uploading")}</p>
                </div>
              ) : filteredFiles.length === 0 && filteredFolders.length === 0 && filteredConversations.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-muted-foreground/30 rounded-lg cursor-pointer hover-elevate"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">{t("fileViewer.dropFilesHere")}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{t("fileViewer.dragDropHint")}</p>
                </div>
              ) : (
                <DndContext
                  sensors={dndSensors}
                  onDragStart={handleDndDragStart}
                  onDragOver={handleDndDragOver}
                  onDragEnd={handleDndDragEnd}
                >
                  <div
                    ref={contentAreaRef}
                    className={`relative select-none min-h-[200px] pb-16 pr-8 ${
                      viewMode === "largeIcons"
                        ? "flex flex-wrap gap-1 content-start"
                        : "flex flex-col gap-1"
                    }`}
                    onMouseDown={handleSelectionMouseDown}
                    onMouseMove={handleSelectionMouseMove}
                    onMouseUp={handleSelectionMouseUp}
                    onContextMenu={handleEmptySpaceContextMenu}
                  >
                    {filteredFolders.map((folder) => (
                      <DroppableFolderItem
                        key={folder.id}
                        folderId={folder.id}
                        isOver={dndOverFolderId === folder.id}
                      >
                        <DraggableFolderItem
                          folderId={folder.id}
                          isDragging={dndDraggingFolderIds.includes(folder.id)}
                          isMultiSelected={selectedItems.folders.has(folder.id) && selectedItems.folders.size > 1}
                          isDndActiveRef={isDndDraggingRef}
                          lastDragEndTimeRef={lastDndDragEndTimeRef}
                        >
                          <div onContextMenu={(e) => handleItemContextMenu(e, "folder", folder.id)}>
                            {renderFolder(folder)}
                          </div>
                        </DraggableFolderItem>
                      </DroppableFolderItem>
                    ))}
                    {filteredConversations.map((conv) => (
                      <DraggableConversationItem
                        key={conv.id}
                        conversationId={conv.id}
                        isDragging={dndDraggingConversationIds.includes(conv.id)}
                        isMultiSelected={selectedItems.conversations.has(conv.id) && selectedItems.conversations.size > 1}
                        isDndActiveRef={isDndDraggingRef}
                        lastDragEndTimeRef={lastDndDragEndTimeRef}
                      >
                        <div onContextMenu={(e) => handleItemContextMenu(e, "conversation", conv.id)}>
                          {renderConversation(conv)}
                        </div>
                      </DraggableConversationItem>
                    ))}
                  {sortedFiles.map((file) => (
                    <DraggableFileItem
                      key={file.id}
                      fileId={file.id}
                      isDragging={dndDraggingFileIds.includes(file.id)}
                      isMultiSelected={selectedItems.files.has(file.id) && selectedItems.files.size > 1}
                      isDndActiveRef={isDndDraggingRef}
                      lastDragEndTimeRef={lastDndDragEndTimeRef}
                    >
                      <div onContextMenu={(e) => handleItemContextMenu(e, "file", file.id)}>
                        {renderFile(file)}
                      </div>
                    </DraggableFileItem>
                  ))}
                  
                    {/* Rubber band selection rectangle */}
                    {isSelecting && selectionRect && (
                      <div
                        className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none z-50"
                        style={{
                          left: Math.min(selectionRect.startX, selectionRect.endX),
                          top: Math.min(selectionRect.startY, selectionRect.endY),
                          width: Math.abs(selectionRect.endX - selectionRect.startX),
                          height: Math.abs(selectionRect.endY - selectionRect.startY),
                        }}
                        data-testid="selection-rubberband"
                      />
                    )}
                  </div>
                  
                  {/* Drag Overlay for visual feedback */}
                  <DragOverlay>
                    {dndDraggingFileIds.length > 0 && (
                      <div className="bg-primary/20 border border-primary rounded-lg px-3 py-2 text-sm shadow-lg">
                        {dndDraggingFileIds.length > 1 
                          ? t("fileViewer.movingFiles", { count: dndDraggingFileIds.length })
                          : files.find(f => f.id === dndDraggingFileIds[0])?.originalName || t("fileViewer.movingFile")
                        }
                      </div>
                    )}
                    {dndDraggingFolderIds.length > 0 && (
                      <div className="bg-primary/20 border border-primary rounded-lg px-3 py-2 text-sm shadow-lg">
                        {dndDraggingFolderIds.length > 1 
                          ? t("fileViewer.movingFolders", { count: dndDraggingFolderIds.length })
                          : folders.find(f => f.id === dndDraggingFolderIds[0])?.name || t("fileViewer.movingFolder")
                        }
                      </div>
                    )}
                    {dndDraggingConversationIds.length > 0 && (
                      <div className="bg-primary/20 border border-primary rounded-lg px-3 py-2 text-sm shadow-lg">
                        {dndDraggingConversationIds.length > 1 
                          ? t("fileViewer.movingConversations", { count: dndDraggingConversationIds.length })
                          : conversations.find(c => c.id === dndDraggingConversationIds[0])?.name || t("fileViewer.movingConversation")
                        }
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              )}
            </div>
          )}
        </ScrollArea>
      </div>

      {selectedProjectId && (
        <div className="p-2 border-t space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-upload-file"
          >
            <Upload className="h-4 w-4 mr-2" />
            {t("fileViewer.dropFilesHere")}
          </Button>
          {onAttachFile && sortedFiles.length > 0 && (
            <p className="text-xs text-center text-muted-foreground" data-testid="text-ctrl-click-hint">
              {t("fileViewer.ctrlClickHint")}
            </p>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-file-upload"
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("fileViewer.deleteFileConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={multiDeleteDialogOpen} onOpenChange={setMultiDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("fileViewer.deleteMultipleConfirm", { 
                count: multiDeleteItems.files.size + multiDeleteItems.folders.size + multiDeleteItems.conversations.size 
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMultiDelete}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConversationDialogOpen} onOpenChange={setDeleteConversationDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("fileViewer.deleteConversationConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteConversation}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={folderUploadWarningOpen} onOpenChange={setFolderUploadWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("fileViewer.folderUploadNotAllowed")}</AlertDialogTitle>
            <AlertDialogDescription>{t("fileViewer.concurrentUploadLimit", { count: MAX_UPLOAD_FILES })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setFolderUploadWarningOpen(false)}>{t("common.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={excessFileWarningOpen} onOpenChange={setExcessFileWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("fileViewer.excessFileWarning", { count: MAX_UPLOAD_FILES })}</AlertDialogTitle>
            <AlertDialogDescription>{t("fileViewer.concurrentUploadLimit", { count: MAX_UPLOAD_FILES })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setExcessFileWarningOpen(false)}>{t("common.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpgradeLimitDialog
        open={storageLimitDialogOpen}
        onOpenChange={setStorageLimitDialogOpen}
        limitType="storage"
        currentCount={`${(subscriptionData?.usage?.storageGB ?? 0).toFixed(2)} GB`}
        maxLimit={`${subscriptionData?.limits?.storageGB ?? 10} GB`}
        currentPlan={subscriptionData?.subscription?.plan}
      />

      <FilePreviewModal
        file={previewFile}
        open={!!previewFile}
        onClose={() => setPreviewFile(null)}
      />

      <TextEditorModal
        file={editorFile}
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditorOpen(false);
            setEditorFile(null);
          }
        }}
        projectId={selectedProjectId}
      />

      {/* Office File Open Choice Dialog */}
      <Dialog open={officeFileDialogOpen} onOpenChange={(open) => {
        setOfficeFileDialogOpen(open);
        if (!open) setOfficeDialogFile(null);
      }}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {officeDialogFile?.mimeType?.includes("word") || officeDialogFile?.mimeType?.includes("document") ? (
                <SiGoogledocs className="h-5 w-5 text-blue-500" />
              ) : officeDialogFile?.mimeType?.includes("spreadsheet") || officeDialogFile?.mimeType?.includes("excel") ? (
                <SiGooglesheets className="h-5 w-5 text-green-500" />
              ) : (
                <SiGoogleslides className="h-5 w-5 text-orange-500" />
              )}
              {t("officeFileDialog.title")}
            </DialogTitle>
            <DialogDescription>
              {t("officeFileDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-2">
              {t("officeFileDialog.fileName")}: <span className="font-medium text-foreground truncate">{officeDialogFile?.originalName}</span>
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleOfficeDownload}
              className="w-full sm:w-auto"
              data-testid="button-office-download"
            >
              <Download className="mr-2 h-4 w-4" />
              {t("officeFileDialog.download")}
            </Button>
            <Button
              onClick={handleOfficeGoogleEdit}
              className="w-full sm:w-auto"
              data-testid="button-office-google-edit"
            >
              {officeDialogFile?.mimeType?.includes("word") || officeDialogFile?.mimeType?.includes("document") ? (
                <SiGoogledocs className="mr-2 h-4 w-4" />
              ) : officeDialogFile?.mimeType?.includes("spreadsheet") || officeDialogFile?.mimeType?.includes("excel") ? (
                <SiGooglesheets className="mr-2 h-4 w-4" />
              ) : (
                <SiGoogleslides className="mr-2 h-4 w-4" />
              )}
              {t("officeFileDialog.openWithGoogle")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GoogleDriveEditorModal
        file={googleDriveFile}
        open={googleDriveEditorOpen}
        onOpenChange={(open) => {
          if (!open) {
            setGoogleDriveEditorOpen(false);
            setGoogleDriveFile(null);
          }
        }}
        projectId={selectedProjectId || ""}
      />

      <PropertiesDialog
        open={!!propertiesItem}
        onOpenChange={(open) => !open && setPropertiesItem(null)}
        item={propertiesItem?.item || null}
        itemType={propertiesItem?.type || "file"}
        project={currentProject}
        parentFolder={propertiesItem?.type === "file" 
          ? folders.find(f => f.id === (propertiesItem.item as FileType).folderId) 
          : propertiesItem?.type === "folder" 
            ? folders.find(f => f.id === (propertiesItem.item as Folder).parentFolderId)
            : null}
        folderStats={propertiesItem?.type === "folder" ? (() => {
          const folderId = (propertiesItem.item as Folder).id;
          const folderFiles = files.filter(f => f.folderId === folderId);
          const subFolders = folders.filter(f => f.parentFolderId === folderId);
          return {
            fileCount: folderFiles.length,
            folderCount: subFolders.length,
            totalSize: folderFiles.reduce((sum, f) => sum + f.size, 0)
          };
        })() : undefined}
      />

      {/* Shared Context Menu */}
      <DropdownMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen} modal={true}>
        <DropdownMenuTrigger asChild>
          <div 
            ref={contextMenuTriggerRef}
            style={{
              position: 'fixed',
              left: contextMenuPosition.x,
              top: contextMenuPosition.y,
              width: 1,
              height: 1,
              pointerEvents: 'none',
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          className="w-56" 
          align="start"
          sideOffset={0}
        >
          {hasMultiSelection ? (
            <>
              {selectedItems.files.size > 0 && (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      handleMultiCut();
                    }}
                    data-testid="context-menu-multi-cut-files"
                  >
                    <Scissors className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.cut")} ({selectedItems.files.size} {t("properties.file")})
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      handleMultiCopy();
                    }}
                    data-testid="context-menu-multi-copy-files"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.copy")} ({selectedItems.files.size} {t("properties.file")})
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {selectedItems.folders.size > 0 && (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      handleMultiFolderCut();
                    }}
                    data-testid="context-menu-multi-cut-folders"
                  >
                    <Scissors className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.cut")} ({selectedItems.folders.size} {t("fileViewer.folder")})
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      handleMultiFolderCopy();
                    }}
                    data-testid="context-menu-multi-copy-folders"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.copy")} ({selectedItems.folders.size} {t("fileViewer.folder")})
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {selectedItems.conversations.size > 0 && (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      handleMultiConversationCut();
                    }}
                    data-testid="context-menu-multi-cut-conversations"
                  >
                    <Scissors className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.cut")} ({selectedItems.conversations.size} {t("fileViewer.conversation")})
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      handleMultiConversationCopy();
                    }}
                    data-testid="context-menu-multi-copy-conversations"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.copy")} ({selectedItems.conversations.size} {t("fileViewer.conversation")})
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={() => {
                  setContextMenuOpen(false);
                  handleMultiDelete();
                }}
                className="text-destructive focus:text-destructive"
                data-testid="context-menu-multi-delete"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("common.delete")} ({selectedItems.files.size + selectedItems.folders.size + selectedItems.conversations.size})
              </DropdownMenuItem>
            </>
          ) : contextMenuTarget.type === "file" ? (
            (() => {
              const file = files.find(f => f.id === contextMenuTarget.id);
              if (!file) return null;
              return (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      handleOpenFile(file);
                    }}
                    data-testid={`context-menu-open-${file.id}`}
                  >
                    <FileIcon className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.open")}
                  </DropdownMenuItem>
                  {!isOfficeFile(file) && (
                    <DropdownMenuItem
                      onClick={() => {
                        setContextMenuOpen(false);
                        setPreviewFile(file);
                      }}
                      data-testid={`context-menu-preview-${file.id}`}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {t("fileViewer.contextMenu.preview")}
                    </DropdownMenuItem>
                  )}
                  {isOfficeFile(file) && (
                    <DropdownMenuItem
                      onClick={() => {
                        setContextMenuOpen(false);
                        window.open(`/api/files/${file.id}/download`, "_blank");
                      }}
                      data-testid={`context-menu-download-${file.id}`}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {t("officeFileDialog.download")}
                    </DropdownMenuItem>
                  )}
                  {isOfficeFile(file) && (
                    <DropdownMenuItem
                      onClick={() => {
                        setContextMenuOpen(false);
                        setGoogleDriveFile(file);
                        setGoogleDriveEditorOpen(true);
                      }}
                      data-testid={`context-menu-edit-gdrive-${file.id}`}
                    >
                      {file.mimeType?.includes("word") || file.mimeType?.includes("document") ? (
                        <SiGoogledocs className="mr-2 h-4 w-4 text-blue-500" />
                      ) : file.mimeType?.includes("spreadsheet") || file.mimeType?.includes("excel") ? (
                        <SiGooglesheets className="mr-2 h-4 w-4 text-green-500" />
                      ) : (
                        <SiGoogleslides className="mr-2 h-4 w-4 text-orange-500" />
                      )}
                      {t("googleDrive.editWithGoogle")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      handleCut(file);
                    }}
                    data-testid={`context-menu-cut-${file.id}`}
                  >
                    <Scissors className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.cut")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      handleCopy(file);
                    }}
                    data-testid={`context-menu-copy-${file.id}`}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.copy")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      setRenameFileId(file.id);
                      setRenameValue(file.originalName);
                      setOriginalRenameValue(file.originalName);
                    }}
                    data-testid={`context-menu-rename-${file.id}`}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    {t("common.rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      setPropertiesItem({ type: "file", item: file });
                    }}
                    data-testid={`context-menu-properties-${file.id}`}
                  >
                    <Info className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.properties")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      setDeleteFileId(file.id);
                      setDeleteDialogOpen(true);
                    }}
                    className="text-destructive focus:text-destructive"
                    data-testid={`context-menu-delete-${file.id}`}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("common.delete")}
                  </DropdownMenuItem>
                </>
              );
            })()
          ) : contextMenuTarget.type === "folder" ? (
            (() => {
              const folder = folders.find(f => f.id === contextMenuTarget.id);
              if (!folder) return null;
              return (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      if (onFolderNavigate && selectedProjectId) {
                        onFolderNavigate(folder.id, selectedProjectId);
                      }
                    }}
                    data-testid={`context-menu-open-folder-${folder.id}`}
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.open")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      handleCutFolder(folder);
                    }}
                    data-testid={`context-menu-cut-folder-${folder.id}`}
                  >
                    <Scissors className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.cut")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      handleCopyFolder(folder);
                    }}
                    data-testid={`context-menu-copy-folder-${folder.id}`}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.copy")}
                  </DropdownMenuItem>
                  {clipboardFiles && clipboardFiles.files.length > 0 && (
                    <DropdownMenuItem
                      onClick={() => {
                        setContextMenuOpen(false);
                        handlePasteToFolder(folder.id);
                      }}
                      data-testid={`context-menu-paste-folder-${folder.id}`}
                    >
                      <ClipboardPaste className="mr-2 h-4 w-4" />
                      {t("fileViewer.contextMenu.paste")} ({clipboardFiles.files.length})
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      setRenameFolderId(folder.id);
                      setRenameFolderValue(folder.name);
                      setOriginalRenameFolderValue(folder.name);
                    }}
                    data-testid={`context-menu-rename-folder-${folder.id}`}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    {t("common.rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      setPropertiesItem({ type: "folder", item: folder });
                    }}
                    data-testid={`context-menu-properties-folder-${folder.id}`}
                  >
                    <Info className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.properties")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      if (selectedProjectId) {
                        deleteFolderMutation.mutate({ id: folder.id, projectId: selectedProjectId });
                      }
                    }}
                    className="text-destructive focus:text-destructive"
                    data-testid={`context-menu-delete-folder-${folder.id}`}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("common.delete")}
                  </DropdownMenuItem>
                </>
              );
            })()
          ) : contextMenuTarget.type === "conversation" ? (
            (() => {
              const conv = conversations.find(c => c.id === contextMenuTarget.id);
              if (!conv) return null;
              return (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      onConversationSettings?.(conv.id);
                    }}
                    data-testid={`context-menu-open-conv-${conv.id}`}
                  >
                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.open")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      handleCutConversation(conv);
                    }}
                    data-testid={`context-menu-cut-conv-${conv.id}`}
                  >
                    <Scissors className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.cut")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      handleCopyConversation(conv);
                    }}
                    data-testid={`context-menu-copy-conv-${conv.id}`}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t("fileViewer.contextMenu.copy")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      setRenameConversationId(conv.id);
                      setRenameConversationValue(conv.name);
                      setOriginalRenameConversationValue(conv.name);
                    }}
                    data-testid={`context-menu-rename-conv-${conv.id}`}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    {t("common.rename")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setContextMenuOpen(false);
                      setDeleteConversationId(conv.id);
                      setDeleteConversationDialogOpen(true);
                    }}
                    className="text-destructive focus:text-destructive"
                    data-testid={`context-menu-delete-conv-${conv.id}`}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("common.delete")}
                  </DropdownMenuItem>
                </>
              );
            })()
          ) : contextMenuTarget.type === null ? (
            // Empty space context menu - show paste options for files, folders, conversations
            <>
              {clipboardFiles && clipboardFiles.files.length > 0 && (
                <DropdownMenuItem
                  onClick={() => {
                    setContextMenuOpen(false);
                    handlePaste();
                  }}
                  data-testid="context-menu-paste-files-empty"
                >
                  <ClipboardPaste className="mr-2 h-4 w-4" />
                  {t("fileViewer.contextMenu.paste")} ({clipboardFiles.files.length} {t("properties.file")})
                </DropdownMenuItem>
              )}
              {clipboardFolders && clipboardFolders.folders.length > 0 && (
                <DropdownMenuItem
                  onClick={() => {
                    setContextMenuOpen(false);
                    handlePasteFolder();
                  }}
                  data-testid="context-menu-paste-folders-empty"
                >
                  <ClipboardPaste className="mr-2 h-4 w-4" />
                  {t("fileViewer.contextMenu.paste")} ({clipboardFolders.folders.length} {t("fileViewer.folder")})
                </DropdownMenuItem>
              )}
              {clipboardConversations && clipboardConversations.conversations.length > 0 && (
                <DropdownMenuItem
                  onClick={() => {
                    setContextMenuOpen(false);
                    handlePasteConversations();
                  }}
                  data-testid="context-menu-paste-conversations-empty"
                >
                  <ClipboardPaste className="mr-2 h-4 w-4" />
                  {t("fileViewer.contextMenu.paste")} ({clipboardConversations.conversations.length} {t("fileViewer.conversation")})
                </DropdownMenuItem>
              )}
              {!clipboardFiles && !clipboardFolders && !clipboardConversations && (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  {t("fileViewer.contextMenu.noPasteItems")}
                </DropdownMenuItem>
              )}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
