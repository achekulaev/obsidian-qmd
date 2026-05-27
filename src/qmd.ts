/**
 * QMD CLI Wrapper
 * 
 * Handles all communication with the QMD binary, including:
 * - Command execution with queue management
 * - JSON output parsing
 * - Error handling and reporting
 */

import { exec, ChildProcess, ExecException } from "child_process";
import { promisify } from "util";

const defaultExecAsync = promisify(exec);

// Type for the async exec function
export type ExecAsyncFn = (
	command: string,
	options?: { maxBuffer?: number; cwd?: string; env?: NodeJS.ProcessEnv }
) => Promise<{ stdout: string; stderr: string }>;

/**
 * Build an env that includes common package-manager bin dirs on PATH.
 *
 * GUI-launched apps on macOS (Dock/Finder/Spotlight) inherit a minimal PATH
 * that excludes /opt/homebrew/bin and /usr/local/bin. Even when the user
 * configures an absolute binaryPath, scripts with `#!/usr/bin/env node`
 * shebangs (like qmd) fail because `env` can't find `node`. Augmenting PATH
 * here lets the shebang resolve and lets qmd itself shell out to its own
 * dependencies.
 */
function buildExecEnv(): NodeJS.ProcessEnv {
	if (process.platform !== "darwin") {
		return process.env;
	}
	const extras = ["/opt/homebrew/bin", "/usr/local/bin"];
	const current = process.env.PATH ?? "";
	const parts = current.split(":").filter(Boolean);
	for (const p of extras) {
		if (!parts.includes(p)) {
			parts.push(p);
		}
	}
	return { ...process.env, PATH: parts.join(":") };
}

// --- Types for QMD JSON output ---

export interface QMDStatusResult {
	collection: string;
	path: string;
	fileCount: number;
	indexedCount: number;
	embeddingsCount: number;
	hasEmbeddings: boolean;
	hasCollection?: boolean;
}

export interface QMDSearchResult {
	path: string;
	score: number;
	title?: string;
	snippet?: string;
	line?: number;
	docid?: string;
}

// Raw JSON result from QMD CLI
interface QMDRawSearchResult {
	docid: string;
	score: number;
	file: string;
	title?: string;
	snippet?: string;
}

export interface QMDCommandResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	stderr?: string;
}

export type QMDErrorType = 
	| "not_found"
	| "no_collection"
	| "no_embeddings"
	| "execution_error"
	| "parse_error"
	| "unknown";

export class QMDError extends Error {
	type: QMDErrorType;
	stderr?: string;

	constructor(message: string, type: QMDErrorType, stderr?: string) {
		super(message);
		this.name = "QMDError";
		this.type = type;
		this.stderr = stderr;
	}
}

// --- QMD CLI Wrapper ---

export class QMDWrapper {
	private binaryPath: string;
	private collectionName: string;
	private indexName: string | null;
	private vaultPath: string;
	private execAsync: ExecAsyncFn;
	
	// Queue management - only one QMD process at a time
	private commandQueue: Array<() => Promise<void>> = [];
	private isProcessing = false;
	
	// Track current search process for cancellation
	private currentSearchProcess: ChildProcess | null = null;

	constructor(
		binaryPath: string,
		collectionName: string,
		indexName: string | null,
		vaultPath: string,
		execAsync?: ExecAsyncFn
	) {
		this.binaryPath = binaryPath;
		this.collectionName = collectionName;
		this.indexName = indexName;
		this.vaultPath = vaultPath;
		this.execAsync = execAsync ?? defaultExecAsync;
	}

	/**
	 * Abort any currently running search process
	 */
	abortSearch(): void {
		if (this.currentSearchProcess) {
			this.currentSearchProcess.kill();
			this.currentSearchProcess = null;
		}
	}

	/**
	 * Update wrapper configuration
	 */
	updateConfig(
		binaryPath: string,
		collectionName: string,
		indexName: string | null
	): void {
		this.binaryPath = binaryPath;
		this.collectionName = collectionName;
		this.indexName = indexName;
	}

