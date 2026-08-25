<script lang="ts">
  /**
   * The arrange area: a fixed column of track headers on the left, and a
   * horizontally scrolling stack of lanes on the right topped by the bar ruler.
   *
   * The lanes pane owns the scrollbars; the header column mirrors its vertical
   * offset, which is how the 1.0 build keeps the two aligned without two
   * competing scroll views.
   */

  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import LaneGrid from './LaneGrid.svelte';
  import TimelineRuler from './TimelineRuler.svelte';
  import TrackHeader from './TrackHeader.svelte';
  import TrackLane from './TrackLane.svelte';
  import { chooseAudioFiles, importAudioPath, isAudioPath } from '$lib/audio/import';
  import {
    chooseSessionFiles,
    chooseSessionFolder,
    filesFromDataTransfer,
    importSessionFiles,
    importSessionPaths,
    isSessionImportablePath
  } from '$lib/audio/import-session';
  import { lastContentBeats, openTimelineBeats, shouldGrowHorizon } from '$lib/core/timeline';
  import { quantize } from '$lib/core/time';
  import { isTauri } from '$lib/persistence/tauri';
  import { projectStore, transport } from '$lib/stores';
  import type { CreateTrackKind } from '$lib/stores/project.svelte';

  const RULER_HEIGHT = 30;

  let lanesPane = $state<HTMLDivElement | null>(null);
  let headerPane = $state<HTMLDivElement | null>(null);
  let horizonBeats = $state(0);
  let scrollLeft = $state(0);
  let viewWidth = $state(1400);

  let dragIndex = $state<number | null>(null);
  let dropIndex = $state<number | null>(null);
  let dropHint = $state(false);
  let importMessage = $state<string | null>(null);
  let addMenuOpen = $state(false);

  const NEW_TRACKS: { kind: CreateTrackKind; label: string; hint: string }[] = [
    { kind: 'audio', label: 'Audio estéreo', hint: 'Pista de audio' },
    { kind: 'midi', label: 'MIDI', hint: 'Notas y piano roll' },
    { kind: 'instrument', label: 'Instrumento virtual', hint: 'Synth interno' },
    { kind: 'aux', label: 'Auxiliar', hint: 'Retorno / envío' },
    { kind: 'bus', label: 'Bus', hint: 'Grupo de mezcla' }
  ];

  const tracks = $derived(projectStore.project.tracks);
  const trackOrder = $derived(tracks.map((t) => t.id));
  const pixelsPerBeat = $derived(projectStore.pixelsPerBeat);

  const contentBeats = $derived.by(() =>
    openTimelineBeats({
      contentEnd: lastContentBeats(projectStore.project),
      playhead: transport.playheadBeats,
      loopEnd: transport.loopEndBeats,
      selectionEnd: projectStore.rangeSelection?.endBeat ?? 0,
      horizon: horizonBeats,
      timeSignature: transport.timeSignature
    })
  );

  const contentWidth = $derived(Math.max(1200, contentBeats * pixelsPerBeat));
  const stackHeight = $derived(tracks.reduce((sum, t) => sum + t.height, 0));

  const rowEdges = $derived.by(() => {
    const edges: number[] = [];
    let y = 0;
    for (const track of tracks) {
      y += track.height;
      edges.push(y);
    }
    return edges;
  });

  const playheadX = $derived(transport.smoothPlayheadBeats * pixelsPerBeat);

  function isFileDrag(event: DragEvent): boolean {
    return [...(event.dataTransfer?.types ?? [])].includes('Files');
  }

  function onFileDragEnter(event: DragEvent) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dropHint = true;
  }

  function onFileDragOver(event: DragEvent) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dropHint = true;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  function onFileDragLeave(event: DragEvent) {
    if (!isFileDrag(event)) return;
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const inside =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom;
    if (inside) return;
    dropHint = false;
  }

  async function onFileDrop(event: DragEvent) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dropHint = false;
    if (!event.dataTransfer) return;

    const files = await filesFromDataTransfer(event.dataTransfer);
    if (!files.length) {
      importMessage = 'No encontré WAV, MP3 o MIDI en lo que soltaste.';
      return;
    }

    const report = await importSessionFiles(files);
    importMessage = report.summary;
  }

  function syncScroll() {
    if (headerPane && lanesPane) headerPane.scrollTop = lanesPane.scrollTop;
    if (!lanesPane) return;
    scrollLeft = lanesPane.scrollLeft;
    viewWidth = lanesPane.clientWidth;
    if (shouldGrowHorizon(scrollLeft, viewWidth, contentWidth)) {
      horizonBeats = Math.max(horizonBeats, contentBeats);
    }
  }

  $effect(() => {
    void projectStore.project.id;
    horizonBeats = 0;
  });

  // Keeps the playhead in view while the transport rolls, like the 1.0 build's
  // auto-scroll: it jumps a page ahead rather than scrolling continuously.
  $effect(() => {
    const pane = lanesPane;
    if (!pane || !transport.isPlaying) return;

    const x = playheadX;
    const left = pane.scrollLeft;
    const visible = pane.clientWidth;

    if (x < left || x > left + visible - 80) {
      pane.scrollLeft = Math.max(0, x - visible * 0.15);
      syncScroll();
    }
  });

  /**
   * Tauri intercepts file drops before the WebView sees them, so the native
   * event is the only way to get real paths. It reports physical pixels, which
   * have to be divided by the device pixel ratio to land on a lane.
   */
  onMount(() => {
    const onImported = (event: Event) => {
      const summary = (event as CustomEvent<{ summary?: string }>).detail?.summary;
      if (summary) importMessage = summary;
    };
    window.addEventListener('qamuz:stems-imported', onImported);
    const pane = lanesPane;
    const resize = pane
      ? new ResizeObserver(() => {
          if (!lanesPane) return;
          viewWidth = lanesPane.clientWidth;
        })
      : null;
    if (pane && resize) resize.observe(pane);
    syncScroll();

    if (!isTauri()) {
      return () => {
        window.removeEventListener('qamuz:stems-imported', onImported);
        resize?.disconnect();
      };
    }

    let unlisten: (() => void) | undefined;

    void (async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');

      unlisten = await getCurrentWebview().onDragDropEvent(async (event) => {
        if (event.payload.type !== 'drop') {
          dropHint = event.payload.type === 'over';
          return;
        }
        dropHint = false;

        const ratio = window.devicePixelRatio || 1;
        const x = event.payload.position.x / ratio;
        const y = event.payload.position.y / ratio;

        const lane = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>(
          '[data-track-id]'
        );
        const trackID = lane?.dataset.trackId;
        const paths = event.payload.paths.filter(isSessionImportablePath);
        if (paths.length > 1 || (!trackID && paths.length > 0)) {
          const report = await importSessionPaths(paths, 0);
          importMessage = report.summary;
          return;
        }

        if (!lane || !trackID) {
          importMessage = 'Suelta audio en un lane, o importa una carpeta para crear todas las pistas.';
          return;
        }

        const rect = lane.getBoundingClientRect();
        let beat = Math.max(0, (x - rect.left) / pixelsPerBeat);
        if (projectStore.snapDivision > 0) beat = quantize(beat, projectStore.snapDivision, 'floor');

        for (const path of paths.filter(isAudioPath)) {
          const result = await importAudioPath(path, trackID, beat);
          if (result.error) importMessage = result.error;
          if (!result.clipID) continue;

          const found = projectStore.findClip(result.clipID);
          if (found) {
            beat +=
              (found.clip.timeRange.duration.samples / projectStore.project.sampleRate / 60) *
              projectStore.project.tempo.bpm;
          }
        }
      });
    })();

    return () => {
      window.removeEventListener('qamuz:stems-imported', onImported);
      resize?.disconnect();
      unlisten?.();
    };
  });

  async function importIntoSelectedTrack() {
    const selected = projectStore.selectedTrack;
    const trackID =
      selected?.type === 'audio'
        ? selected.id
        : projectStore.project.tracks.find((t) => t.type === 'audio')?.id ??
          projectStore.addTrack('audio').id;

    const results = await chooseAudioFiles(trackID, transport.playheadBeats);
    const failure = results.find((r) => r.error);
    if (failure?.error) importMessage = failure.error;
    else if (results.some((r) => r.clipID)) importMessage = 'Archivo importado a la pista. Pon el BPM si no coincide.';
  }

  async function importFolder() {
    const report = await chooseSessionFolder();
    if (report.summary !== 'Importación cancelada.') importMessage = report.summary;
  }

  async function importStems() {
    const report = await chooseSessionFiles();
    if (report.summary !== 'Importación cancelada.') importMessage = report.summary;
  }

  function createTrack(kind: CreateTrackKind) {
    addMenuOpen = false;
    projectStore.addTrackByKind(kind);
  }

  function onDragStart(index: number) {
    dragIndex = index;
  }

  function onDragOver(index: number) {
    dropIndex = index;
  }

  function onDrop() {
    if (dragIndex !== null && dropIndex !== null) {
      projectStore.moveTrack(dragIndex, dropIndex);
    }
    dragIndex = null;
    dropIndex = null;
  }

  function zoom(factor: number) {
    projectStore.pixelsPerBeat = Math.max(8, Math.min(300, projectStore.pixelsPerBeat * factor));
  }

  function onWheel(event: WheelEvent) {
    // Ctrl/Cmd plus wheel is horizontal zoom, anchored on the pointer so the
    // beat under the cursor stays put.
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();

    const pane = lanesPane;
    if (!pane) return;

    const rect = pane.getBoundingClientRect();
    const beatUnderPointer = (pane.scrollLeft + event.clientX - rect.left) / pixelsPerBeat;

    zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);

    pane.scrollLeft = Math.max(
      0,
      beatUnderPointer * projectStore.pixelsPerBeat - (event.clientX - rect.left)
    );
  }
