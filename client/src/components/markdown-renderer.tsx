import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  Lightbulb, 
  Star, 
  Zap, 
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  Circle,
  Square,
  Hash
} from "lucide-react";
import type { Components } from "react-markdown";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const emojiIconMap: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  '✅': { icon: CheckCircle2, color: 'text-emerald-500' },
  '✓': { icon: CheckCircle2, color: 'text-emerald-500' },
  '☑': { icon: CheckCircle2, color: 'text-emerald-500' },
  '❌': { icon: AlertCircle, color: 'text-red-500' },
  '✗': { icon: AlertCircle, color: 'text-red-500' },
  '⚠️': { icon: AlertTriangle, color: 'text-amber-500' },
  '⚠': { icon: AlertTriangle, color: 'text-amber-500' },
  'ℹ️': { icon: Info, color: 'text-blue-500' },
  'ℹ': { icon: Info, color: 'text-blue-500' },
  '💡': { icon: Lightbulb, color: 'text-yellow-500' },
  '⭐': { icon: Star, color: 'text-yellow-500' },
  '★': { icon: Star, color: 'text-yellow-500' },
  '⚡': { icon: Zap, color: 'text-amber-500' },
  '👍': { icon: ThumbsUp, color: 'text-emerald-500' },
  '👎': { icon: ThumbsDown, color: 'text-red-500' },
  '→': { icon: ArrowRight, color: 'text-primary' },
  '➡️': { icon: ArrowRight, color: 'text-primary' },
  '•': { icon: Circle, color: 'text-primary' },
  '■': { icon: Square, color: 'text-primary' },
};

function replaceEmojisWithIcons(text: string, keyPrefix: string = ''): (string | JSX.Element)[] {
  const result: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  
  const emojiPattern = new RegExp(
    Object.keys(emojiIconMap).map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'g'
  );
  
  let match;
  let matchCount = 0;
  while ((match = emojiPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }
    
    const iconInfo = emojiIconMap[match[0]];
    if (iconInfo) {
      const IconComponent = iconInfo.icon;
      result.push(
        <IconComponent 
          key={`${keyPrefix}icon-${matchCount++}`} 
          className={`inline-block h-4 w-4 ${iconInfo.color} mr-1 align-text-bottom`} 
        />
      );
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }
  
  return result.length > 0 ? result : [text];
}

let textKeyCounter = 0;

const customComponents: Partial<Components> = {
  text: ({ children }) => {
    if (typeof children === 'string') {
      const result = replaceEmojisWithIcons(children, `t${textKeyCounter++}-`);
      return <>{result}</>;
    }
    return <>{children}</>;
  },
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold text-primary mb-4 mt-6 first:mt-0 pb-2 border-b border-primary/20">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-bold text-foreground mb-3 mt-5 first:mt-0 flex items-center gap-2">
      <Hash className="h-5 w-5 text-primary/60" />
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold text-foreground mb-2 mt-4 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-base font-semibold text-foreground mb-2 mt-3 first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-foreground leading-relaxed mb-3 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-bold text-foreground">
      {children}
    </strong>
  ),
  em: ({ children }) => (
    <em className="italic text-muted-foreground">
      {children}
    </em>
  ),
  ul: ({ children }) => (
    <ul className="markdown-ul space-y-2 my-3 ml-1">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="markdown-ol space-y-2 my-3 ml-1 counter-reset-list">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="markdown-li text-foreground leading-relaxed">
      {children}
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-primary bg-primary/5 dark:bg-primary/10 pl-4 py-2 my-4 rounded-r-md italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="px-1.5 py-0.5 rounded-md bg-muted text-primary font-mono text-sm">
          {children}
        </code>
      );
    }
    return (
      <code className={className}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-muted/50 dark:bg-muted/30 border border-border rounded-lg p-4 overflow-x-auto my-4 text-sm">
      {children}
    </pre>
  ),
  hr: () => (
    <hr className="my-6 border-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
  ),
  a: ({ href, children }) => (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer"
      className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-4 rounded-lg border border-border">
      <table className="w-full text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/50 dark:bg-muted/30">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2 text-left font-semibold text-foreground border-b border-border">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2 text-foreground border-b border-border/50">
      {children}
    </td>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-muted/30 transition-colors">
      {children}
    </tr>
  ),
};

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={customComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

