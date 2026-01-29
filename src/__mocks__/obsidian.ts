/**
 * Mock for Obsidian API used in testing
 */

export class Plugin {
	app: App;
	manifest: PluginManifest;

	constructor(app: App, manifest: PluginManifest) {
		this.app = app;
		this.manifest = manifest;
	}

	async loadData(): Promise<unknown> {
		return {};
	}

	async saveData(_data: unknown): Promise<void> {
		// Mock save
	}

	addCommand(_command: Command): Command {
		return _command;
	}

	addRibbonIcon(_icon: string, _title: string, _callback: () => void): HTMLElement {
		return document.createElement("div");
	}

	addSettingTab(_tab: PluginSettingTab): void {
		// Mock add setting tab
	}

	registerView(_type: string, _viewCreator: ViewCreator): void {
		// Mock register view
	}

	registerEvent(_event: unknown): void {
		// Mock register event
	}
}

export class PluginSettingTab {
	app: App;
	plugin: Plugin;
	containerEl: HTMLElement;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = document.createElement("div");
	}

	display(): void {
		// Override in subclass
	}

	hide(): void {
		// Override in subclass
	}
}

export class Modal {
	app: App;
	contentEl: HTMLElement;
	modalEl: HTMLElement;

	constructor(app: App) {
		this.app = app;
		this.contentEl = document.createElement("div");
		this.modalEl = document.createElement("div");
	}

	open(): void {
		// Mock open
	}

	close(): void {
		// Mock close
	}

	onOpen(): void {
		// Override in subclass
	}

	onClose(): void {
		// Override in subclass
	}
}

export class SuggestModal<T> extends Modal {
	constructor(app: App) {
		super(app);
	}

	getSuggestions(_query: string): T[] | Promise<T[]> {
		return [];
	}

	renderSuggestion(_item: T, _el: HTMLElement): void {
		// Override in subclass
	}

	onChooseSuggestion(_item: T, _evt: MouseEvent | KeyboardEvent): void {
		// Override in subclass
	}

	setPlaceholder(_placeholder: string): void {
		// Mock set placeholder
	}

	setInstructions(_instructions: Array<{ command: string; purpose: string }>): void {
		// Mock set instructions
	}
}

export class ItemView {
	app: App;
	containerEl: HTMLElement;
	contentEl: HTMLElement;
	leaf: WorkspaceLeaf;

	constructor(leaf: WorkspaceLeaf) {
		this.leaf = leaf;
		this.app = leaf.view?.app || ({} as App);
		this.containerEl = document.createElement("div");
		this.contentEl = document.createElement("div");
	}

	getViewType(): string {
		return "";
	}

	getDisplayText(): string {
		return "";
	}

	getIcon(): string {
		return "";
	}

	async onOpen(): Promise<void> {
		// Override in subclass
	}

	async onClose(): Promise<void> {
		// Override in subclass
	}
}

export class Setting {
	settingEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;

	constructor(_containerEl: HTMLElement) {
		this.settingEl = document.createElement("div");
		this.nameEl = document.createElement("div");
		this.descEl = document.createElement("div");
		this.controlEl = document.createElement("div");
	}

	setName(_name: string): this {
		return this;
	}

	setDesc(_desc: string | DocumentFragment): this {
		return this;
	}

	setClass(_cls: string): this {
		return this;
	}

	addText(_callback: (text: TextComponent) => unknown): this {
		return this;
	}

	addToggle(_callback: (toggle: ToggleComponent) => unknown): this {
		return this;
	}

	addDropdown(_callback: (dropdown: DropdownComponent) => unknown): this {
		return this;
	}

	addButton(_callback: (button: ButtonComponent) => unknown): this {
		return this;
	}

	addSlider(_callback: (slider: SliderComponent) => unknown): this {
		return this;
	}
}

export class Notice {
	constructor(_message: string | DocumentFragment, _timeout?: number) {
		// Mock notice
	}

	hide(): void {
		// Mock hide
	}
}

export interface App {
	vault: Vault;
	workspace: Workspace;
}

export interface Vault {
	getName(): string;
	adapter: DataAdapter;
	getFiles(): TFile[];
	on(name: string, callback: (...args: unknown[]) => unknown): EventRef;
}

export interface DataAdapter {
	getBasePath(): string;
}

export interface Workspace {
	on(name: string, callback: (...args: unknown[]) => unknown): EventRef;
	getLeaf(newLeaf?: boolean | string): WorkspaceLeaf;
	revealLeaf(leaf: WorkspaceLeaf): void;
	getLeavesOfType(type: string): WorkspaceLeaf[];
	detachLeavesOfType(type: string): void;
	getRightLeaf(split: boolean): WorkspaceLeaf | null;
}

export interface WorkspaceLeaf {
	view: ItemView;
	setViewState(state: unknown): Promise<void>;
}

export interface TFile {
	path: string;
	basename: string;
	extension: string;
}

export interface TAbstractFile {
	path: string;
}

export interface EventRef {
	// Event reference for cleanup
}

export interface PluginManifest {
	id: string;
	name: string;
	version: string;
}

export interface Command {
	id: string;
	name: string;
	callback?: () => unknown;
	checkCallback?: (checking: boolean) => boolean | void;
}

export type ViewCreator = (leaf: WorkspaceLeaf) => ItemView;

export interface TextComponent {
	inputEl: HTMLInputElement;
	setValue(value: string): this;
	setPlaceholder(placeholder: string): this;
	onChange(callback: (value: string) => unknown): this;
}

export interface ToggleComponent {
	setValue(value: boolean): this;
	onChange(callback: (value: boolean) => unknown): this;
}

export interface DropdownComponent {
	addOption(value: string, display: string): this;
	setValue(value: string): this;
	onChange(callback: (value: string) => unknown): this;
}

export interface ButtonComponent {
	setButtonText(text: string): this;
	setCta(): this;
	setWarning(): this;
	onClick(callback: () => unknown): this;
}

export interface SliderComponent {
	setLimits(min: number, max: number, step: number): this;
	setValue(value: number): this;
	setDynamicTooltip(): this;
	onChange(callback: (value: number) => unknown): this;
}

export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
	func: T,
	wait: number,
	_immediate?: boolean
): T {
	let timeout: NodeJS.Timeout | null = null;
	return function (this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> {
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(() => func.apply(this, args), wait);
		return undefined as ReturnType<T>;
	} as T;
}
