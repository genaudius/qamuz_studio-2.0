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
  }

  let { width, height }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let wasPlaying = false;

  const pixelsPerBeat = $derived(projectStore.pixelsPerBeat);
  const perBar = $derived(beatsPerBar(transport.timeSignature));
  const markers = $derived(projectStore.project.markers);

  $effect(() => {
    const element = canvas;
    if (!element) return;

    const dpr = window.devicePixelRatio || 1;
    element.width = Math.max(1, Math.round(width * dpr));
    element.height = Math.max(1, Math.round(height * dpr));

    const ctx = element.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, width, height);

    const totalBeats = Math.ceil(width / pixelsPerBeat) + 1;

    for (let beat = 0; beat < totalBeats; beat += 1) {
      const x = Math.round(beat * pixelsPerBeat) + 0.5;
      const isBar = beat % perBar === 0;
      const tickHeight = isBar ? 15 : 8;

      ctx.beginPath();
      ctx.moveTo(x, height - tickHeight);
      ctx.lineTo(x, height);
      ctx.strokeStyle = isBar ? '#f2f2f7' : 'rgba(152, 152, 159, 0.5)';
      ctx.lineWidth = isBar ? 1 : 0.5;
      ctx.stroke();

      if (isBar) {
        ctx.fillStyle = '#98989f';
        ctx.font = '500 10px ui-monospace, monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(beat / perBar + 1), x + 4, 10);
      }
    }

    if (transport.isLoopEnabled) {
      const start = transport.loopStartBeats * pixelsPerBeat;
      const end = transport.loopEndBeats * pixelsPerBeat;
      ctx.fillStyle = 'rgba(10, 132, 255, 0.18)';
      ctx.fillRect(start, 0, Math.max(1, end - start), 4);
    }

    ctx.strokeStyle = '#38383c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
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
  role="slider"
  aria-label="Playhead position"
  aria-valuenow={Math.round(transport.playheadBeats)}
  tabindex="0"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
>
  <canvas bind:this={canvas} style:width="{width}px" style:height="{height}px"></canvas>

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
  }

  .marker {
    position: absolute;
    top: 2px;
    padding: 0 4px;
    border-left: 2px solid var(--ai);
    background: rgba(191, 90, 242, 0.2);
    color: var(--text-primary);
    font-size: 9px;
    line-height: 12px;
    border-radius: 0 3px 3px 0;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
