import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Trash2, File, Folder, MessageSquare, RotateCcw, Trash, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface TrashItem {
  type: "file" | "folder" | "conversation";
  id: string;
  name: string;
  deletedAt: string;
  projectId?: string;
  projectName?: string;
  folderId?: string;
  folderName?: string;
  parentFolderId?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
}

interface TrashResponse {
  files: TrashItem[];
  folders: TrashItem[];
  conversations: TrashItem[];
}

export function TrashView() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TrashItem | null>(null);

  const { data: trashData, isLoading } = useQuery<TrashResponse>({
    queryKey: ["/api/trash"],
    enabled: open,
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      const pluralType = type === "file" ? "files" : type === "folder" ? "folders" : "conversations";
      return apiRequest("POST", `/api/trash/${pluralType}/${id}/restore`);
    },
    onSuccess: () => {
      toast({
        title: t("chat.trash.restoreSuccess"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trash"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      const pluralType = type === "file" ? "files" : type === "folder" ? "folders" : "conversations";
      return apiRequest("DELETE", `/api/trash/${pluralType}/${id}`);
    },
    onSuccess: () => {
      toast({
        title: t("chat.trash.deleteSuccess"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trash"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/trash/empty");
    },
    onSuccess: () => {
      toast({
        title: t("chat.trash.emptySuccess"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trash"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    },
  });

  const handleRestore = (item: TrashItem) => {
    restoreMutation.mutate({ type: item.type, id: item.id });
  };

  const handleDelete = (item: TrashItem) => {
    setSelectedItem(item);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (selectedItem) {
      deleteMutation.mutate({ type: selectedItem.type, id: selectedItem.id });
    }
    setDeleteConfirmOpen(false);
    setSelectedItem(null);
  };

  const handleEmptyTrash = () => {
    setEmptyConfirmOpen(true);
  };

  const confirmEmptyTrash = () => {
    emptyTrashMutation.mutate();
    setEmptyConfirmOpen(false);
  };

  const totalItems =
    (trashData?.files?.length || 0) +
    (trashData?.folders?.length || 0) +
    (trashData?.conversations?.length || 0);

  const filesWithType: TrashItem[] = (trashData?.files || []).map(f => ({ ...f, type: "file" as const }));
  const foldersWithType: TrashItem[] = (trashData?.folders || []).map(f => ({ ...f, type: "folder" as const }));
  const conversationsWithType: TrashItem[] = (trashData?.conversations || []).map(c => ({ ...c, type: "conversation" as const }));
  const allItems = [...filesWithType, ...foldersWithType, ...conversationsWithType];

  const renderItem = (item: TrashItem) => {
    const Icon =
      item.type === "file" ? File : item.type === "folder" ? Folder : MessageSquare;
    const deletedDate = format(new Date(item.deletedAt), "yyyy-MM-dd HH:mm");

    return (
      <div
        key={`${item.type}-${item.id}`}
        className="flex items-center justify-between p-3 rounded-md bg-muted/50 group hover-elevate"
        data-testid={`trash-item-${item.type}-${item.id}`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{item.name || item.originalName}</p>
            <p className="text-xs text-muted-foreground">
              {t("chat.trash.deletedOn", { date: deletedDate })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleRestore(item)}
            disabled={restoreMutation.isPending}
            title={t("chat.trash.restore")}
            data-testid={`button-restore-${item.type}-${item.id}`}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleDelete(item)}
            disabled={deleteMutation.isPending}
            title={t("chat.trash.deleteForever")}
            className="text-destructive hover:text-destructive"
            data-testid={`button-delete-${item.type}-${item.id}`}
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Trash2 className="h-12 w-12 text-muted-foreground mb-4" />
      <p className="text-sm font-medium text-muted-foreground">{t("chat.trash.empty")}</p>
      <p className="text-xs text-muted-foreground mt-1">{t("chat.trash.emptyDescription")}</p>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title={t("chat.sidebar.trash")}
            data-testid="button-open-trash"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="w-[95vw] max-w-2xl h-[90vh] max-h-[600px] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              {t("chat.trash.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("chat.trash.emptyDescription")}
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 flex-1">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : totalItems === 0 ? (
            <div className="flex-1 overflow-auto">
              {renderEmptyState()}
            </div>
          ) : (
            <Tabs defaultValue="all" className="flex-1 flex flex-col min-h-0">
              <div className="shrink-0 overflow-x-auto">
                <TabsList className="w-full min-w-max">
                  <TabsTrigger value="all" className="flex-1 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-trash-all">
                    {t("common.all")} ({totalItems})
                  </TabsTrigger>
                  <TabsTrigger value="files" className="flex-1 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-trash-files">
                    {t("chat.trash.files")} ({trashData?.files?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="folders" className="flex-1 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-trash-folders">
                    {t("chat.trash.folders")} ({trashData?.folders?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="conversations" className="flex-1 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-trash-conversations">
                    {t("chat.trash.conversations")} ({trashData?.conversations?.length || 0})
                  </TabsTrigger>
                </TabsList>
              </div>
              <ScrollArea className="flex-1 mt-4 min-h-0">
                <TabsContent value="all" className="space-y-2 m-0 pr-2">
                  {allItems
                    .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime())
                    .map(renderItem)}
                </TabsContent>
                <TabsContent value="files" className="space-y-2 m-0 pr-2">
                  {filesWithType.length ? (
                    filesWithType
                      .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime())
                      .map(renderItem)
                  ) : (
                    renderEmptyState()
                  )}
                </TabsContent>
                <TabsContent value="folders" className="space-y-2 m-0 pr-2">
                  {foldersWithType.length ? (
                    foldersWithType
                      .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime())
                      .map(renderItem)
                  ) : (
                    renderEmptyState()
                  )}
                </TabsContent>
                <TabsContent value="conversations" className="space-y-2 m-0 pr-2">
                  {conversationsWithType.length ? (
                    conversationsWithType
                      .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime())
                      .map(renderItem)
                  ) : (
                    renderEmptyState()
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          )}

          {totalItems > 0 && (
            <div className="flex justify-end pt-4 border-t mt-4 shrink-0">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleEmptyTrash}
                disabled={emptyTrashMutation.isPending}
                data-testid="button-empty-trash"
              >
                {emptyTrashMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Trash className="h-4 w-4 mr-2" />
                )}
                {t("chat.trash.emptyTrash")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chat.trash.deleteForever")}</AlertDialogTitle>
            <AlertDialogDescription>{t("chat.trash.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {t("chat.trash.deleteForever")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={emptyConfirmOpen} onOpenChange={setEmptyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chat.trash.emptyTrash")}</AlertDialogTitle>
            <AlertDialogDescription>{t("chat.trash.emptyTrashConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-empty">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmEmptyTrash}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-empty"
            >
              {t("chat.trash.emptyTrash")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
