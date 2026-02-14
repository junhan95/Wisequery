import { useState, useCallback, useMemo } from "react";
import { ChevronRight, ChevronDown, Folder as FolderIcon, FolderOpen, MessageSquare, Plus, MoreHorizontal, LogIn, LogOut, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DndContext, DragOverlay, closestCenter, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { Project, Conversation, Folder } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { TrashView } from "@/components/trash-view";

interface ExplorerSidebarProps {
  projects: Project[];
  conversations: Conversation[];
  folders: Folder[];
  selectedConversationId: string | null;
  selectedProjectId: string | null;
  selectedFolderId: string | null;
  expandedProjects: Set<string>;
  expandedFolderIds?: Set<string>;
  onProjectToggle: (projectId: string) => void;
  onProjectSelect: (projectId: string) => void;
  onConversationSelect: (conversationId: string) => void;
  onFolderSelect?: (folderId: string, projectId: string) => void;
  onFolderToggle?: (folderId: string) => void;
  onCreateProject: () => void;
  onCreateFolder: (projectId: string, parentFolderId?: string) => void;
  onCreateConversation: (projectId: string, folderId?: string) => void;
  onRenameProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onEditConversation: (conversationId: string) => void;
  onRenameConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onMoveConversation: (conversationId: string, newProjectId: string, folderId?: string | null) => void;
  onMoveFolder: (folderId: string, newProjectId: string, parentFolderId?: string | null) => void;
  onReorderProjects: (fromIndex: number, toIndex: number) => void;
}

function DraggableConversation({
  conversation,
  isSelected,
  onSelect,
  onEdit,
  onRename,
  onDelete,
}: {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `conversation-${conversation.id}`,
    data: { conversation },
  });

  return (
    <div
      ref={setNodeRef}
      className={`ml-8 flex items-center gap-2 px-2 py-1.5 rounded-sm group hover-elevate cursor-pointer transition-all duration-150 ${isSelected ? "bg-sidebar-accent" : ""
        } ${isDragging ? "opacity-50" : ""}`}
      onClick={onSelect}
      data-testid={`conversation-${conversation.id}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        {isDragging ? (
          <GripVertical className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate text-sidebar-foreground">{conversation.name}</div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            data-testid={`button-conversation-menu-${conversation.id}`}
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit} data-testid={`menu-edit-conversation-${conversation.id}`}>
            {t('chat.sidebar.settings')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRename} data-testid={`menu-rename-conversation-${conversation.id}`}>
            {t('chat.sidebar.renameConversation')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDelete}
            data-testid={`menu-delete-conversation-${conversation.id}`}
            className="text-destructive"
          >
            {t('chat.sidebar.deleteConversation')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function FolderItem({
  folder,
  allFolders,
  conversations,
  selectedConversationId,
  selectedFolderId,
  expandedFolderIds,
  onSelectConversation,
  onSelectFolder,
  onFolderToggle,
  onCreateFolder,
  onCreateConversation,
  onRenameFolder,
  onDeleteFolder,
  onEditConversation,
  onRenameConversation,
  onDeleteConversation,
  depth = 0,
}: {
  folder: Folder;
  allFolders: Folder[];
  conversations: Conversation[];
  selectedConversationId: string | null;
  selectedFolderId: string | null;
  expandedFolderIds?: Set<string>;
  onSelectConversation: (id: string) => void;
  onSelectFolder: (folderId: string, projectId: string) => void;
  onFolderToggle?: (folderId: string) => void;
  onCreateFolder: (parentFolderId: string) => void;
  onCreateConversation: (folderId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onEditConversation: (id: string) => void;
  onRenameConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  depth?: number;
}) {
  const { t } = useTranslation();
  const [localExpanded, setLocalExpanded] = useState(false);

  // 제어된 상태 또는 로컬 상태 사용
  const isExpanded = expandedFolderIds ? expandedFolderIds.has(folder.id) : localExpanded;
  const handleToggle = () => {
    if (onFolderToggle) {
      onFolderToggle(folder.id);
    } else {
      setLocalExpanded(!localExpanded);
    }
  };

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `folder-${folder.id}`,
    data: { folder, projectId: folder.projectId },
  });

  const { attributes, listeners, setNodeRef: setDraggableRef, isDragging } = useDraggable({
    id: `draggable-folder-${folder.id}`,
    data: { folder, type: 'folder' },
  });

  const folderConversations = conversations.filter((c) => c.folderId === folder.id);
  const childFolders = allFolders.filter((f) => f.parentFolderId === folder.id);
  const hasChildren = childFolders.length > 0 || folderConversations.length > 0;
  const isSelected = selectedFolderId === folder.id;

  const handleFolderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectFolder(folder.id, folder.projectId);
  };

  return (
    <div
      ref={setDroppableRef}
      style={{ marginLeft: `${depth > 0 ? 16 : 16}px` }}
      className={isOver ? "border-2 border-dashed border-primary bg-primary/10 rounded-sm" : ""}
    >
      <div
        className={`flex items-center gap-1 group hover-elevate rounded-sm transition-all duration-150 ${isSelected ? "bg-sidebar-accent" : ""
          } ${!isOver ? "border-2 border-transparent" : ""} ${isDragging ? "opacity-50" : ""}`}
        data-testid={`folder-item-${folder.id}`}
      >
        <Button
          size="icon"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); handleToggle(); }}
          data-testid={`button-toggle-folder-${folder.id}`}
          className="h-7 w-7 shrink-0"
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : (
            <span className="h-3 w-3" />
          )}
        </Button>

        <div
          ref={setDraggableRef}
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing"
        >
          {isDragging ? (
            <GripVertical className="h-4 w-4 shrink-0 text-primary" />
          ) : isExpanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </div>
        <div
          className="flex-1 min-w-0 py-1 cursor-pointer"
          onClick={handleFolderClick}
        >
          <span className="text-sm truncate text-sidebar-foreground">{folder.name}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              data-testid={`button-folder-menu-${folder.id}`}
              className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onCreateFolder(folder.id)} data-testid={`menu-new-folder-in-folder-${folder.id}`}>
              {t('chat.sidebar.newFolder')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreateConversation(folder.id)} data-testid={`menu-new-conversation-in-folder-${folder.id}`}>
              {t('chat.sidebar.newConversation')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRenameFolder(folder.id)} data-testid={`menu-rename-folder-${folder.id}`}>
              {t('chat.sidebar.renameFolder')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDeleteFolder(folder.id)} data-testid={`menu-delete-folder-${folder.id}`} className="text-destructive">
              {t('chat.sidebar.deleteFolder')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isExpanded && (
        <div className="space-y-0.5 mt-0.5">
          {childFolders.map((childFolder) => (
            <FolderItem
              key={childFolder.id}
              folder={childFolder}
              allFolders={allFolders}
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              selectedFolderId={selectedFolderId}
              expandedFolderIds={expandedFolderIds}
              onSelectConversation={onSelectConversation}
              onSelectFolder={onSelectFolder}
              onFolderToggle={onFolderToggle}
              onCreateFolder={onCreateFolder}
              onCreateConversation={onCreateConversation}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onEditConversation={onEditConversation}
              onRenameConversation={onRenameConversation}
              onDeleteConversation={onDeleteConversation}
              depth={depth + 1}
            />
          ))}
          {folderConversations.map((conv) => (
            <DraggableConversation
              key={conv.id}
              conversation={conv}
              isSelected={selectedConversationId === conv.id}
              onSelect={() => onSelectConversation(conv.id)}
              onEdit={() => onEditConversation(conv.id)}
              onRename={() => onRenameConversation(conv.id)}
              onDelete={() => onDeleteConversation(conv.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SortableProject({
  project,
  isExpanded,
  isSelected,
  conversations,
  folders,
  selectedConversationId,
  selectedFolderId,
  expandedFolderIds,
  onToggle,
  onSelect,
  onSelectConversation,
  onSelectFolder,
  onFolderToggle,
  onCreateFolder,
  onCreateConversation,
  onRename,
  onDelete,
  onRenameFolder,
  onDeleteFolder,
  onEditConversation,
  onRenameConversation,
  onDeleteConversation,
}: {
  project: Project;
  isExpanded: boolean;
  isSelected: boolean;
  conversations: Conversation[];
  folders: Folder[];
  selectedConversationId: string | null;
  selectedFolderId: string | null;
  expandedFolderIds?: Set<string>;
  onToggle: () => void;
  onSelect: () => void;
  onSelectConversation: (id: string) => void;
  onSelectFolder: (folderId: string, projectId: string) => void;
  onFolderToggle?: (folderId: string) => void;
  onCreateFolder: (parentFolderId?: string) => void;
  onCreateConversation: (folderId?: string) => void;
  onRename: () => void;
  onDelete: () => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onEditConversation: (id: string) => void;
  onRenameConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sortable-project-${project.id}`,
    data: { project, type: "project" },
  });

  const { setNodeRef: setDroppableRef, isOver: isDropOver } = useDroppable({
    id: `droppable-project-${project.id}`,
    data: { project },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setDroppableRef} style={style}>
      <div
        className={`flex items-center gap-1 group hover-elevate rounded-sm transition-all duration-150 ${isSelected ? "bg-sidebar-accent" : ""
          } ${isDropOver ? "border-2 border-dashed border-primary bg-primary/10" : "border-2 border-transparent"}`}
        onClick={onSelect}
        data-testid={`project-item-${project.id}`}
      >
        <Button
          size="icon"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          data-testid={`button-toggle-project-${project.id}`}
          className="h-8 w-8 shrink-0"
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          className="flex items-center gap-2 flex-1 min-w-0 py-1.5 cursor-grab active:cursor-grabbing"
        >
          {isExpanded || isSelected ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="text-sm font-medium truncate text-sidebar-foreground">{project.name}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              data-testid={`button-project-menu-${project.id}`}
              className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onCreateFolder()} data-testid={`menu-new-folder-${project.id}`}>
              {t('chat.sidebar.newFolder')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreateConversation()} data-testid={`menu-new-conversation-${project.id}`}>
              {t('chat.sidebar.newConversation')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRename} data-testid={`menu-rename-project-${project.id}`}>
              {t('chat.sidebar.renameProject')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} data-testid={`menu-delete-project-${project.id}`} className="text-destructive">
              {t('chat.sidebar.deleteProject')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isExpanded && (
        <div className="space-y-0.5 mt-1">
          {folders.filter(f => !f.parentFolderId).map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              allFolders={folders}
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              selectedFolderId={selectedFolderId}
              expandedFolderIds={expandedFolderIds}
              onSelectConversation={onSelectConversation}
              onSelectFolder={onSelectFolder}
              onFolderToggle={onFolderToggle}
              onCreateFolder={onCreateFolder}
              onCreateConversation={onCreateConversation}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onEditConversation={onEditConversation}
              onRenameConversation={onRenameConversation}
              onDeleteConversation={onDeleteConversation}
            />
          ))}
          {conversations.filter(c => !c.folderId).map((conv) => (
            <DraggableConversation
              key={conv.id}
              conversation={conv}
              isSelected={selectedConversationId === conv.id}
              onSelect={() => onSelectConversation(conv.id)}
              onEdit={() => onEditConversation(conv.id)}
              onRename={() => onRenameConversation(conv.id)}
              onDelete={() => onDeleteConversation(conv.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ExplorerSidebar({
  projects,
  conversations,
  folders,
  selectedConversationId,
  selectedProjectId,
  selectedFolderId,
  expandedProjects,
  expandedFolderIds,
  onProjectToggle,
  onProjectSelect,
  onConversationSelect,
  onFolderSelect,
  onFolderToggle,
  onCreateProject,
  onCreateFolder,
  onCreateConversation,
  onRenameProject,
  onDeleteProject,
  onRenameFolder,
  onDeleteFolder,
  onEditConversation,
  onRenameConversation,
  onDeleteConversation,
  onMoveConversation,
  onMoveFolder,
  onReorderProjects,
}: ExplorerSidebarProps) {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading } = useAuth();

  const { data: subscriptionData } = useQuery<{
    subscription: { plan: string };
    usage: { projects: number; conversations: number; aiQueries: number; storageGB: number };
    limits: { projects: number; conversations: number; aiQueries: number; storageGB: number };
  }>({
    queryKey: ["/api/subscription"],
    enabled: isAuthenticated,
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // 드래그 활성화 조건: 10px 이상 이동해야 드래그 시작
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 10,
    },
  });
  const sensors = useSensors(pointerSensor);

  const getConversationsForProject = (projectId: string) => {
    return conversations.filter((c) => c.projectId === projectId);
  };

  const getFoldersForProject = (projectId: string) => {
    return folders.filter((f) => f.projectId === projectId);
  };

  const handleDragStart = useCallback((event: DragEndEvent) => {
    setActiveId(event.active.id as string);
    setOverId(null);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    setOverId(over ? (over.id as string) : null);
  }, []);

  // 폴더가 다른 폴더의 하위 폴더인지 확인 (자기 자신 또는 자손으로 드롭 방지)
  const isFolderDescendant = (folderId: string, potentialAncestorId: string): boolean => {
    if (folderId === potentialAncestorId) return true;

    const checkDescendants = (currentId: string): boolean => {
      const children = folders.filter((f) => f.parentFolderId === currentId);
      for (const child of children) {
        if (child.id === folderId) return true;
        if (checkDescendants(child.id)) return true;
      }
      return false;
    };

    return checkDescendants(potentialAncestorId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // 프로젝트 드래그 (정렬)
    if (activeId.startsWith("sortable-project-") && overId.startsWith("sortable-project-")) {
      const activeIndex = projects.findIndex((p) => `sortable-project-${p.id}` === activeId);
      const overIndex = projects.findIndex((p) => `sortable-project-${p.id}` === overId);

      if (activeIndex !== -1 && overIndex !== -1) {
        onReorderProjects(activeIndex, overIndex);
      }
      return;
    }

    // 대화를 폴더로 드래그
    if (activeId.startsWith("conversation-") && overId.startsWith("folder-")) {
      const conversationId = activeId.replace("conversation-", "");
      const folderId = overId.replace("folder-", "");

      const folder = folders.find((f) => f.id === folderId);
      const conversation = conversations.find((c) => c.id === conversationId);

      if (folder && conversation) {
        onMoveConversation(conversationId, folder.projectId, folderId);
      }
      return;
    }

    // 대화를 프로젝트로 드래그 (폴더에서 프로젝트 루트로 이동)
    if (activeId.startsWith("conversation-") && overId.startsWith("droppable-project-")) {
      const conversationId = activeId.replace("conversation-", "");
      const newProjectId = overId.replace("droppable-project-", "");

      const conversation = conversations.find((c) => c.id === conversationId);
      if (conversation) {
        // 폴더에서 빼서 프로젝트 루트로 이동 또는 다른 프로젝트로 이동
        onMoveConversation(conversationId, newProjectId, null);
      }
      return;
    }

    // 폴더를 다른 폴더로 드래그 (하위 폴더로 만들기)
    if (activeId.startsWith("draggable-folder-") && overId.startsWith("folder-")) {
      const draggedFolderId = activeId.replace("draggable-folder-", "");
      const targetFolderId = overId.replace("folder-", "");

      // 자기 자신 또는 자손 폴더로 드롭 방지
      if (isFolderDescendant(targetFolderId, draggedFolderId)) {
        return;
      }

      const targetFolder = folders.find((f) => f.id === targetFolderId);
      const draggedFolder = folders.find((f) => f.id === draggedFolderId);

      if (targetFolder && draggedFolder) {
        onMoveFolder(draggedFolderId, targetFolder.projectId, targetFolderId);
      }
      return;
    }

    // 폴더를 프로젝트로 드래그 (프로젝트 루트로 이동)
    if (activeId.startsWith("draggable-folder-") && overId.startsWith("droppable-project-")) {
      const draggedFolderId = activeId.replace("draggable-folder-", "");
      const newProjectId = overId.replace("droppable-project-", "");

      const draggedFolder = folders.find((f) => f.id === draggedFolderId);
      if (draggedFolder) {
        onMoveFolder(draggedFolderId, newProjectId, null);
      }
      return;
    }
  };

  const getUserDisplayName = () => {
    if (!user) return "";
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) return user.firstName;
    if (user.email) return user.email;
    return user.id;
  };

  const getUserInitials = () => {
    if (!user) return "?";
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.firstName) return user.firstName[0].toUpperCase();
    if (user.email) return user.email[0].toUpperCase();
    return user.id[0].toUpperCase();
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
          <h2 className="text-sm font-semibold text-sidebar-foreground">{t('chat.sidebar.projects')}</h2>
          <div className="flex items-center gap-1">
            <TrashView />
            <Button
              size="icon"
              variant="ghost"
              onClick={onCreateProject}
              data-testid="button-create-project"
              className="h-8 w-8"
              title={t('chat.sidebar.newProject')}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <SortableContext items={projects.map((p) => `sortable-project-${p.id}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {projects.map((project) => {
                const isExpanded = expandedProjects.has(project.id);
                const projectConversations = getConversationsForProject(project.id);

                const projectFolders = getFoldersForProject(project.id);

                return (
                  <SortableProject
                    key={project.id}
                    project={project}
                    isExpanded={isExpanded}
                    isSelected={selectedProjectId === project.id && !selectedFolderId}
                    conversations={projectConversations}
                    folders={projectFolders}
                    selectedConversationId={selectedConversationId}
                    selectedFolderId={selectedFolderId}
                    expandedFolderIds={expandedFolderIds}
                    onToggle={() => onProjectToggle(project.id)}
                    onSelect={() => onProjectSelect(project.id)}
                    onSelectConversation={onConversationSelect}
                    onSelectFolder={onFolderSelect || (() => { })}
                    onFolderToggle={onFolderToggle}
                    onCreateFolder={(parentFolderId) => onCreateFolder(project.id, parentFolderId)}
                    onCreateConversation={(folderId) => onCreateConversation(project.id, folderId)}
                    onRename={() => onRenameProject(project.id)}
                    onDelete={() => onDeleteProject(project.id)}
                    onRenameFolder={onRenameFolder}
                    onDeleteFolder={onDeleteFolder}
                    onEditConversation={onEditConversation}
                    onRenameConversation={onRenameConversation}
                    onDeleteConversation={onDeleteConversation}
                  />
                );
              })}
            </div>
          </SortableContext>
        </div>

        {/* Usage Display Section */}
        {isAuthenticated && subscriptionData && (
          <div className="border-t border-sidebar-border px-3 py-2" data-testid="usage-display">
            <div className="flex items-center gap-2">
              {subscriptionData.limits.storageGB > 0 && (
                <div className="flex-1">
                  <Progress
                    value={Math.min((subscriptionData.usage.storageGB / subscriptionData.limits.storageGB) * 100, 100)}
                    className="h-2"
                    data-testid="progress-storage"
                  />
                </div>
              )}
              <span className="text-xs text-muted-foreground whitespace-nowrap" data-testid="text-usage">
                ({subscriptionData.usage.storageGB}/{subscriptionData.limits.storageGB > 0 ? subscriptionData.limits.storageGB : '∞'}GB) ({subscriptionData.usage.aiQueries}/{subscriptionData.limits.aiQueries > 0 ? subscriptionData.limits.aiQueries : '∞'})
              </span>
            </div>
          </div>
        )}

        {/* User Login Section */}
        <div className="border-t border-sidebar-border p-3">
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-20 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ) : isAuthenticated && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover-elevate active-elevate-2 cursor-pointer"
                  data-testid="button-user-menu"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.profileImageUrl || undefined} alt={getUserDisplayName()} />
                    <AvatarFallback className="text-xs">{getUserInitials()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm flex-1 truncate text-sidebar-foreground">{getUserDisplayName()}</span>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => window.location.href = "/api/logout"}
                  data-testid="menu-logout"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  {t('chat.sidebar.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => window.location.href = "/login"}
              data-testid="button-login"
              className="w-full"
            >
              <LogIn className="h-4 w-4 mr-2" />
              {t('chat.sidebar.login')}
            </Button>
          )}
        </div>

        <DragOverlay>
          {activeId && activeId.startsWith("project-") && (
            <div className="px-2 py-1.5 bg-sidebar-accent rounded-sm shadow-lg flex items-center gap-2 opacity-80">
              <FolderIcon className="h-4 w-4" />
              <span className="text-sm">
                {projects.find((p) => p.id === activeId.replace("project-", ""))?.name || ""}
              </span>
            </div>
          )}
          {activeId && activeId.startsWith("conversation-") && (
            <div className="flex flex-col gap-1">
              <div className="px-2 py-1.5 bg-sidebar-accent rounded-sm shadow-lg flex items-center gap-2 opacity-80">
                <MessageSquare className="h-4 w-4" />
                <span className="text-sm">
                  {conversations.find((c) => c.id === activeId.replace("conversation-", ""))?.name || ""}
                </span>
              </div>
              {overId && overId.startsWith("folder-") && (
                <div className="ml-auto px-2 py-1 bg-primary text-primary-foreground rounded-sm shadow-lg text-xs flex items-center gap-1">
                  <span>→</span>
                  <span>
                    {t('chat.sidebar.moveToFolder', { folderName: folders.find((f) => f.id === overId.replace("folder-", ""))?.name || "" })}
                  </span>
                </div>
              )}
              {overId && overId.startsWith("project-") && (
                <div className="ml-auto px-2 py-1 bg-primary text-primary-foreground rounded-sm shadow-lg text-xs flex items-center gap-1">
                  <span>→</span>
                  <span>
                    {t('chat.sidebar.moveToProject', { projectName: projects.find((p) => p.id === overId.replace("project-", ""))?.name || "" })}
                  </span>
                </div>
              )}
            </div>
          )}
          {activeId && activeId.startsWith("draggable-folder-") && (
            <div className="flex flex-col gap-1">
              <div className="px-2 py-1.5 bg-sidebar-accent rounded-sm shadow-lg flex items-center gap-2 opacity-80">
                <FolderIcon className="h-4 w-4" />
                <span className="text-sm">
                  {folders.find((f) => f.id === activeId.replace("draggable-folder-", ""))?.name || ""}
                </span>
              </div>
              {overId && overId.startsWith("folder-") && (
                <div className="ml-auto px-2 py-1 bg-primary text-primary-foreground rounded-sm shadow-lg text-xs flex items-center gap-1">
                  <span>→</span>
                  <span>
                    {t('chat.sidebar.moveToFolder', { folderName: folders.find((f) => f.id === overId.replace("folder-", ""))?.name || "" })}
                  </span>
                </div>
              )}
              {overId && overId.startsWith("project-") && (
                <div className="ml-auto px-2 py-1 bg-primary text-primary-foreground rounded-sm shadow-lg text-xs flex items-center gap-1">
                  <span>→</span>
                  <span>
                    {t('chat.sidebar.moveToProject', { projectName: projects.find((p) => p.id === overId.replace("project-", ""))?.name || "" })}
                  </span>
                </div>
              )}
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
