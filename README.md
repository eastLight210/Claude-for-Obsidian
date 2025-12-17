# Claude for Obsidian

An Obsidian plugin that integrates Claude Code CLI into the sidebar for document analysis, writing assistance, and AI-powered conversations.

## Features

- **Sidebar Chat Interface**: Chat with Claude directly in Obsidian's sidebar
- **Document Context**: Send current document or selection as context
- **Session Persistence**: Maintains conversation history within a session
- **Tool Approval System**: Review and approve Claude's tool usage
- **MCP Support**: Works with MCP servers configured in Claude Code CLI
- **No API Key Required**: Uses Claude Code CLI with your existing Claude subscription

## Requirements

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Claude Pro/Team/Enterprise subscription (for CLI access)
- Obsidian v1.0.0 or higher

## Installation

### Manual Installation

1. Download the latest release (`main.js`, `manifest.json`, `styles.css`)
2. Create a folder `claude-for-obsidian` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into the folder
4. Enable the plugin in Obsidian Settings → Community Plugins

### From Source

```bash
git clone https://github.com/eastLight210/Claude-for-Obsidian.git
cd Claude-for-Obsidian
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder.

## Usage

1. Open the Claude sidebar by clicking the brain icon in the left ribbon
2. Type your message in the input field
3. Use context options to include:
   - **Full Document**: Sends entire current document
   - **Selection**: Sends only selected text
   - **None**: Chat without document context

### Keyboard Shortcuts

- `Enter`: Send message
- `Shift+Enter`: New line

## Configuration

Access settings via Settings → Claude for Obsidian:

- **Claude CLI Path**: Path to Claude CLI executable (default: `claude`)
- **System Prompt**: Custom instructions for Claude
- **Auto-approve Read Tools**: Automatically approve read-only operations

## How It Works

This plugin spawns Claude Code CLI in print mode (`-p`) with streaming JSON output. It:

1. Maintains session continuity using `--resume`
2. Handles tool approvals via `--allowedTools`
3. Streams responses in real-time
4. Supports MCP servers configured in your Claude settings

## License

MIT
