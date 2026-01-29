/**
 * Tests for Settings
 */

import { DEFAULT_SETTINGS, deriveCollectionName } from "./settings";

describe("DEFAULT_SETTINGS", () => {
	it("should have correct default values for core settings", () => {
		expect(DEFAULT_SETTINGS.qmdBinaryPath).toBe("qmd");
		expect(DEFAULT_SETTINGS.collectionName).toBe("");
		expect(DEFAULT_SETTINGS.indexName).toBeNull();
		expect(DEFAULT_SETTINGS.fileMask).toBe("**/*.md");
	});

	it("should have correct default values for indexing settings", () => {
		expect(DEFAULT_SETTINGS.debounceMs).toBe(45000);
		expect(DEFAULT_SETTINGS.enablePeriodicUpdates).toBe(true);
		expect(DEFAULT_SETTINGS.periodicUpdateMinutes).toBe(15);
	});

	it("should have correct default values for search behavior", () => {
		expect(DEFAULT_SETTINGS.defaultSearchMode).toBe("semantic");
		expect(DEFAULT_SETTINGS.fallbackOnSemanticFailure).toBe(true);
		expect(DEFAULT_SETTINGS.fallbackOnZeroResults).toBe(false);
		expect(DEFAULT_SETTINGS.showEmbeddingsBanner).toBe(true);
	});

	it("should have correct default values for UI settings", () => {
		expect(DEFAULT_SETTINGS.enableRibbonIcon).toBe(true);
		expect(DEFAULT_SETTINGS.enableSearchPane).toBe(false);
		expect(DEFAULT_SETTINGS.showScoresInResults).toBe(true);
	});

	it("should have null diagnostics by default", () => {
		expect(DEFAULT_SETTINGS.lastIndexUpdateTime).toBeNull();
		expect(DEFAULT_SETTINGS.lastEmbeddingRunTime).toBeNull();
		expect(DEFAULT_SETTINGS.lastSearchMode).toBeNull();
		expect(DEFAULT_SETTINGS.lastError).toBeNull();
	});
});

describe("deriveCollectionName", () => {
	it("should lowercase the vault name", () => {
		expect(deriveCollectionName("MyVault")).toBe("myvault");
		expect(deriveCollectionName("UPPERCASE")).toBe("uppercase");
	});

	it("should replace spaces with hyphens", () => {
		expect(deriveCollectionName("My Vault")).toBe("my-vault");
		expect(deriveCollectionName("My  Vault")).toBe("my-vault");
	});

	it("should replace special characters with hyphens", () => {
		expect(deriveCollectionName("My@Vault!")).toBe("my-vault");
		expect(deriveCollectionName("Vault_Name")).toBe("vault-name");
	});

	it("should remove leading and trailing hyphens", () => {
		expect(deriveCollectionName("@MyVault@")).toBe("myvault");
		expect(deriveCollectionName("  Vault  ")).toBe("vault");
	});

	it("should handle complex names", () => {
		expect(deriveCollectionName("My Personal Notes (2024)")).toBe("my-personal-notes-2024");
		expect(deriveCollectionName("Work & Life Balance")).toBe("work-life-balance");
	});

	it("should handle numeric names", () => {
		expect(deriveCollectionName("123")).toBe("123");
		expect(deriveCollectionName("Vault2024")).toBe("vault2024");
	});

	it("should handle empty or special-only names", () => {
		expect(deriveCollectionName("")).toBe("");
		expect(deriveCollectionName("@#$")).toBe("");
	});
});
