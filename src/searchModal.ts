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
import { QMDWrapper, QMDSearchResult } from "./qmd";
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
	private searchId = 0;
	private usedFallback = false;
	private searchError: string | null = null;
	private onSearchModeUsed: (mode: SearchMode, isFallback: boolean) => void;
	private onError: (error: string) => void;

	// Debounced search function
	private debouncedSearch: (query: string) => void;
	
	// Progress bar and search mode indicator elements
	private progressBar: HTMLElement | null = null;
	private searchModeIndicator: HTMLElement | null = null;

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

		// Create debounced search - trailing edge (waits 1000ms after last keystroke)
		this.debouncedSearch = debounce(
			(query: string) => this.performSearch(query),
			1000,
			false
		);
	}

	/**
	 * Called when modal opens - inject progress bar
	 */
	onOpen(): void {
		super.onOpen();
		this.injectStatusElements();
		const input = this.getInputElement();
		if (input) {
			input.maxLength = 50;
		}
	}

	/**
	 * Inject progress bar and search mode indicator below the input field
	 */
	private injectStatusElements(): void {
		const inputEl = this.containerEl.querySelector(".prompt-input-container");
		if (!inputEl) return;

		if (!this.progressBar) {
			this.progressBar = createDiv({ cls: "qmd-progress-container qmd-hidden" });
			const bar = this.progressBar.createDiv({ cls: "qmd-progress-bar" });
			bar.createDiv({ cls: "qmd-progress-bar-fill" });
			this.progressBar.createSpan({ cls: "qmd-progress-text", text: "Searching..." });
			inputEl.insertAdjacentElement("afterend", this.progressBar);
		}

		if (!this.searchModeIndicator) {
			this.searchModeIndicator = createDiv({ cls: "qmd-search-mode-indicator qmd-hidden" });
			inputEl.appendChild(this.searchModeIndicator);
		}
	}

	/**
	 * Show progress bar
	 */
	private showProgressBar(): void {
		this.progressBar?.removeClass("qmd-hidden");
	}

	/**
	 * Hide progress bar
	 */
	private hideProgressBar(): void {
		this.progressBar?.addClass("qmd-hidden");
	}

	/**
	 * Update search mode indicator pill inside the input field
	 */
	private updateSearchModeIndicator(mode: SearchMode, isFallback: boolean): void {
		if (!this.searchModeIndicator) return;
		const label = isFallback ? "keyword (fallback)" : mode;
		this.searchModeIndicator.textContent = label;
		this.searchModeIndicator.removeClass("qmd-hidden");

		const input = this.getInputElement();
		if (input) {
			input.addClass("qmd-input-with-pill");
		}
	}

	/**
	 * Hide search mode indicator
	 */
	private hideSearchModeIndicator(): void {
		this.searchModeIndicator?.addClass("qmd-hidden");
		const input = this.getInputElement();
		if (input) {
			input.removeClass("qmd-input-with-pill");
		}
	}

	/**
	 * Get suggestions based on query
	 */
	getSuggestions(query: string): SearchResultItem[] {
		this.currentQuery = query;

		if (!query || query.trim().length < 2) {
			this.searchError = null;
			this.lastCompletedQuery = "";
			this.lastResults = [];
			this.hideProgressBar();
			this.hideSearchModeIndicator();
			return [];
		}

		// If a search is running, abort it and invalidate its searchId
		if (this.isSearching) {
			this.qmd.abortSearch();
			this.searchId++;
		}

		// Schedule a new search for queries we haven't completed yet
		if (query !== this.lastCompletedQuery) {
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
		if (query !== this.currentQuery) return; // Query changed, skip

		const thisSearchId = ++this.searchId;
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
				if (thisSearchId !== this.searchId) return;

				if (semanticResult.success && semanticResult.data) {
					if (semanticResult.data.length > 0 || !this.settings.fallbackOnZeroResults) {
						results = this.mapResults(semanticResult.data, "semantic", false);
					} else if (this.settings.fallbackOnZeroResults) {
						// Zero results, try fallback
						const fallbackResult = await this.qmd.keywordSearch(query);
						if (thisSearchId !== this.searchId) return;
						if (fallbackResult.success && fallbackResult.data) {
							results = this.mapResults(fallbackResult.data, "keyword", true);
							this.usedFallback = true;
							searchMode = "keyword";
						}
					}
				} else if (this.settings.fallbackOnSemanticFailure) {
					// Semantic search failed, try fallback
					if (semanticResult.error?.includes("embeddings")) {
						this.showEmbeddingsNotice();
					}

					const fallbackResult = await this.qmd.keywordSearch(query);
					if (thisSearchId !== this.searchId) return;
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
				if (thisSearchId !== this.searchId) return;
				if (keywordResult.success && keywordResult.data) {
					results = this.mapResults(keywordResult.data, "keyword", false);
				} else {
					this.searchError = keywordResult.error || "Search failed";
					this.onError(this.searchError);
				}
			}

			// Update results and clean up state before re-render
			this.lastResults = results;
			this.lastCompletedQuery = query;
			this.isSearching = false;
			this.hideProgressBar();
			if (results.length > 0) {
				this.updateSearchModeIndicator(searchMode, this.usedFallback);
			} else {
				this.hideSearchModeIndicator();
			}
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
			if (thisSearchId !== this.searchId) return;
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			this.searchError = errorMessage;
			this.onError(errorMessage);
		} finally {
			// Fallback cleanup for error/cancellation paths
			if (thisSearchId === this.searchId) {
				this.isSearching = false;
				this.hideProgressBar();
			}
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
				"Semantic search requires embeddings. Run 'QMD: Generate embeddings' to enable.",
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

		// Title row with inline score
		const titleRow = container.createDiv({ cls: "qmd-search-result-title" });
		titleRow.createSpan({
			text: result.title || result.path.replace(/\.md$/i, "").split("/").pop() || result.path,
			cls: isError ? "qmd-search-error-title" : "qmd-search-result-name"
		});
		if (!isError && this.settings.showScoresInResults) {
			const pct = Math.round(result.score * 100);
			titleRow.createSpan({
				text: ` (Score: ${pct}%)`,
				cls: "qmd-search-result-score"
			});
		}

		// Snippet
		if (result.snippet) {
			container.createDiv({
				text: result.snippet,
				cls: isError ? "qmd-search-error-hint" : "qmd-search-result-snippet"
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

