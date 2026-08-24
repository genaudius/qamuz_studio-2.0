<script lang="ts">
  /**
   * Window layout. Mirrors MainWindowView.swift: transport on top, V-Rack on the
   * left, arrange area in the middle with an optional bottom editor, inspector
   * and AI panel on the right, status bar at the bottom.
   */

  import { onMount } from 'svelte';
  import AIPanel from '$lib/components/AIPanel.svelte';
  import ArrangeView from '$lib/components/ArrangeView.svelte';
  import GenerateDialog from '$lib/components/GenerateDialog.svelte';
  import Inspector from '$lib/components/Inspector.svelte';
  import MixerPanel from '$lib/components/MixerPanel.svelte';
  import PianoRoll from '$lib/components/PianoRoll.svelte';
  import Resizer from '$lib/components/Resizer.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import TransportBar from '$lib/components/TransportBar.svelte';
  import VRackPanel from '$lib/components/VRackPanel.svelte';
  import {
    newProject,
    openProject,
    refreshRecentProjects,
    saveProject,
    saveProjectAs,
    startAutosave
  } from '$lib/persistence/documents.svelte';
  import { engine, initApp, projectStore, transport } from '$lib/stores';

  let booting = $state(true);

  onMount(() => {
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

<TransportBar onNewProject={newProject} onSaveProject={saveProject} />

<div class="body">
  {#if projectStore.showVRack}
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
  </div>

  {#if projectStore.showInspector}
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

  {#if projectStore.showAI}
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
<GenerateDialog />

<style>
  .body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .center {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
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
