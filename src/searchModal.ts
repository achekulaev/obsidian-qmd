/**
 * QMD Search Modal
 * 
 * Provides a SuggestModal-style interface for searching with QMD.
 * Supports both semantic and keyword search with automatic fallback.
 */

import {
	App,
	SuggestModal,
	Notice,
	TFile,
	debounce,
} from "obsidian";
import { QMDWrapper, QMDSearchResult, QMDError } from "./qmd";
import { QMDPluginSettings, SearchMode } from "./settings";

export interface SearchResultItem extends QMDSearchResult {
	file?: TFile;
	searchMode: SearchMode;
	isFallback: boolean;
}

export class QMDSearchModal extends SuggestModal<SearchResultItem> {
	private qmd: QMDWrapper;
	private settings: QMDPluginSettings;
	private onResultSelect: (result: SearchResultItem) => void;
	private currentQuery = "";
	private lastCompletedQuery = "";
	private lastResults: SearchResultItem[] = [];
	private isSearching = false;
	private usedFallback = false;
	private searchError: string | null = null;
	private onSearchModeUsed: (mode: SearchMode, isFallback: boolean) => void;
	private onError: (error: string) => void;

	// Debounced search function
	private debouncedSearch: (query: string) => void;
	
	// Progress bar element
	private progressBar: HTMLElement | null = null;

	constructor(
		app: App,
		qmd: QMDWrapper,
		settings: QMDPluginSettings,
		callbacks: {
			onResultSelect: (result: SearchResultItem) => void;
			onSearchModeUsed: (mode: SearchMode, isFallback: boolean) => void;
			onError: (error: string) => void;
		}
	) {
		super(app);
		this.qmd = qmd;
		this.settings = settings;
		this.onResultSelect = callbacks.onResultSelect;
		this.onSearchModeUsed = callbacks.onSearchModeUsed;
		this.onError = callbacks.onError;

		// Set up modal
		this.setPlaceholder("Search your vault with QMD...");
		this.setInstructions([
			{ command: "↑↓", purpose: "Navigate" },
			{ command: "↵", purpose: "Open file" },
			{ command: "esc", purpose: "Close" },
		]);

		// Create debounced search - trailing edge (waits 500ms after last keystroke)
		this.debouncedSearch = debounce(
			(query: string) => this.performSearch(query),
			500,
			false
		);
	}

	/**
	 * Called when modal opens - inject progress bar
	 */
	onOpen(): void {
		super.onOpen();
		this.injectProgressBar();
	}

	/**
	 * Inject progress bar below the input field
	 */
	private injectProgressBar(): void {
		const inputEl = this.containerEl.querySelector(".prompt-input-container");
		if (inputEl && !this.progressBar) {
			this.progressBar = createDiv({ cls: "qmd-progress-container" });
			this.progressBar.innerHTML = `
				<div class="qmd-progress-bar">
					<div class="qmd-progress-bar-fill"></div>
				</div>
				<span class="qmd-progress-text">Searching...</span>
			`;
			this.progressBar.style.display = "none";
			inputEl.insertAdjacentElement("afterend", this.progressBar);
		}
	}

	/**
	 * Show progress bar
	 */
	private showProgressBar(): void {
		if (this.progressBar) {
			this.progressBar.style.display = "flex";
		}
	}

	/**
	 * Hide progress bar
	 */
	private hideProgressBar(): void {
		if (this.progressBar) {
			this.progressBar.style.display = "none";
		}
	}

	/**
	 * Get suggestions based on query
	 */
	async getSuggestions(query: string): Promise<SearchResultItem[]> {
		this.currentQuery = query;

		if (!query || query.trim().length < 2) {
			this.searchError = null;
			this.lastCompletedQuery = "";
			this.lastResults = [];
			this.hideProgressBar();
			return [];
		}

		// If user is typing a new query while searching, abort it
		if (this.isSearching) {
			this.qmd.abortSearch();
			this.hideProgressBar();
		}

		// Only trigger search if this is a new query we haven't completed yet
		if (query !== this.lastCompletedQuery && !this.isSearching) {
			this.debouncedSearch(query);
		}

		// If there's an error, show it as a pseudo-result
		if (this.searchError && this.lastResults.length === 0) {
			return [{
				path: "",
				score: 0,
				title: `Error: ${this.searchError}`,
				snippet: "Check that QMD is installed and accessible. Use 'Test QMD' in settings.",
				searchMode: this.settings.defaultSearchMode,
				isFallback: false,
			}];
		}

		// Return current results (will update when search completes)
		return this.lastResults;
	}

