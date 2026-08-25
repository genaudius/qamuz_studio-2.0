<script lang="ts">
  /**
   * Beat and bar grid for the whole lane stack, drawn once on a single canvas
   * rather than per track, so scrolling stays cheap. Line weights come from
   * TrackGridView in MainWindowView.swift.
   */

  import { beatsPerBar } from '$lib/core/time';
  import { projectStore, transport } from '$lib/stores';

  interface Props {
    width: number;
    height: number;
    /** Cumulative y offsets where each track lane ends. */
    rowEdges: number[];
    scrollLeft?: number;
    viewWidth?: number;
  }

  let { width, height, rowEdges, scrollLeft = 0, viewWidth = 1400 }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);

  const pixelsPerBeat = $derived(projectStore.pixelsPerBeat);
  const perBar = $derived(beatsPerBar(transport.timeSignature));
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

    const startBeat = Math.floor(drawLeft / pixelsPerBeat);
    const endBeat = Math.ceil((drawLeft + drawWidth) / pixelsPerBeat) + 1;

    for (let beat = startBeat; beat < endBeat; beat += 1) {
      const x = Math.round(beat * pixelsPerBeat - drawLeft) + 0.5;
      const isBar = beat % perBar === 0;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.strokeStyle = isBar ? 'rgba(135, 146, 155, 0.4)' : 'rgba(62, 72, 80, 0.55)';
      ctx.lineWidth = isBar ? 1 : 0.5;
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(62, 72, 80, 0.85)';
    ctx.lineWidth = 1;
    for (const edge of rowEdges) {
      const y = Math.round(edge) - 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(drawWidth, y);
      ctx.stroke();
    }

    if (transport.isLoopEnabled) {
      const start = transport.loopStartBeats * pixelsPerBeat - drawLeft;
      const end = transport.loopEndBeats * pixelsPerBeat - drawLeft;
      ctx.fillStyle = 'rgba(0, 174, 239, 0.06)';
      ctx.fillRect(start, 0, Math.max(1, end - start), height);
    }
  });
</script>

<canvas
  bind:this={canvas}
  style:width="{drawWidth}px"
  style:height="{height}px"
  style:left="{drawLeft}px"
></canvas>

<style>
  canvas {
    position: absolute;
    top: 0;
    pointer-events: none;
  }
</style>
