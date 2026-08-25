<script lang="ts">
  /**
   * A clip on a lane: drag to move (across tracks too), drag the right edge to
   * resize, double click to open the piano roll. Audio clips draw their waveform
   * on a canvas, MIDI clips draw a note preview.
   */

  import {
    peaksFor,
    resamplePeaks,
    subscribeWaveformCache,
    waveformCacheGeneration,
    waveformColumns
  } from '$lib/audio/waveform';
  import { isNoteEvent } from '$lib/core/midi';
  import { quantize, toBeats } from '$lib/core/time';
  import { TRACK_COLOR_HEX, type Track } from '$lib/core/track';
  import type { Clip } from '$lib/core/clip';
  import { engine, projectStore, workspace } from '$lib/stores';

  interface Props {
    clip: Clip;
    track: Track;
    laneHeight: number;
    /** Track ids in display order, so a vertical drag can pick a new lane. */
    trackOrder: string[];
  }

  let { clip, track, laneHeight, trackOrder }: Props = $props();

  const RESIZE_ZONE = 8;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let peaksTick = $state(waveformCacheGeneration());

  $effect(() => {
    return subscribeWaveformCache(() => {
      peaksTick = waveformCacheGeneration();
    });
  });

  const bpm = $derived(projectStore.project.tempo.bpm);
  const pixelsPerBeat = $derived(projectStore.pixelsPerBeat);
  const startBeat = $derived(toBeats(clip.timeRange.start, bpm));
  const lengthBeats = $derived(toBeats(clip.timeRange.duration, bpm));
  const isSelected = $derived(projectStore.selectedClipIDs.includes(clip.id));
  const color = $derived(TRACK_COLOR_HEX[clip.color ?? track.color]);
  const width = $derived(Math.max(4, lengthBeats * pixelsPerBeat));
  const bodyHeight = $derived(laneHeight - 20);

  const notes = $derived.by(() => {
    if (clip.content.kind !== 'midi') return [];
    return clip.content.midi.events.filter(isNoteEvent).map((event) => ({
      beat: event.beatPosition,
      pitch: event.type.note.pitch,
      duration: event.type.note.duration,
      velocity: event.type.note.velocity
    }));
  });

  const pitchRange = $derived.by(() => {
    if (notes.length === 0) return { low: 48, high: 72 };
    const pitches = notes.map((n) => n.pitch);
    const low = Math.min(...pitches);
    const high = Math.max(...pitches);
    return high - low < 12 ? { low: low - 6, high: low + 6 } : { low, high };
  });

  // Audio clips: redraw whenever geometry, zoom or the decoded buffer changes.
  $effect(() => {
    const element = canvas;
    if (!element || clip.content.kind !== 'audio') return;
    const generation = peaksTick;
    void generation;

    const audio = clip.content.audio;
    const peaks = peaksFor(audio.fileReference.fileID);
    const drawHeight = Math.max(8, Math.floor(bodyHeight));
    const columns = waveformColumns(width);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    element.width = Math.round(columns * dpr);
    element.height = Math.round(drawHeight * dpr);

    const ctx = element.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, columns, drawHeight);

    if (!peaks) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(0, 0, columns, drawHeight);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(0, drawHeight / 2 - 0.5, columns, 1);
      return;
    }

    const resampled = resamplePeaks(
      peaks,
      audio.fileReference.lengthInSamples,
      audio.sourceStartSample,
      audio.sourceLengthSamples,
      columns
    );

    const mid = drawHeight / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';

    for (let column = 0; column < columns; column += 1) {
      const min = resampled[column * 2];
      const max = resampled[column * 2 + 1];
      const top = mid - max * mid * 0.92;
      const bottom = mid - min * mid * 0.92;
      ctx.fillRect(column, top, 1, Math.max(1, bottom - top));
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(0, mid - 0.5, columns, 1);
  });

  const DRAG_THRESHOLD = 5;

  type DragMode = 'move' | 'resize';

  let pending: {
    mode: DragMode;
    pointerX: number;
    pointerY: number;
    startBeat: number;
    lengthBeats: number;
    laneIndex: number;
  } | null = null;

  let drag: {
    mode: DragMode;
    pointerX: number;
    pointerY: number;
    startBeat: number;
    lengthBeats: number;
    laneIndex: number;
  } | null = null;

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    if (projectStore.aiFillMode) return;

    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    const mode: DragMode = event.clientX > rect.right - RESIZE_ZONE ? 'resize' : 'move';

    event.stopPropagation();
    element.setPointerCapture(event.pointerId);
    projectStore.selectClipForMaestro(clip.id);

    pending = {
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startBeat,
      lengthBeats,
      laneIndex: trackOrder.indexOf(track.id)
    };
  }

  function onPointerMove(event: PointerEvent) {
    if (projectStore.aiFillMode) return;

    if (!drag && pending) {
      const distance = Math.hypot(event.clientX - pending.pointerX, event.clientY - pending.pointerY);
      if (distance < DRAG_THRESHOLD) return;
      projectStore.beginInteraction(pending.mode === 'move' ? 'Move Clip' : 'Resize Clip');
      drag = pending;
      pending = null;
    }

    if (!drag) return;

    const deltaBeats = (event.clientX - drag.pointerX) / pixelsPerBeat;

    const grid = projectStore.snapDivision;
    const snap = (value: number) => (event.altKey || grid === 0 ? value : quantize(value, grid));

    if (drag.mode === 'resize') {
      projectStore.setClipLength(clip.id, Math.max(0.25, snap(drag.lengthBeats + deltaBeats)));
      return;
    }

    const target = Math.max(0, snap(drag.startBeat + deltaBeats));

    const laneDelta = Math.round((event.clientY - drag.pointerY) / laneHeight);
    const laneIndex = Math.max(0, Math.min(trackOrder.length - 1, drag.laneIndex + laneDelta));
    const targetTrackID = trackOrder[laneIndex];

    if (targetTrackID !== track.id) {
      projectStore.moveClipToTrack(clip.id, targetTrackID, target);
    } else {
      projectStore.setClipStart(clip.id, target);
    }
  }

  function onPointerUp(event: PointerEvent) {
    pending = null;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    if (!drag) return;
    drag = null;
    projectStore.endInteraction();
  }

  function openEditor() {
    projectStore.selectClip(clip.id);
    if (clip.content.kind === 'midi') {
      workspace.open('pianoRoll');
      engine.auditionNote(track.id, 60, 120);
    }
  }
