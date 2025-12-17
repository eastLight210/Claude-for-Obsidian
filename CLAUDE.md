# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An Obsidian plugin that integrates Claude Code CLI into the sidebar for document analysis, writing, and editing. Uses Claude Code CLI (not API keys) - users must have it installed and logged in with their Claude Pro subscription.

## Build Commands

```bash
npm run dev    # Development build with watch mode
npm run build  # Production build (minified)
```

Output: `main.js` loaded by Obsidian.

## Architecture

```
┌─────────────────────────────────────┐
│      Obsidian Application           │
├─────────────────────────────────────┤
│  Vault ◄──► ClaudePlugin (main.ts)  │
│  Files      ├─ ClaudeService        │
│             │  (CLI via Node.js)    │
│             ├─ ClaudeView           │
│             │  (Sidebar UI)         │
│             └─ ClaudeSettingsTab    │
└─────────────────────────────────────┘
               │
               ▼ spawn(node, [claude.js, ...])
       ┌──────────────┐
       │ Claude Code  │
       │    CLI       │
       └──────────────┘
```

## Core Components

### ClaudeService (`src/services/ClaudeService.ts`)
Manages Claude CLI process lifecycle with these key features:

- **Path Resolution**: GUI apps don't inherit terminal PATH. Service searches common paths (`/opt/homebrew/bin`, `/usr/local/bin`, etc.) and resolves symlinks via `realpathSync`.
- **Node.js Execution**: Spawns CLI via `spawn(nodePath, [resolvedClaudePath, ...args])` rather than direct CLI execution for reliability.
- **UTF-8 Handling**: `splitUTF8Buffer()` handles multi-byte character boundaries in streaming chunks (critical for Korean text).
- **Extended ENV**: Adds common bin paths to PATH and sets `LANG=en_US.UTF-8`.

Key methods:
```typescript
checkAvailability(): Promise<ClaudeStatusInfo>  // Verify CLI status
sendMessage(options, onChunk): Promise<ClaudeResponse>  // Streaming response
abort(): void  // Kill current process
```

### ClaudeView (`src/views/ClaudeView.ts`)
Single-file sidebar UI extending `ItemView`:
- View type: `claude-view`
- Renders messages with `MarkdownRenderer.render()`
- Context toggles for document/selection
- Action buttons: Insert to document, Copy, Save as note
- Auto-scroll and history limit enforcement

### Type Definitions (`src/types/index.ts`)
All TypeScript interfaces including `ClaudePluginSettings`, `ChatMessage`, `ClaudeStatusInfo`, `SendMessageOptions`.

## Development Workflow

1. Create symlink: `ln -s /path/to/project ~/.obsidian/plugins/claude-for-obsidian`
2. Run `npm run dev`
3. Enable plugin in Obsidian Settings → Community plugins
4. Use Cmd+R (Mac) or Ctrl+R to reload after changes

## Key Implementation Details

### CLI Communication
```typescript
// Context is prepended to prompt, not piped via stdin
const prompt = `Document: ${fileName}\n\n${context}\n\n---\n\nUser Question: ${message}`;
spawn(nodePath, [resolvedClaudePath, '-p', prompt], { env: extendedEnv });
```

### Obsidian API Patterns
```typescript
// Get active file content
const file = this.app.workspace.getActiveFile();
const content = await this.app.vault.read(file);

// Get selection
const editor = this.app.workspace.activeEditor?.editor;
const selection = editor?.getSelection();

// Insert at cursor
editor.replaceSelection(content);

// Markdown rendering in view
MarkdownRenderer.render(this.app, content, containerEl, '', this);
```

### Error Types
- `CLI_NOT_FOUND`: ENOENT or exit code 127
- `NOT_AUTHENTICATED`: stderr contains 'auth', 'login', 'unauthorized'
- `RATE_LIMIT`: stderr contains 'rate' or 'limit'
- `TIMEOUT`: 5 minute default, 10 second for version check

## Common Issues

### PATH Not Found in GUI
Obsidian (Electron) doesn't inherit terminal PATH. `ClaudeService.COMMON_PATHS` and `getExtendedEnv()` handle this by searching common installation directories.

### UTF-8 Streaming
Chunks may split multi-byte characters. `splitUTF8Buffer()` buffers incomplete sequences until next chunk.

### Process Cleanup
`onClose()` calls `abort()`. Always kill process on view close to prevent orphans.

## Permission System

Interactive permission handling for Claude tool usage:

### Architecture
```
Claude CLI (stream-json) → Parse tool_use events → Show PermissionModal → User approves/denies
```

### Key Components
- **PermissionModal** (`src/components/PermissionModal.ts`): Obsidian modal for permission requests
- **ClaudeService**: Parses `--output-format stream-json`, calls permission callback on tool_use
- **ClaudeView**: Shows modal via `handlePermissionRequest()`, displays tool status in UI

### Settings
- `autoApproveReadOnly`: Auto-approve low-risk tools (Read, Glob, Grep, etc.)
- `rememberApprovedTools`: Remember approved tools for session duration

### Tool Risk Levels
- **Low** (auto-approve): View, Read, Glob, Grep, LS, ReadNotebook
- **Medium** (ask): Edit, Write, NotebookEdit, MultiEdit
- **High** (ask): Bash, Terminal, Execute
