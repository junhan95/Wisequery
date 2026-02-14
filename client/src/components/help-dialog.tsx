import { useState, type ReactNode } from "react";
import { HelpCircle, Keyboard, MousePointer, Folder, MessageSquare, Search, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "react-i18next";

interface ShortcutItemProps {
  keys: string[];
  description: string;
}

function ShortcutItem({ keys, description }: ShortcutItemProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-foreground">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span key={i}>
            <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border border-border">
              {key}
            </kbd>
            {i < keys.length - 1 && <span className="mx-1 text-muted-foreground">+</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

interface FeatureItemProps {
  icon: ReactNode;
  title: string;
  description: string;
}

function FeatureItem({ icon, title, description }: FeatureItemProps) {
  return (
    <div className="flex gap-3 p-3 rounded-lg border border-border bg-card">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div>
        <h4 className="font-medium text-foreground">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function HelpDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const shortcuts = [
    { keys: ["Enter"], description: t('help.shortcuts.send') },
    { keys: ["Shift", "Enter"], description: t('help.shortcuts.newLine') },
    { keys: ["Ctrl/Cmd", "Click"], description: t('help.shortcuts.tagFile') },
    { keys: ["Shift", "Click"], description: t('help.shortcuts.multiSelect') },
    { keys: ["Ctrl/Cmd", "C"], description: t('help.shortcuts.copy') },
    { keys: ["Ctrl/Cmd", "V"], description: t('help.shortcuts.paste') },
    { keys: ["Ctrl/Cmd", "X"], description: t('help.shortcuts.cut') },
    { keys: ["Ctrl/Cmd", "E"], description: t('help.shortcuts.edit') },
    { keys: ["Ctrl/Cmd", "S"], description: t('help.shortcuts.save') },
    { keys: ["Escape"], description: t('help.shortcuts.close') },
    { keys: ["Delete"], description: t('help.shortcuts.delete') },
  ];

  const features = [
    {
      icon: <Folder className="h-5 w-5" />,
      title: t('help.features.projects.title'),
      description: t('help.features.projects.description'),
    },
    {
      icon: <MessageSquare className="h-5 w-5" />,
      title: t('help.features.chat.title'),
      description: t('help.features.chat.description'),
    },
    {
      icon: <Search className="h-5 w-5" />,
      title: t('help.features.search.title'),
      description: t('help.features.search.description'),
    },
    {
      icon: <FileText className="h-5 w-5" />,
      title: t('help.features.files.title'),
      description: t('help.features.files.description'),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          data-testid="button-help"
          className="h-8 w-8"
          title={t('help.title')}
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            {t('help.title')}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="guide" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="guide" data-testid="tab-guide">
              <MousePointer className="h-4 w-4 mr-2" />
              {t('help.tabs.guide')}
            </TabsTrigger>
            <TabsTrigger value="shortcuts" data-testid="tab-shortcuts">
              <Keyboard className="h-4 w-4 mr-2" />
              {t('help.tabs.shortcuts')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="guide" className="mt-4">
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {features.map((feature, i) => (
                  <FeatureItem
                    key={i}
                    icon={feature.icon}
                    title={feature.title}
                    description={feature.description}
                  />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="shortcuts" className="mt-4">
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-1">
                {shortcuts.map((shortcut, i) => (
                  <ShortcutItem
                    key={i}
                    keys={shortcut.keys}
                    description={shortcut.description}
                  />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
