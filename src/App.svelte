<script lang="ts">
  /**
   * Window layout: transport on top, sidebar as the module navigator,
   * arrange in the middle with inspector / V-Rack / bottom editor, status bar last.
   */

  import { onMount } from 'svelte';
  import AIPanel from '$lib/components/AIPanel.svelte';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import ArrangeView from '$lib/components/ArrangeView.svelte';
  import ExportPanel from '$lib/components/ExportPanel.svelte';
  import GenerateDialog from '$lib/components/GenerateDialog.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Inspector from '$lib/components/Inspector.svelte';
  import MasteringPanel from '$lib/components/MasteringPanel.svelte';
  import MixerPanel from '$lib/components/MixerPanel.svelte';
  import PianoRoll from '$lib/components/PianoRoll.svelte';
  import Resizer from '$lib/components/Resizer.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import TransportBar from '$lib/components/TransportBar.svelte';
  import VRackPanel from '$lib/components/VRackPanel.svelte';
  import { readStudioLaunch } from '$lib/ai/launch';
  import {
    newProject,
    openProject,
    refreshRecentProjects,
    saveProject,
    saveProjectAs,
    startAutosave
  } from '$lib/persistence/documents.svelte';
  import { engine, initApp, projectStore, transport, workspace } from '$lib/stores';

  let booting = $state(true);

  $effect(() => {
    switch (workspace.module) {
      case 'mixer':
        projectStore.bottomPanel = 'mixer';
        break;
      case 'pianoRoll':
        projectStore.bottomPanel = 'pianoRoll';
        if (!isMIDITrack(projectStore.selectedTrackID)) {
          const midi = projectStore.project.tracks.find(
            (track) => track.type === 'midi' || track.type === 'instrument'
          );
          if (midi) projectStore.selectTrack(midi.id);
        }
        break;
      case 'vrack':
        projectStore.showVRack = true;
        break;
      case 'maestro':
        projectStore.showAI = true;
        break;
      default:
        break;
    }
  });

  function isMIDITrack(id: string | null): boolean {
    if (!id) return false;
    const track = projectStore.project.tracks.find((item) => item.id === id);
    return Boolean(track && (track.type === 'midi' || track.type === 'instrument'));
  }

  onMount(() => {
    const launch = readStudioLaunch();
    if (launch.session) projectStore.rename(launch.session);
    if (launch.idea) {
      sessionStorage.setItem('qamuz.maestro.seed', launch.idea);
      sessionStorage.setItem('qamuz.maestro.autoPlan', launch.autoPlan ? '1' : '0');
      workspace.open('maestro');
    }

    void initApp().finally(() => (booting = false));
    void refreshRecentProjects();
    const stopAutosave = startAutosave();

    return () => {
      stopAutosave();
      engine.dispose();
    };
  });

  // Warn before closing with unsaved work; Tauri routes the window close through
  // the same beforeunload as a browser tab.
  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!projectStore.isDirty) return;
    event.preventDefault();
    event.returnValue = '';
  }

  /** True when a text field has focus, so shortcuts do not steal typing. */
  function isTyping(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;
    return (
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT' ||
      element.isContentEditable
    );
  }

  async function onKeyDown(event: KeyboardEvent) {
    if (isTyping(event.target)) return;

    const mod = event.metaKey || event.ctrlKey;

    if (mod) {
      switch (event.key.toLowerCase()) {
        case 'z':
          event.preventDefault();
          if (event.shiftKey) projectStore.redo();
          else projectStore.undo();
          return;
        case 's':
          event.preventDefault();
          if (event.shiftKey) await saveProjectAs();
          else await saveProject();
          return;
        case 'o':
          event.preventDefault();
          await openProject();
          return;
        case 'n':
          event.preventDefault();
          newProject();
          return;
        case 'd':
          event.preventDefault();
          for (const id of projectStore.selectedClipIDs) projectStore.duplicateClip(id);
          return;
      }
      return;
    }

    switch (event.key) {
      case ' ':
        event.preventDefault();
        await engine.backend.resume();
        transport.togglePlayPause();
        break;
      case 'Enter':
        event.preventDefault();
        transport.returnToZero();
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        projectStore.deleteSelectedClips();
        break;
      case 'l':
      case 'L':
        transport.toggleLoop();
        break;
      case 'c':
      case 'C':
        transport.toggleMetronome();
        break;
      case 'r':
      case 'R':
        await engine.backend.resume();
        if (transport.isRecording) transport.stopRecording();
        else transport.startRecording();
        break;
      case 'm':
      case 'M':
        if (projectStore.selectedTrackID) {
          projectStore.toggleTrackMute(projectStore.selectedTrackID);
        }
        break;
      case 's':
      case 'S':
        if (projectStore.selectedTrackID) {
          projectStore.toggleTrackSolo(projectStore.selectedTrackID);
        }
        break;
      case 'ArrowLeft':
        transport.nudgePlayheadBars(-1);
        break;
      case 'ArrowRight':
        transport.nudgePlayheadBars(1);
        break;
      case 'Escape':
        projectStore.setRangeSelection(null);
        projectStore.clearClipSelection();
        break;
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} onbeforeunload={onBeforeUnload} />

<div class="shell">
  {#if !workspace.sidebarHidden}
    <AppSidebar />
  {/if}

  <div class="stage">
    {#if workspace.sidebarHidden}
      <button class="show-rail" title="Mostrar menú" onclick={() => workspace.showSidebar()}>
        <Icon name="chevron-right" size={14} />
        <span>Menú</span>
      </button>
    {/if}
    <TransportBar onNewProject={newProject} onSaveProject={saveProject} />

    <div class="body">
      {#if projectStore.showVRack && workspace.showsArrange}
        <div class="side" style:width="{projectStore.vRackWidth}px">
          <VRackPanel />
        </div>
        <Resizer
          orientation="horizontal"
          size={projectStore.vRackWidth}
          min={180}
          max={420}
          onResize={(size) => (projectStore.vRackWidth = size)}
        />
      {/if}

      <div class="center">
        {#if workspace.module === 'export'}
          <div class="module">
            <ExportPanel />
          </div>
        {:else if workspace.module === 'settings'}
          <div class="module">
            <SettingsPanel />
          </div>
        {:else if workspace.module === 'mastering'}
          <MasteringPanel />
        {:else}
          <ArrangeView />

          {#if projectStore.bottomPanel !== 'none'}
            <Resizer
              orientation="vertical"
              size={projectStore.bottomPanelHeight}
              min={140}
              max={640}
              invert
              onResize={(size) => (projectStore.bottomPanelHeight = size)}
            />
            <div class="bottom" style:height="{projectStore.bottomPanelHeight}px">
              {#if projectStore.bottomPanel === 'mixer'}
                <MixerPanel />
              {:else}
                <PianoRoll />
              {/if}
            </div>
          {/if}
        {/if}
      </div>

      {#if projectStore.showInspector && workspace.showsArrange}
        <Resizer
          orientation="horizontal"
          size={projectStore.inspectorWidth}
          min={210}
          max={420}
          invert
          onResize={(size) => (projectStore.inspectorWidth = size)}
        />
        <div class="side" style:width="{projectStore.inspectorWidth}px">
          <Inspector />
        </div>
      {/if}

      {#if projectStore.showAI && workspace.showsArrange}
        <Resizer
          orientation="horizontal"
          size={projectStore.aiWidth}
          min={280}
          max={520}
          invert
          onResize={(size) => (projectStore.aiWidth = size)}
        />
        <div class="side" style:width="{projectStore.aiWidth}px">
          <AIPanel />
        </div>
      {/if}
    </div>

    <StatusBar {booting} />
  </div>
</div>
<GenerateDialog />

<style>
  .shell {
    display: flex;
    flex: 1;
    min-height: 0;
    height: 100%;
  }

  .stage {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .body {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .center {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    background: var(--bg-inset);
  }

  .module {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--bg-inset);
  }

  .show-rail {
    position: absolute;
    left: 0;
    top: 64px;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 10px 8px 8px;
    border-radius: 0 10px 10px 0;
    background: var(--bg-control);
    border: 1px solid var(--stroke);
    border-left: 0;
    color: var(--text-secondary);
    font-size: 11px;
  }

  .show-rail:hover {
    color: var(--text-primary);
    background: var(--bg-elevated);
  }

  .side {
    display: flex;
    flex-direction: column;
    flex: none;
    min-height: 0;
    background: var(--bg-panel);
    overflow: hidden;
  }

  .bottom {
    flex: none;
    min-height: 0;
    background: var(--bg-panel);
    border-top: 1px solid var(--stroke);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
