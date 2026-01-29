/**
 * QMD Plugin Settings
 * 
 * All configurable options for the QMD Semantic Search plugin.
 */

export type SearchMode = "semantic" | "keyword";

export interface QMDPluginSettings {
	// Core / External Tool
	qmdBinaryPath: string;
	collectionName: string;
	indexName: string | null;
	fileMask: string;

	// Indexing & Updates
	debounceMs: number;
	enablePeriodicUpdates: boolean;
	periodicUpdateMinutes: number;

	// Semantic Search Behavior
	defaultSearchMode: SearchMode;
	fallbackOnSemanticFailure: boolean;
	fallbackOnZeroResults: boolean;
	showEmbeddingsBanner: boolean;
	autoGenerateEmbeddings: boolean;

	// UI & UX
	enableRibbonIcon: boolean;
	enableSearchPane: boolean;
	showScoresInResults: boolean;

	// Diagnostics (read-only, managed by plugin)
	lastIndexUpdateTime: string | null;
	lastEmbeddingRunTime: string | null;
	lastSearchMode: SearchMode | null;
	lastError: string | null;
}

export const DEFAULT_SETTINGS: QMDPluginSettings = {
	// Core / External Tool
	qmdBinaryPath: "qmd",
	collectionName: "",  // Will be derived from vault name if empty
	indexName: null,
	fileMask: "**/*.md",

	// Indexing & Updates
	debounceMs: 45000,
	enablePeriodicUpdates: false,
	periodicUpdateMinutes: 15,

	// Semantic Search Behavior
	defaultSearchMode: "semantic",
	fallbackOnSemanticFailure: true,
	fallbackOnZeroResults: false,
	showEmbeddingsBanner: true,
	autoGenerateEmbeddings: true,

	// UI & UX
	enableRibbonIcon: true,
	enableSearchPane: false,
	showScoresInResults: false,

	// Diagnostics
	lastIndexUpdateTime: null,
	lastEmbeddingRunTime: null,
	lastSearchMode: null,
	lastError: null,
};

/**
 * Helper to derive collection name from vault name
 */
export function deriveCollectionName(vaultName: string): string {
	// Sanitize vault name for use as collection name
	return vaultName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
