/**
 * QMD Plugin Settings Tab
 * 
 * Provides the UI for configuring plugin settings.
 */

import {
	App,
	PluginSettingTab,
	Setting,
	Notice,
} from "obsidian";
import type QMDPlugin from "./main";
import { SearchMode } from "./settings";

export class QMDSettingTab extends PluginSettingTab {
	plugin: QMDPlugin;

	constructor(app: App, plugin: QMDPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// --- Core / External Tool ---
		new Setting(containerEl).setName("QMD configuration").setHeading();

		new Setting(containerEl)
			.setName("QMD binary path")
			.setDesc("Path to the QMD executable. Use 'qmd' if it's in your PATH.")
			.addText((text) =>
				text
					.setPlaceholder("qmd")
					.setValue(this.plugin.settings.qmdBinaryPath)
					.onChange(async (value) => {
						this.plugin.settings.qmdBinaryPath = value || "qmd";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Collection name")
			.setDesc("Name for the QMD collection. Leave empty to use vault name.")
			.addText((text) =>
				text
					.setPlaceholder("(derived from vault name)")
					.setValue(this.plugin.settings.collectionName)
					.onChange(async (value) => {
						this.plugin.settings.collectionName = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Index name")
			.setDesc("Optional QMD index name override. Leave empty for default.")
			.addText((text) =>
				text
					.setPlaceholder("(default)")
					.setValue(this.plugin.settings.indexName || "")
					.onChange(async (value) => {
						this.plugin.settings.indexName = value || null;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("File mask")
			.setDesc("Glob pattern for markdown files to index.")
			.addText((text) =>
				text
					.setPlaceholder("**/*.md")
					.setValue(this.plugin.settings.fileMask)
					.onChange(async (value) => {
						this.plugin.settings.fileMask = value || "**/*.md";
						await this.plugin.saveSettings();
					})
			);

		// Test QMD button
		new Setting(containerEl)
			.setName("Test QMD connection")
			.setDesc("Verify that QMD is installed and accessible.")
			.addButton((button) =>
				button
					.setButtonText("Test QMD")
					.setCta()
					.onClick(async () => {
						button.setButtonText("Testing...");
						button.setDisabled(true);

						const result = await this.plugin.testQMDConnection();
						
						if (result.success) {
							new Notice("QMD is working correctly.");
							if (result.data) {
								new Notice(
									`Collection: ${result.data.collection}\n` +
									`Files: ${result.data.fileCount}\n` +
									`Embeddings: ${result.data.hasEmbeddings ? "Yes" : "No"}`
								);
							}
						} else {
							new Notice(`QMD error: ${result.error}`, 10000);
						}

						button.setButtonText("Test QMD");
						button.setDisabled(false);
					})
			);

		// --- Indexing & Updates ---
		new Setting(containerEl).setName("Indexing & updates").setHeading();

		new Setting(containerEl)
			.setName("Debounce delay (ms)")
			.setDesc("Wait time after file changes before updating index.")
			.addSlider((slider) =>
				slider
					.setLimits(1000, 120000, 1000)
					.setValue(this.plugin.settings.debounceMs)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.debounceMs = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable periodic updates")
			.setDesc("Automatically run index updates on a timer.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enablePeriodicUpdates)
					.onChange(async (value) => {
						this.plugin.settings.enablePeriodicUpdates = value;
						await this.plugin.saveSettings();
						this.plugin.setupPeriodicUpdates();
					})
			);

		new Setting(containerEl)
			.setName("Periodic update interval (minutes)")
			.setDesc("How often to run automatic index updates.")
			.addSlider((slider) =>
				slider
					.setLimits(5, 120, 5)
					.setValue(this.plugin.settings.periodicUpdateMinutes)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.periodicUpdateMinutes = value;
						await this.plugin.saveSettings();
						this.plugin.setupPeriodicUpdates();
					})
			);

		// --- Semantic Search Behavior ---
		new Setting(containerEl).setName("Search behavior").setHeading();

		new Setting(containerEl)
			.setName("Default search mode")
			.setDesc("Primary search method. Semantic uses AI embeddings, keyword uses BM25.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("semantic", "Semantic (AI)")
					.addOption("keyword", "Keyword (BM25)")
					.setValue(this.plugin.settings.defaultSearchMode)
					.onChange(async (value) => {
						this.plugin.settings.defaultSearchMode = value as SearchMode;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Fallback on semantic failure")
			.setDesc("Use keyword search if semantic search fails or has no embeddings.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.fallbackOnSemanticFailure)
					.onChange(async (value) => {
						this.plugin.settings.fallbackOnSemanticFailure = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Fallback on zero results")
			.setDesc("Use keyword search if semantic search returns no results.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.fallbackOnZeroResults)
					.onChange(async (value) => {
						this.plugin.settings.fallbackOnZeroResults = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show embeddings banner")
			.setDesc("Display a notice when semantic search is unavailable due to missing embeddings.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showEmbeddingsBanner)
					.onChange(async (value) => {
						this.plugin.settings.showEmbeddingsBanner = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto-generate embeddings")
			.setDesc("Automatically generate embeddings when missing. First run downloads ~3GB of local AI models.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoGenerateEmbeddings)
					.onChange(async (value) => {
						this.plugin.settings.autoGenerateEmbeddings = value;
						await this.plugin.saveSettings();
					})
			);

		// --- UI & UX ---
		new Setting(containerEl).setName("User interface").setHeading();

		new Setting(containerEl)
			.setName("Show ribbon icon")
			.setDesc("Display QMD search icon in the left sidebar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableRibbonIcon)
					.onChange(async (value) => {
						this.plugin.settings.enableRibbonIcon = value;
						await this.plugin.saveSettings();
						this.plugin.setupRibbonIcon();
					})
			);

		new Setting(containerEl)
			.setName("Enable search pane")
			.setDesc("Allow opening QMD search as a persistent sidebar pane.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableSearchPane)
					.onChange(async (value) => {
						this.plugin.settings.enableSearchPane = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show scores in results")
			.setDesc("Display numeric relevance scores in search results.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showScoresInResults)
					.onChange(async (value) => {
						this.plugin.settings.showScoresInResults = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Diagnostics ---
		new Setting(containerEl).setName("Diagnostics").setHeading();

		const diagnosticsContainer = containerEl.createDiv({ cls: "qmd-diagnostics" });
		
		this.renderDiagnostics(diagnosticsContainer);

		// Actions
		new Setting(containerEl).setName("Actions").setHeading();

		new Setting(containerEl)
			.setName("Update index now")
			.setDesc("Manually trigger an index update.")
			.addButton((button) =>
				button
					.setButtonText("Update index")
					.onClick(async () => {
						button.setButtonText("Updating...");
						button.setDisabled(true);
						await this.plugin.updateIndexNow();
						button.setButtonText("Update index");
						button.setDisabled(false);
					})
			);

		new Setting(containerEl)
			.setName("Generate embeddings")
			.setDesc("Build AI embeddings for semantic search. This may take a while for large vaults.")
			.addButton((button) =>
				button
					.setButtonText("Generate embeddings")
					.onClick(async () => {
						button.setButtonText("Generating...");
						button.setDisabled(true);
						await this.plugin.generateEmbeddings(false);
						button.setButtonText("Generate embeddings");
						button.setDisabled(false);
					})
			);

		new Setting(containerEl)
			.setName("Force rebuild embeddings")
			.setDesc("Rebuild all embeddings from scratch. Use if embeddings seem corrupted.")
			.addButton((button) =>
				button
					.setButtonText("Force rebuild")
					.setWarning()
					.onClick(async () => {
						button.setButtonText("Rebuilding...");
						button.setDisabled(true);
						await this.plugin.generateEmbeddings(true);
						button.setButtonText("Force rebuild");
						button.setDisabled(false);
					})
			);

		new Setting(containerEl)
			.setName("Ensure collection exists")
			.setDesc("Create the QMD collection if it doesn't exist.")
			.addButton((button) =>
				button
					.setButtonText("Ensure collection")
					.onClick(async () => {
						button.setButtonText("Checking...");
						button.setDisabled(true);
						await this.plugin.ensureCollection();
						button.setButtonText("Ensure collection");
						button.setDisabled(false);
					})
			);
	}

	private renderDiagnostics(container: HTMLElement): void {
		container.empty();

		const settings = this.plugin.settings;
		
		const items = [
			{ label: "Last index update", value: settings.lastIndexUpdateTime || "Never" },
			{ label: "Last embedding run", value: settings.lastEmbeddingRunTime || "Never" },
			{ label: "Last search mode", value: settings.lastSearchMode || "N/A" },
			{ label: "Last error", value: settings.lastError || "None" },
		];

		for (const item of items) {
			const row = container.createDiv({ cls: "qmd-diagnostic-row" });
			row.createSpan({ text: item.label + ":", cls: "qmd-diagnostic-label" });
			row.createSpan({ text: item.value, cls: "qmd-diagnostic-value" });
		}
	}
}

