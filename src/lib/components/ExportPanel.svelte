<script lang="ts">
  import Icon from './Icon.svelte';
  import { encodeWav } from '$lib/audio/import';
  import { downloadBytes, encodeMp3 } from '$lib/audio/encode-mp3';
  import {
    bounceMix,
    bounceRangeFromSelection,
    downloadWav,
    measureLoudness,
    projectEndBeats,
    type BounceRange
  } from '$lib/audio/mastering';
  import { projectStore, transport } from '$lib/stores';

  let busy = $state(false);
  let error = $state<string | null>(null);
  let format = $state<'wav' | 'mp3'>('wav');
  let useSelection = $state(false);

  const songEnd = $derived(projectEndBeats());
  const selection = $derived(projectStore.rangeSelection);
  const activeRange = $derived.by((): BounceRange => {
    if (useSelection && selection && selection.endBeat - selection.startBeat >= 0.25) {
      return { startBeat: selection.startBeat, endBeat: selection.endBeat };
    }
    return { startBeat: 0, endBeat: songEnd };
  });
  const durationSec = $derived(
    ((activeRange.endBeat - activeRange.startBeat) / Math.max(1, transport.bpm)) * 60
  );

  function selectSong() {
    projectStore.selectToSongEnd();
    useSelection = true;
  }

  async function exportMix() {
    busy = true;
    error = null;
    try {
      const range = useSelection ? bounceRangeFromSelection() : { startBeat: 0, endBeat: songEnd };
      const buffer = await bounceMix(range);
      const report = measureLoudness(buffer);
      const base = projectStore.project.name || 'QAMUZ';
      if (format === 'mp3') {
        const mp3 = await encodeMp3(buffer, 320);
        downloadBytes(mp3, `${base}-mix.mp3`, 'audio/mpeg');
      } else {
        downloadWav(encodeWav(buffer), `${base}-mix.wav`);
      }
      error = `Bounce listo · ${report.durationSec.toFixed(1)}s · ${report.lufs.toFixed(1)} LUFS · ${format === 'mp3' ? 'MP3 320' : 'WAV'}`;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="wrap">
  <h2>Export</h2>
  <p class="sub">Bounce del arrange. La línea de tiempo no tiene final; el bounce usa la canción (o la selección) hasta el último clip.</p>
  <dl>
    <div><dt>Proyecto</dt><dd>{projectStore.project.name}</dd></div>
    <div><dt>Tempo</dt><dd>{transport.bpm.toFixed(1)} BPM</dd></div>
    <div><dt>Duración</dt><dd>{durationSec.toFixed(1)}s · {activeRange.startBeat.toFixed(1)}–{activeRange.endBeat.toFixed(1)} beats</dd></div>
  </dl>

  <div class="row">
    <label class:on={format === 'wav'}>
      <input type="radio" name="fmt" value="wav" bind:group={format} />
      WAV estéreo
    </label>
    <label class:on={format === 'mp3'}>
      <input type="radio" name="fmt" value="mp3" bind:group={format} />
      MP3 320 kbps
    </label>
  </div>

  <label class="check">
    <input type="checkbox" bind:checked={useSelection} />
    Solo la selección del arrange
  </label>

  <div class="actions">
    <button class="ghost" onclick={selectSong}>Seleccionar hasta el final</button>
    <button class="primary" disabled={busy} onclick={() => void exportMix()}>
      <Icon name="download" size={14} />
      {busy ? 'Renderizando…' : `Bounce ${format === 'mp3' ? 'MP3 320' : 'WAV'}`}
    </button>
  </div>
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
  .row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .row label,
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--stroke);
    font-size: 13px;
  }
  .row label.on {
    border-color: var(--accent);
    background: var(--accent-dim);
  }
  .check {
    margin-bottom: 16px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .ghost,
  .primary {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    padding: 10px 16px;
    border-radius: 8px;
    font-weight: 600;
  }
  .ghost {
    background: var(--bg-control);
  }
  .primary {
    background: var(--accent-strong);
    color: var(--on-primary);
  }
</style>
