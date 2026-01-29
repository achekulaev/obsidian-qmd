# QMD Semantic Search for Obsidian

A **fully local, privacy-first** semantic search plugin for Obsidian. Powered by [QMD (Quick Markdown Search)](https://github.com/tobi/qmd), it brings AI-powered vector search to your vault without sending a single byte to any cloud service, API, or remote LLM. All embedding generation and search runs entirely on your machine.

## Features

- **100% Local** - No API keys, no cloud services, no remote LLMs. Your notes never leave your machine
- **Semantic Search** - Find notes by meaning, not just keywords. Ask questions like "notes about productivity" or "ideas related to machine learning"
- **Automatic Fallback** - Gracefully falls back to keyword (BM25) search when semantic search is unavailable
- **Automatic Indexing & Embedding** - Keeps your vault indexed and embedded in the background as you create and edit notes
- **Responsive Search** - 1-second debounce waits for you to stop typing, with animated progress indicator
- **Cancellable** - Typing while searching cancels the previous search immediately
- **Native UX** - Search modal and optional sidebar pane follow Obsidian design patterns
- **Desktop Only** - Requires filesystem access (macOS, Windows, Linux)

## Prerequisites

### Install QMD

This plugin requires [QMD](https://github.com/tobi/qmd) to be installed on your system. QMD is a standalone CLI tool for semantic markdown search that runs entirely locally.

#### System Requirements

- **Bun >= 1.0.0** - Required runtime for QMD
- **Disk space**: ~300MB for embedding model (this plugin only uses `search` and `vsearch`)
- **Network**: Internet connection required for first-time model download

#### Installation

**macOS:**
```bash
# Install Homebrew SQLite (required for QMD extensions)
# If you don't have Homebrew: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install sqlite

# Install Bun if needed
curl -fsSL https://bun.sh/install | bash

# Install QMD globally
bun install -g https://github.com/tobi/qmd
```

**Linux:**
```bash
# Install Bun if needed
curl -fsSL https://bun.sh/install | bash

# Install QMD globally
bun install -g https://github.com/tobi/qmd
```

**Windows:**
1. Install Bun from [bun.sh](https://bun.sh)
2. Run: `bun install -g https://github.com/tobi/qmd`

**Verify installation:**
```bash
qmd --version
```

#### First-Time Model Download

When you first use QMD, it automatically downloads AI models from HuggingFace:

| Model | Purpose | Size | When Downloaded |
|-------|---------|------|-----------------|
| embeddinggemma-300M-Q8_0 | Vector embeddings | ~300MB | First `embed` |
| qwen3-reranker-0.6b-q8_0 | Re-ranking | ~640MB | First `query` |
| Qwen3-1.7B-Q8_0 | Query expansion | ~2.2GB | First `query` |

Models are cached in `~/.cache/qmd/models/` and only downloaded once.

**Note:** This plugin uses `search` (keyword) and `vsearch` (semantic), which only require the embedding model (~300MB). The larger query expansion and reranking models are only needed if you use QMD's `query` command directly.

## Installation

### From Obsidian Community Plugins

1. Open Obsidian Settings → Community Plugins
2. Browse and search for "QMD Semantic Search"
3. Install and enable the plugin

### Manual Installation

1. Download the latest release (`main.js`, `manifest.json`, `styles.css`)
2. Create a folder `obsidian-qmd` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into this folder
4. Enable the plugin in Obsidian Settings → Community Plugins

### Development Installation

```bash
# Clone the repository
git clone https://github.com/achekulaev/obsidian-qmd.git
cd obsidian-qmd

# Install dependencies
npm install

# Build the plugin
npm run build

# For development with hot reload
npm run dev
```

## Getting Started

### 1. First-Time Setup

After enabling the plugin, it will automatically:
1. Create a QMD collection for your vault
2. Build an initial keyword index

### 2. Embeddings for Semantic Search

Semantic search requires AI embeddings. **By default, embeddings are generated automatically** when the plugin detects they're missing.

On first run:
- QMD downloads ~300MB embedding model (one-time)
- Generates embeddings for all markdown files (may take a few minutes for large vaults)
- Shows a notice when complete

You can disable auto-generation in Settings → QMD Semantic Search → "Auto-generate embeddings".

To manually regenerate embeddings, use Command Palette: **"QMD: Generate Embeddings"** or **"QMD: Force Rebuild Embeddings"**.

### 3. Start Searching

- **Command Palette:** Run **"QMD: Search"**
- **Ribbon Icon:** Click the search icon in the left sidebar (if enabled)
- **Keyboard Shortcut:** Assign a hotkey in Settings → Hotkeys

## How It Works

### Semantic-First Philosophy

This plugin prioritizes semantic (AI/vector) search over traditional keyword search:

1. **Primary:** Semantic search using `qmd vsearch`
2. **Fallback:** Keyword (BM25) search using `qmd search`

When you search:
1. The plugin waits 1 second after you stop typing (debounce)
2. An animated progress bar appears below the search input
3. Semantic search is attempted first
4. If semantic search fails (no embeddings, error, or optionally zero results), it falls back to keyword search
5. A subtle notice indicates when fallback is used

**Tip:** If you start typing again while a search is running, the previous search is cancelled immediately.

### Search Modes

| Mode | Description | When Used |
|------|-------------|-----------|
| **Semantic** | AI-powered meaning-based search | Default, when embeddings exist |
| **Keyword** | Traditional BM25 text matching | Fallback, or when explicitly selected |

## Configuration

Access settings via Obsidian Settings → QMD Semantic Search

### Core Settings

| Setting | Description | Default |
|---------|-------------|---------|
| QMD Binary Path | Path to QMD executable | `qmd` |
| Collection Name | QMD collection name | (derived from vault name) |
| Index Name | Optional QMD index override | (none) |
| File Mask | Glob pattern for files to index | `**/*.md` |

### Indexing

| Setting | Description | Default |
|---------|-------------|---------|
| Debounce Delay | Wait time after changes before indexing | 45 seconds |
| Periodic Updates | Enable timed index updates | On |
| Update Interval | Minutes between periodic updates | 15 |

### Search Behavior

| Setting | Description | Default |
|---------|-------------|---------|
| Default Search Mode | Primary search method | Semantic |
| Fallback on Failure | Use keyword if semantic fails | On |
| Fallback on Zero Results | Use keyword if no semantic results | Off |
| Show Embeddings Banner | Notify when embeddings missing | On |
| Auto-generate Embeddings | Generate embeddings automatically | On |

### User Interface

| Setting | Description | Default |
|---------|-------------|---------|
| Ribbon Icon | Show search icon in sidebar | On |
| Search Pane | Enable persistent sidebar pane | Off |
| Show Scores | Display relevance scores | On |

## Commands

| Command | Description |
|---------|-------------|
| **QMD: Search** | Open the search modal |
| **QMD: Open Search Pane** | Open search in sidebar (if enabled) |
| **QMD: Update Index Now** | Manually trigger index update |
| **QMD: Generate Embeddings** | Build AI embeddings |
| **QMD: Force Rebuild Embeddings** | Rebuild all embeddings from scratch |
| **QMD: Ensure Collection** | Create collection if missing |

## Troubleshooting

### "QMD binary not found"

Ensure QMD is installed and accessible from your terminal:
```bash
which qmd  # macOS/Linux
where qmd  # Windows
```

If QMD is installed but not in PATH, specify the full path in settings.

### First-time embedding fails

If embedding generation fails on first run:

1. **Check internet connection** - Models must be downloaded from HuggingFace
2. **Check disk space** - Need ~300MB free for embedding model
3. **macOS users** - Ensure Homebrew SQLite is installed: `brew install sqlite`
4. **Check Bun installation** - Run `bun --version` to verify Bun is installed
5. **Try manually** - Run `qmd embed` in terminal to see detailed errors

### "Semantic search unavailable"

This means embeddings haven't been generated. Either:
- Wait for auto-generation to complete (check for notice)
- Manually run **"QMD: Generate Embeddings"**
- Check Settings → Diagnostics for errors

### Embedding generation is slow

First-time embedding involves:
1. Downloading ~300MB embedding model (one-time)
2. Processing all markdown files in your vault

For large vaults (1000+ files), this can take 5-10 minutes. Subsequent runs are faster.

### Search is slow

- Large vaults may take time to search
- Consider reducing the file mask to index fewer files
- Ensure QMD has enough system resources

### Index seems outdated

- Run **"QMD: Update Index Now"**
- Check that the debounce delay isn't too long
- Verify file watching is working (check vault events)

## Desktop Only

This plugin requires direct filesystem access and only works on:
- macOS
- Windows
- Linux

Mobile platforms (iOS/Android) are not supported as they don't provide direct filesystem access to Obsidian plugins.

## Development

### Project Structure

```
obsidian-qmd/
├── src/
│   ├── main.ts          # Plugin entry point
│   ├── settings.ts      # Settings types and defaults
│   ├── qmd.ts           # QMD CLI wrapper
│   ├── searchModal.ts   # Search modal UI
│   ├── searchPane.ts    # Sidebar search pane
│   ├── settingsTab.ts   # Settings UI
│   └── __mocks__/       # Test mocks
├── manifest.json        # Obsidian plugin manifest
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

### Scripts

```bash
# Development build with watch
npm run dev

# Production build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Auto-fix lint issues
npm run lint:fix
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage report
npm run test:coverage
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Credits

- [QMD](https://github.com/tobi/qmd) by Tobi Lütke - The underlying search engine
- [Obsidian](https://obsidian.md) - The incredible knowledge base app
