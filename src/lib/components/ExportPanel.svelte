<script lang="ts">
  import Icon from './Icon.svelte';
  import { encodeWav } from '$lib/audio/import';
  import { bounceMix, downloadWav, measureLoudness, projectEndBeats } from '$lib/audio/mastering';
  import { projectStore, transport } from '$lib/stores';

  let busy = $state(false);
  let error = $state<string | null>(null);
  const bars = $derived(Math.ceil(projectEndBeats() / transport.timeSignature.numerator));

  async function exportMix() {
    busy = true;
    error = null;
    try {
      const buffer = await bounceMix();
      const report = measureLoudness(buffer);
      downloadWav(
        encodeWav(buffer),
        `${projectStore.project.name || 'Qamuz'}-mix.wav`
      );
      error = `Exportado · ${report.durationSec.toFixed(1)}s · ${report.lufs.toFixed(1)} LUFS`;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="wrap">
  <h2>Export</h2>
  <p class="sub">Bounce del arrange a WAV estéreo, sin metrónomo.</p>
  <dl>
    <div><dt>Proyecto</dt><dd>{projectStore.project.name}</dd></div>
    <div><dt>Tempo</dt><dd>{transport.bpm.toFixed(1)} BPM</dd></div>
    <div><dt>Duración</dt><dd>~{bars} compases</dd></div>
  </dl>
  <button class="primary" disabled={busy} onclick={() => void exportMix()}>
    <Icon name="download" size={14} />
    {busy ? 'Renderizando…' : 'Exportar mix WAV'}
  </button>
  {#if error}
    <p class="note">{error}</p>
  {/if}
</div>

<style>
  .wrap {
    padding: 28px;
    max-width: 520px;
    overflow: auto;
    flex: 1;
  }
  h2 {
    margin: 0 0 8px;
  }
  .sub,
  .note {
    color: var(--text-secondary);
  }
  dl {
    display: grid;
    gap: 8px;
    margin: 20px 0;
  }
  dt {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }
  dd {
    margin: 2px 0 0;
  }
  .primary {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    padding: 10px 16px;
    border-radius: 8px;
    background: var(--accent-strong);
    color: var(--on-primary);
    font-weight: 600;
  }
</style>
