# Contributing to QMD Semantic Search

Thank you for your interest in contributing to QMD Semantic Search! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git
- [QMD](https://github.com/tobi/qmd) installed for testing
- An Obsidian vault for testing

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/achekulaev/obsidian-qmd.git
   cd obsidian-qmd
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the plugin**
   ```bash
   npm run build
   ```

4. **Link to an Obsidian vault for testing**
   ```bash
   # Create a symbolic link in your vault's plugins folder
   ln -s /path/to/obsidian-qmd /path/to/your/vault/.obsidian/plugins/obsidian-qmd
   ```

5. **Start development mode**
   ```bash
   npm run dev
   ```
   This watches for changes and rebuilds automatically.

6. **Reload Obsidian** to see changes (View → Force Reload)

## Development Workflow

### Code Style

- TypeScript with strict mode
- ESLint for linting
- Follow existing code patterns
- Use meaningful variable and function names
- Add JSDoc comments for public functions

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Linting

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

### Building

```bash
# Development build (with source maps)
npm run dev

# Production build (minified)
npm run build
```

## Project Structure

```
obsidian-qmd/
├── src/
│   ├── main.ts          # Plugin entry point
│   ├── settings.ts      # Settings types and defaults
│   ├── qmd.ts           # QMD CLI wrapper
│   ├── searchModal.ts   # Search modal component
│   ├── searchPane.ts    # Sidebar pane component
│   ├── settingsTab.ts   # Settings UI
│   ├── *.test.ts        # Test files
│   └── __mocks__/       # Test mocks
├── manifest.json        # Obsidian manifest
├── package.json         # npm configuration
├── tsconfig.json        # TypeScript configuration
├── jest.config.js       # Jest test configuration
└── esbuild.config.mjs   # Build configuration
```

## Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clear, concise commits
   - Follow conventional commit format if possible

3. **Test your changes**
   - Run `npm test` to ensure tests pass
   - Run `npm run lint` to check code style
   - Test manually in Obsidian

4. **Submit a pull request**
   - Provide a clear description of changes
   - Reference any related issues
   - Include screenshots for UI changes

## Guidelines

### Commit Messages

Use clear, descriptive commit messages:
- `feat: add support for custom search filters`
- `fix: resolve issue with empty search results`
- `docs: update README with new configuration options`
- `refactor: simplify QMD wrapper queue logic`
- `test: add tests for settings validation`

### Code Guidelines

1. **Error Handling**
   - Always handle errors gracefully
   - Use `Notice` for user-facing errors
   - Log errors for debugging

2. **Performance**
   - Debounce frequent operations
   - Use queuing for QMD commands
   - Avoid blocking the UI thread

3. **Obsidian API**
   - Follow Obsidian plugin conventions
   - Use native Obsidian components when possible
   - Respect user preferences

4. **Testing**
   - Write tests for new functionality
   - Mock external dependencies
   - Test edge cases

### Documentation

- Update README for new features
- Add JSDoc comments for public APIs
- Include examples where helpful

## Reporting Issues

When reporting issues, please include:

1. **Description** - Clear explanation of the issue
2. **Steps to reproduce** - How to trigger the issue
3. **Expected behavior** - What should happen
4. **Actual behavior** - What actually happens
5. **Environment** - OS, Obsidian version, QMD version
6. **Logs** - Any error messages or console output

## Feature Requests

Feature requests are welcome! Please:

1. Check if it's already been requested
2. Describe the use case
3. Explain the expected behavior
4. Consider implementation complexity

## Questions?

If you have questions:
- Check existing issues and documentation
- Open a discussion or issue
- Be respectful and patient

Thank you for contributing!