	/**
	 * Build the binary path with optional global index flag
	 * Note: --index is a global option that must come before any subcommand
	 */
	private buildBinaryWithIndex(): string {
		let cmd = `"${this.binaryPath}"`;
		if (this.indexName) {
			cmd += ` --index "${this.indexName}"`;
		}
		return cmd;
	}

	/**
	 * Build the base command with optional index flag
	 */
	private buildBaseCommand(subcommand: string): string {
		return `${this.buildBinaryWithIndex()} ${subcommand}`;
	}

	/**
	 * Execute a command through the queue
	 */
	private async queueCommand<T>(
		executor: () => Promise<T>
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const task = async () => {
				try {
					const result = await executor();
					resolve(result);
				} catch (error) {
					reject(error instanceof Error ? error : new Error(String(error)));
				}
			};

			this.commandQueue.push(task);
			void this.processQueue();
		});
	}

	/**
	 * Process the command queue
	 */
	private async processQueue(): Promise<void> {
		if (this.isProcessing || this.commandQueue.length === 0) {
			return;
		}

		this.isProcessing = true;

		while (this.commandQueue.length > 0) {
			const task = this.commandQueue.shift();
			if (task) {
				await task();
			}
		}

		this.isProcessing = false;
	}

	/**
	 * Execute a raw command and return output
	 */
	private async execCommand(command: string): Promise<{ stdout: string; stderr: string }> {
		try {
			const { stdout, stderr } = await this.execAsync(command, {
				maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
				cwd: this.vaultPath,
				env: buildExecEnv(),
			});
			return { stdout, stderr };
		} catch (error) {
			const execError = error as ExecException & { stdout?: string; stderr?: string };
			
			// Check for common error conditions
			if (execError.code === 127 || execError.message?.includes("not found")) {
				throw new QMDError(
					`QMD binary not found at: ${this.binaryPath}`,
					"not_found",
					execError.stderr
				);
			}

			if (execError.stderr?.includes("no collection")) {
				throw new QMDError(
					`Collection "${this.collectionName}" not found`,
					"no_collection",
					execError.stderr
				);
			}

			if (execError.stderr?.includes("no embeddings") || 
				execError.stderr?.includes("embeddings not found")) {
				throw new QMDError(
					"Embeddings not generated for this collection",
					"no_embeddings",
					execError.stderr
				);
			}

			throw new QMDError(
				execError.message || "Unknown QMD error",
				"execution_error",
				execError.stderr
			);
		}
	}

	/**
	 * Execute a search command with cancellation support
	 * Uses exec directly to track the ChildProcess (in production)
	 * Falls back to execAsync when injected (for testing)
	 */
	private execSearchCommand(command: string): Promise<{ stdout: string; stderr: string }> {
		// If using injected execAsync (testing), use it directly
		if (this.execAsync !== defaultExecAsync) {
			return this.execCommand(command);
		}
		
		// Production: use exec directly for cancellation support
		return new Promise((resolve, reject) => {
			this.currentSearchProcess = exec(
				command,
				{
					maxBuffer: 10 * 1024 * 1024,
					cwd: this.vaultPath,
					env: buildExecEnv(),
				},
				(error, stdout, stderr) => {
					this.currentSearchProcess = null;
					
					if (error) {
						// Check if it was killed (aborted)
						if (error.killed || error.signal === "SIGTERM") {
							reject(new QMDError("Search cancelled", "execution_error"));
							return;
						}
						
						const execError = error as ExecException & { stdout?: string; stderr?: string };
						
						if (execError.code === 127 || execError.message?.includes("not found")) {
							reject(new QMDError(
								`QMD binary not found at: ${this.binaryPath}`,
								"not_found",
								stderr
							));
							return;
						}

						if (stderr?.includes("no collection")) {
							reject(new QMDError(
								`Collection "${this.collectionName}" not found`,
								"no_collection",
								stderr
							));
							return;
						}

						if (stderr?.includes("no embeddings") || stderr?.includes("embeddings not found")) {
							reject(new QMDError(
								"Embeddings not generated for this collection",
								"no_embeddings",
								stderr
							));
							return;
						}

						reject(new QMDError(
							execError.message || "Unknown QMD error",
							"execution_error",
							stderr
						));
						return;
					}
					
					resolve({ stdout, stderr });
				}
			);
		});
	}

	/**
	 * Check if QMD is available and working
	 */
	async testConnection(): Promise<QMDCommandResult<QMDStatusResult>> {
		return this.queueCommand(async () => {
			try {
				const cmd = this.buildBaseCommand("status");
				const { stdout, stderr } = await this.execCommand(cmd);

				// Parse text output from qmd status
				const data = this.parseStatusOutput(stdout);
				return { success: true, data, stderr };
			} catch (error) {
				const qmdError = error as QMDError;
				return { 
					success: false, 
					error: qmdError.message,
					stderr: qmdError.stderr 
				};
			}
		});
	}

	/**
	 * Parse qmd status text output
	 */
	private parseStatusOutput(stdout: string): QMDStatusResult {
		// Parse "Total: X files indexed"
		const totalMatch = stdout.match(/Total:\s+(\d+)\s+files?\s+indexed/i);
		const fileCount = totalMatch ? parseInt(totalMatch[1], 10) : 0;

		// Parse "Vectors: X embedded"
		const vectorsMatch = stdout.match(/Vectors:\s+(\d+)\s+embedded/i);
		const embeddingsCount = vectorsMatch ? parseInt(vectorsMatch[1], 10) : 0;

		// Check if our collection exists in output
		const hasCollection = stdout.includes(this.collectionName) || 
			stdout.includes(`qmd://${this.collectionName}/`);

		// Check for "No collections" message
		const noCollections = stdout.toLowerCase().includes("no collections");

		return {
			collection: hasCollection ? this.collectionName : "",
			path: this.vaultPath,
			fileCount,
			indexedCount: fileCount,
			embeddingsCount,
			hasEmbeddings: embeddingsCount > 0,
			hasCollection: hasCollection && !noCollections,
		};
	}

	/**
	 * Ensure collection exists, creating if necessary
	 */
	async ensureCollection(fileMask: string): Promise<QMDCommandResult> {
		return this.queueCommand(async () => {
			try {
				// Check if our collection exists by listing collections
				const listCmd = `${this.buildBinaryWithIndex()} collection list`;
				try {
					const { stdout } = await this.execCommand(listCmd);
					// Check if our collection name appears in the output
					if (stdout.includes(this.collectionName) || 
						stdout.includes(`qmd://${this.collectionName}/`)) {
						// Collection exists
						return { success: true };
					}
				} catch {
					// collection list failed, try to create anyway
				}

				// Collection doesn't exist, create it
				const addCmd = `${this.buildBinaryWithIndex()} collection add "${this.vaultPath}" --name "${this.collectionName}" --mask "${fileMask}"`;
				const { stderr } = await this.execCommand(addCmd);
				return { success: true, stderr };
			} catch (error) {
				const qmdError = error as QMDError;
				return { 
					success: false, 
					error: qmdError.message,
					stderr: qmdError.stderr 
				};
			}
		});
	}

	/**
	 * Update the index
	 */
	async updateIndex(): Promise<QMDCommandResult> {
		return this.queueCommand(async () => {
			try {
				const cmd = this.buildBaseCommand("update");
				const { stderr } = await this.execCommand(cmd);
				return { success: true, stderr };
			} catch (error) {
				const qmdError = error as QMDError;
				return { 
					success: false, 
					error: qmdError.message,
					stderr: qmdError.stderr 
				};
			}
		});
	}

	/**
	 * Generate embeddings
	 */
	async generateEmbeddings(force = false): Promise<QMDCommandResult> {
		return this.queueCommand(async () => {
			try {
				let cmd = this.buildBaseCommand("embed");
				if (force) {
					cmd += " -f";
				}
				const { stderr } = await this.execCommand(cmd);
				return { success: true, stderr };
			} catch (error) {
				const qmdError = error as QMDError;
				return { 
					success: false, 
					error: qmdError.message,
					stderr: qmdError.stderr 
				};
			}
		});
	}

	/**
	 * Parse raw QMD search results into our format
	 * Converts file paths from qmd://collection/path to just path
	 */
	private parseSearchResults(rawResults: QMDRawSearchResult[]): QMDSearchResult[] {
		return rawResults.map((raw) => {
			// Extract path from qmd://collection/path format
			let path = raw.file;
			if (path.startsWith("qmd://")) {
				// Remove qmd:// prefix and collection name
				const withoutPrefix = path.substring(6); // Remove "qmd://"
				const slashIndex = withoutPrefix.indexOf("/");
				if (slashIndex !== -1) {
					path = withoutPrefix.substring(slashIndex + 1);
				}
			}

			// Strip diff hunk headers from snippets (e.g. "@@ -1,1 @@ (0 before, 0 after)")
			let snippet = raw.snippet;
			if (snippet) {
				snippet = snippet.replace(/@@ -\d+,\d+ @@\s*\(\d+ before, \d+ after\)\s*/g, "").trim();
			}

			return {
				path,
				score: raw.score,
				title: raw.title,
				snippet,
				docid: raw.docid,
			};
		});
	}

	/**
	 * Extract JSON array from QMD output (may contain text before JSON)
	 */
	private extractJsonArray(stdout: string): string {
		// Find the start of the JSON array
		const jsonStart = stdout.indexOf("[");
		if (jsonStart === -1) {
			return "[]"; // No JSON array found, return empty
		}
		// Find the matching end bracket
		let bracketCount = 0;
		let jsonEnd = jsonStart;
		for (let i = jsonStart; i < stdout.length; i++) {
			if (stdout[i] === "[") bracketCount++;
			if (stdout[i] === "]") bracketCount--;
			if (bracketCount === 0) {
				jsonEnd = i + 1;
				break;
			}
		}
		return stdout.substring(jsonStart, jsonEnd);
	}

	/**
	 * Perform semantic search (vsearch)
	 */
	async semanticSearch(query: string): Promise<QMDCommandResult<QMDSearchResult[]>> {
		return this.queueCommand(async () => {
			try {
				const escapedQuery = query.replace(/"/g, '\\"');
				const cmd = this.buildBaseCommand("vsearch") + ` "${escapedQuery}" --json`;
				const { stdout, stderr } = await this.execSearchCommand(cmd);

				try {
					const jsonStr = this.extractJsonArray(stdout);
					const rawResults = JSON.parse(jsonStr) as QMDRawSearchResult[];
					const results = this.parseSearchResults(rawResults);
					return { success: true, data: results, stderr };
				} catch {
					throw new QMDError(
						"Failed to parse search results",
						"parse_error",
						stdout
					);
				}
			} catch (error) {
				const qmdError = error as QMDError;
				return { 
					success: false, 
					error: qmdError.message,
					stderr: qmdError.stderr 
				};
			}
		});
	}

	/**
	 * Perform keyword search (search)
	 */
	async keywordSearch(query: string): Promise<QMDCommandResult<QMDSearchResult[]>> {
		return this.queueCommand(async () => {
			try {
				const escapedQuery = query.replace(/"/g, '\\"');
				const cmd = this.buildBaseCommand("search") + ` "${escapedQuery}" --json`;
				const { stdout, stderr } = await this.execSearchCommand(cmd);

				try {
					const jsonStr = this.extractJsonArray(stdout);
					const rawResults = JSON.parse(jsonStr) as QMDRawSearchResult[];
					const results = this.parseSearchResults(rawResults);
					return { success: true, data: results, stderr };
				} catch {
					throw new QMDError(
						"Failed to parse search results",
						"parse_error",
						stdout
					);
				}
			} catch (error) {
				const qmdError = error as QMDError;
				return { 
					success: false, 
					error: qmdError.message,
					stderr: qmdError.stderr 
				};
			}
		});
	}

	/**
	 * Check if embeddings are available
	 */
	async hasEmbeddings(): Promise<boolean> {
		const status = await this.testConnection();
		return status.success && status.data?.hasEmbeddings === true;
	}

	/**
	 * Get current queue length
	 */
	getQueueLength(): number {
		return this.commandQueue.length;
	}

	/**
	 * Check if currently processing
	 */
	isBusy(): boolean {
		return this.isProcessing;
	}
}
