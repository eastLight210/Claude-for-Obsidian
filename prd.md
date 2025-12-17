# Product Requirements Document (PRD)
## Obsidian Claude Code Plugin

**Version**: 1.0
**Last Updated**: 2025-12-17
**Status**: Planning

---

## 1. Product Overview

### 1.1 Vision
Provide seamless Claude AI integration within Obsidian, enabling users to analyze, write, and edit documents directly from the sidebar without leaving their note-taking workflow.

### 1.2 Key Differentiators
- **No API Key Required**: Uses Claude Code CLI with existing Claude Pro subscription
- **Native Obsidian Integration**: Works directly with vault files and active editor
- **Real-time Streaming**: Displays Claude responses as they're generated
- **Context-Aware**: Automatically provides document context to Claude

### 1.3 Success Criteria
- Users can chat with Claude from Obsidian sidebar
- Claude responses appear in real-time with streaming
- Users can insert Claude's responses into their documents with one click
- Plugin works seamlessly with Obsidian themes and mobile layout

---

## 2. Target Users

### Primary User Persona
**"Alex the Knowledge Worker"**
- Uses Obsidian daily for note-taking and knowledge management
- Has Claude Pro subscription
- Wants AI assistance without context switching
- Values privacy (prefers CLI over API keys)

### Use Cases
1. **Document Summarization**: Summarize long research notes
2. **Content Generation**: Generate meeting notes, drafts, outlines
3. **Text Editing**: Improve writing, fix grammar, rewrite sections
4. **Research Assistant**: Ask questions about document content
5. **Code Documentation**: Generate docs for code snippets in notes

---

## 3. Feature Requirements

### 3.1 Core Features (P0 - MVP)

#### F1: Sidebar Chat Interface
**Description**: A persistent chat view in Obsidian's sidebar where users can converse with Claude.

**Acceptance Criteria**:
- [ ] Chat view appears in right sidebar
- [ ] Users can type messages and send to Claude
- [ ] Messages display in chronological order with user/Claude distinction
- [ ] Markdown rendering for Claude responses
- [ ] Loading indicator while Claude processes

**Technical Requirements**:
- Extend `ItemView` class from Obsidian API
- Register view type in plugin manifest
- Implement message container with scroll support

---

#### F2: Current Document Context
**Description**: Automatically send the active document's content as context to Claude.

**Acceptance Criteria**:
- [ ] Toggle button to include/exclude current document
- [ ] Current document content sent with user message
- [ ] Visual indicator showing document is included
- [ ] Works with all Obsidian file types (markdown, canvas, etc.)

**Technical Requirements**:
- Use `app.workspace.getActiveFile()` and `app.vault.read()`
- Format context as: "Document: [filename]\n\n[content]"
- Respect max context length setting

---

#### F3: Streaming Responses
**Description**: Display Claude's response in real-time as it's being generated.

**Acceptance Criteria**:
- [ ] Response appears word-by-word or chunk-by-chunk
- [ ] No significant lag or UI blocking
- [ ] Partial markdown rendering updates as text arrives
- [ ] User can see response start within 1 second of request

**Technical Requirements**:
- Process stdout stream from Claude CLI
- Buffer and render chunks efficiently
- Handle incomplete UTF-8 sequences at boundaries

---

#### F4: Response Actions
**Description**: Quick actions to use Claude's responses.

**Acceptance Criteria**:
- [ ] "Insert to Document" button inserts response at cursor position
- [ ] "Copy" button copies response to clipboard
- [ ] Actions appear below each Claude message
- [ ] Visual feedback on action completion

**Technical Requirements**:
- Use Obsidian editor API for insertion
- Use Clipboard API for copy
- Show toast notification on success

---

#### F5: Selected Text Analysis
**Description**: Send only the selected text to Claude instead of full document.

**Acceptance Criteria**:
- [ ] Button to include selection as context
- [ ] Works when text is selected in active editor
- [ ] Disabled state when no selection exists
- [ ] Visual indicator showing selection is included

**Technical Requirements**:
- Use `editor.getSelection()` to get selected text
- Fallback to full document if no selection

---

#### F6: Conversation History
**Description**: Maintain chat history within a session.