	/**
	 * Perform the actual search
	 */
	private async performSearch(query: string): Promise<void> {
		if (this.isSearching) return;
		if (query !== this.currentQuery) return; // Query changed, skip

		this.isSearching = true;
		this.usedFallback = false;
		this.searchError = null;
		this.showProgressBar();

		try {
			let results: SearchResultItem[] = [];
			let searchMode: SearchMode = this.settings.defaultSearchMode;

			if (searchMode === "semantic") {
				// Try semantic search first
				const semanticResult = await this.qmd.semanticSearch(query);

				if (semanticResult.success && semanticResult.data) {
					if (semanticResult.data.length > 0 || !this.settings.fallbackOnZeroResults) {
						results = this.mapResults(semanticResult.data, "semantic", false);
					} else if (this.settings.fallbackOnZeroResults) {
						// Zero results, try fallback
						const fallbackResult = await this.qmd.keywordSearch(query);
						if (fallbackResult.success && fallbackResult.data) {
							results = this.mapResults(fallbackResult.data, "keyword", true);
							this.usedFallback = true;
							searchMode = "keyword";
						}
					}
				} else if (this.settings.fallbackOnSemanticFailure) {
					// Semantic search failed, try fallback
					const qmdError = new QMDError(
						semanticResult.error || "Unknown error",
						"unknown"
					);
					
					// Check if it's a no-embeddings error
					if (qmdError.message.includes("embeddings") || 
						semanticResult.error?.includes("embeddings")) {
						this.showEmbeddingsNotice();
					}

					const fallbackResult = await this.qmd.keywordSearch(query);
					if (fallbackResult.success && fallbackResult.data) {
						results = this.mapResults(fallbackResult.data, "keyword", true);
						this.usedFallback = true;
						searchMode = "keyword";
						new Notice("Semantic search unavailable — using keyword search.");
					}
				} else {
					this.searchError = semanticResult.error || "Search failed";
					this.onError(this.searchError);
				}
			} else {
				// Direct keyword search
				const keywordResult = await this.qmd.keywordSearch(query);
				if (keywordResult.success && keywordResult.data) {
					results = this.mapResults(keywordResult.data, "keyword", false);
				} else {
					this.searchError = keywordResult.error || "Search failed";
					this.onError(this.searchError);
				}
			}

			// Check if query changed during search - if so, discard results
			if (query !== this.currentQuery) {
				return;
			}

			// Update results
			this.lastResults = results;
			this.lastCompletedQuery = query;
			this.onSearchModeUsed(searchMode, this.usedFallback);

			// Trigger re-render by updating input (hack for SuggestModal)
			// Preserve scroll position to avoid jumping back to top
			const inputElement = this.getInputElement();
			if (inputElement && inputElement.value === query) {
				// Find the suggestions container and save scroll position
				const suggestContainer = this.containerEl.querySelector(".suggestion-container");
				const scrollTop = suggestContainer?.scrollTop || 0;
				
				// Force update by dispatching input event
				inputElement.dispatchEvent(new Event("input"));
				
				// Restore scroll position after a microtask (after render)
				if (suggestContainer && scrollTop > 0) {
					queueMicrotask(() => {
						suggestContainer.scrollTop = scrollTop;
					});
				}
			}

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			this.searchError = errorMessage;
			this.onError(errorMessage);
		} finally {
			this.isSearching = false;
			this.hideProgressBar();
		}
	}

	/**
	 * Convert a string to a slug (lowercase, spaces/special chars to hyphens)
	 * This matches QMD's internal slugification
	 */
	private toSlug(str: string): string {
		return str
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
	}

	/**
	 * Build a lookup map from slugified names to actual files
	 * QMD slugifies all file paths, so we need this to resolve them
	 */
	private buildSlugMap(): Map<string, TFile> {
		const map = new Map<string, TFile>();
		for (const file of this.app.vault.getFiles()) {
			// Map by slug of basename (most common case)
			const slug = this.toSlug(file.basename);
			if (!map.has(slug)) {
				map.set(slug, file);
			}
			// Also map by slug of full path (for disambiguation)
			const pathSlug = this.toSlug(file.path.replace(/\.md$/i, ""));
			if (!map.has(pathSlug)) {
				map.set(pathSlug, file);
			}
		}
		return map;
	}

	/**
	 * Map QMD results to our result format
	 */
	private mapResults(
		results: QMDSearchResult[],
		mode: SearchMode,
		isFallback: boolean
	): SearchResultItem[] {
		// Build slug lookup map once for all results
		const slugMap = this.buildSlugMap();
		
		return results.map((result) => {
			let file: TFile | undefined;
			
			// Primary: Match by title (QMD preserves titles correctly)
			if (result.title) {
				file = this.app.vault.getFiles().find((f) => f.basename === result.title);
			}
			
			// Fallback: Match by slug
			if (!file) {
				const resultSlug = this.toSlug(result.path.replace(/\.md$/i, ""));
				file = slugMap.get(resultSlug);
			}

			return {
				...result,
				file,
				searchMode: mode,
				isFallback,
			};
		});
	}

