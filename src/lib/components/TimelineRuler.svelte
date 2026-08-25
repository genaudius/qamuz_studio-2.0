<script lang="ts">
  /**
   * Bar ruler drawn on canvas: 15 px bar ticks with numbers, 8 px beat ticks,
   * matching TimelineRulerContent in MainWindowView.swift. Dragging anywhere on
   * it scrubs the playhead, pausing and resuming playback the way the 1.0 build
   * does.
   */

  import { beatsPerBar } from '$lib/core/time';
  import { engine, projectStore, transport } from '$lib/stores';

  interface Props {
    width: number;
    height: number;
    scrollLeft?: number;
    viewWidth?: number;
  }

  let { width, height, scrollLeft = 0, viewWidth = 1400 }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let wasPlaying = false;

  const pixelsPerBeat = $derived(projectStore.pixelsPerBeat);
  const perBar = $derived(beatsPerBar(transport.timeSignature));
  const markers = $derived(projectStore.project.markers);
  const drawLeft = $derived(Math.max(0, scrollLeft - 200));
  const drawWidth = $derived(Math.min(width - drawLeft, Math.max(viewWidth, 400) + 400));

  $effect(() => {
    const element = canvas;
    if (!element) return;

    const dpr = window.devicePixelRatio || 1;
    element.width = Math.max(1, Math.round(drawWidth * dpr));
    element.height = Math.max(1, Math.round(height * dpr));

    const ctx = element.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, drawWidth, height);

    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, drawWidth, height);

    const startBeat = Math.floor(drawLeft / pixelsPerBeat);
    const endBeat = Math.ceil((drawLeft + drawWidth) / pixelsPerBeat) + 1;

    for (let beat = startBeat; beat < endBeat; beat += 1) {
      const x = Math.round(beat * pixelsPerBeat - drawLeft) + 0.5;
      const isBar = beat % perBar === 0;
      const tickHeight = isBar ? 15 : 8;

      ctx.beginPath();
      ctx.moveTo(x, height - tickHeight);
      ctx.lineTo(x, height);
      ctx.strokeStyle = isBar ? '#e5e2e1' : 'rgba(135, 146, 155, 0.5)';
      ctx.lineWidth = isBar ? 1 : 0.5;
      ctx.stroke();

      if (isBar) {
        ctx.fillStyle = '#87929b';
        ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(beat / perBar + 1), x + 4, 10);
      }
    }

    if (transport.isLoopEnabled) {
      const start = transport.loopStartBeats * pixelsPerBeat - drawLeft;
      const end = transport.loopEndBeats * pixelsPerBeat - drawLeft;
      ctx.fillStyle = 'rgba(0, 174, 239, 0.18)';
      ctx.fillRect(start, 0, Math.max(1, end - start), 4);
    }

    ctx.strokeStyle = '#3e4850';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(drawWidth, height - 0.5);
    ctx.stroke();
  });

  function beatAt(event: PointerEvent): number {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.max(0, (event.clientX - rect.left) / pixelsPerBeat);
  }

  function onPointerDown(event: PointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    wasPlaying = transport.isPlaying;
    if (wasPlaying) transport.pause();
    transport.setPlayheadBeats(beatAt(event));
  }

  function onPointerMove(event: PointerEvent) {
    if (event.buttons === 0) return;
    transport.setPlayheadBeats(beatAt(event));
  }

  async function onPointerUp(event: PointerEvent) {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    if (!wasPlaying) return;

    wasPlaying = false;
    await engine.backend.resume();
    transport.play();
  }
</script>

<div
  class="ruler"
  style:height="{height}px"
  style:width="{width}px"
  role="slider"
  aria-label="Playhead position"
  aria-valuenow={Math.round(transport.playheadBeats)}
  tabindex="0"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
>
  <canvas
    bind:this={canvas}
    style:width="{drawWidth}px"
    style:height="{height}px"
    style:transform="translateX({drawLeft}px)"
  ></canvas>

  {#each markers as marker (marker.id)}
    <span
      class="marker"
      style:left="{marker.beatPosition * pixelsPerBeat}px"
      title={marker.name}
    >
      {marker.name}
    </span>
  {/each}
</div>

<style>
  .ruler {
    position: sticky;
    top: 0;
    z-index: 3;
    cursor: ew-resize;
    background: var(--bg-window);
  }

  canvas {
    display: block;
    position: relative;
  }

  .marker {
    position: absolute;
    top: 2px;
    padding: 0 4px;
    border-left: 2px solid var(--ai);
    background: rgba(201, 160, 255, 0.2);
    color: var(--text-primary);
    font-size: 9px;
    line-height: 12px;
    border-radius: 0 3px 3px 0;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
