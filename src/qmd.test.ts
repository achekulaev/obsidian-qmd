/**
 * Tests for QMD CLI Wrapper
 */

import { QMDWrapper, QMDError, ExecAsyncFn } from "./qmd";

// Helper to create a mock exec function
function createMockExec(): jest.Mock<ReturnType<ExecAsyncFn>, Parameters<ExecAsyncFn>> {
	return jest.fn();
}

describe("QMDWrapper", () => {
	let wrapper: QMDWrapper;
	let mockExecAsync: jest.Mock;

	beforeEach(() => {
		mockExecAsync = createMockExec();
		wrapper = new QMDWrapper(
			"qmd",
			"test-collection",
			null,
			"/path/to/vault",
			mockExecAsync
		);
	});

	describe("constructor", () => {
		it("should initialize with provided values", () => {
			expect(wrapper).toBeDefined();
		});

		it("should handle optional index name", () => {
			const wrapperWithIndex = new QMDWrapper(
				"qmd",
				"test-collection",
				"custom-index",
				"/path/to/vault",
				mockExecAsync
			);
			expect(wrapperWithIndex).toBeDefined();
		});
	});

	describe("updateConfig", () => {
		it("should update configuration", () => {
			wrapper.updateConfig("/new/path/qmd", "new-collection", "new-index");
			// Configuration is internal, so we just verify no error is thrown
			expect(true).toBe(true);
		});
	});

	describe("testConnection", () => {
		it("should return success when QMD is available", async () => {
			// Mock text output format from qmd status
			mockExecAsync.mockResolvedValueOnce({
				stdout: `QMD Status

Index: /Users/test/.cache/qmd/index.sqlite
Size:  100 KB

Documents
  Total:    100 files indexed
  Vectors:  50 embedded

Collections
  test-collection (qmd://test-collection/)
    Pattern:  **/*.md
    Files:    100
`,
				stderr: "",
			});

			const result = await wrapper.testConnection();
			
			expect(result.success).toBe(true);
			expect(result.data?.collection).toBe("test-collection");
			expect(result.data?.hasEmbeddings).toBe(true);
			expect(result.data?.fileCount).toBe(100);
			expect(result.data?.embeddingsCount).toBe(50);
		});

		it("should detect no embeddings", async () => {
			mockExecAsync.mockResolvedValueOnce({
				stdout: `QMD Status

Documents
  Total:    10 files indexed
  Vectors:  0 embedded
  Pending:  10 need embedding

Collections
  test-collection (qmd://test-collection/)
`,
				stderr: "",
			});

			const result = await wrapper.testConnection();
			
			expect(result.success).toBe(true);
			expect(result.data?.hasEmbeddings).toBe(false);
			expect(result.data?.embeddingsCount).toBe(0);
		});

		it("should return failure when QMD is not found", async () => {
			const error = new Error("Command not found") as Error & { code?: number };
			error.code = 127;
			mockExecAsync.mockRejectedValueOnce(error);

			const result = await wrapper.testConnection();
			
			expect(result.success).toBe(false);
			expect(result.error).toContain("not found");
		});

		it("should include 'binary' and 'not found' in error message for missing QMD", async () => {
			const error = new Error("Command not found: qmd") as Error & { code?: number };
			error.code = 127;
			mockExecAsync.mockRejectedValueOnce(error);

			const result = await wrapper.testConnection();
			
			expect(result.success).toBe(false);
			// Error should mention both "binary" and "not found" for proper detection
			expect(result.error?.toLowerCase()).toContain("not found");
			expect(result.error?.toLowerCase()).toContain("binary");
		});
	});

	describe("semanticSearch", () => {
		it("should parse JSON results correctly", async () => {
			// Mock raw QMD JSON format
			const mockRawResults = [
				{ docid: "#abc123", file: "qmd://test-collection/note1.md", score: 0.95, title: "Note 1", snippet: "Content..." },
				{ docid: "#def456", file: "qmd://test-collection/note2.md", score: 0.85, title: "Note 2", snippet: "More content..." },
			];

			mockExecAsync.mockResolvedValueOnce({
				stdout: JSON.stringify(mockRawResults),
				stderr: "",
			});

			const result = await wrapper.semanticSearch("test query");
			
			expect(result.success).toBe(true);
			expect(result.data).toHaveLength(2);
			expect(result.data?.[0].score).toBe(0.95);
			expect(result.data?.[0].path).toBe("note1.md"); // Converted from qmd:// format
			expect(result.data?.[0].docid).toBe("#abc123");
		});

		it("should handle search errors", async () => {
			const error = new Error("No embeddings found") as Error & { stderr?: string };
			error.stderr = "no embeddings available for this collection";
			mockExecAsync.mockRejectedValueOnce(error);

			const result = await wrapper.semanticSearch("test query");
			
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});

		it("should escape quotes in query", async () => {
			mockExecAsync.mockResolvedValueOnce({ stdout: "[]", stderr: "" });

			await wrapper.semanticSearch('test "quoted" query');
			
			expect(mockExecAsync).toHaveBeenCalled();
			const calledCommand = mockExecAsync.mock.calls[0][0] as string;
			expect(calledCommand).toContain('\\"');
		});
	});

	describe("keywordSearch", () => {
		it("should parse JSON results correctly", async () => {
			const mockRawResults = [
				{ docid: "#abc123", file: "qmd://test-collection/note1.md", score: 1.0, title: "Note 1" },
			];

			mockExecAsync.mockResolvedValueOnce({
				stdout: JSON.stringify(mockRawResults),
				stderr: "",
			});

			const result = await wrapper.keywordSearch("keyword test");
			
			expect(result.success).toBe(true);
			expect(result.data).toHaveLength(1);
			expect(result.data?.[0].path).toBe("note1.md");
		});
	});

	describe("updateIndex", () => {
		it("should return success on successful update", async () => {
			mockExecAsync.mockResolvedValueOnce({
				stdout: "Index updated",
				stderr: "",
			});

			const result = await wrapper.updateIndex();
			
			expect(result.success).toBe(true);
		});
	});

	describe("generateEmbeddings", () => {
		it("should include -f flag when force is true", async () => {
			mockExecAsync.mockResolvedValueOnce({ stdout: "Embeddings generated", stderr: "" });

			await wrapper.generateEmbeddings(true);
			
			expect(mockExecAsync).toHaveBeenCalled();
			const calledCommand = mockExecAsync.mock.calls[0][0] as string;
			expect(calledCommand).toContain("-f");
		});

		it("should not include -f flag when force is false", async () => {
			mockExecAsync.mockResolvedValueOnce({ stdout: "Embeddings generated", stderr: "" });

			await wrapper.generateEmbeddings(false);
			
			expect(mockExecAsync).toHaveBeenCalled();
			const calledCommand = mockExecAsync.mock.calls[0][0] as string;
			expect(calledCommand).not.toContain("-f");
		});
	});

	describe("ensureCollection", () => {
		it("should not create collection if it already exists", async () => {
			// collection list shows our collection exists
			mockExecAsync.mockResolvedValueOnce({
				stdout: `Collections (1):

test-collection (qmd://test-collection/)
  Pattern:  **/*.md
  Files:    10
`,
				stderr: "",
			});

			const result = await wrapper.ensureCollection("**/*.md");
			
			expect(result.success).toBe(true);
			expect(mockExecAsync).toHaveBeenCalledTimes(1); // Only list check, no create
		});

		it("should create collection if it does not exist", async () => {
			// First call - collection list shows no matching collection
			mockExecAsync.mockResolvedValueOnce({
				stdout: "No collections found. Run 'qmd add .' to create one.",
				stderr: "",
			});
			
			// Second call - create succeeds
			mockExecAsync.mockResolvedValueOnce({
				stdout: "Collection created",
				stderr: "",
			});

			const result = await wrapper.ensureCollection("**/*.md");
			
			expect(result.success).toBe(true);
			expect(mockExecAsync).toHaveBeenCalledTimes(2); // List check + create
		});
	});

	describe("queue management", () => {
		it("should report correct queue length", () => {
			expect(wrapper.getQueueLength()).toBe(0);
		});

		it("should report busy state correctly", () => {
			expect(wrapper.isBusy()).toBe(false);
		});

		it("should process commands sequentially", async () => {
			const order: number[] = [];
			let callIndex = 0;

			mockExecAsync.mockImplementation(async () => {
				order.push(callIndex++);
				// Small delay to test sequencing
				await new Promise(resolve => setTimeout(resolve, 5));
				return { stdout: "[]", stderr: "" };
			});

			// Queue multiple commands
			const p1 = wrapper.semanticSearch("query 1");
			const p2 = wrapper.semanticSearch("query 2");
			const p3 = wrapper.semanticSearch("query 3");

			await Promise.all([p1, p2, p3]);

			// Should be processed in order
			expect(order).toEqual([0, 1, 2]);
		});
	});
});

describe("QMDError", () => {
	it("should create error with correct properties", () => {
		const error = new QMDError("Test error", "not_found", "stderr output");
		
		expect(error.message).toBe("Test error");
		expect(error.type).toBe("not_found");
		expect(error.stderr).toBe("stderr output");
		expect(error.name).toBe("QMDError");
	});
});
