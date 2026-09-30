# Milestone 1: vault-backed editing foundation

Detailed checklist for item 1 of `roadmap-vault-editor.md`. Turns
tomet-web-editor from a single-document playground into an app that opens
and edits a real folder of `.tmt` files, using shion-ui for the chrome.

Scope note, decided during implementation: shion-ui's `Sidebar` layout is
a full activity-bar + registered-pane system (`paneStore`), built for a
multi-panel app shell. Wiring into that registry is more than this
milestone needs. This milestone uses shion-ui's `TreeView` for the file
list (which itself renders each row through shion-ui's own `Button`), with
a plain flex layout and the app's existing header-button styling standing
in for the full `Sidebar`/`Titlebar`/`StatusBar` shell -- that fuller shell
adoption, plus a resizable `Splitter`, is follow-up polish, not blocking
"can I open a vault and edit a real file."

- [x] Add `@shion/ui` as a dependency -- pinned to the exact `main` commit
      SHA (`dd8aa101...`) rather than the `v0.1.7` tag: that tag's
      `package.json` still says `"name": "@shiola/ui"` (pre-rename), and
      pinning a commit SHA is exactly as immutable as a tag. Switched the
      package manager from npm to pnpm to install it at all -- shion-ui's
      own `devDependencies` use pnpm-workspace `"catalog:"` version
      refs, which npm's git-dependency install (it always resolves a git
      dep's full `devDependencies`) can't parse; pnpm doesn't need to
      resolve a consumed (non-workspace) package's devDependencies at
      all, so it isn't affected. `package-lock.json` removed,
      `pnpm-lock.yaml` is now the lockfile. Added `tailwindcss` +
      `@tailwindcss/vite`, wired the Vite plugin, imported shion-ui's
      `themes/theme.css` in `main.ts`. Confirmed in the production build
      that real Tailwind utility CSS (`.flex{}`, `--tw-*`) is generated
      from the scanned module graph, shion-ui's compiled components
      included.
- [x] `src/vault.ts`: File System Access API wrapper --
      `showDirectoryPicker()`, recursive `.tmt`-file tree build (skips
      `.git`/`node_modules`/`.obsidian`/`dist`/`.jj`/dotfiles), read,
      write, `queryPermission`/`requestPermission` at `mode: "readwrite"`.
- [x] Directory handle persisted to IndexedDB (`src/vault.ts`'s
      `saveVaultHandle`/`loadVaultHandle`). On load, only *queries*
      existing permission (no prompt) since browsers require a user
      gesture to request it -- shows a "Reconnect Vault" button instead
      when permission isn't already granted.
- [x] File tree sidebar (shion-ui `TreeView`) in `App.svelte`, wired to
      `openVaultFile` -> `editorComponent.setContent(...)`.
- [x] Saving: `handleEditorChange` schedules a 400ms-debounced
      `writeVaultFile` alongside the existing reparse debounce, whenever
      a vault file is open. A small saving/saved/error indicator sits in
      the editor pane's header.
- [x] Presets dropdown: left as always-available, vault or not -- it's
      still useful for trying syntax examples with a vault open, and
      doesn't conflict with anything.
- [x] Verify: `pnpm run typecheck` and `pnpm run build` both clean.
      Caught and fixed one real bug this way: `currentFileHandle` was a
      plain `let`, not `$state`, so the save-indicator's `{#if
      currentFileHandle}` would never have updated. File System Access
      API itself was **not** exercised in a real browser -- this
      environment is headless and can't grant/click through its
      permission prompts. That part needs a human to actually click
      through (pick a folder, open a file, edit it, confirm the write
      landed on disk).
- [x] Follow-up pass: adopted shion-ui's real app-shell components.
      - `Sidebar` (activity-bar + registered pane), replacing the ad-hoc
        `{#if vaultRoot}` sidebar div. Registered one pane, `'files'`,
        with a `FolderTree` (`@lucide/svelte`) icon and a new
        `src/components/VaultPane.svelte` wrapping `TreeView`. Pane
        `props` are getters (`get nodes() { return vaultTree }`, etc.)
        since `paneStore.register` only snapshots props once -- this
        keeps the pane's content live as vault state changes. Sets up
        cleanly for milestone 2 (a `'search'` or `'backlinks'` pane is
        just another `paneStore.register` call).
      - `SplitView` between the editor and preview panes -- this *is*
        the resizable-Splitter item, done via the higher-level
        `SplitView` (which wraps `Splitter` + two snippet slots) rather
        than wiring `Splitter` directly.
      - `StatusBar` replacing the plain `<footer>`.
      - **Skipped on purpose**: `Titlebar`/`WindowControls`. Those render
        fake minimize/maximize/close buttons -- correct for an
        Electron/Tauri-wrapped desktop app (which is what they're built
        for, in `shiola`), actively wrong for a page in an ordinary
        browser tab that already has real window chrome. Not a shortfall,
        a fit mismatch.
      - shion-ui side: `layouts/statusbar/StatusBar.svelte` was a 0-byte
        empty file despite being exported from the package index --
        implemented it for real (`start`/`end` snippet slots, matching
        `Titlebar`'s conventions), committed and pushed to shion-ui `main`
        (`55f6369`), tomet-web-editor's dependency re-pinned to that
        commit. Iterated via a temporary `link:` dependency pointing at
        the local shion-ui checkout, so this didn't require a
        commit-push-repin cycle per attempt.
      - Noted, not fixed: `Sidebar.svelte:29` has a pre-existing
        svelte-check warning (`items[0]` only captures its initial value
        for seeding `activeId`) -- harmless for this app's static
        `items={['files']}`, but a real behavior question for a caller
        that changes `items` at runtime. Left alone rather than guessing
        at intended behavior.
      - Verified: `pnpm run typecheck` and `pnpm run build` clean against
        the real (non-`link:`) pinned dependency.

## Explicitly deferred to later milestones/polish

- Wikilink navigation, backlinks, search (milestone 2).
- tomet-book integration (milestone 3).
