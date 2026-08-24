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
  }

  let { width, height, rowEdges }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);

  const pixelsPerBeat = $derived(projectStore.pixelsPerBeat);
  const perBar = $derived(beatsPerBar(transport.timeSignature));

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

    const totalBeats = Math.ceil(width / pixelsPerBeat) + 1;

    for (let beat = 0; beat < totalBeats; beat += 1) {
      const x = Math.round(beat * pixelsPerBeat) + 0.5;
      const isBar = beat % perBar === 0;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.strokeStyle = isBar ? 'rgba(152, 152, 159, 0.4)' : 'rgba(152, 152, 159, 0.15)';
      ctx.lineWidth = isBar ? 1 : 0.5;
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(152, 152, 159, 0.3)';
    ctx.lineWidth = 1;
    for (const edge of rowEdges) {
      const y = Math.round(edge) - 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (transport.isLoopEnabled) {
      const start = transport.loopStartBeats * pixelsPerBeat;
      const end = transport.loopEndBeats * pixelsPerBeat;
      ctx.fillStyle = 'rgba(10, 132, 255, 0.05)';
      ctx.fillRect(start, 0, Math.max(1, end - start), height);
    }
  });
</script>

<canvas bind:this={canvas} style:width="{width}px" style:height="{height}px"></canvas>

<style>
  canvas {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
</style>