	/**
	 * Show notice about missing embeddings
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
	 * Render a suggestion item
	 */
	renderSuggestion(result: SearchResultItem, el: HTMLElement): void {
		// Check if this is an error item
		const isError = result.path === "" && result.title?.startsWith("Error:");
		
		const container = el.createDiv({ 
			cls: isError ? "qmd-search-error" : "qmd-search-result" 
		});

		// Title row
		const titleRow = container.createDiv({ cls: "qmd-search-result-title" });
		titleRow.createSpan({ 
			text: result.title || result.path.split("/").pop() || result.path,
			cls: isError ? "qmd-search-error-title" : "qmd-search-result-name"
		});

		// Path (if different from title) - skip for error items
		if (result.title && result.path && !isError) {
			container.createDiv({ 
				text: result.path,
				cls: "qmd-search-result-path"
			});
		}

		// Snippet
		if (result.snippet) {
			container.createDiv({ 
				text: result.snippet,
				cls: isError ? "qmd-search-error-hint" : "qmd-search-result-snippet"
			});
		}

		// Score and mode indicator - skip for error items
		if (!isError) {
			const metaRow = container.createDiv({ cls: "qmd-search-result-meta" });
			
			if (this.settings.showScoresInResults) {
				metaRow.createSpan({ 
					text: `Score: ${result.score.toFixed(3)}`,
					cls: "qmd-search-result-score"
				});
			}

			metaRow.createSpan({ 
				text: result.isFallback ? "keyword (fallback)" : result.searchMode,
				cls: `qmd-search-result-mode qmd-mode-${result.searchMode}`
			});
		}
	}

	/**
	 * Handle selection of a result
	 */
	onChooseSuggestion(result: SearchResultItem, _evt: MouseEvent | KeyboardEvent): void {
		// Don't do anything for error items
		if (result.path === "" && result.title?.startsWith("Error:")) {
			return;
		}
		this.onResultSelect(result);
	}

	/**
	 * Get the input element (for external access)
	 */
	getInputElement(): HTMLInputElement {
		return this.containerEl.querySelector("input") as HTMLInputElement;
	}
}

/**
 * CSS styles for the search modal
 */
export const SEARCH_MODAL_STYLES = `
.qmd-search-result {
	padding: 8px 12px;
}

.qmd-search-result-title {
	font-weight: 500;
	margin-bottom: 2px;
}

.qmd-search-result-name {
	color: var(--text-normal);
}

.qmd-search-result-path {
	font-size: 0.85em;
	color: var(--text-muted);
	margin-bottom: 4px;
}

.qmd-search-result-snippet {
	font-size: 0.9em;
	color: var(--text-muted);
	margin-bottom: 4px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qmd-search-result-meta {
	display: flex;
	gap: 12px;
	font-size: 0.8em;
	color: var(--text-faint);
}

.qmd-search-result-mode {
	padding: 1px 6px;
	border-radius: 3px;
	background: var(--background-modifier-hover);
}

.qmd-mode-semantic {
	color: var(--text-accent);
}

.qmd-mode-keyword {
	color: var(--text-muted);
}

/* Error display styles */
.qmd-search-error {
	padding: 12px;
	background: var(--background-modifier-error);
	border-radius: 4px;
	cursor: default;
}

.qmd-search-error-title {
	color: var(--text-error);
	font-weight: 500;
}

.qmd-search-error-hint {
	font-size: 0.9em;
	color: var(--text-muted);
	margin-top: 4px;
}

/* Progress bar below search input */
.qmd-progress-container {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 12px;
	background: var(--background-secondary);
	border-bottom: 1px solid var(--background-modifier-border);
}

.qmd-progress-bar {
	flex: 1;
	height: 3px;
	background: var(--background-modifier-border);
	border-radius: 2px;
	overflow: hidden;
}

.qmd-progress-bar-fill {
	height: 100%;
	width: 30%;
	background: var(--text-accent);
	border-radius: 2px;
	animation: qmd-progress-slide 1s ease-in-out infinite;
}

@keyframes qmd-progress-slide {
	0% { transform: translateX(-100%); }
	50% { transform: translateX(200%); }
	100% { transform: translateX(-100%); }
}

.qmd-progress-text {
	font-size: 0.8em;
	color: var(--text-muted);
	white-space: nowrap;
}
`;
