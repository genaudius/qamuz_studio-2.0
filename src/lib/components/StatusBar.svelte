<script lang="ts">
  /** Bottom status strip: engine state, master meter, sample rate, selection. */

  import { formatDb } from '$lib/core/time';
  import { documentStatus } from '$lib/persistence/documents.svelte';
  import { engine, projectStore, transport } from '$lib/stores';

  interface Props {
    booting: boolean;
  }

  let { booting }: Props = $props();

  const status = $derived.by(() => {
    if (booting) return { text: 'Starting audio engine', tone: 'idle' as const };
    if (engine.startupError) return { text: engine.startupError, tone: 'error' as const };
    if (documentStatus.tone === 'error') return { text: documentStatus.message, tone: 'error' as const };
    if (transport.isRecording) return { text: 'Recording', tone: 'record' as const };
    if (transport.isPlaying) return { text: 'Playing', tone: 'live' as const };
    if (documentStatus.message) return { text: documentStatus.message, tone: 'idle' as const };
    return { text: 'Ready', tone: 'idle' as const };
  });

  const trackCount = $derived(projectStore.project.tracks.length);
  const clipCount = $derived(
    projectStore.project.tracks.reduce((sum, t) => sum + t.clips.length, 0)
  );
  const masterPeak = $derived(engine.masterMeter.peak);
  const range = $derived(projectStore.rangeSelection);
</script>

<footer class="status">
  <span class="dot {status.tone}"></span>
  <span class="text">{status.text}</span>

  <div class="divider-v"></div>

  <span class="text">{trackCount} tracks</span>
  <span class="text dim">{clipCount} clips</span>

  {#if range}
    <div class="divider-v"></div>
    <span class="text accent">
      Range {range.startBeat.toFixed(2)} – {range.endBeat.toFixed(2)}
    </span>
  {/if}

  {#if projectStore.selectedClipIDs.length > 0}
    <div class="divider-v"></div>
    <span class="text">{projectStore.selectedClipIDs.length} selected</span>
  {/if}

  <span class="spacer"></span>

  <span class="text dim">Master</span>
  <div class="master-meter" title="Master output">
    <span class="fill" style:width="{Math.min(1, masterPeak) * 100}%"></span>
  </div>
  <span class="text mono">{formatDb(masterPeak)}</span>

  <div class="divider-v"></div>

  <span class="text dim mono">{(transport.sampleRate / 1000).toFixed(1)} kHz</span>
</footer>

<style>
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
    padding: 0 12px;
    background: var(--bg-window);
    border-top: 1px solid var(--stroke);
    flex: none;
  }

  .text {
    font-size: 10px;
    color: var(--text-secondary);
  }

  .text.dim {
    color: var(--text-tertiary);
  }

  .text.accent {
    color: var(--ai);
  }

  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .spacer {
    flex: 1;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-tertiary);
    flex: none;
  }

  .dot.live {
    background: var(--time);
  }

  .dot.record {
    background: var(--record);
  }

  .dot.error {
    background: var(--warn);
  }

  .master-meter {
    width: 70px;
    height: 5px;
    border-radius: 3px;
    background: var(--bg-inset);
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--time), var(--tempo) 78%, var(--record));
    transition: width 60ms linear;
  }

  .status .divider-v {
    height: 12px;
  }
</style>
