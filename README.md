# Tomet Web Editor

Interactive web playground for the [Tomet](https://github.com/tomet-lang/tomet) markup language, built with **Svelte 5** and **CodeMirror 6**, powered by WebAssembly ([@tomet/wasm](https://www.npmjs.com/package/@tomet/wasm)) and AST components ([@tomet/svelte](https://www.npmjs.com/package/@tomet/svelte)).

## Features

- ⚡ **Client-side WebAssembly parsing** via `@tomet/wasm`
- 🎨 **Interactive Svelte 5 AST rendering** via `@tomet/svelte`
- 📝 **CodeMirror 6 Editor** with syntax highlighting and linting
- 🔄 **Real-time multi-view**:
  - Svelte Preview (interactive component rendering)
  - HTML Preview
  - AST Tree & AST JSON
  - CommonMark Markdown export
  - Typst markup export
- 🧹 **Lossless source formatting**

## Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## License

MIT OR Apache-2.0
