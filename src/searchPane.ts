/**
 * QMD Search Pane
 * 
 * Optional persistent sidebar pane for QMD search.
 * Provides a dedicated view for searching without opening a modal.
 */

import {
	ItemView,
	WorkspaceLeaf,
	TextComponent,
	debounce,
	Notice,
	setIcon,
} from "obsidian";
import { QMDWrapper, QMDSearchResult } from "./qmd";
import { QMDPluginSettings, SearchMode } from "./settings";
import { SearchResultItem } from "./searchModal";

export const QMD_SEARCH_VIEW_TYPE = "qmd-search-view";

export class QMDSearchPane extends ItemView {
	private qmd: QMDWrapper;
	private settings: QMDPluginSettings;
	private onResultSelect: (result: SearchResultItem) => void;
	private onSearchModeUsed: (mode: SearchMode, isFallback: boolean) => void;
	private onError: (error: string) => void;
	
	private searchInput: TextComponent | null = null;
	private resultsContainer: HTMLElement | null = null;
	private statusContainer: HTMLElement | null = null;
	private currentQuery = "";
	private isSearching = false;

	// Debounced search
	private debouncedSearch: (query: string) => void;

	constructor(
		leaf: WorkspaceLeaf,
		qmd: QMDWrapper,
		settings: QMDPluginSettings,
		callbacks: {
			onResultSelect: (result: SearchResultItem) => void;
			onSearchModeUsed: (mode: SearchMode, isFallback: boolean) => void;
			onError: (error: string) => void;
		}
	) {
		super(leaf);
		this.qmd = qmd;
		this.settings = settings;
		this.onResultSelect = callbacks.onResultSelect;
		this.onSearchModeUsed = callbacks.onSearchModeUsed;
		this.onError = callbacks.onError;

		this.debouncedSearch = debounce(
			(query: string) => this.performSearch(query),
			300,
			true
		);
	}

	getViewType(): string {
		return QMD_SEARCH_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "QMD Search";
	}

	getIcon(): string {
		return "search";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("qmd-search-pane");

		// Search input container
		const inputContainer = container.createDiv({ cls: "qmd-search-input-container" });
		
		const inputWrapper = inputContainer.createDiv({ cls: "qmd-search-input-wrapper" });
		const searchIcon = inputWrapper.createSpan({ cls: "qmd-search-icon" });
		setIcon(searchIcon, "search");

		const input = inputWrapper.createEl("input", {
			type: "text",
			placeholder: "Search with QMD...",
			cls: "qmd-search-input",
		});

		input.addEventListener("input", (e) => {
			const query = (e.target as HTMLInputElement).value;
			this.currentQuery = query;
			if (query.trim().length >= 2) {
				this.debouncedSearch(query);
			} else {
				this.clearResults();
			}
		});

		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && this.currentQuery.trim().length >= 2) {
				this.performSearch(this.currentQuery);
			}
		});

		// Status container
		this.statusContainer = container.createDiv({ cls: "qmd-search-status" });

		// Results container
		this.resultsContainer = container.createDiv({ cls: "qmd-search-results" });
	}

	async onClose(): Promise<void> {
		// Cleanup
	}

	/**
	 * Update references when settings change
	 */
	updateReferences(qmd: QMDWrapper, settings: QMDPluginSettings): void {
		this.qmd = qmd;
		this.settings = settings;
	}

	/**
	 * Perform search
	 */
	private async performSearch(query: string): Promise<void> {
		if (this.isSearching) return;
		if (!query || query.trim().length < 2) return;

		this.isSearching = true;
		this.showStatus("Searching...", "loading");

		try {
			let results: QMDSearchResult[] = [];
			let searchMode: SearchMode = this.settings.defaultSearchMode;
			let usedFallback = false;

			if (searchMode === "semantic") {
				const semanticResult = await this.qmd.semanticSearch(query);

				if (semanticResult.success && semanticResult.data) {
					if (semanticResult.data.length > 0 || !this.settings.fallbackOnZeroResults) {
						results = semanticResult.data;
					} else if (this.settings.fallbackOnZeroResults) {
						const fallbackResult = await this.qmd.keywordSearch(query);
						if (fallbackResult.success && fallbackResult.data) {
							results = fallbackResult.data;
							usedFallback = true;
							searchMode = "keyword";
						}
					}
				} else if (this.settings.fallbackOnSemanticFailure) {
					if (semanticResult.error?.includes("embeddings")) {
						this.showEmbeddingsNotice();
					}

					const fallbackResult = await this.qmd.keywordSearch(query);
					if (fallbackResult.success && fallbackResult.data) {
						results = fallbackResult.data;
						usedFallback = true;
						searchMode = "keyword";
						new Notice("Semantic search unavailable — using keyword search.");
					}
				} else {
					throw new Error(semanticResult.error || "Search failed");
				}
			} else {
				const keywordResult = await this.qmd.keywordSearch(query);
				if (keywordResult.success && keywordResult.data) {
					results = keywordResult.data;
				} else {
					throw new Error(keywordResult.error || "Search failed");
				}
			}

			this.onSearchModeUsed(searchMode, usedFallback);
			this.renderResults(results, searchMode, usedFallback);
			
			const statusText = usedFallback 
				? `${results.length} results (keyword fallback)`
				: `${results.length} results (${searchMode})`;
			this.showStatus(statusText, "success");

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			this.onError(errorMessage);
			this.showStatus(`Error: ${errorMessage}`, "error");
		} finally {
			this.isSearching = false;
		}
	}

	/**
	 * Show embeddings notice
	 */
	private showEmbeddingsNotice(): void {
		if (this.settings.showEmbeddingsBanner) {
			new Notice(
				"Semantic search requires embeddings. Run 'QMD: Generate Embeddings' to enable.",
				10000
			);
		}
	}

	/**
	 * Render search results
	 */
	private renderResults(
		results: QMDSearchResult[],
		mode: SearchMode,
		isFallback: boolean
	): void {
		if (!this.resultsContainer) return;
		this.resultsContainer.empty();

		if (results.length === 0) {
			this.resultsContainer.createDiv({
				text: "No results found",
				cls: "qmd-search-no-results",
			});
			return;
		}

		for (const result of results) {
			const item = this.resultsContainer.createDiv({ cls: "qmd-search-result-item" });
			
			// Find matching file
			const file = this.app.vault
				.getFiles()
				.find((f) => f.path === result.path || f.path.endsWith(result.path));

			const resultItem: SearchResultItem = {
				...result,
				file,
				searchMode: mode,
				isFallback,
			};

			// Title
			const title = item.createDiv({ cls: "qmd-result-title" });
			title.createSpan({
				text: result.title || result.path.split("/").pop() || result.path,
			});

			// Path
			if (result.title) {
				item.createDiv({
					text: result.path,
					cls: "qmd-result-path",
				});
			}

			// Snippet
			if (result.snippet) {
				item.createDiv({
					text: result.snippet,
					cls: "qmd-result-snippet",
				});
			}

			// Score
			if (this.settings.showScoresInResults) {
				item.createDiv({
					text: `Score: ${result.score.toFixed(3)}`,
					cls: "qmd-result-score",
				});
			}

			// Click handler
			item.addEventListener("click", () => {
				this.onResultSelect(resultItem);
			});
		}
	}

	/**
	 * Clear results
	 */
	private clearResults(): void {
		if (this.resultsContainer) {
			this.resultsContainer.empty();
		}
		this.hideStatus();
	}

	/**
	 * Show status message
	 */
	private showStatus(message: string, type: "loading" | "success" | "error"): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();
		this.statusContainer.removeClass("qmd-status-loading", "qmd-status-success", "qmd-status-error");
		this.statusContainer.addClass(`qmd-status-${type}`);
		
		if (type === "loading") {
			// Add spinner for loading state
			const spinnerRow = this.statusContainer.createDiv({ cls: "qmd-pane-loading-row" });
			spinnerRow.createSpan({ cls: "qmd-pane-spinner" });
			spinnerRow.createSpan({ text: message });
		} else {
			this.statusContainer.setText(message);
		}
		this.statusContainer.show();
	}

	/**
	 * Hide status message
	 */
	private hideStatus(): void {
		if (this.statusContainer) {
			this.statusContainer.hide();
		}
	}
}

