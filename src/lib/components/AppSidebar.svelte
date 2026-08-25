<script lang="ts">
  /**
   * Left rail: the Studio flow, from session to delivery.
   */

  import Icon from './Icon.svelte';
  import { goHome } from '$lib/saas';
  import { saveProject, openSessionFinder } from '$lib/persistence/documents.svelte';
  import { sessionGate } from '$lib/persistence/sessions.svelte';
  import { chooseSessionFiles } from '$lib/audio/import-session';
  import { projectStore, workspace, type StudioModule } from '$lib/stores';
  import { studioHelp } from '$lib/stores/help.svelte';

  interface Item {
    id: StudioModule | 'home' | 'new' | 'open' | 'save' | 'inspector' | 'audio' | 'import' | 'help';
    label: string;
    icon: 'home' | 'file-plus' | 'folder' | 'save' | 'layout' | 'sparkles' | 'mixer' | 'pianoroll' | 'keyboard' | 'disc' | 'download' | 'gear' | 'inspector' | 'waveform' | 'help';
    module?: StudioModule;
  }

  const sections: { title: string; items: Item[] }[] = [
    {
      title: 'Sesión',
      items: [
        { id: 'home', label: 'Home', icon: 'home' },
        { id: 'new', label: 'Nuevo', icon: 'file-plus' },
        { id: 'open', label: 'Abrir', icon: 'folder' },
        { id: 'save', label: 'Guardar', icon: 'save' }
      ]
    },
    {
      title: 'Crear',
      items: [
        { id: 'arrange', label: 'Arrange', icon: 'layout', module: 'arrange' },
        { id: 'import', label: 'Importar stems', icon: 'waveform' },
        { id: 'maestro', label: 'Maestro', icon: 'sparkles', module: 'maestro' },
        { id: 'inspector', label: 'Inspector', icon: 'inspector' },
        { id: 'audio', label: 'Audio / MIDI', icon: 'waveform' }
      ]
    },
    {
      title: 'Mezcla',
      items: [
        { id: 'mixer', label: 'Mixer', icon: 'mixer', module: 'mixer' },
        { id: 'pianoRoll', label: 'Piano', icon: 'pianoroll', module: 'pianoRoll' },
        { id: 'vrack', label: 'V-Rack', icon: 'keyboard', module: 'vrack' }
      ]
    },
    {
      title: 'Entrega',
      items: [
        { id: 'mastering', label: 'MASTER PRO', icon: 'disc', module: 'mastering' },
        { id: 'export', label: 'Export', icon: 'download', module: 'export' }
      ]
    }
  ];

  function isActive(item: Item): boolean {
    if (item.id === 'inspector') return projectStore.showInspector && workspace.showsArrange;
    if (item.id === 'audio') return workspace.module === 'settings';
    if (item.id === 'import') return false;
    return Boolean(item.module && workspace.module === item.module);
  }

  async function run(item: Item) {
    if (item.id === 'home') {
      void goHome();
      return;
    }
    if (item.id === 'new') {
      sessionGate.open('idea');
      return;
    }
    if (item.id === 'open') {
      await openSessionFinder();
      return;
    }
    if (item.id === 'save') {
      await saveProject();
      return;
    }
    if (item.id === 'inspector') {
      workspace.open('arrange');
      projectStore.showInspector = !projectStore.showInspector;
      return;
    }
    if (item.id === 'import') {
      workspace.open('arrange');
      await chooseSessionFiles();
      return;
    }
    if (item.id === 'audio') {
      workspace.open('settings');
      return;
    }
    if (item.id === 'help') {
      studioHelp.toggle();
      return;
    }
    if (item.module) workspace.open(item.module);
  }
</script>

<nav class="rail" class:wide={workspace.sidebarExpanded} aria-label="Studio">
  <div class="brand-row">
    <button class="brand" title="QAMUZ Studio" onclick={() => workspace.toggleSidebar()}>
      <span class="mark">Q</span>
      {#if workspace.sidebarExpanded}
        <span class="brand-name">Studio</span>
      {/if}
    </button>
    <button class="hide" title="Ocultar menú" onclick={() => workspace.hideSidebar()}>
      <Icon name="chevron-left" size={13} />
      {#if workspace.sidebarExpanded}<span>Ocultar</span>{/if}
    </button>
  </div>

  {#each sections as section}
    <p class="section">{#if workspace.sidebarExpanded}{section.title}{/if}</p>
    {#each section.items as item}
      <button
        class="item"
        class:active={isActive(item)}
        class:dirty={item.id === 'save' && projectStore.isDirty}
        title={item.label}
        onclick={() => void run(item)}
      >
        <Icon name={item.icon} size={15} />
        {#if workspace.sidebarExpanded}
          <span>{item.label}</span>
        {/if}
      </button>
    {/each}
  {/each}

  <span class="flex"></span>

  <button
    class="item"
    class:active={studioHelp.open}
    title="Ayuda (F1)"
    onclick={() => studioHelp.toggle()}
  >
    <Icon name="help" size={15} />
    {#if workspace.sidebarExpanded}
      <span>Ayuda</span>
    {/if}
  </button>

  <button
    class="item"
    class:active={workspace.module === 'settings'}
    title="Ajustes"
    onclick={() => workspace.open('settings')}
  >
    <Icon name="gear" size={15} />
    {#if workspace.sidebarExpanded}
      <span>Ajustes</span>
    {/if}
  </button>
</nav>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    width: 56px;
    flex: none;
    background: var(--bg-control);
    border-right: 1px solid var(--stroke);
    padding: 8px 6px 10px;
    gap: 2px;
    overflow: hidden;
  }

  .rail.wide {
    width: 168px;
  }

  .brand-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding-bottom: 6px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px;
    color: var(--text-primary);
    min-width: 0;
  }

  .hide {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px 6px;
    border-radius: 7px;
    color: var(--text-tertiary);
    font-size: 10px;
    flex: none;
  }

  .hide:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .mark {
    width: 26px;
    height: 26px;
    border-radius: var(--radius);
    background: var(--accent-strong);
    color: var(--on-primary);
    font-weight: 800;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }

  .brand-name {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .section {
    margin: 8px 8px 4px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    min-height: 12px;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 8px;
    border-radius: 8px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .item:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .item.active {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .item.dirty {
    color: var(--tempo);
  }

  .flex {
    flex: 1;
  }
</style>
