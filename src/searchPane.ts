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
			(query: string) => { void this.performSearch(query); },
			300,
			true
		);
	}

	getViewType(): string {
		return QMD_SEARCH_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "QMD search";
	}

	getIcon(): string {
		return "search";
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
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
				void this.performSearch(this.currentQuery);
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
				"Semantic search requires embeddings. Run 'QMD: Generate embeddings' to enable.",
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

