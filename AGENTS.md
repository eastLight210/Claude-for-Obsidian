# AGENTS.md

## Build Commands
- `npm run dev` - Development build with watch mode
- `npm run build` - Production build (minified)
- No test framework; test manually in Obsidian (Cmd+R to reload)

## Code Style
- **TypeScript**: `strictNullChecks`, `noImplicitAny` enabled (see tsconfig.json)
- **Imports**: Named imports from 'obsidian', relative paths with `./` prefix
- **Types**: Define in `src/types/index.ts`, use JSDoc `/** */` for public methods
- **Naming**: PascalCase (classes/interfaces), camelCase (variables/functions), SCREAMING_SNAKE_CASE (constants)
- **Error Handling**: Return `{ success: boolean, content?, error? }` pattern (see ClaudeResponse), never throw
- **Async**: async/await with Promise wrappers, handle timeouts explicitly (5min default, 10s for version check)
- **Comments**: Korean comments acceptable and common throughout codebase

## Architecture
- Entry: `src/main.ts` extends Obsidian `Plugin`
- `src/services/ClaudeService.ts` - CLI process lifecycle via `child_process.spawn`, UTF-8 streaming with `StringDecoder`
- `src/views/ClaudeView.ts` - Sidebar UI extending `ItemView`, view type: `claude-view`
- `src/settings/SettingsTab.ts` - Plugin settings UI
- GUI apps don't inherit terminal PATH; ClaudeService searches COMMON_PATHS and uses `getExtendedEnv()`