</script>

<section
  class="arrange"
  role="region"
  aria-label="Arrange"
  ondragenter={onFileDragEnter}
  ondragover={onFileDragOver}
  ondragleave={onFileDragLeave}
  ondrop={(event) => void onFileDrop(event)}
>
  <div class="import-strip">
    <button class="import-primary" title="Elige WAV, MP3 o MIDI — una pista por archivo" onclick={() => void importStems()}>
      <Icon name="waveform" size={13} />
      Importar stems
    </button>
    <button title="Importar una carpeta completa" onclick={() => void importFolder()}>
      <Icon name="folder" size={13} />
      Carpeta
    </button>
    <button title="Importar archivo a la pista seleccionada" onclick={() => void importIntoSelectedTrack()}>
      <Icon name="waveform" size={13} />
      Archivo a pista
    </button>
    <div class="new-track">
      <button title="Crear pista" onclick={() => (addMenuOpen = !addMenuOpen)}>
        <Icon name="plus" size={13} />
        Nueva pista
      </button>
      {#if addMenuOpen}
        <div class="add-menu strip-menu" role="menu">
          {#each NEW_TRACKS as item (item.kind)}
            <button onclick={() => createTrack(item.kind)} title={item.hint}>
              <span>{item.label}</span>
              <em>{item.hint}</em>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <p>Elige los WAV, o arrastra la carpeta — una pista por archivo</p>
  </div>

  <div class="arrange-body">
  <div class="header-column">
    <div class="corner" style:height="{RULER_HEIGHT}px">
      <button class="icon-btn" title="Zoom out" onclick={() => zoom(1 / 1.25)}>
        <Icon name="zoom-out" size={13} />
      </button>
      <button class="icon-btn" title="Zoom in" onclick={() => zoom(1.25)}>
        <Icon name="zoom-in" size={13} />
      </button>
      <span class="flex"></span>
      <select
        class="snap"
        title="Snap grid"
        value={String(projectStore.snapDivision)}
        onchange={(e) => (projectStore.snapDivision = Number(e.currentTarget.value))}
      >
        <option value="0">Off</option>
        <option value="4">1/1</option>
        <option value="1">1/4</option>
        <option value="0.5">1/8</option>
        <option value="0.25">1/16</option>
        <option value="0.125">1/32</option>
      </select>
    </div>

    <div class="header-scroll" bind:this={headerPane}>
      {#each tracks as track, index (track.id)}
        <TrackHeader
          {track}
          {index}
          {onDragStart}
          {onDragOver}
          {onDrop}
          isDragging={dragIndex === index}
          isDropTarget={dropIndex === index && dragIndex !== index}
        />
      {/each}

      <div class="add-track">
        <button
          class="add-toggle"
          class:open={addMenuOpen}
          onclick={() => (addMenuOpen = !addMenuOpen)}
        >
          <Icon name="plus" size={11} />
          Nueva pista
        </button>
        {#if addMenuOpen}
          <div class="add-menu" role="menu">
            {#each NEW_TRACKS as item (item.kind)}
              <button
                onclick={() => createTrack(item.kind)}
                title={item.hint}
              >
                <span>{item.label}</span>
                <em>{item.hint}</em>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div
    class="lanes"
    bind:this={lanesPane}
    onscroll={syncScroll}
    onwheel={onWheel}
    role="presentation"
  >
    <div class="canvas" style:width="{contentWidth}px">
      <TimelineRuler width={contentWidth} height={RULER_HEIGHT} {scrollLeft} {viewWidth} />

      <div class="stack" style:height="{Math.max(stackHeight, 1)}px">
        <LaneGrid width={contentWidth} height={Math.max(stackHeight, 1)} {rowEdges} {scrollLeft} {viewWidth} />

        {#each tracks as track (track.id)}
          <TrackLane
            {track}
            {trackOrder}
            width={contentWidth}
            onImportMessage={(message) => (importMessage = message)}
          />
        {/each}
      </div>

      <div class="playhead" style:transform="translateX({playheadX}px)" style:top="0">
        <span class="playhead-flag"></span>
      </div>
    </div>

    {#if importMessage}
      <button class="import-message" onclick={() => (importMessage = null)}>
        {importMessage}
      </button>
    {/if}
  </div>
  </div>

  {#if dropHint}
    <div class="drop-veil">Suelta los stems aquí — una pista por archivo (Bajo, Requinto, Bongó…)</div>
  {/if}
</section>

<style>
  .arrange {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .import-strip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--stroke);
    background: var(--bg-panel);
    flex: none;
    min-height: 36px;
    position: relative;
    z-index: 6;
    overflow: visible;
  }

  .import-strip > button,
  .new-track > button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 5px;
    background: var(--bg-control);
    color: var(--text-primary);
    font-size: 11px;
    white-space: nowrap;
  }

  .import-strip > button:hover,
  .new-track > button:hover {
    background: var(--bg-elevated);
  }

  .import-strip .import-primary {
    background: var(--accent-dim);
    color: var(--accent);
    border: 1px solid var(--accent);
  }

  .import-strip p {
    margin: 0;
    font-size: 11px;
    color: var(--text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .new-track {
    position: relative;
  }

  .strip-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 20;
    min-width: 200px;
  }

  .arrange-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .drop-veil {
    position: absolute;
    inset: 0;
    z-index: 18;
    display: grid;
    place-items: center;
    pointer-events: none;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    border: 2px dashed var(--accent);
    color: var(--accent);
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    padding: 24px;
  }

  .header-column {
    display: flex;
    flex-direction: column;
    width: var(--track-header-width);
    flex: none;
    border-right: 1px solid var(--stroke);
    background: var(--bg-panel);
  }

  .corner {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 6px;
    background: var(--bg-window);
    border-bottom: 1px solid var(--stroke);
    flex: none;
  }

  .flex {
    flex: 1;
  }

  .snap {
    padding: 1px 2px;
    font-size: 10px;
    background: var(--bg-control);
  }

  .header-scroll {
    flex: 1;
    overflow: hidden;
  }

  .add-track {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
  }

  .add-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    padding: 6px 8px;
    border-radius: 4px;
    background: var(--bg-control);
    color: var(--text-secondary);
    font-size: 11px;
  }

  .add-toggle:hover,
  .add-toggle.open {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .add-menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    border-radius: 6px;
    background: var(--bg-highest);
    border: 1px solid var(--stroke);
  }

  .add-menu button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: 6px 8px;
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 11px;
  }

  .add-menu button:hover {
    background: var(--bg-elevated);
  }

  .add-menu em {
    font-style: normal;
    font-size: 9px;
    color: var(--text-tertiary);
  }

  .lanes {
    flex: 1;
    overflow: auto;
    min-width: 0;
  }

  .canvas {
    position: relative;
  }

  .stack {
    position: relative;
  }

  /* Above the sticky ruler so the flag stays visible while scrubbing. */
  .playhead {
    position: absolute;
    bottom: 0;
    width: 1px;
    background: var(--record);
    pointer-events: none;
    will-change: transform;
    z-index: 4;
  }

  .import-message {
    position: fixed;
    bottom: 36px;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 12px;
    border-radius: 6px;
    background: var(--bg-elevated);
    border: 1px solid var(--stroke-strong);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
    color: var(--warn);
    font-size: 11px;
    z-index: 20;
    max-width: 60%;
  }

  .playhead-flag {
    position: absolute;
    top: 0;
    left: -4px;
    width: 9px;
    height: 9px;
    background: var(--record);
    clip-path: polygon(0 0, 100% 0, 50% 100%);
  }
</style>
