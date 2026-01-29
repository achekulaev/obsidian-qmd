/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/src"],
	testMatch: ["**/*.test.ts"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	collectCoverageFrom: [
		"src/**/*.ts",
		"!src/**/*.test.ts",
		"!src/**/*.d.ts",
	],
	coverageDirectory: "coverage",
	coverageReporters: ["text", "lcov", "html"],
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				tsconfig: "tsconfig.json",
			},
		],
	},
	moduleNameMapper: {
		"^obsidian$": "<rootDir>/src/__mocks__/obsidian.ts",
	},
};