**Acceptance Criteria**:
- [ ] Previous messages remain visible as user scrolls
- [ ] History persists during plugin session
- [ ] Clear history button to start fresh
- [ ] History limit configurable in settings (default: 50 messages)

**Technical Requirements**:
- Store messages in array: `{role: 'user'|'assistant', content: string}[]`
- Implement virtual scrolling for performance with long histories

---

### 3.2 Essential Features (P1 - Post-MVP)

#### F7: Settings Panel
**Description**: Configuration options for plugin behavior.

**Settings to Include**:
- [ ] Claude CLI path (default: `claude`)
- [ ] Default context inclusion (on/off)
- [ ] Max context length (default: 10000 tokens)
- [ ] Auto-copy responses (on/off)
- [ ] History limit (default: 50)

**Technical Requirements**:
- Extend `PluginSettingTab` class
- Save settings to `data.json`
- Validate Claude CLI path on save

---

#### F8: CLI Status Detection
**Description**: Detect if Claude CLI is installed and authenticated.

**Acceptance Criteria**:
- [ ] Check CLI availability on plugin load
- [ ] Show helpful error if CLI not found
- [ ] Provide installation instructions link
- [ ] Re-check on settings change

**Technical Requirements**:
- Run `claude --version` to verify installation
- Detect authentication by checking exit codes
- Show status in UI (ready/not installed/not authenticated)

---

#### F9: Error Handling
**Description**: Graceful handling of errors and edge cases.

**Error Scenarios**:
- [ ] CLI not found → Show installation guide
- [ ] CLI not authenticated → Show login instructions
- [ ] Network timeout → Show retry button
- [ ] Rate limit → Show clear error message
- [ ] Large context → Show warning and truncate

**Technical Requirements**:
- Distinguish error types by CLI exit codes
- Display user-friendly error messages
- Implement retry mechanism

---

#### F10: Create New Note from Response
**Description**: Save Claude's response as a new note in vault.

**Acceptance Criteria**:
- [ ] "Save as Note" button on responses
- [ ] Prompt for filename
- [ ] Create note in current folder or specified location
- [ ] Link to new note appears in chat

**Technical Requirements**:
- Use `app.vault.create(path, content)`
- Generate filename with timestamp if not provided

---

### 3.3 Future Enhancements (P2/P3)

#### F11: Template Prompts (P2)
- Save frequently used prompts
- Quick access via dropdown
- Variable substitution (e.g., `{{selection}}`)

#### F12: Multi-File Context (P2)
- Select multiple files to include as context
- File picker interface
- Show total context size

#### F13: Vault Search Integration (P2)
- Search vault for relevant notes
- Auto-include search results as context
- RAG-like functionality with local embeddings

#### F14: Command Palette Integration (P3)
- Execute common prompts via command palette
- Keyboard shortcuts for frequent actions
- Quick switches between contexts

#### F15: MCP Server Integration (P3)
- Expose Obsidian vault as MCP server
- Allow Claude to read/write files directly
- Enhanced file system operations

---

## 4. Non-Functional Requirements

### 4.1 Performance
- **Startup Time**: Plugin loads in < 1 second
- **Response Time**: First token from Claude appears in < 2 seconds
- **UI Responsiveness**: No UI blocking during Claude processing
- **Memory Usage**: < 100MB additional memory for typical usage

### 4.2 Compatibility
- **Obsidian Version**: v1.0.0 or higher
- **OS Support**: Windows, macOS, Linux
- **Claude CLI**: Latest stable version
- **Theme Compatibility**: Works with all Obsidian themes

### 4.3 Reliability
- **Uptime**: Plugin should not crash Obsidian
- **Data Safety**: Never modify files without user action
- **Session Persistence**: Recover gracefully from CLI crashes

### 4.4 Security
- **No API Key Storage**: Uses CLI authentication only
- **No Data Transmission**: All communication via local CLI
- **Safe Defaults**: Conservative context limits to prevent accidents

### 4.5 Usability
- **Learning Curve**: New users productive within 5 minutes
- **Accessibility**: Keyboard navigation for all actions
- **Documentation**: Clear README with examples

---

## 5. User Stories

