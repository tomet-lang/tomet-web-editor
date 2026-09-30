<script lang="ts">
  import { TreeView, type TreeNodeData } from '@shion/ui';

  interface Props {
    nodes: TreeNodeData[];
    selected: string | null;
    onselect: (node: TreeNodeData) => void;
  }

  let { nodes, selected, onselect }: Props = $props();
</script>

{#snippet fileTreeItem(node: TreeNodeData, _state: { isOpen: boolean; isSelected: boolean })}
  <span class="tree-item-label">
    {(node.meta as { kind?: string } | undefined)?.kind === 'dir' ? '📁' : '📄'}
    {node.label}
  </span>
{/snippet}

<div class="vault-pane">
  {#if nodes.length === 0}
    <div class="empty-state">No .tmt files found.</div>
  {:else}
    <TreeView {nodes} {selected} {onselect} item={fileTreeItem} />
  {/if}
</div>

<style>
  .vault-pane {
    height: 100%;
    overflow: auto;
    padding: 6px 4px;
    box-sizing: border-box;
  }
  .tree-item-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty-state {
    padding: 12px;
    font-size: 12px;
    font-style: italic;
    color: var(--color-text-muted, #94a3b8);
  }
</style>
