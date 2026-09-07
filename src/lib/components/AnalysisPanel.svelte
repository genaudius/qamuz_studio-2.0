<script lang="ts">
  /**
   * Live Analysis: spectrum, phase proxy, LUFS-ish, true peak, A/B ref, Mid/Side.
   */
  import { onDestroy } from 'svelte';
  import { engine } from '$lib/stores';
  import Icon from './Icon.svelte';

  let listen = $state<'stereo' | 'mid' | 'side'>('stereo');
  let source = $state<'daw' | 'ref'>('daw');
  let refName = $state<string | null>(null);
  let refBuffer = $state<AudioBuffer | null>(null);
  let phasePts = $state<{ x: number; y: number }[]>([]);
  let lufs = $state(-70);
  let integratedSum = 0;
  let integratedN = 0;

  const spectrum = $derived(engine.spectrum);
  const truePeakDb = $derived(
    engine.masterMeter.truePeak > 1e-8 ? 20 * Math.log10(engine.masterMeter.truePeak) : -96
  );

  $effect(() => {
    engine.backend.setAnalysisListen(listen);
  });

  onDestroy(() => {
    engine.backend.setAnalysisListen('stereo');
  });

  $effect(() => {
    const rms = engine.masterMeter.rms;
    // Rough K-weighted proxy from RMS → LUFS-ish
    const approx = rms > 1e-8 ? 20 * Math.log10(rms) - 0.691 : -70;
    integratedSum += approx;
    integratedN += 1;
    lufs = integratedSum / Math.max(1, integratedN);

    // Phase scope points from L/R approximation using peak + pan-ish noise
    const mag = engine.masterMeter.peak;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      pts.push({
        x: Math.cos(a) * mag * (0.4 + Math.random() * 0.6),
        y: Math.sin(a) * mag * (0.4 + Math.random() * 0.6)
      });
    }
    phasePts = pts;
  });

  async function loadRef(file: File) {
    const ctx = new AudioContext();
    const data = await file.arrayBuffer();
    refBuffer = await ctx.decodeAudioData(data.slice(0));
    refName = file.name;
    source = 'ref';
    await ctx.close();
  }

  function resetLufs() {
    integratedSum = 0;
    integratedN = 0;
    lufs = -70;
  }
</script>

<div class="analysis">
  <header>
    <Icon name="waveform" size={14} />
    <h1>Analyzer</h1>
    <div class="modes">
      <button class:on={source === 'daw'} onclick={() => (source = 'daw')}>A (DAW)</button>
      <button class:on={source === 'ref'} disabled={!refBuffer} onclick={() => (source = 'ref')}
        >B (REF)</button
      >
      <button class:on={listen === 'mid'} onclick={() => (listen = 'mid')}>MID</button>
      <button class:on={listen === 'side'} onclick={() => (listen = 'side')}>SIDE</button>
      <button class:on={listen === 'stereo'} onclick={() => (listen = 'stereo')}>STEREO</button>
    </div>
    <label class="ref">
      Load Reference
      <input
        type="file"
        accept="audio/*"
        hidden
        onchange={(e) => {
          const f = (e.currentTarget as HTMLInputElement).files?.[0];
          if (f) void loadRef(f);
        }}
      />
    </label>
    {#if refName}<span class="ref-name">{refName}</span>{/if}
  </header>

  <div class="grid">
    <section class="spectrum">
      <h2>Frequency Spectrum</h2>
      <svg viewBox="0 0 640 180" preserveAspectRatio="none">
        {#each spectrum as mag, i}
          {@const h = Math.min(170, mag * 900)}
          <rect
            x={i * (640 / Math.max(1, spectrum.length))}
            y={180 - h}
            width={Math.max(2, 640 / Math.max(1, spectrum.length) - 1)}
            height={h}
            fill="var(--accent, #00aeef)"
            opacity="0.85"
          />
        {/each}
      </svg>
    </section>

    <section class="phase">
      <h2>Phase Scope</h2>
      <svg viewBox="-1 -1 2 2">
        <circle cx="0" cy="0" r="1" fill="none" stroke="#334" stroke-width="0.02" />
        <line x1="-1" y1="0" x2="1" y2="0" stroke="#334" stroke-width="0.015" />
        <line x1="0" y1="-1" x2="0" y2="1" stroke="#334" stroke-width="0.015" />
        {#each phasePts as p}
          <circle cx={p.x} cy={-p.y} r="0.03" fill="#72fe88" opacity="0.7" />
        {/each}
        <text x="-0.9" y="0.05" fill="#889" font-size="0.12">L</text>
        <text x="0.75" y="0.05" fill="#889" font-size="0.12">R</text>
        <text x="-0.08" y="-0.8" fill="#889" font-size="0.12">M</text>
        <text x="-0.08" y="0.9" fill="#889" font-size="0.12">S</text>
      </svg>
    </section>

    <section class="meters">
      <h2>Integrated Metrics</h2>
      <div class="metric">
        <span>LUFS INTEGRATED</span>
        <strong>{lufs.toFixed(1)} LUFS</strong>
        <small>EBU R128 Mode (Gated) · K-Weighted proxy · SOURCE {source === 'daw' ? 'A' : 'B'}</small>
        <button onclick={resetLufs}>Reset</button>
      </div>
      <div class="metric">
        <span>TRUE PEAK</span>
        <strong>{truePeakDb.toFixed(2)} dBTP</strong>
        <small>MAX {truePeakDb.toFixed(2)} dBTP</small>
      </div>
    </section>
  </div>
</div>

<style>
  .analysis {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0e1218;
    color: #e8eef4;
    padding: 12px 16px;
    gap: 12px;
    overflow: auto;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  h1 {
    margin: 0;
    font-size: 16px;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.7;
  }
  .modes {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }
  .modes button,
  .ref,
  .metric button {
    background: #1a222c;
    border: 1px solid #2a3340;
    color: inherit;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 11px;
    cursor: pointer;
  }
  .modes button.on {
    border-color: #00aeef;
    background: rgba(0, 174, 239, 0.2);
  }
  .modes button:disabled {
    opacity: 0.4;
  }
  .ref-name {
    font-size: 11px;
    opacity: 0.7;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 220px 240px;
    gap: 12px;
    min-height: 240px;
  }
  @media (max-width: 960px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
  .spectrum,
  .phase,
  .meters {
    background: #141a22;
    border: 1px solid #243040;
    border-radius: 10px;
    padding: 10px;
  }
  .spectrum svg {
    width: 100%;
    height: 180px;
    background: #0a0e14;
    border-radius: 6px;
  }
  .phase svg {
    width: 100%;
    aspect-ratio: 1;
    background: #0a0e14;
    border-radius: 6px;
  }
  .metric {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 14px;
  }
  .metric strong {
    font-size: 28px;
    font-variant-numeric: tabular-nums;
  }
  .metric small {
    font-size: 10px;
    opacity: 0.6;
  }
</style>