### Epic 1: Basic Chat
```
AS AN Obsidian user
I WANT to chat with Claude in the sidebar
SO THAT I can get AI assistance without leaving Obsidian
```

**Stories**:
- US1.1: As a user, I can open Claude chat from the sidebar
- US1.2: As a user, I can type a message and see Claude's response
- US1.3: As a user, I can see previous messages in the conversation

### Epic 2: Document Integration
```
AS AN Obsidian user writing a note
I WANT to send my document to Claude
SO THAT I can get help improving or analyzing it
```

**Stories**:
- US2.1: As a user, I can include the current document when chatting
- US2.2: As a user, I can include only selected text
- US2.3: As a user, I can insert Claude's response into my document

### Epic 3: Configuration
```
AS AN Obsidian user with custom setup
I WANT to configure the plugin
SO THAT it works with my environment and preferences
```

**Stories**:
- US3.1: As a user, I can specify Claude CLI path
- US3.2: As a user, I can set default context preferences
- US3.3: As a user, I can control history length

---

## 6. Technical Architecture

### 6.1 Component Overview
```
┌─────────────────────────────────────┐
│         Obsidian Plugin             │
│  ┌───────────────────────────────┐  │
│  │      main.ts (Entry)          │  │
│  └───────────────────────────────┘  │
│            │           │             │
│            ▼           ▼             │
│  ┌─────────────┐  ┌──────────────┐  │
│  │ ClaudeView  │  │ Settings Tab │  │
│  │  (UI Layer) │  │              │  │
│  └─────────────┘  └──────────────┘  │
│            │                         │
│            ▼                         │
│  ┌─────────────────────────────┐    │
│  │    ClaudeService            │    │
│  │  (Business Logic)           │    │
│  │  - spawn/manage process     │    │
│  │  - stream handling          │    │
│  │  - session management       │    │
│  └─────────────────────────────┘    │
│            │                         │
└────────────┼─────────────────────────┘
             ▼
    ┌────────────────┐
    │  Claude CLI    │
    │  (External)    │
    └────────────────┘
```

### 6.2 Data Flow
1. User types message in ClaudeView
2. ClaudeView collects context (document/selection) if enabled
3. ClaudeView calls ClaudeService.sendMessage()
4. ClaudeService spawns Claude CLI process
5. ClaudeService writes context + message to stdin
6. ClaudeService reads stdout chunks
7. ClaudeService calls onChunk callback for each chunk
8. ClaudeView renders chunk in UI
9. Process completes, full response available
10. User can take actions (insert, copy, save)

### 6.3 File Structure
```
src/
├── main.ts                     # Plugin registration
├── services/
│   └── ClaudeService.ts       # CLI communication
├── views/
│   └── ClaudeView.ts          # Main UI
├── components/
│   ├── ChatMessage.ts         # Message component
│   ├── InputArea.ts           # Input with context options
│   └── ActionButtons.ts       # Response actions
├── settings/
│   └── SettingsTab.ts         # Settings UI
└── types/
    └── index.ts               # TypeScript definitions
```

---

## 7. Implementation Phases

### Phase 1: Foundation (MVP Core)
**Goal**: Basic working plugin with chat functionality

**Features**: F1, F2, F3, F4
**Duration**: 3-5 days
**Success**: User can chat with Claude and see responses

**Deliverables**:
- Working sidebar view
- Claude CLI integration
- Streaming responses
- Basic UI

---

### Phase 2: Context & Actions (MVP Complete)
**Goal**: Full document integration and response actions

**Features**: F5, F6
**Duration**: 2-3 days
**Success**: User can work with documents and manage conversations

**Deliverables**:
- Selection handling
- Conversation history
- Insert/copy actions

---

### Phase 3: Configuration & Polish (Post-MVP)
**Goal**: Production-ready with proper error handling

**Features**: F7, F8, F9
**Duration**: 2-3 days
**Success**: Plugin is stable and user-friendly

**Deliverables**:
- Settings panel
- CLI detection
- Error handling
- User documentation

---

### Phase 4: Enhanced Features (Optional)
**Goal**: Power user features

**Features**: F10, F11, F12
**Duration**: 3-5 days
**Success**: Advanced workflows supported

**Deliverables**:
- Save as note
- Template prompts
- Multi-file context

---

