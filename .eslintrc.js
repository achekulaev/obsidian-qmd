module.exports = {
	root: true,
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaVersion: 2020,
		sourceType: "module",
	},
	plugins: ["@typescript-eslint"],
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
	],
	env: {
		node: true,
		browser: true,
		es2020: true,
	},
	rules: {
		"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
		"@typescript-eslint/explicit-function-return-type": "off",
		"@typescript-eslint/no-explicit-any": "warn",
		"no-console": ["warn", { allow: ["warn", "error"] }],
	},
	ignorePatterns: ["main.js", "node_modules/", "*.config.js", "*.config.mjs"],
};
