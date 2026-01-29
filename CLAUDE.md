# CLAUDE.md - Project Context for AI Assistants

This file provides context for AI assistants working on this project.

## Project Overview

**obsidian-qmd** is an Obsidian plugin that integrates [QMD (Quick Markdown Search)](https://github.com/tobi/qmd) to provide semantic-first search in Obsidian vaults. It's a desktop-only plugin that uses QMD's vector search (semantic) as the default, with keyword (BM25) search as a fallback.

## What Has Been Implemented

### Project Structure (Complete)
```
obsidian-qmd/
├── src/
│   ├── main.ts           # ✅ Plugin entry point
│   ├── settings.ts       # ✅ Settings types and defaults
│   ├── qmd.ts            # ✅ QMD CLI wrapper with queue management + cancellation
│   ├── searchModal.ts    # ✅ Search modal UI (SuggestModal)
│   ├── searchPane.ts     # ✅ Optional sidebar search pane (ItemView)
│   ├── settingsTab.ts    # ✅ Settings UI tab
│   ├── settings.test.ts  # ✅ Tests for settings
│   ├── qmd.test.ts       # ✅ Tests for QMD wrapper
│   └── __mocks__/
│       └── obsidian.ts   # ✅ Mock for Obsidian API
├── manifest.json         # ✅ Obsidian plugin manifest
├── package.json          # ✅ Dependencies and scripts
├── tsconfig.json         # ✅ TypeScript configuration
├── esbuild.config.mjs    # ✅ Build configuration
├── jest.config.js        # ✅ Test configuration
├── .eslintrc.js          # ✅ Linting configuration
├── version-bump.mjs      # ✅ Version management script
├── versions.json         # ✅ Version history
├── styles.css            # ✅ Plugin styles
├── .gitignore            # ✅ Git ignore rules
├── LICENSE               # ✅ MIT License
├── README.md             # ✅ User documentation
└── CONTRIBUTING.md       # ✅ Contributor guidelines
```

### Core Features Implemented
1. **QMD CLI Wrapper** (`src/qmd.ts`)
   - Command queue (only one QMD process at a time)
   - All QMD commands: status, collection add, update, embed, vsearch, search
   - **Search cancellation** - `abortSearch()` kills running QMD process
   - Proper error handling with typed errors
   - JSON output parsing with slug-to-file path resolution

2. **Main Plugin** (`src/main.ts`)
   - Settings load/save
   - Desktop-only detection
   - File watcher for auto-indexing (debounced)
   - Optional periodic updates
   - All commands registered
   - Ribbon icon support
   - Search pane view registration
   - Auto-detection of QMD binary in common paths

3. **Search Modal** (`src/searchModal.ts`)
   - SuggestModal-based interface
   - Semantic-first with fallback logic
   - **500ms trailing-edge debounce** - waits for user to stop typing
   - **Animated progress bar** - appears below search input when searching
   - **Cancellable search** - typing kills in-flight search process
   - **Smart file matching** - matches QMD's slugified paths to actual files via title or slug
   - Result rendering with scores

4. **Search Pane** (`src/searchPane.ts`)
   - ItemView-based sidebar pane
   - Persistent search interface
   - Same search logic as modal

5. **Settings Tab** (`src/settingsTab.ts`)
   - All settings from the spec
   - Test QMD button
   - Diagnostic display
   - Action buttons (update index, generate embeddings, etc.)

### Build Status
- ✅ `npm install` - Dependencies installed
- ✅ `npm run build` - Builds successfully, produces `main.js`
- ✅ `npm test` - All 32 tests pass
- ✅ `npm run lint` - No lint errors

## What Was Fixed

### Jest Mocking Issue (Resolved)

The original problem was that `qmd.test.ts` used `jest.mock()` which gets hoisted, causing a "Cannot access before initialization" error.

**Solution:** Refactored `qmd.ts` to use dependency injection for the `execAsync` function:
- Added an optional `execAsync` parameter to the `QMDWrapper` constructor
- Tests inject a mock function directly instead of using `jest.mock()`
- This makes the code more testable and avoids Jest hoisting issues

### Lint Errors (Resolved)
- Removed unused imports (`WorkspaceLeaf`, `App`, `TFile`)
- Prefixed unused parameters with underscore (`_oldPath`, `_isFallback`)

### QMD CLI Integration Fixes
- **--index flag position**: Fixed to place `--index` before subcommand (global option)
- **Collection detection**: Fixed to parse text output from `qmd collection list` instead of expecting errors
- **Status parsing**: Fixed to parse text output from `qmd status` (QMD doesn't output JSON)
- **Search result parsing**: Fixed to handle QMD's JSON format (`file` field with `qmd://` prefix, `docid` field)
- **Embed flag**: Changed from `--force` to `-f` to match QMD's documented CLI
- **Binary auto-detection**: Added checking common paths (`~/.bun/bin/qmd`, etc.) for QMD binary
- **File path resolution**: QMD returns slugified paths (e.g., `costly-rituals.md` for `Costly Rituals.md`), fixed by matching via title or slug conversion

### Search UX Improvements
- **Trailing-edge debounce (500ms)**: Search only starts after user stops typing for 500ms
- **Cancellable search**: Typing while a search is running kills the QMD process immediately
- **Animated progress bar**: Shows below search input when search is in progress
- **Scroll position preservation**: Results don't jump to top when updating

## Key Design Decisions

1. **Semantic-First** - Vector search is always tried first, keyword search is fallback only
2. **Auto-Embeddings** - Embeddings are generated automatically when missing (QMD is fully local, no API costs)
3. **Queue Management** - Only one QMD process runs at a time to prevent race conditions
4. **Cancellable Search** - Uses `exec` directly (not promisified) to track and kill ChildProcess
5. **Desktop Only** - Plugin checks for filesystem access and disables on mobile
6. **Native UX** - Uses Obsidian's standard UI patterns (SuggestModal, ItemView, SettingTab)

## Commands Available

| npm script | Description |
|------------|-------------|
| `npm run dev` | Development build with watch |
| `npm run build` | Production build |
| `npm test` | Run tests |
| `npm run lint` | Check for lint errors |
| `npm run lint:fix` | Auto-fix lint errors |

## Dependencies

- `obsidian` - Obsidian API types
- `esbuild` - Bundler
- `typescript` - Type checking
- `jest` / `ts-jest` - Testing
- `eslint` - Linting

## Files to Review

If picking up this project:
1. `src/qmd.ts` - Core QMD integration logic (search cancellation, path parsing)
2. `src/searchModal.ts` - Search UI (debounce, progress bar, file matching)
3. `src/main.ts` - Plugin lifecycle and registration
