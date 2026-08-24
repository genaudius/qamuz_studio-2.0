<script lang="ts">
  /** Recent-projects menu, shown from the Open button in the transport bar. */

  import Icon from './Icon.svelte';
  import { openProject, openProjectAtPath, recentProjects } from '$lib/persistence/documents.svelte';

  let open = $state(false);

  function shortPath(path: string): string {
    const parts = path.split(/[\\/]/);
    return parts.slice(-2).join('/');
  }

  async function choose(path: string) {
    open = false;
    await openProjectAtPath(path);
  }
</script>

<div class="recent">
  <button class="chip" title="Open project" onclick={() => openProject()}>
    <Icon name="folder" size={12} /> Open
  </button>

  <button
    class="caret"
    title="Recent projects"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <Icon name="chevron-down" size={9} />
  </button>

  {#if open}
    <button class="backdrop" aria-label="Close menu" onclick={() => (open = false)}></button>

    <div class="menu">
      {#if recentProjects.items.length === 0}
        <span class="empty">No recent projects</span>
      {:else}
        {#each recentProjects.items as item (item.path)}
          <button class="item" title={item.path} onclick={() => choose(item.path)}>
            <span class="item-name">{item.name}</span>
            <span class="item-path">{shortPath(item.path)}</span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .recent {
    position: relative;
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px 4px 8px;
    border-radius: 5px 0 0 5px;
    background: var(--bg-control);
    color: var(--text-secondary);
    font-size: 11px;
  }

  .caret {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 24px;
    border-radius: 0 5px 5px 0;
    background: var(--bg-control);
    color: var(--text-tertiary);
  }

  .chip:hover,
  .caret:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
  }

  .menu {
    position: absolute;
    top: 28px;
    left: 0;
    z-index: 31;
    min-width: 240px;
    padding: 4px;
    border-radius: 6px;
    background: var(--bg-elevated);
    border: 1px solid var(--stroke-strong);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .empty {
    padding: 8px;
    font-size: 11px;
    color: var(--text-tertiary);
  }

  .item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 5px 8px;
    border-radius: 4px;
    text-align: left;
  }

  .item:hover {
    background: var(--accent-dim);
  }

  .item-name {
    font-size: 11px;
    color: var(--text-primary);
  }

  .item-path {
    font-size: 9px;
    color: var(--text-tertiary);
  }
</style>
