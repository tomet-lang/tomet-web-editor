# Roadmap: tomet-web-editor as an Obsidian/Notion-level vault editor

Where this came from: tomet-book (the site generator/reader) briefly grew
an in-browser editing feature, tried three shapes (per-block textarea,
whole-file textarea, discussed-but-rejected rich block editor), and none
of them felt like writing tomet. Conclusion: tomet-book stays read/publish
-only; a "View Source" read-only overlay is all it keeps. Real authoring
belongs here, in tomet-web-editor, aimed high enough (Obsidian/Notion
level) that someone evaluating tomet thinks "this is complete enough to
migrate to."

This file is the ordered backlog across every repo that work touches, so
switching between them (e.g. to prep shion-ui first) doesn't lose the
overall plan. Each numbered item becomes its own `.agents/tasks/`
checklist (in its own repo) once actually started; this file stays the
index and doesn't get the fine-grained steps.

## 0. Prepare shion-ui for public/reusable release (blocking, do first)

Repo: `project-shiola/shion-ui`.

- [x] Distribution path: published to `https://github.com/kakusika/shion-ui`
      (public GitHub, SSH remote `origin`). History was rewritten first --
      all 97 commits' author/committer moved off the old `BardMoon
      <personal-gmail>` identity onto the current `kakusika` one, and a
      leftover `BardMoon` GitHub-URL reference in the README was rewritten
      too. The old Forgejo remote is kept locally as `forgejo`, not
      removed. `package.json` is still `"private": true` -- untouched,
      not part of this step.
- [ ] README/docs beyond the one-line description.
- [ ] Enough version stability (currently 0.1.6) to depend on it as a real
      dependency rather than a moving target -- decide what "stable
      enough" means here (a tag/version policy, at minimum).

## 1. tomet-web-editor milestone 1 -- vault-backed editing foundation ✅ core done

Repo: `tomet-web-editor`. Turns it from a single-document playground into
an app that opens and edits a real folder of `.tmt` files. Full checklist
and notes: `milestone-1-vault-foundation.md`.

Done: shion-ui dependency (pinned to a commit SHA, via pnpm -- npm can't
install shion-ui as-is, see that file), Tailwind 4 wired in, File System
Access API vault open/read/write + IndexedDB-persisted handle, `TreeView`
file sidebar, debounced autosave to disk (this much was confirmed live in
a real browser: open vault, browse tree, edit, autosave all worked), and
(follow-up pass, not yet clicked through live) the real shion-ui shell:
`Sidebar` (pane registry) + `SplitView` (resizable editor/preview) +
`StatusBar`. `Titlebar`/`WindowControls` deliberately skipped -- they
render native window buttons, right for `shiola` wrapped in a desktop
shell, wrong for a plain browser tab. shion-ui itself picked up a real
fix along the way (`StatusBar` was a 0-byte stub), pushed to its `main`.

## 2. tomet-web-editor milestone 2 -- navigation & discovery within the vault

- [ ] Wikilink click-to-navigate: clicking `@link(ref:"...")` in the
      preview opens that file in the vault.
- [ ] Backlinks panel -- reuse `tomet-links`'s resolution logic (via
      `@tomet/wasm` if it's exposed there, otherwise reimplemented
      client-side).
- [ ] Full-vault search / quick file switcher.

## 3. tomet-book <-> tomet-web-editor integration

- [ ] A real "Open in tomet-web-editor" entry in tomet-book's edit
      dropdown, carrying enough (vault path, file) for web-editor to jump
      straight to the right file once it holds permission for that
      directory.
- [ ] No new server/network protocol needed: both apps read/write the
      same on-disk vault directly -- tomet-book's file watcher already
      reacts to any write regardless of what made it. Worth confirming
      this holds up in practice once milestone 1 exists (a save from
      web-editor's File System Access API write should trigger
      tomet-book's live-reload same as any editor's save would).
- [ ] Visual/UX coherence between the two apps (shared theme tokens,
      consistent look) -- not decided how deep this goes.

## Explicitly not yet scoped

- True Obsidian-style live preview (hiding/revealing raw markup around
  the cursor, rather than a separate rendered pane) -- would need live
  decoration mapping from the WASM parser's CST into CodeMirror. Bigger
  than milestones 1-3; not committed to.
- Plugins/extensibility, themes beyond what shion-ui already provides.
