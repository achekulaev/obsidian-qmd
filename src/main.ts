/**
 * QMD Semantic Search Plugin
 *
 * Main entry point for the Obsidian plugin.
 * Integrates QMD (Quick Markdown Search) for semantic-first search in Obsidian.
 */

import {
	App,
	Plugin,
	PluginManifest,
	Notice,
	TFile,
	TAbstractFile,
	debounce,
} from "obsidian";

import {
	QMDPluginSettings,
	DEFAULT_SETTINGS,
	deriveCollectionName,
	SearchMode,
} from "./settings";

import { QMDWrapper, QMDCommandResult, QMDStatusResult } from "./qmd";
import { QMDSearchModal, SearchResultItem } from "./searchModal";
import { QMDSearchPane, QMD_SEARCH_VIEW_TYPE } from "./searchPane";
import { QMDSettingTab } from "./settingsTab";
import { existsSync } from "fs";
import { homedir } from "os";

// Common paths where QMD might be installed
const COMMON_QMD_PATHS = [
	"qmd", // In PATH
	`${homedir()}/.bun/bin/qmd`, // Bun global install
	"/usr/local/bin/qmd", // Manual install
	"/opt/homebrew/bin/qmd", // Homebrew on Apple Silicon
	"/usr/bin/qmd", // System install
];

export default class QMDPlugin extends Plugin {
	settings: QMDPluginSettings = DEFAULT_SETTINGS;
	private qmd: QMDWrapper | null = null;
	private ribbonIcon: HTMLElement | null = null;
	private periodicUpdateInterval: number | null = null;

