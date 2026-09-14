<script lang="ts">
  /**
   * QAMUZ MASTER PRO workspace: import + library + plugin + history + Maestro.
   */

  import { onDestroy, onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import Knob from './Knob.svelte';
  import MasterAgentChat from './MasterAgentChat.svelte';
  import { MASTER_STYLES } from '$lib/audio/mastering';
  import { hasMasterProAccess } from '$lib/entitlement';
  import { account } from '$lib/account.svelte';
  import { goToSaasPath } from '$lib/saas';
  import { engine, workspace } from '$lib/stores';
  import { masterSession } from '$lib/stores/master.svelte';

  let canvas: HTMLCanvasElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let addInput: HTMLInputElement | null = $state(null);
  let previewSource: AudioBufferSourceNode | null = null;
  let reprocessTimer: number | null = null;
  // Reactive: re-evaluates when the parent sends plan/admin via postMessage, so
  // the gate unlocks as soon as a premium tier (pro/advanced/premium) OR an
  // admin flag arrives.
  const unlocked = $derived(hasMasterProAccess(account.plan, account.isAdmin));
  const hzMarks = ['20', '50', '100', '200', '500', '1k', '2k', '5k', '10k'];

  const peakDb = $derived(masterSession.wetReport?.peakDb ?? masterSession.dryReport?.peakDb ?? -60);
  const lufs = $derived(masterSession.wetReport?.lufs ?? masterSession.dryReport?.lufs ?? -24);
  const leftHeight = $derived(Math.min(100, Math.max(6, engine.masterMeter.peak * 100)));
  const rightHeight = $derived(Math.min(100, Math.max(6, engine.masterMeter.rms * 140)));

  $effect(() => {
    drawSpectrum(masterSession.drySpec, masterSession.wetSpec);
  });

  $effect(() => {
    const recipe = masterSession.recipe;
    recipe.style;
    recipe.inputTrimDb;
    recipe.eqLow;
    recipe.eqMid;
    recipe.eqHigh;
    recipe.presence;
    recipe.deEsser;
    recipe.deEsserHz;
    recipe.stereoWidth;
    recipe.compression;
    recipe.character;
    recipe.saturation;
    recipe.loudness;
    recipe.gainMatch;
    recipe.bypass;
    if (!masterSession.dry) return;
    if (reprocessTimer) window.clearTimeout(reprocessTimer);
    reprocessTimer = window.setTimeout(() => {
      masterSession.reprocess();
      reprocessTimer = null;
    }, 160);
  });

  onMount(() => {
    void masterSession.refreshLists();
    // Best-effort: wake the audio engine so live meters and preview work.
    // The mastering DSP itself no longer depends on this (uses an offline
    // context fallback), but preview/metering need a running AudioContext.
    void engine.backend.resume().catch(() => undefined);
  });

  onDestroy(() => {
    if (reprocessTimer) window.clearTimeout(reprocessTimer);
    stopPreview();
  });

  function stopPreview() {
    previewSource?.stop();
    previewSource?.disconnect();
    previewSource = null;
  }

  function preview() {
    const buffer = masterSession.recipe.bypass ? masterSession.dry : masterSession.wet ?? masterSession.dry;
    const context = engine.backend.audioContext;
    if (!buffer || !context) return;
    stopPreview();
    void context.resume();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => {
      if (previewSource === source) previewSource = null;
    };
    source.start();
    previewSource = source;
  }

  async function onPick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await masterSession.loadFile(file);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    void onPick(event.dataTransfer?.files ?? null);
  }

  function when(value?: string | Date) {
    if (!value) return '';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  }

  function drawSpectrum(dryBands: Float32Array | null, wetBands: Float32Array | null) {
    const node = canvas;
    if (!node) return;
    const ctx = node.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = node.clientWidth * dpr;
    const height = node.clientHeight * dpr;
    if (node.width !== width || node.height !== height) {
      node.width = width;
      node.height = height;
    }
    ctx.clearRect(0, 0, width, height);
    const glow = ctx.createLinearGradient(0, 0, 0, height);
    glow.addColorStop(0, 'rgba(130, 207, 255, 0.55)');
    glow.addColorStop(1, 'rgba(0, 174, 239, 0.05)');
    const fillPath = (bands: Float32Array, gain: number) => {
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let i = 0; i < bands.length; i += 1) {
        const x = (i / (bands.length - 1)) * width;
        const mag = Math.min(1, Math.pow(bands[i] * gain, 0.55));
        ctx.lineTo(x, height - mag * height * 0.92);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
    };
    if (dryBands) {
      ctx.fillStyle = 'rgba(130, 207, 255, 0.22)';
      fillPath(dryBands, 22);
      ctx.fill();
    }
    if (wetBands) {
      ctx.fillStyle = glow;
      fillPath(wetBands, 26);
      ctx.fill();
    }
  }
