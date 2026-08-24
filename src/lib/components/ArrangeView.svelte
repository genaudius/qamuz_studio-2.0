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
  import { beatsPerBar, quantize } from '$lib/core/time';
  import { isTauri } from '$lib/persistence/tauri';
  import { projectStore, transport } from '$lib/stores';

  const RULER_HEIGHT = 30;
  /** Empty bars kept past the last clip so there is always room to work. */
  const TRAILING_BARS = 8;

  let lanesPane = $state<HTMLDivElement | null>(null);
  let headerPane = $state<HTMLDivElement | null>(null);

  let dragIndex = $state<number | null>(null);
  let dropIndex = $state<number | null>(null);
  let dropHint = $state(false);
  let importMessage = $state<string | null>(null);

  const tracks = $derived(projectStore.project.tracks);
  const trackOrder = $derived(tracks.map((t) => t.id));
  const pixelsPerBeat = $derived(projectStore.pixelsPerBeat);
  const perBar = $derived(beatsPerBar(transport.timeSignature));

  const contentBeats = $derived.by(() => {
    let end = 0;
    for (const track of tracks) {
      for (const clip of track.clips) {
        const start = clip.timeRange.start.samples;
        const length = clip.timeRange.duration.samples;
        const beats =
          ((start + length) / projectStore.project.sampleRate / 60) * projectStore.project.tempo.bpm;
        if (beats > end) end = beats;
      }
    }
    const minimum = Math.max(end, transport.playheadBeats, transport.loopEndBeats);
    return Math.ceil((minimum + TRAILING_BARS * perBar) / perBar) * perBar;
  });

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

  function syncScroll() {
    if (headerPane && lanesPane) headerPane.scrollTop = lanesPane.scrollTop;
  }

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
    }
  });

  /**
   * Tauri intercepts file drops before the WebView sees them, so the native
   * event is the only way to get real paths. It reports physical pixels, which
   * have to be divided by the device pixel ratio to land on a lane.
   */
  onMount(() => {
    if (!isTauri()) return;

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
        if (!lane || !trackID) {
          importMessage = 'Drop audio onto a track lane';
          return;
        }

        const rect = lane.getBoundingClientRect();
        let beat = Math.max(0, (x - rect.left) / pixelsPerBeat);
        if (projectStore.snapDivision > 0) beat = quantize(beat, projectStore.snapDivision, 'floor');

        for (const path of event.payload.paths.filter(isAudioPath)) {
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

    return () => unlisten?.();
  });

  async function importIntoSelectedTrack() {
    const trackID =
      projectStore.selectedTrackID ??
      projectStore.project.tracks.find((t) => t.type === 'audio')?.id;
    if (!trackID) return;

    const results = await chooseAudioFiles(trackID, transport.playheadBeats);
    const failure = results.find((r) => r.error);
    if (failure?.error) importMessage = failure.error;
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

<section class="arrange">
  <div class="header-column">
    <div class="corner" style:height="{RULER_HEIGHT}px">
      <button class="icon-btn" title="Zoom out" onclick={() => zoom(1 / 1.25)}>
        <Icon name="zoom-out" size={13} />
      </button>
      <button class="icon-btn" title="Zoom in" onclick={() => zoom(1.25)}>
        <Icon name="zoom-in" size={13} />
      </button>
      <button class="icon-btn" title="Import audio" onclick={importIntoSelectedTrack}>
        <Icon name="waveform" size={13} />
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
        <button onclick={() => projectStore.addTrack('midi')}>
          <Icon name="plus" size={11} /> MIDI
        </button>
        <button onclick={() => projectStore.addTrack('audio')}>
          <Icon name="plus" size={11} /> Audio
        </button>
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
      <TimelineRuler width={contentWidth} height={RULER_HEIGHT} />

      <div class="stack" style:height="{Math.max(stackHeight, 1)}px">
        <LaneGrid width={contentWidth} height={Math.max(stackHeight, 1)} {rowEdges} />

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

    {#if dropHint}
      <div class="drop-hint">Drop audio on a track</div>
    {/if}

    {#if importMessage}
      <button class="import-message" onclick={() => (importMessage = null)}>
        {importMessage}
      </button>
    {/if}
  </div>
</section>

<style>
  .arrange {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
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
    display: flex;
    gap: 4px;
    padding: 6px;
  }

  .add-track button {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 4px 6px;
    border-radius: 4px;
    background: var(--bg-control);
    color: var(--text-secondary);
    font-size: 10px;
  }

  .add-track button:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
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

  .drop-hint,
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
    color: var(--text-primary);
    font-size: 11px;
    z-index: 20;
  }

  .drop-hint {
    border-color: var(--accent);
    color: var(--accent);
  }

  .import-message {
    max-width: 60%;
    color: var(--warn);
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
