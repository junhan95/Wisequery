# Design Guidelines: AI Chat Explorer Application

## Design Approach
**Hybrid Reference-Based**: Windows Explorer + Modern SaaS
- Primary references: Windows File Explorer (dual-pane efficiency, information density), Linear (clean typography, spacious cards), VS Code (sidebar navigation, dark-compatible)
- Key principle: Productivity-focused layout with modern polish—functional density without visual clutter
- Brand continuity: Maintains Inter font, sharp edges, and spacing system from marketing site

## Core Layout Structure

### Application Shell
- **Fixed dual-pane layout**: Left sidebar (280px) + main content area (flex-1)
- **Header bar**: Fixed top, 60px height, backdrop blur, contains search, user controls
- **Sidebar sections**: Collapsible tree navigation (projects/conversations), takes full sidebar height
- **Main content**: Chat interface or file management view, full remaining width
- **No rounded containers**: Sharp edges throughout, consistent with brand identity

### Spacing System
Tailwind units: **2, 4, 6, 8, 12, 16** (tighter than marketing for information density)
- Toolbar/header padding: p-4
- Sidebar item padding: px-4 py-2
- Chat message spacing: gap-4 between messages
- Section spacing: py-6 for panel headers, gap-2 for tree items

## Typography Hierarchy

### Font Stack
- **All text**: Inter, -apple-system, sans-serif (universal consistency)
- **Code/paths**: 'Cascadia Code', 'Consolas', monospace

### Text Sizes
- **Panel headers**: text-sm (14px) font-semibold uppercase tracking-wide
- **Tree items**: text-sm (14px) font-medium
- **Chat messages**: text-base (16px) for readability
- **Message metadata**: text-xs (12px) muted
- **File names**: text-sm (14px)
- **Toolbar buttons**: text-sm (14px)

### Font Weights
- Semibold (600): Panel headers, active tree items
- Medium (500): Default tree items, file names
- Regular (400): Chat messages, descriptions

## Component Library

### Sidebar Navigation Tree
- **Tree structure**: Nested indentation (pl-4 per level), chevron icons for expand/collapse
- **Item layout**: Icon (16px) + label, full-width clickable area, px-4 py-2
- **States**: Default (subtle hover), active (accent border-l-2), expanded (chevron rotated)
- **Icons**: fa-folder, fa-folder-open, fa-comments, fa-file-alt
- **Sections**: "Projects" header, "Recent Conversations" header, collapsible groups

### Chat Interface (Main Content Area)
- **Message list**: Scrollable container, messages stack vertically with gap-4
- **Message card**: Avatar (32px circle) + content block, p-4, subtle border
- **Message types**: User message (right-aligned accent), AI response (left-aligned), system (centered, muted)
- **Context indicators**: Small chips showing RAG sources, file references (text-xs, px-2 py-1)
- **Input area**: Fixed bottom, textarea + send button, toolbar for attachments/formatting

### Search Overlay
- **Trigger**: Command palette style (Ctrl+K), appears as centered modal overlay
- **Input**: Large search field (text-lg), autofocus, with search icon prefix
- **Results**: List below input, shows conversations/files/messages, keyboard navigable
- **Result items**: Icon + title + breadcrumb path (text-xs muted), highlight matching text
- **Backdrop**: Slight blur, dismissible click-outside

### File Management Panel
- **View modes**: List view (default), grid view toggle in toolbar
- **List view**: Icon + filename + size + modified date, sortable columns, row hover
- **Grid view**: Card grid (grid-cols-4), thumbnail + filename below, p-4 per card
- **Actions toolbar**: Upload, new folder, delete, move buttons with icons

### Top Header Bar
- **Left section**: Breadcrumb navigation (current project/folder path)
- **Center**: Global search trigger button (icon + "Search..." placeholder text)
- **Right section**: User avatar (32px) + dropdown menu, settings icon

## Icons
**Font Awesome 6**:
- Navigation: fa-folder, fa-folder-open, fa-comments, fa-file-alt, fa-chevron-right
- Chat: fa-user, fa-robot, fa-paperclip, fa-paper-plane, fa-link
- Actions: fa-search, fa-cog, fa-upload, fa-trash, fa-ellipsis-v
- File types: fa-file-code, fa-file-pdf, fa-file-image, fa-file-text

## Images

### In-Application Imagery
- **File thumbnails**: Generated previews for images/PDFs in grid view (120x120px)
- **Avatar placeholders**: User/AI avatars in chat (32px circles, initials or icons)
- **Empty states**: Illustration when no conversations/files (centered, max 300px wide, muted)
- **No hero images**: Utility application—content is the focus

## Visual Treatment

### Density & Information Hierarchy
- **High information density**: Compact tree items, efficient use of space
- **Visual breathing room**: Strategic gap-4 between major sections, p-4 for panels
- **Subtle separators**: 1px borders between sidebar/main, panel sections
- **Hover states**: Subtle background change (opacity), no heavy shadows

### Interactive States
- **Default**: Clean, minimal styling
- **Hover**: Slight background tint, cursor pointer
- **Active/Selected**: Accent left border (border-l-2), slightly bolder text
- **Focus**: 2px outline offset for keyboard navigation

## Responsive Behavior
- **Desktop (lg:)**: Full dual-pane layout as described
- **Tablet (md:)**: Collapsible sidebar (hamburger toggle), overlay when open
- **Mobile**: Sidebar drawer, full-width main content, simplified toolbar
- **Breakpoint actions**: Sidebar auto-collapses below 1024px

## Accessibility
- **Keyboard navigation**: Full tree keyboard support, tab order, Escape to close modals
- **Focus indicators**: Visible outlines on all interactive elements
- **ARIA**: Tree roles, expanded states, message list with proper landmarks
- **Screen reader**: Descriptive labels for icon-only buttons, live regions for new messages

## Key Design Principles
1. **Functional density**: Pack information efficiently without overwhelming
2. **Familiar patterns**: Windows Explorer muscle memory meets modern SaaS polish
3. **Keyboard-first**: Power users can navigate entirely via keyboard
4. **Context awareness**: Visual indicators show file relationships, conversation context
5. **Consistent with marketing**: Same fonts, spacing philosophy, sharp-edge brand identity