<!-- Generated from tmtroot/readme.tmt. Edit that, then `tomet export .`. -->

# Tomet Web Editor

Interactive web playground for the [Tomet](https://github.com/tomet-lang/tomet) markup language, built with **Svelte 5** and **CodeMirror 6**, powered by WebAssembly (`@tomet/wasm`) and AST components (`@tomet/svelte`).

## Features

- **Client-side WebAssembly parsing** via `@tomet/wasm`.
- **Interactive Svelte 5 AST rendering** via `@tomet/svelte`.
- **CodeMirror 6 Editor** with syntax highlighting and linting.
- **Real-time multi-view**:
  1. Svelte Preview (interactive component rendering)
  2. HTML Preview
  3. AST Tree & AST JSON
  4. CommonMark Markdown export
  5. Typst markup export
- **Lossless source formatting**.

## Development

### Install dependencies

```bash
pnpm install
```

### Start development server

```bash
pnpm dev
```

### Build for production

```bash
pnpm build
pnpm preview
```

## License

MIT OR Apache-2.0

