# WiseQuery Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

## [2024-12-04]

### Added
- **Document Parsing Support:** Comprehensive parsing for PDF, Word (.docx), Excel (.xlsx), and PowerPoint (.pptx) files integrated into the WebSocket tagged file handler
- **File & Conversation Tagging:** Ctrl+left-click interaction to tag files and conversations for AI context injection
  - Mixed type support with `type` field ("file" | "conversation")
  - System prompt hierarchy: FILES → CONVERSATIONS → RAG CONTEXT
  - `@{filename}` stored in database, `[filename]` badges displayed in UI
- **FileViewer Large Icons View:**
  - Image thumbnails using `/api/files/:id/view` endpoint
  - File type icons for non-image files
  - 6-level mouse wheel zoom (64px, 96px, 128px, 160px, 192px, 256px)
  - Default size: 128px (index 2)
- **Chat Message Animations:** Smooth fade-in animations for natural message transitions

### Fixed
- **Chat Streaming UX:** Proper `await queryClient.invalidateQueries()` before clearing streaming state to prevent message flicker
- **Toast Notifications:** Auto-dismiss after 1 second for less intrusive feedback
- **Wheel Zoom Browser Interference:** Event capture phase (`capture: true`) on ScrollArea parent container prevents browser Ctrl+Wheel zoom from interfering with icon size adjustment

### Technical Details
- Wheel zoom uses `scrollContainerRef` wrapping ScrollArea with `overflow-hidden`
- Always invalidate `/api/subscription` when project/conversation counts change
- ICON_SIZES constant: `[64, 96, 128, 160, 192, 256]`

---

## [2024-12-03]

### Added
- Initial WiseQuery application with Windows Explorer-style AI chat interface
- Project-based RAG knowledge management system
- 4-tier Stripe subscription system (Free/Basic/Pro/Custom)
- Dual authentication (session-based + email/password with SendGrid verification)
- Hierarchical folder organization with drag-and-drop (@dnd-kit)
- 3-panel layout with resizable panels
- Complete multilingual support (English/Korean) via i18next
- Real-time AI response streaming via WebSocket
- Semantic search with OpenAI embeddings
- Markdown rendering with syntax highlighting
- Dark mode support with localStorage persistence

---

## Version History Summary

| Date | Version | Highlights |
|------|---------|------------|
| 2024-12-04 | v1.2.0 | Document parsing, file tagging, large icons view with zoom |
| 2024-12-03 | v1.1.0 | Core application with RAG, subscriptions, auth, i18n |