</script>

<div class="workspace">
  <aside class="rail">
    <div class="rail-head">
      <strong>Audio</strong>
      <button class="mini" onclick={() => addInput?.click()} title="Agregar canción">
        <Icon name="file-plus" size={12} /> Agregar
      </button>
      <input
        bind:this={addInput}
        class="hidden"
        type="file"
        accept="audio/*,.wav,.mp3,.flac,.aiff,.m4a"
        onchange={(event) => void onPick(event.currentTarget.files)}
      />
    </div>

    <form
      class="importer"
      ondragover={(event) => event.preventDefault()}
      ondrop={onDrop}
    >
      <p>Importar audio para que MASTER PRO lo conozca</p>
      <button type="button" class="pick" onclick={() => fileInput?.click()}>Elegir archivo</button>
      <button type="button" class="pick ghost" disabled={!unlocked} onclick={() => void masterSession.loadArrangeMix()}>
        Usar mix del arrange
      </button>
      <input
        bind:this={fileInput}
        class="hidden"
        type="file"
        accept="audio/*,.wav,.mp3,.flac,.aiff,.m4a"
        onchange={(event) => void onPick(event.currentTarget.files)}
      />
    </form>

    <h4>Canciones</h4>
    <div class="list">
      {#if masterSession.library.length === 0}
        <p class="empty">Tus canciones de QAMUZ AI y las que agregues aquí.</p>
      {/if}
      {#each masterSession.library as track (track.id)}
        <button
          class="row"
          class:on={masterSession.sourceName === track.title}
          onclick={() => void masterSession.loadLibraryTrack(track)}
        >
          <span>{track.title}</span>
          <em>{track.kind}</em>
        </button>
      {/each}
    </div>

    <h4>Historial / descargas</h4>
    <div class="list">
      {#if masterSession.history.length === 0}
        <p class="empty">Los masters se guardan aquí y en la base de datos.</p>
      {/if}
      {#each masterSession.history as job (job.id)}
        <button class="row" onclick={() => void masterSession.downloadHistory(job)}>
          <span>{job.title}</span>
          <em>{job.style} · {job.lufs != null ? `${job.lufs.toFixed(1)} LUFS` : 'WAV'} · {when(job.createdAt)}</em>
        </button>
      {/each}
    </div>
  </aside>

  <div class="stage">
    {#if !masterSession.hasSource}
      <div class="hero">
        <span class="logo">Q</span>
        <h2>QAMUZ MASTER PRO</h2>
        <p>Primero importa el audio. El plugin no adivina el mix: súbelo, elige una canción creada o usa el bounce del arrange.</p>
        <div class="hero-actions">
          <button onclick={() => fileInput?.click()}>Importar audio</button>
          <button class="alt" disabled={!unlocked} onclick={() => void masterSession.loadArrangeMix()}>Mix del arrange</button>
        </div>
      </div>
    {:else}
      <div class="plugin" class:locked={!unlocked}>
        <header class="chrome">
          <div class="brand">
            <span class="logo">Q</span>
            <div>
              <strong>QAMUZ MASTER PRO</strong>
              <em>{masterSession.sourceName}</em>
            </div>
          </div>

          <button
            class="master-btn"
            disabled={masterSession.busy || !unlocked}
            onclick={() => void masterSession.master()}
          >
            {masterSession.busy ? 'Analyzing…' : 'Master'}
          </button>

          <div class="tools">
            <button
              class:on={masterSession.recipe.gainMatch}
              disabled={!unlocked}
              onclick={() => (masterSession.recipe.gainMatch = !masterSession.recipe.gainMatch)}
              >Gain Match</button
            >
            <button
              class:on={masterSession.recipe.bypass}
              disabled={!unlocked}
              onclick={() => (masterSession.recipe.bypass = !masterSession.recipe.bypass)}>Bypass</button
            >
            <button class="close" title="Cerrar" onclick={() => workspace.open('arrange')}>
              <Icon name="close" size={13} />
            </button>
          </div>
        </header>

        <section class="viz">
          <canvas bind:this={canvas}></canvas>
          <div class="hz">
            {#each hzMarks as mark}
              <span>{mark}</span>
            {/each}
          </div>
        </section>

        <div class="styles">
          {#each MASTER_STYLES as style}
            <button
              class:on={masterSession.recipe.style === style.id}
              disabled={!unlocked}
              onclick={() => masterSession.setStyle(style.id)}>{style.label}</button
            >
          {/each}
        </div>

        <div class="deck">
          <section>
            <h3>Equalizer</h3>
            <div class="knobs">
              <Knob bind:value={masterSession.recipe.eqLow} label="Low" />
              <Knob bind:value={masterSession.recipe.eqMid} label="Mid" />
              <Knob bind:value={masterSession.recipe.eqHigh} label="High" />
            </div>
          </section>
          <section class="field">
            <h3>Stereo Field</h3>
            <div class="width">
              <span>Focus</span>
              <input type="range" min="0" max="1" step="0.01" bind:value={masterSession.recipe.stereoWidth} disabled={!unlocked} />
              <span>Wide</span>
            </div>
            <label class="trim">
              Input Trim
              <input type="range" min="-12" max="12" step="0.1" bind:value={masterSession.recipe.inputTrimDb} disabled={!unlocked} />
              <em>{masterSession.recipe.inputTrimDb >= 0 ? '+' : ''}{masterSession.recipe.inputTrimDb.toFixed(1)} dB</em>
            </label>
          </section>
          <section>
            <h3>Presence</h3>
            <Knob bind:value={masterSession.recipe.presence} label="Amount" />
          </section>
          <section>
            <h3>De-Esser</h3>
            <div class="knobs">
              <Knob bind:value={masterSession.recipe.deEsser} label="Amount" />
              <Knob bind:value={masterSession.recipe.deEsserHz} label="Frequency" />
            </div>
          </section>
          <section>
            <h3>Dynamics</h3>
            <div class="knobs">
              <Knob bind:value={masterSession.recipe.compression} label="Compression" />
              <Knob bind:value={masterSession.recipe.character} label="Character" />
              <Knob bind:value={masterSession.recipe.saturation} label="Saturation" />
            </div>
          </section>
          <section class="loud">
            <h3>Loudness</h3>
            <div class="loud-row">
              <Knob bind:value={masterSession.recipe.loudness} label="Amount" size={72} />
              <div class="meters">
                <div class="bars">
                  <span style:height="{leftHeight}%"></span>
                  <span style:height="{rightHeight}%"></span>
                </div>
                <strong>{peakDb.toFixed(1)} dB</strong>
                <em>{lufs.toFixed(1)} LUFS</em>
              </div>
            </div>
          </section>
        </div>

        <footer>
          <button class="ghost" disabled={!masterSession.dry} onclick={preview}><Icon name="play" size={12} /> Preview</button>
          <button class="ghost" onclick={stopPreview}>Stop</button>
          <button class="ghost" disabled={!masterSession.wet} onclick={() => masterSession.downloadCurrent()}>
            <Icon name="download" size={12} /> WAV
          </button>
          <button class="ghost" disabled={!masterSession.wet} onclick={() => void masterSession.placeOnTimeline()}>
            Al arrange
          </button>
          {#if masterSession.error}<span class="err">{masterSession.error}</span>{/if}
        </footer>
      </div>
    {/if}

    {#if !unlocked}
      <div class="gate">
        <span class="badge">Premium</span>
        <h2>QAMUZ MASTER PRO</h2>
        <p>Importar, masterizar y descargar vive en el plan Premium de QAMUZ AI (Pro o Advanced).</p>
        <button class="upgrade" onclick={() => void goToSaasPath('pricing')}>Activar Premium</button>
      </div>
    {/if}
  </div>

  <MasterAgentChat />
</div>

<style>
  .workspace {
    display: flex;
    flex: 1;
    min-height: 0;
    background: var(--bg-inset);
    color: var(--text-primary);
    position: relative;
  }

  .rail {
    width: 250px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 10px;
    background: var(--bg-panel);
    border-right: 1px solid var(--stroke);
    min-height: 0;
    overflow: hidden;
  }

  .rail-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .mini,
  .pick,
  .ghost,
  .hero-actions button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border-radius: var(--radius);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: 12px;
  }

  .importer {
    padding: 10px;
    border-radius: var(--radius-lg);
    border: 1px dashed var(--accent);
    background: var(--accent-faint);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .importer p {
    margin: 0;
    font-size: 11px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .pick.ghost {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--stroke);
  }

  h4 {
    margin: 8px 2px 0;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .list {
    overflow: auto;
    min-height: 72px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px;
    border-radius: var(--radius);
    text-align: left;
    color: var(--text-primary);
  }

  .row:hover,
  .row.on {
    background: var(--bg-elevated);
  }

  .row em,
  .empty {
    font-style: normal;
    font-size: 10px;
    color: var(--text-tertiary);
  }

  .empty {
    margin: 0;
    padding: 6px;
  }

  .hidden {
    display: none;
  }

  .stage {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: stretch;
    justify-content: center;
    padding: 12px;
  }

  .hero {
    max-width: 460px;
    margin: auto;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .hero h2 {
    margin: 0;
    font-size: 28px;
  }

  .hero p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .hero-actions {
    display: flex;
    gap: 8px;
  }

  .hero-actions button {
    background: var(--accent-strong);
    color: var(--on-primary);
    font-weight: 800;
  }

  .hero-actions .alt {
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-weight: 600;
  }

  .plugin {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: auto;
    border-radius: var(--radius-lg);
    background: var(--bg-control);
    border: 1px solid var(--stroke);
  }

  .chrome {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 12px 16px 8px;
    gap: 12px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logo {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--accent-strong);
    color: var(--on-primary);
    font-weight: 800;
  }

  .brand strong,
  .brand em {
    display: block;
  }

  .brand em {
    font-style: normal;
    font-size: 10px;
    color: var(--text-tertiary);
  }

  .master-btn {
    min-width: 118px;
    padding: 9px 22px;
    border-radius: var(--radius-full);
    background: var(--accent-strong);
    color: var(--on-primary);
    font-weight: 800;
    box-shadow: 0 0 24px rgba(0, 174, 239, 0.35);
  }

  .tools {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .tools button {
    padding: 6px 10px;
    border-radius: var(--radius);
    color: var(--text-secondary);
    font-size: 12px;
  }

  .tools button.on {
    color: var(--accent);
    background: var(--accent-dim);
  }

  .viz {
    margin: 0 16px;
    height: 150px;
    border-radius: var(--radius-lg);
    background: radial-gradient(ellipse at 50% 120%, var(--accent-dim), var(--bg-inset) 70%);
    overflow: hidden;
    position: relative;
  }

  canvas {
    width: 100%;
    height: calc(100% - 22px);
    display: block;
  }

  .hz {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 4px;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: var(--text-tertiary);
  }

  .styles {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px 4px;
  }

  .styles button {
    min-width: 108px;
    padding: 7px 14px;
    border-radius: 9px;
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: 12px;
  }

  .styles button.on {
    background: var(--accent-dim);
    color: var(--accent);
    box-shadow: inset 0 -2px 0 var(--accent-strong);
  }

  .deck {
    display: grid;
    grid-template-columns: 1.1fr 1fr 0.7fr 0.9fr 1.2fr 1.05fr;
    gap: 8px;
    padding: 8px 16px 6px;
  }

  .deck section {
    background: var(--bg-inset);
    border: 1px solid var(--stroke);
    border-radius: var(--radius-lg);
    padding: 10px 8px 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  h3 {
    margin: 0 0 10px;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .knobs {
    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .width,
  .trim {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: var(--text-tertiary);
  }

  .width input,
  .trim input {
    flex: 1;
  }

  .trim {
    margin-top: 14px;
    flex-wrap: wrap;
  }

  .trim em {
    font-style: normal;
    width: 100%;
    text-align: center;
  }

  .loud-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .meters {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .bars {
    display: flex;
    gap: 4px;
    height: 84px;
    align-items: flex-end;
  }

  .bars span {
    width: 10px;
    border-radius: 4px 4px 2px 2px;
    background: linear-gradient(180deg, var(--accent), var(--accent-strong));
  }

  .meters strong,
  .meters em {
    font-size: 10px;
    font-style: normal;
    color: var(--text-tertiary);
  }

  footer {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 16px 12px;
  }

  .err {
    color: var(--record);
    font-size: 12px;
  }

  .gate {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: color-mix(in srgb, var(--bg-inset) 78%, transparent);
    backdrop-filter: blur(10px);
    text-align: center;
    padding: 24px;
  }

  .badge {
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .gate h2 {
    margin: 0;
  }

  .gate p {
    max-width: 420px;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .upgrade {
    padding: 10px 18px;
    border-radius: var(--radius-full);
    background: var(--accent-strong);
    color: var(--on-primary);
    font-weight: 800;
  }

  @media (max-width: 1100px) {
    .deck {
      grid-template-columns: 1fr 1fr;
    }
    .chrome {
      grid-template-columns: 1fr;
      justify-items: center;
    }
  }
</style>