	// Debounced index update
	private debouncedUpdate: (() => void) | null = null;
	private hasPendingChanges = false;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
	}

	async onload(): Promise<void> {
		// Load settings
		await this.loadSettings();

		// Check for desktop environment
		if (!this.isDesktop()) {
			new Notice("QMD requires desktop filesystem access — plugin disabled on mobile.");
			return;
		}

		// Initialize QMD wrapper
		this.initializeQMD();

		// Register view for search pane
		this.registerView(
			QMD_SEARCH_VIEW_TYPE,
			(leaf) => new QMDSearchPane(leaf, this.qmd!, this.settings, {
				onResultSelect: (result) => { void this.openSearchResult(result); },
				onSearchModeUsed: (mode, isFallback) => { void this.recordSearchMode(mode, isFallback); },
				onError: (error) => { void this.recordError(error); },
			})
		);

		// Register commands
		this.registerCommands();

		// Setup ribbon icon
		this.setupRibbonIcon();

		// Setup file watchers
		this.setupFileWatchers();

		// Setup periodic updates
		this.setupPeriodicUpdates();

		// Add settings tab
		this.addSettingTab(new QMDSettingTab(this.app, this));

		// On first load, ensure collection exists
		void this.ensureCollectionOnLoad();
	}

	onunload(): void {
		// Clear periodic update interval
		if (this.periodicUpdateInterval !== null) {
			window.clearInterval(this.periodicUpdateInterval);
		}
	}

	/**
	 * Check if running on desktop
	 */
	private isDesktop(): boolean {
		// Check for filesystem adapter with getBasePath
		const adapter = this.app.vault.adapter;
		return typeof (adapter as { getBasePath?: () => string }).getBasePath === "function";
	}

	/**
	 * Get vault filesystem path
	 */
	private getVaultPath(): string {
		const adapter = this.app.vault.adapter as unknown as { getBasePath: () => string };
		return adapter.getBasePath();
	}

	/**
	 * Find QMD binary in common locations
	 */
	private findQMDBinary(): string {
		// If user specified a custom path, use it
		if (this.settings.qmdBinaryPath !== "qmd") {
			return this.settings.qmdBinaryPath;
		}

		// Check common paths
		for (const path of COMMON_QMD_PATHS) {
			if (path === "qmd") continue; // Skip bare "qmd", check it last via wrapper
			try {
				if (existsSync(path)) {
					return path;
				}
			} catch {
				// Ignore errors, try next path
			}
		}

		// Fall back to default (will try PATH)
		return this.settings.qmdBinaryPath;
	}

	/**
	 * Initialize QMD wrapper
	 */
	private initializeQMD(): void {
		const vaultPath = this.getVaultPath();
		const collectionName = this.settings.collectionName ||
			deriveCollectionName(this.app.vault.getName());

		const binaryPath = this.findQMDBinary();

		// Update settings if we found a different path
		if (binaryPath !== this.settings.qmdBinaryPath) {
			this.settings.qmdBinaryPath = binaryPath;
			void this.saveSettings();
		}

		this.qmd = new QMDWrapper(
			binaryPath,
			collectionName,
			this.settings.indexName,
			vaultPath
		);
	}

	/**
	 * Register plugin commands
	 */
	private registerCommands(): void {
		// Main search command
		this.addCommand({
			id: "search",
			name: "Search",
			callback: () => this.openSearchModal(),
		});

		// Open search pane
		this.addCommand({
			id: "open-search-pane",
			name: "Open search pane",
			checkCallback: (checking) => {
				if (!this.settings.enableSearchPane) {
					return false;
				}
				if (!checking) {
					void this.openSearchPane();
				}
				return true;
			},
		});

		// Update index
		this.addCommand({
			id: "update-index",
			name: "Update index now",
			callback: () => { void this.updateIndexNow(); },
		});

		// Generate embeddings
		this.addCommand({
			id: "generate-embeddings",
			name: "Generate embeddings",
			callback: () => { void this.generateEmbeddings(false); },
		});

		// Force rebuild embeddings
		this.addCommand({
			id: "force-rebuild-embeddings",
			name: "Force rebuild embeddings",
			callback: () => { void this.generateEmbeddings(true); },
		});

		// Ensure collection
		this.addCommand({
			id: "ensure-collection",
			name: "Ensure collection",
			callback: () => { void this.ensureCollection(); },
		});
	}

	/**
	 * Setup ribbon icon
	 */
	setupRibbonIcon(): void {
		// Remove existing icon if any
		if (this.ribbonIcon) {
			this.ribbonIcon.remove();
			this.ribbonIcon = null;
		}

		if (this.settings.enableRibbonIcon) {
			this.ribbonIcon = this.addRibbonIcon(
				"search",
				"QMD search",
				() => this.openSearchModal()
			);
		}
	}

	/**
	 * Setup file watchers for automatic index updates
	 */
	private setupFileWatchers(): void {
		// Create debounced update function
		this.debouncedUpdate = debounce(
			() => { void this.triggerIndexUpdate(); },
			this.settings.debounceMs,
			true
		);

		// Watch for file changes
		const onFileChange = (file: TAbstractFile) => {
			if (file instanceof TFile && file.extension === "md") {
				this.hasPendingChanges = true;
				this.debouncedUpdate?.();
			}
		};

		this.registerEvent(this.app.vault.on("create", onFileChange));
		this.registerEvent(this.app.vault.on("modify", onFileChange));
		this.registerEvent(this.app.vault.on("delete", onFileChange));
		this.registerEvent(this.app.vault.on("rename", onFileChange));
	}

	/**
	 * Setup periodic index updates
	 */
	setupPeriodicUpdates(): void {
		// Clear existing interval
		if (this.periodicUpdateInterval !== null) {
			window.clearInterval(this.periodicUpdateInterval);
			this.periodicUpdateInterval = null;
		}

		if (this.settings.enablePeriodicUpdates) {
			const intervalMs = this.settings.periodicUpdateMinutes * 60 * 1000;
			this.periodicUpdateInterval = window.setInterval(
				() => { void this.triggerIndexUpdate(); },
				intervalMs
			);
		}
	}

	/**
	 * Trigger index update and embedding generation (internal, doesn't show status)
	 */
	private async triggerIndexUpdate(): Promise<void> {
		if (!this.qmd) return;
		if (!this.hasPendingChanges) return;

		this.hasPendingChanges = false;

		const result = await this.qmd.updateIndex();
		if (result.success) {
			this.settings.lastIndexUpdateTime = new Date().toISOString();
			await this.saveSettings();

			// Also generate embeddings for new/changed files
			const embedResult = await this.qmd.generateEmbeddings(false);
			if (embedResult.success) {
				this.settings.lastEmbeddingRunTime = new Date().toISOString();
				await this.saveSettings();
			} else if (embedResult.error) {
				void this.recordError(embedResult.error);
			}
		} else if (result.error) {
			void this.recordError(result.error);
		}
	}

	/**
	 * Ensure collection exists on load and optionally generate embeddings
	 */
	private async ensureCollectionOnLoad(): Promise<void> {
		if (!this.qmd) return;

		// Check if QMD is accessible
		const status = await this.qmd.testConnection();

		if (!status.success) {
			// Check what kind of error
			if (status.error?.toLowerCase().includes("not found") &&
				status.error?.toLowerCase().includes("binary")) {
				// QMD binary not found - show prominent warning
				new Notice(
					"QMD binary not found. Install QMD and configure the path in settings.",
					15000
				);
				void this.recordError(status.error);
				return;
			}

			// Other error - log it
			void this.recordError(status.error || "Unknown QMD error");
			return;
		}

		// Check if our collection exists
		if (!status.data?.hasCollection) {
			// Collection doesn't exist, create it
			await this.ensureCollection();
		}

		// Check if we need to generate embeddings
		if (!status.data?.hasEmbeddings) {
			await this.autoGenerateEmbeddingsIfNeeded();
		}
	}

	/**
	 * Auto-generate embeddings if enabled and missing
	 */
	private async autoGenerateEmbeddingsIfNeeded(): Promise<void> {
		if (!this.qmd) return;
		if (!this.settings.autoGenerateEmbeddings) return;

		// Check current status
		const status = await this.qmd.testConnection();
		if (status.success && status.data?.hasEmbeddings) {
			// Already have embeddings
			return;
		}

		// Check if this is likely the first run (no previous embedding time)
		const isFirstRun = !this.settings.lastEmbeddingRunTime;

		// Generate embeddings automatically
		if (isFirstRun) {
			new Notice(
				"QMD: generating embeddings for the first time. " +
				"This will download ~300MB of AI models and may take several minutes. " +
				"Semantic search will be available when complete.",
				15000
			);
		} else {
			new Notice(
				"Generating embeddings for semantic search...",
				5000
			);
		}

		const result = await this.qmd.generateEmbeddings(false);

		if (result.success) {
			this.settings.lastEmbeddingRunTime = new Date().toISOString();
			await this.saveSettings();
			new Notice("Embeddings generated. Semantic search is now available.");
		} else {
			// Show error for first run, just log for subsequent failures
			if (isFirstRun) {
				new Notice(
					`Failed to generate embeddings: ${result.error}. ` +
					"Check that QMD is properly installed and you have internet access for model download.",
					15000
				);
			}
			void this.recordError(result.error || "Failed to auto-generate embeddings");
		}
	}

	// --- Public Methods (called from settings/commands) ---

	/**
	 * Load settings
	 */
	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/**
	 * Save settings
	 */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);

		// Update QMD wrapper config if it exists
		if (this.qmd) {
			const collectionName = this.settings.collectionName ||
				deriveCollectionName(this.app.vault.getName());
			this.qmd.updateConfig(
				this.settings.qmdBinaryPath,
				collectionName,
				this.settings.indexName
			);
		}
	}

	/**
	 * Test QMD connection
	 */
	async testQMDConnection(): Promise<QMDCommandResult<QMDStatusResult>> {
		if (!this.qmd) {
			return { success: false, error: "QMD not initialized" };
		}
		return this.qmd.testConnection();
	}

	/**
	 * Update index now (with status)
	 */
	async updateIndexNow(): Promise<void> {
		if (!this.qmd) {
			new Notice("QMD not initialized");
			return;
		}

		new Notice("Updating QMD index...");
		const result = await this.qmd.updateIndex();

		if (result.success) {
			this.settings.lastIndexUpdateTime = new Date().toISOString();
			await this.saveSettings();
			new Notice("QMD index updated successfully.");
		} else {
			new Notice(`Failed to update index: ${result.error}`, 10000);
			void this.recordError(result.error || "Unknown error");
		}
	}

	/**
	 * Generate embeddings
	 */
	async generateEmbeddings(force: boolean): Promise<void> {
		if (!this.qmd) {
			new Notice("QMD not initialized");
			return;
		}

		const action = force ? "Rebuilding" : "Generating";
		new Notice(`${action} embeddings... this may take a while.`);

		const result = await this.qmd.generateEmbeddings(force);

		if (result.success) {
			this.settings.lastEmbeddingRunTime = new Date().toISOString();
			await this.saveSettings();
			new Notice("Embeddings generated successfully.");
		} else {
			new Notice(`Failed to generate embeddings: ${result.error}`, 10000);
			void this.recordError(result.error || "Unknown error");
		}
	}

	/**
	 * Ensure collection exists
	 */
	async ensureCollection(): Promise<void> {
		if (!this.qmd) {
			new Notice("QMD not initialized");
			return;
		}

		new Notice("Ensuring QMD collection exists...");
		const result = await this.qmd.ensureCollection(this.settings.fileMask);

		if (result.success) {
			new Notice("QMD collection is ready.");
		} else {
			new Notice(`Failed to ensure collection: ${result.error}`, 10000);
			void this.recordError(result.error || "Unknown error");
		}
	}

	/**
	 * Open search modal
	 */
	openSearchModal(): void {
		if (!this.qmd) {
			new Notice("QMD not initialized");
			return;
		}

		const modal = new QMDSearchModal(this.app, this.qmd, this.settings, {
			onResultSelect: (result) => { void this.openSearchResult(result); },
			onSearchModeUsed: (mode, isFallback) => { void this.recordSearchMode(mode, isFallback); },
			onError: (error) => { void this.recordError(error); },
		});
		modal.open();
	}

	/**
	 * Open search pane
	 */
	async openSearchPane(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(QMD_SEARCH_VIEW_TYPE);

		if (leaves.length > 0) {
			// Already open, reveal it
			await this.app.workspace.revealLeaf(leaves[0]);
		} else {
			// Create new leaf in right sidebar
			const leaf = this.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: QMD_SEARCH_VIEW_TYPE,
					active: true,
				});
				await this.app.workspace.revealLeaf(leaf);
			}
		}
	}

	/**
	 * Open a search result file
	 */
	private async openSearchResult(result: SearchResultItem): Promise<void> {
		if (result.file) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(result.file);

			// If we have a line number, scroll to it
			if (result.line !== undefined && result.line > 0) {
				// Small delay to ensure file is loaded
				setTimeout(() => {
					const view = leaf.view;
					if (view && "editor" in view) {
						const editor = (view as { editor: { setCursor: (pos: { line: number; ch: number }) => void; scrollIntoView: (range: { from: { line: number }; to: { line: number } }) => void } }).editor;
						const line = result.line! - 1; // Convert to 0-indexed
						editor.setCursor({ line, ch: 0 });
						editor.scrollIntoView({ from: { line }, to: { line } });
					}
				}, 100);
			}
		} else {
			// File not found in vault, show notice
			new Notice(`File not found: ${result.path}`);
		}
	}

	/**
	 * Record search mode used
	 */
	private async recordSearchMode(mode: SearchMode, _isFallback: boolean): Promise<void> {
		this.settings.lastSearchMode = mode;
		await this.saveSettings();
	}

	/**
	 * Record error
	 */
	private async recordError(error: string): Promise<void> {
		this.settings.lastError = `${new Date().toISOString()}: ${error}`;
		await this.saveSettings();
	}
}