/**
 * CSS styles for the search pane
 */
export const SEARCH_PANE_STYLES = `
.qmd-search-pane {
	display: flex;
	flex-direction: column;
	height: 100%;
	padding: 8px;
}

.qmd-search-input-container {
	margin-bottom: 8px;
}

.qmd-search-input-wrapper {
	display: flex;
	align-items: center;
	background: var(--background-modifier-form-field);
	border: 1px solid var(--background-modifier-border);
	border-radius: 4px;
	padding: 4px 8px;
}

.qmd-search-icon {
	color: var(--text-muted);
	margin-right: 8px;
}

.qmd-search-input {
	flex: 1;
	border: none;
	background: transparent;
	outline: none;
	color: var(--text-normal);
}

.qmd-search-status {
	padding: 4px 8px;
	font-size: 0.85em;
	margin-bottom: 8px;
	border-radius: 4px;
}

.qmd-status-loading {
	color: var(--text-muted);
	background: var(--background-modifier-hover);
}

.qmd-pane-loading-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.qmd-pane-spinner {
	width: 12px;
	height: 12px;
	border: 2px solid var(--background-modifier-border);
	border-top-color: var(--text-accent);
	border-radius: 50%;
	animation: qmd-pane-spin 0.8s linear infinite;
}

@keyframes qmd-pane-spin {
	to { transform: rotate(360deg); }
}

.qmd-status-success {
	color: var(--text-success);
}

.qmd-status-error {
	color: var(--text-error);
	background: var(--background-modifier-error);
}

.qmd-search-results {
	flex: 1;
	overflow-y: auto;
}

.qmd-search-result-item {
	padding: 8px;
	margin-bottom: 4px;
	border-radius: 4px;
	cursor: pointer;
	background: var(--background-secondary);
}

.qmd-search-result-item:hover {
	background: var(--background-modifier-hover);
}

.qmd-result-title {
	font-weight: 500;
	color: var(--text-normal);
	margin-bottom: 2px;
}

.qmd-result-path {
	font-size: 0.85em;
	color: var(--text-muted);
	margin-bottom: 4px;
}

.qmd-result-snippet {
	font-size: 0.9em;
	color: var(--text-muted);
	margin-bottom: 4px;
	overflow: hidden;
	text-overflow: ellipsis;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
}

.qmd-result-score {
	font-size: 0.8em;
	color: var(--text-faint);
}

.qmd-search-no-results {
	padding: 16px;
	text-align: center;
	color: var(--text-muted);
}
`;
