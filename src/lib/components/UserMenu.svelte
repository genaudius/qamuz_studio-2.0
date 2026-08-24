<script lang="ts">
  /**
   * Compact User+ menu: session actions and the view list that used to live
   * in the duplicate top tab bar. The sidebar remains the main navigator.
   */

  import Icon from './Icon.svelte';
  import {
    openProject,
    openProjectAtPath,
    recentProjects
  } from '$lib/persistence/documents.svelte';
  import { goHome } from '$lib/saas';
  import { projectStore, workspace, type StudioModule } from '$lib/stores';

  interface Props {
    onNewProject: () => void;
    onSaveProject: () => void;
  }

  let { onNewProject, onSaveProject }: Props = $props();
  let open = $state(false);

  const views: { id: StudioModule; label: string }[] = [
    { id: 'arrange', label: 'Arrange' },
    { id: 'mixer', label: 'Mixer' },
    { id: 'pianoRoll', label: 'Piano' },
    { id: 'vrack', label: 'V-Rack' },
    { id: 'maestro', label: 'Maestro' },
    { id: 'mastering', label: 'MASTER PRO' },
    { id: 'export', label: 'Export' }
  ];

  function shortPath(path: string): string {
    const parts = path.split(/[\\/]/);
    return parts.slice(-2).join('/');
  }

  function close() {
    open = false;
  }

  function go(id: StudioModule) {
    workspace.open(id);
    close();
  }

  function onWindowKey(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="user">
  <button
    class="chip"
    class:on={open}
    title="User+"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <Icon name="user" size={13} />
    User+
    <Icon name="chevron-down" size={9} />
  </button>

  {#if open}
    <button class="backdrop" aria-label="Cerrar menú" onclick={close}></button>
    <div class="menu" role="menu">
      <button
        role="menuitem"
        onclick={() => {
          close();
          void goHome();
        }}
      >
        <Icon name="home" size={12} /> Home
      </button>
      <button
        role="menuitem"
        onclick={() => {
          close();
          onNewProject();
          workspace.open('arrange');
        }}
      >
        <Icon name="file-plus" size={12} /> Nuevo
      </button>
      <button
        role="menuitem"
        onclick={() => {
          close();
          void openProject();
        }}
      >
        <Icon name="folder" size={12} /> Abrir
      </button>
      <button
        role="menuitem"
        class:dirty={projectStore.isDirty}
        onclick={() => {
          close();
          onSaveProject();
        }}
      >
        <Icon name="save" size={12} /> Guardar{projectStore.isDirty ? ' *' : ''}
      </button>
      <button
        role="menuitem"
        class:on={workspace.module === 'settings'}
        onclick={() => go('settings')}
      >
        <Icon name="gear" size={12} /> Ajustes
      </button>

      <span class="label">Vistas</span>
      {#each views as view}
        <button role="menuitem" class:on={workspace.module === view.id} onclick={() => go(view.id)}>
          {view.label}
        </button>
      {/each}

      {#if recentProjects.items.length > 0}
        <span class="label">Recientes</span>
        {#each recentProjects.items as item (item.path)}
          <button
            role="menuitem"
            class="recent"
            title={item.path}
            onclick={() => {
              close();
              void openProjectAtPath(item.path);
            }}
          >
            <span>{item.name}</span>
            <em>{shortPath(item.path)}</em>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .user {
    position: relative;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: var(--radius);
    background: var(--bg-control);
    border: 1px solid var(--stroke);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
  }

  .chip:hover,
  .chip.on {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 41;
    min-width: 196px;
    max-height: min(70vh, 480px);
    overflow: auto;
    padding: 6px;
    border-radius: var(--radius-lg);
    background: var(--bg-control);
    border: 1px solid var(--stroke);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 8px;
    border-radius: var(--radius);
    color: var(--text-secondary);
    font-size: 12px;
    text-align: left;
  }

  .menu button:hover,
  .menu button.on {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .menu button.dirty {
    color: var(--tempo);
  }

  .label {
    margin: 6px 8px 2px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .recent {
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
  }

  .recent em {
    font-style: normal;
    font-size: 10px;
    color: var(--text-tertiary);
  }
</style>