</script>

<div
  class="clip"
  class:selected={isSelected}
  class:muted={clip.isMuted}
  class:fill-pass={projectStore.aiFillMode}
  style:left="{startBeat * pixelsPerBeat}px"
  style:width="{width}px"
  style:height="{laneHeight - 4}px"
  style:--clip-color={color}
  role="button"
  tabindex="0"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  ondblclick={openEditor}
  onkeydown={(e) => {
    if (e.key === 'Enter') openEditor();
    if (e.key === 'Delete' || e.key === 'Backspace') projectStore.deleteClip(clip.id);
  }}
>
  <div class="clip-header">
    <span class="clip-name">{clip.name}</span>
    {#if clip.isMuted}<span class="badge">M</span>{/if}
  </div>

  <div class="clip-body" style:height="{bodyHeight}px">
    {#if clip.content.kind === 'audio'}
      <canvas bind:this={canvas}></canvas>
    {:else if clip.content.kind === 'midi'}
      {#each notes as note, i (i)}
        <span
          class="note"
          style:left="{(note.beat / Math.max(lengthBeats, 0.001)) * 100}%"
          style:width="{Math.max(1.5, (note.duration / Math.max(lengthBeats, 0.001)) * 100)}%"
          style:bottom="{((note.pitch - pitchRange.low) /
            Math.max(1, pitchRange.high - pitchRange.low)) *
            88}%"
          style:opacity={0.4 + (note.velocity / 127) * 0.6}
        ></span>
      {/each}
    {/if}
  </div>

  <span class="resize-handle"></span>
</div>

<style>
  .clip {
    position: absolute;
    top: 2px;
    border-radius: 4px;
    border: 1px solid color-mix(in srgb, var(--clip-color) 70%, black);
    background: color-mix(in srgb, var(--clip-color) 45%, #131313);
    overflow: hidden;
    cursor: grab;
  }

  .clip.fill-pass {
    pointer-events: none;
  }

  .clip.selected {
    border-color: var(--text-primary);
    box-shadow: 0 0 0 1px var(--text-primary);
  }

  .clip.muted {
    opacity: 0.4;
  }

  .clip-header {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 16px;
    padding: 0 4px;
    background: color-mix(in srgb, var(--clip-color) 75%, black);
  }

  .clip-name {
    font-size: 9px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    font-size: 8px;
    font-weight: 700;
    color: var(--mute);
  }

  .clip-body {
    position: relative;
    overflow: hidden;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    opacity: 0.95;
  }

  .note {
    position: absolute;
    height: 3px;
    border-radius: 1px;
    background: var(--text-primary);
  }

  .resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    width: 8px;
    height: 100%;
    cursor: ew-resize;
  }
</style>
