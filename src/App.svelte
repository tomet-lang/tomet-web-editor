<script lang="ts">
  import { onMount } from 'svelte';
  import { Tomet } from '@tomet/svelte';
  import initWasm, {
    parseDocument as wasmParse,
    formatSource as wasmFormat,
    toHtml as wasmToHtml,
    toMarkdown as wasmToMarkdown,
    toTypst as wasmToTypst,
    validate as wasmValidate,
  } from '@tomet/wasm';
  import { Sidebar, SplitView, StatusBar, paneStore, type TreeNodeData } from '@shion/ui';
  import { FolderTree } from '@lucide/svelte';
  import Editor from './components/Editor.svelte';
  import CustomTask from './components/CustomTask.svelte';
  import CustomCallout from './components/CustomCallout.svelte';
  import VaultPane from './components/VaultPane.svelte';
  import { presets } from './presets';
  import {
    isFileSystemAccessSupported,
    pickVaultDirectory,
    verifyReadWritePermission,
    buildVaultTree,
    readVaultFile,
    writeVaultFile,
    saveVaultHandle,
    loadVaultHandle,
  } from './vault';
  import type { Diagnostic } from '@codemirror/lint';

  interface ParseErrorInfo {
    message: string;
    line: number;
    column: number;
    offset: number;
    formatted: string;
  }

  interface DiagnosticInfo {
    message: string;
    line: number;
    column: number;
    offset: number;
    severity: string;
  }

  interface ParseResult {
    ok: boolean;
    html: string;
    ast: string;
    ast_json: string;
    markdown: string;
    typst: string;
    diagnostics: DiagnosticInfo[];
    error: ParseErrorInfo | null;
  }

  let sourceText = $state(presets.cheatsheet);
  let selectedPreset = $state('cheatsheet');
  let advancedHeadings = $state(false);
  let activeTab = $state<'svelte_preview' | 'html_preview' | 'ast' | 'ast_json' | 'markdown' | 'typst' | 'source'>('svelte_preview');

  let wasmReady = $state(false);
  let parseResult = $state<ParseResult | null>(null);
  let parsedAst = $state<any>(null);
  let isParsing = $state(false);
  let parseError = $state<string | null>(null);
  let copied = $state(false);

  let editorComponent: ReturnType<typeof Editor> | undefined = $state();
  let splitSize = $state(640);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // --- Vault (File System Access API) ---
  let vaultRoot = $state<FileSystemDirectoryHandle | null>(null);
  let vaultTree = $state<TreeNodeData[]>([]);
  let vaultNeedsReconnect = $state(false);
  let currentFilePath = $state<string | null>(null);
  let currentFileHandle = $state<FileSystemFileHandle | null>(null);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const customComponents = {
    task: CustomTask,
    callout: CustomCallout,
  };

  let editorDiagnostics = $derived<Diagnostic[]>(() => {
    if (!parseResult) return [];
    if (!parseResult.ok && parseResult.error) {
      const from = byteOffsetToUtf16(sourceText, parseResult.error.offset);
      return [
        {
          from,
          to: Math.min(from + 1, sourceText.length),
          severity: 'error',
          message: parseResult.error.message,
        },
      ];
    }
    return (parseResult.diagnostics || []).map((diag) => {
      const from = byteOffsetToUtf16(sourceText, diag.offset);
      return {
        from,
        to: Math.min(from + 1, sourceText.length),
        severity: 'warning',
        message: diag.message,
      };
    });
  });

  function byteOffsetToUtf16(source: string, byteOffset: number): number {
    const bytes = new TextEncoder().encode(source);
    const clamped = Math.max(0, Math.min(byteOffset, bytes.length));
    return new TextDecoder().decode(bytes.slice(0, clamped)).length;
  }

  async function triggerParse() {
    if (wasmReady) {
      parseViaWasm();
      return;
    }

    isParsing = true;
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sourceText, advanced: advancedHeadings }),
      });
      const data: ParseResult = await res.json();
      parseResult = data;
      if (data.ok) {
        parseError = null;
        try {
          parsedAst = JSON.parse(data.ast_json);
        } catch {
          parsedAst = null;
        }
      } else {
        parseError = data.error?.formatted || data.error?.message || 'Parse Error';
        parsedAst = null;
      }
    } catch (err) {
      parseError = 'Server connection error';
    } finally {
      isParsing = false;
    }
  }

  function parseViaWasm() {
    try {
      const doc = wasmParse(sourceText);
      const html = wasmToHtml(doc);
      const markdown = wasmToMarkdown(doc);
      const typst = wasmToTypst(doc);
      const ast_json = JSON.stringify(doc, null, 2);
      const rawDiags = wasmValidate(sourceText) || [];
      const diagnostics: DiagnosticInfo[] = (Array.isArray(rawDiags) ? rawDiags : []).map((d: any) => ({
        message: typeof d === 'string' ? d : d.message || JSON.stringify(d),
        line: d.span?.start?.line || 1,
        column: d.span?.start?.column || 1,
        offset: d.span?.start?.offset || 0,
        severity: 'warning',
      }));

      parseResult = {
        ok: true,
        html,
        ast: ast_json,
        ast_json,
        markdown,
        typst,
        diagnostics,
        error: null,
      };
      parsedAst = doc;
      parseError = null;
    } catch (err: any) {
      const errMsg = err?.toString() || 'Parse Error';
      parseResult = {
        ok: false,
        html: '',
        ast: '',
        ast_json: '',
        markdown: '',
        typst: '',
        diagnostics: [],
        error: {
          message: errMsg,
          line: 1,
          column: 1,
          offset: 0,
          formatted: errMsg,
        },
      };
      parsedAst = null;
      parseError = errMsg;
    }
  }

  function handleEditorChange(newText: string) {
    sourceText = newText;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      triggerParse();
    }, wasmReady ? 30 : 150);

    if (currentFileHandle) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveCurrentFile(newText), 400);
    }
  }

  async function saveCurrentFile(text: string) {
    if (!currentFileHandle) return;
    saveState = 'saving';
    try {
      await writeVaultFile(currentFileHandle, text);
      saveState = 'saved';
    } catch (err) {
      console.error('Failed to save vault file:', err);
      saveState = 'error';
    }
  }

  async function refreshVaultTree() {
    if (!vaultRoot) return;
    vaultTree = await buildVaultTree(vaultRoot);
  }

  async function openVault() {
    try {
      const dir = await pickVaultDirectory();
      vaultRoot = dir;
      vaultNeedsReconnect = false;
      await saveVaultHandle(dir);
      await refreshVaultTree();
    } catch (err) {
      // AbortError when the user cancels the picker -- not a real failure.
      if ((err as any)?.name !== 'AbortError') console.error('Failed to open vault:', err);
    }
  }

  async function reconnectVault() {
    if (!vaultRoot) return;
    const granted = await verifyReadWritePermission(vaultRoot);
    if (granted) {
      vaultNeedsReconnect = false;
      await refreshVaultTree();
    }
  }

  async function openVaultFile(node: TreeNodeData) {
    const meta = node.meta as { kind: 'file' | 'dir'; handle?: FileSystemFileHandle } | undefined;
    if (!meta || meta.kind !== 'file' || !meta.handle) return;
    try {
      const content = await readVaultFile(meta.handle);
      currentFileHandle = meta.handle;
      currentFilePath = node.id;
      saveState = 'idle';
      sourceText = content;
      editorComponent?.setContent(content);
      triggerParse();
    } catch (err) {
      console.error('Failed to open vault file:', err);
    }
  }

  // Registered once; the getters keep the pane's props live even though
  // shion-ui's paneStore only takes a props snapshot at registration time.
  if (!paneStore.get('files')) {
    paneStore.register({
      id: 'files',
      label: 'Files',
      icon: FolderTree,
      content: VaultPane,
      props: {
        get nodes() {
          return vaultTree;
        },
        get selected() {
          return currentFilePath;
        },
        onselect: openVaultFile,
      },
    });
  }

  function handlePresetChange(e: Event) {
    const key = (e.target as HTMLSelectElement).value;
    if (presets[key]) {
      selectedPreset = key;
      sourceText = presets[key];
      editorComponent?.setContent(presets[key]);
      triggerParse();
    }
  }

  async function applyFormat() {
    if (wasmReady) {
      try {
        const formatted = wasmFormat(sourceText);
        sourceText = formatted;
        editorComponent?.setContent(formatted);
        triggerParse();
        return;
      } catch (e) {
        console.warn('WASM format failed, falling back to API:', e);
      }
    }

    try {
      const res = await fetch('/api/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sourceText }),
      });
      const data: { formatted: string } = await res.json();
      if (typeof data.formatted === 'string') {
        editorComponent?.setContent(data.formatted);
        triggerParse();
      }
    } catch (err) {
      console.error('Format failed:', err);
    }
  }

  async function copyActiveContent() {
    let content = '';
    if (activeTab === 'html_preview' || activeTab === 'source') {
      content = parseResult?.html || '';
    } else if (activeTab === 'ast') {
      content = parseResult?.ast || '';
    } else if (activeTab === 'ast_json') {
      content = parseResult?.ast_json || '';
    } else if (activeTab === 'markdown') {
      content = parseResult?.markdown || '';
    } else if (activeTab === 'typst') {
      content = parseResult?.typst || '';
    } else if (activeTab === 'svelte_preview') {
      content = sourceText;
    }

    if (content) {
      await navigator.clipboard.writeText(content);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 1500);
    }
  }

  function exportDocument() {
    const blob = new Blob([sourceText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'playground.tmt';
    a.click();
    URL.revokeObjectURL(url);
  }

  onMount(async () => {
    try {
      await initWasm();
      wasmReady = true;
    } catch (e) {
      console.warn('WASM initialization failed, using HTTP API:', e);
    }
    triggerParse();

    if (isFileSystemAccessSupported()) {
      const saved = await loadVaultHandle();
      if (saved) {
        vaultRoot = saved;
        // Browsers require a user gesture to *request* permission, but
        // checking whether it's already granted (e.g. still within the
        // same browsing session) is fine to do on load.
        const already = (await (saved as any).queryPermission({ mode: 'readwrite' })) === 'granted';
        if (already) {
          await refreshVaultTree();
        } else {
          vaultNeedsReconnect = true;
        }
      }
    }
  });
</script>

<div class="app-container">
  <header>
    <div class="logo-area">
      <div class="logo">Tomet</div>
      <div class="subtitle">Svelte 5 Interactive Playground</div>
    </div>
    <div class="controls">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={advancedHeadings} onchange={triggerParse} />
        Heading Numbers
      </label>
      <select value={selectedPreset} onchange={handlePresetChange}>
        <option value="cheatsheet">Preset: Full Cheatsheet</option>
        <option value="tasks">Preset: Task List with Statuses</option>
        <option value="meta">Preset: Embedded JSON/YAML/TOML</option>
        <option value="macros">Preset: Macro Templates & Variables</option>
      </select>
      <button class="btn btn-primary" onclick={applyFormat} type="button">⚡ Format</button>
      <button class="btn btn-secondary" onclick={exportDocument} type="button">💾 Export .tmt</button>
      {#if isFileSystemAccessSupported()}
        {#if vaultNeedsReconnect}
          <button class="btn btn-primary" onclick={reconnectVault} type="button">🔓 Reconnect Vault</button>
        {:else}
          <button class="btn btn-secondary" onclick={openVault} type="button">📁 {vaultRoot ? 'Change' : 'Open'} Vault</button>
        {/if}
      {/if}
    </div>
  </header>

  <main>
    <Sidebar items={['files']} />

    <SplitView bind:size={splitSize} defaultSize={640} minSize={360} maxSize={1400} first={editorPane} second={previewPane} />
  </main>

  <StatusBar>
    {#snippet start()}
      <span class={`status-dot ${parseResult?.ok ? 'ok' : 'err'}`}></span>
      <span>
        {parseResult?.ok
          ? parseResult.diagnostics && parseResult.diagnostics.length > 0
            ? `Valid Tomet (${parseResult.diagnostics.length} warnings)`
            : 'Valid Tomet Document'
          : parseResult?.error
          ? `Parse Error line ${parseResult.error.line}:${parseResult.error.column}`
          : 'Ready'}
      </span>
    {/snippet}
    {#snippet end()}
      <span>{wasmReady ? '⚡ Client WASM' : '🌐 Server API'} • Svelte 5 Engine</span>
    {/snippet}
  </StatusBar>
</div>

{#snippet editorPane()}
  <div class="panel">
    <div class="panel-header">
      <span>{currentFilePath ?? 'Tomet Source (.tmt)'}</span>
      {#if currentFileHandle}
        <span class="save-indicator">
          {#if saveState === 'saving'}Saving…{:else if saveState === 'saved'}✓ Saved{:else if saveState === 'error'}⚠ Save failed{/if}
        </span>
      {/if}
    </div>
    <div class="editor-host">
      <Editor
        bind:this={editorComponent}
        bind:value={sourceText}
        diagnostics={editorDiagnostics()}
        onchange={handleEditorChange}
      />
    </div>
    {#if parseError}
      <pre class="problems-panel">{parseError}</pre>
    {/if}
  </div>
{/snippet}

{#snippet previewPane()}
  <div class="panel">
    <div class="panel-header">
        <div class="tabs">
          <button class={`tab ${activeTab === 'svelte_preview' ? 'active' : ''}`} onclick={() => (activeTab = 'svelte_preview')}>
            ✨ Svelte 5 Component
          </button>
          <button class={`tab ${activeTab === 'html_preview' ? 'active' : ''}`} onclick={() => (activeTab = 'html_preview')}>
            Rendered HTML
          </button>
          <button class={`tab ${activeTab === 'ast' ? 'active' : ''}`} onclick={() => (activeTab = 'ast')}>
            AST (Debug)
          </button>
          <button class={`tab ${activeTab === 'ast_json' ? 'active' : ''}`} onclick={() => (activeTab = 'ast_json')}>
            AST (JSON)
          </button>
          <button class={`tab ${activeTab === 'markdown' ? 'active' : ''}`} onclick={() => (activeTab = 'markdown')}>
            CommonMark
          </button>
          <button class={`tab ${activeTab === 'typst' ? 'active' : ''}`} onclick={() => (activeTab = 'typst')}>
            Typst
          </button>
          <button class={`tab ${activeTab === 'source' ? 'active' : ''}`} onclick={() => (activeTab = 'source')}>
            HTML Source
          </button>
        </div>
        <div class="panel-actions">
          <button class="action-btn" onclick={copyActiveContent} type="button">
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
      </div>

      <div class="preview-viewport">
        {#if activeTab === 'svelte_preview'}
          <div class="svelte-preview-box">
            {#if parsedAst}
              <Tomet ast={parsedAst} components={customComponents} class="tomet-rendered-root" />
            {:else}
              <div class="empty-state">No valid AST to render. Fix errors in editor.</div>
            {/if}
          </div>
        {:else if activeTab === 'html_preview'}
          <div class="iframe-box">
            <iframe srcdoc={parseResult?.html || ''} title="HTML Preview" class="preview-frame" sandbox=""></iframe>
          </div>
        {:else if activeTab === 'ast'}
          <pre class="code-view">{parseResult?.ast || ''}</pre>
        {:else if activeTab === 'ast_json'}
          <pre class="code-view">{parseResult?.ast_json || ''}</pre>
        {:else if activeTab === 'markdown'}
          <pre class="code-view">{parseResult?.markdown || ''}</pre>
        {:else if activeTab === 'typst'}
          <pre class="code-view">{parseResult?.typst || ''}</pre>
        {:else if activeTab === 'source'}
          <pre class="code-view">{parseResult?.html || ''}</pre>
        {/if}
      </div>
    </div>
  {/snippet}

<style>
  :global(:root) {
    --bg-main: #0f172a;
    --bg-panel: #1e293b;
    --bg-input: #090d16;
    --accent: #3b82f6;
    --accent-hover: #60a5fa;
    --text-main: #f8fafc;
    --text-muted: #94a3b8;
    --border: #334155;
    --error: #ef4444;
    --success: #10b981;
  }
  :global(*) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) {
    font-family: 'Inter', system-ui, sans-serif;
    background: var(--bg-main);
    color: var(--text-main);
    overflow: hidden;
    height: 100vh;
  }
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  header {
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    padding: 0 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 60px;
    flex-shrink: 0;
  }
  .logo-area { display: flex; align-items: center; gap: 12px; }
  .logo { font-size: 20px; font-weight: 700; color: var(--text-main); }
  .subtitle {
    font-size: 12.5px;
    color: var(--text-muted);
    padding-left: 12px;
    border-left: 1px solid var(--border);
  }
  .controls { display: flex; align-items: center; gap: 12px; }
  select {
    background: var(--bg-main);
    color: var(--text-main);
    border: 1px solid var(--border);
    padding: 7px 14px;
    border-radius: 7px;
    font-size: 13px;
    cursor: pointer;
  }
  .btn {
    padding: 7px 16px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-secondary { background: rgba(255, 255, 255, 0.08); color: var(--text-main); border-color: var(--border); }
  .btn-secondary:hover { background: rgba(255, 255, 255, 0.15); }
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    color: var(--text-muted);
    cursor: pointer;
  }
  main {
    flex: 1;
    min-height: 0;
    display: flex;
    background: var(--bg-main);
    overflow: hidden;
  }
  :global(main > div) {
    min-width: 0;
  }
  .save-indicator {
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 400;
  }
  .panel {
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    min-height: 0;
    overflow: hidden;
  }
  .panel:last-child { border-right: none; }
  .panel-header {
    background: var(--bg-panel);
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 40px;
    flex-shrink: 0;
  }
  .tabs { display: flex; gap: 4px; }
  .tab {
    background: transparent;
    border: none;
    color: var(--text-muted);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .tab.active { background: var(--bg-main); color: var(--accent-hover); font-weight: 600; }
  .action-btn {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-muted);
    border: 1px solid var(--border);
    padding: 4px 10px;
    border-radius: 5px;
    font-size: 11.5px;
    cursor: pointer;
  }
  .action-btn:hover { background: rgba(255, 255, 255, 0.15); color: var(--text-main); }
  .editor-host { flex: 1; min-height: 0; overflow: hidden; background: var(--bg-input); }
  .problems-panel {
    flex-shrink: 0;
    max-height: 140px;
    overflow: auto;
    padding: 12px 20px;
    background: var(--bg-panel);
    color: var(--error);
    border-top: 1px solid var(--border);
    font-family: 'Fira Code', monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .preview-viewport { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
  .svelte-preview-box {
    flex: 1;
    overflow: auto;
    padding: 24px 32px;
    background: #0f172a;
    color: #f8fafc;
    line-height: 1.7;
  }
  :global(.tomet-rendered-root) {
    max-width: 48rem;
    margin: 0 auto;
  }
  :global(.tomet-rendered-root h1, .tomet-rendered-root h2, .tomet-rendered-root h3) {
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
    font-weight: 700;
  }
  :global(.tomet-rendered-root p) {
    margin: 0.85rem 0;
  }
  :global(.tomet-rendered-root a) {
    color: #3b82f6;
    text-decoration: underline;
  }
  :global(.tomet-rendered-root pre) {
    background: #090d16;
    padding: 14px 18px;
    border-radius: 8px;
    margin: 14px 0;
    border: 1px solid #334155;
    overflow-x: auto;
    font-family: 'Fira Code', monospace;
  }
  .iframe-box { flex: 1; min-height: 0; background: #fff; }
  .preview-frame { width: 100%; height: 100%; border: none; }
  .code-view {
    flex: 1;
    overflow: auto;
    background: var(--bg-input);
    color: #e2e8f0;
    padding: 20px 24px;
    font-family: 'Fira Code', monospace;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
  }
  .empty-state { color: var(--text-muted); font-style: italic; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; }
  .status-dot.ok { background: var(--success); }
  .status-dot.err { background: var(--error); }
</style>