## 8. Success Metrics

### User Engagement
- **Daily Active Users**: Track plugin usage frequency
- **Messages Per Session**: Average interactions per chat session
- **Feature Adoption**: % of users using each feature

### Technical Performance
- **Response Time**: Average time to first token
- **Error Rate**: % of failed requests
- **Crash Rate**: Plugin stability metric

### User Satisfaction
- **GitHub Stars**: Community interest
- **Issue Resolution Time**: Average time to fix bugs
- **Feature Requests**: User engagement with roadmap

---

## 9. Risks & Mitigations

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Claude CLI changes API | High | Medium | Abstract CLI interface, version checks |
| Memory leaks in streaming | Medium | Medium | Proper cleanup, process monitoring |
| Large context crashes CLI | Medium | High | Context length limits, validation |
| Cross-platform path issues | Medium | Medium | Thorough testing, path normalization |

### Product Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Users don't have CLI installed | High | High | Clear installation guide, auto-detection |
| Competing plugins emerge | Medium | Medium | Focus on quality and unique features |
| Claude CLI requires paid tier | High | Low | Document requirements clearly |

---

## 10. Open Questions

1. **Session Persistence**: Should conversation history persist across Obsidian restarts?
2. **Context Strategies**: Should we implement smart context selection (e.g., linked notes)?
3. **Mobile Support**: Can we support Obsidian mobile despite CLI limitation?
4. **Rate Limiting**: How do we handle Claude CLI rate limits gracefully?
5. **Collaborative Features**: Should we support shared prompts/templates?

---

## 11. Out of Scope (V1)

The following are explicitly NOT included in the initial release:

- Mobile app support
- Image/audio input
- Real-time collaboration
- Cloud sync of conversations
- Built-in prompt marketplace
- Custom model selection
- Batch processing of multiple notes
- Automatic note generation pipelines
- Integration with external tools (Notion, etc.)

---

## 12. Dependencies

### Required
- Node.js (via Obsidian)
- Claude Code CLI installed and authenticated
- Obsidian v1.0.0+

### Development
- TypeScript
- esbuild
- Obsidian API types

### Runtime
- No external npm packages beyond Obsidian API

---

## 13. Acceptance Criteria (Launch Checklist)

### Functionality
- [ ] All P0 features implemented and tested
- [ ] Works on Windows, macOS, Linux
- [ ] No data loss scenarios identified
- [ ] Error messages are user-friendly

### Quality
- [ ] No critical bugs in issue tracker
- [ ] Manual testing completed for all user stories
- [ ] Performance meets non-functional requirements
- [ ] Compatible with popular Obsidian themes

### Documentation
- [ ] README with installation instructions
- [ ] Usage examples with screenshots
- [ ] Settings documentation
- [ ] Troubleshooting guide

### Compliance
- [ ] No API keys or secrets in code
- [ ] License file included (MIT)
- [ ] Privacy policy if collecting telemetry
- [ ] Claude usage terms acknowledged

---

## Appendix A: CLI Integration Details

### Command Format
```bash
# Basic message
claude -p "Your prompt here"

# With context
echo "Context content" | claude -p "Question about context"
```

### Process Management
```typescript
import { spawn } from 'child_process';

const proc = spawn('claude', ['-p', prompt], {
  stdio: ['pipe', 'pipe', 'pipe'],
  encoding: 'utf-8'
});

// Write context
proc.stdin.write(context);
proc.stdin.end();

// Stream output
proc.stdout.on('data', chunk => {
  renderChunk(chunk.toString());
});

// Handle errors
proc.stderr.on('data', err => {
  handleError(err.toString());
});

// Cleanup
proc.on('close', code => {
  if (code !== 0) handleError();
});
```

### Error Code Mapping
- **127**: Command not found (CLI not installed)
- **1**: Authentication error (not logged in)
- **2**: Invalid arguments
- **130**: User interrupted (Ctrl+C)
- **timeout**: Network/processing timeout

---

## Appendix B: UI Mockups

See plan.md sections 5.1 and 5.2 for detailed UI layout and user flow diagrams.

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-17 | Initial | First draft based on plan.md |

---

**Next Steps**: Review PRD → Approve features → Begin Phase 1 implementation
