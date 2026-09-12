<script lang="ts">
  /**
   * EQAMUZ 04 // PRO-EQ
   * 8-Band Dynamic Parametric EQ with Real-time Spectrum & Mid/Side Processing
   */
  import { eqamuzStore } from '../state.svelte';
  import KnobControl from '../components/KnobControl.svelte';
  import type { ProEqBand, ProEqBandType, ProEqModuleState } from '../types';

  const modState = $derived(eqamuzStore.currentModuleState as ProEqModuleState);
  let selectedBandIndex = $state(0);

  const selectedBand = $derived<ProEqBand>(
    modState?.bands?.[selectedBandIndex] ?? modState?.bands?.[0]
  );

  const modes: ProEqModuleState['processingMode'][] = ['STEREO', 'MID_SIDE', 'LINEAR_PHASE'];
  const bandTypes: ProEqBandType[] = ['HPF', 'LOW_SHELF', 'BELL', 'BELL_DYNAMIC', 'HIGH_SHELF', 'LPF', 'AIR_BAND'];

  function setMode(m: ProEqModuleState['processingMode']) {
    eqamuzStore.updateActiveModuleState((s: ProEqModuleState) => {
      s.processingMode = m;
    });
  }

  function updateSelectedBand(updater: (b: ProEqBand) => void) {
    eqamuzStore.updateActiveModuleState((s: ProEqModuleState) => {
      const b = s.bands[selectedBandIndex];
      if (b) updater(b);
    });
  }

  // Generate SVG curve path from 8 bands
  const curvePoints = $derived.by(() => {
    // 200 points logarithmically spaced from 20Hz to 20kHz
    const pts: { x: number; y: number }[] = [];
    const minF = 20;
    const maxF = 20000;
    const logMin = Math.log10(minF);
    const logMax = Math.log10(maxF);

    for (let i = 0; i <= 100; i++) {
      const ratio = i / 100;
      const freq = Math.pow(10, logMin + ratio * (logMax - logMin));
      let totalGain = 0;

      for (const b of modState?.bands ?? []) {
        if (!b.enabled) continue;
        const dist = Math.abs(Math.log10(freq) - Math.log10(b.freqHz));
        const oct = dist * 3.32;
        const width = 1 / Math.max(0.2, b.q);
        const weight = Math.exp(-0.5 * Math.pow(oct / width, 2));
        totalGain += b.gainDb * weight;
      }

      const x = ratio * 800;
      // 0dB is at y=100 (range -18dB to +18dB -> 180 to 20)
      const y = 100 - (totalGain / 18) * 75;
      pts.push({ x, y: Math.max(10, Math.min(190, y)) });
    }

    if (pts.length === 0) return 'M 0,100 L 800,100';
    return 'M ' + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
  });
</script>

<div class="pro-eq-module">
  <!-- Faceplate Strip -->
  <div class="faceplate-strip">
    <div class="strip-left">
      <div class="pulse-indicator"></div>
      <div>
        <div class="title-row">
          <h2>04 // EQAMUZ PRO-EQ</h2>
          <span class="precision-pill">8-BAND DYNAMIC MATRIX</span>
        </div>
        <span class="sub-desc">PRECISION PARAMETRIC EQUALIZER &amp; MID/SIDE HARMONIC CALIBRATION</span>
      </div>
    </div>

    <div class="strip-right">
      <div class="character-modes">
        {#each modes as m}
          <button
            class="mode-btn"
            class:active={modState?.processingMode === m}
            onclick={() => setMode(m)}
          >
            {m.replace('_', '/')}
          </button>
        {/each}
      </div>
      <button
        class="unmask-btn"
        class:active={modState?.spectralUnmask}
        onclick={() => {
          eqamuzStore.updateActiveModuleState((s: ProEqModuleState) => {
            s.spectralUnmask = !s.spectralUnmask;
          });
        }}
      >
        SPECTRAL UNMASK: {modState?.spectralUnmask ? 'ACTIVE' : 'OFF'}
      </button>
    </div>
  </div>

  <!-- Central Spectrum & EQ Curve Display -->
  <div class="eq-screen">
    <!-- Grid lines -->
    <div class="screen-grid">
      <div class="db-marker plus">+12dB</div>
      <div class="db-marker zero">0dB</div>
      <div class="db-marker minus">-12dB</div>
      <div class="freq-lines">
        <span>100Hz</span>
        <span>1kHz</span>
        <span>10kHz</span>
      </div>
    </div>

    <!-- SVG Curve & Nodes -->
    <svg viewBox="0 0 800 200" preserveAspectRatio="none" class="curve-svg">
      <defs>
        <linearGradient id="eqGlow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#00f2fe" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      <!-- Fill under curve -->
      <path d="{curvePoints} L 800,200 L 0,200 Z" fill="url(#eqGlow)" />
      <!-- Main curve line -->
      <path d={curvePoints} fill="none" stroke="#00f2fe" stroke-width="2.5" class="eq-path-glow" />

      <!-- Band Handle Nodes -->
      {#each modState?.bands ?? [] as b, idx}
        {@const logMin = Math.log10(20)}
        {@const logMax = Math.log10(20000)}
        {@const ratio = (Math.log10(b.freqHz) - logMin) / (logMax - logMin)}
        {@const nx = Math.max(20, Math.min(780, ratio * 800))}
        {@const ny = 100 - (b.gainDb / 18) * 75}
        <g
          class="band-node"
          class:selected={selectedBandIndex === idx}
          role="button"
          tabindex="0"
          onclick={() => (selectedBandIndex = idx)}
          onkeydown={(e) => { if (e.key === 'Enter') selectedBandIndex = idx; }}
        >
          <circle cx={nx} cy={ny} r={selectedBandIndex === idx ? 7 : 5} fill="#11131a" stroke="#00f2fe" stroke-width="2" />
          <text x={nx} y={ny - 10} fill="#00f2fe" font-size="9" text-anchor="middle" font-family="'JetBrains Mono', monospace">
            B{idx + 1}
          </text>
        </g>
      {/each}
    </svg>

    <!-- Band Selector Pill Strip -->
    <div class="bands-selector-strip">
      {#each modState?.bands ?? [] as b, idx}
        <button
          class="band-tab"
          class:active={selectedBandIndex === idx}
          class:disabled={!b.enabled}
          onclick={() => (selectedBandIndex = idx)}
        >
          <span>B{idx + 1}</span>
          <small>{b.gainDb > 0 ? '+' : ''}{b.gainDb.toFixed(1)}dB</small>
        </button>
      {/each}
    </div>
  </div>

  <!-- Rotary Controls for Selected Band -->
  <div class="rotary-rack">
    <KnobControl
      label="BAND FREQ"
      value={selectedBand.freqHz}
      min={20}
      max={20000}
      step={10}
      unit="Hz"
      badge="B{selectedBandIndex + 1}"
      sublabel="CENTER FREQ"
      color="primary"
      onChange={(v) => {
        updateSelectedBand((b) => (b.freqHz = v));
      }}
    />

    <KnobControl
      label="BAND GAIN"
      value={selectedBand.gainDb}
      min={-18}
      max={18}
      step={0.1}
      unit="dB"
      badge="{selectedBand.gainDb > 0 ? '+' : ''}{selectedBand.gainDb.toFixed(1)}dB"
      sublabel="AMPLITUDE"
      color={selectedBand.gainDb >= 0 ? 'primary' : 'secondary'}
      onChange={(v) => {
        updateSelectedBand((b) => (b.gainDb = v));
      }}
    />

    <KnobControl
      label="Q FACTOR"
      value={selectedBand.q}
      min={0.2}
      max={10.0}
      step={0.1}
      unit="Q"
      badge="RESONANCE"
      sublabel="BANDWIDTH"
      color="primary"
      onChange={(v) => {
        updateSelectedBand((b) => (b.q = v));
      }}
    />

    <KnobControl
      label="DYNAMIC THRESHOLD"
      value={selectedBand.dynamicThresholdDb ?? -18}
      min={-40}
      max={0}
      step={0.5}
      unit="dB"
      badge="DYNAMIC"
      sublabel="TRIGGER LEVEL"
      color="secondary"
      onChange={(v) => {
        updateSelectedBand((b) => (b.dynamicThresholdDb = v));
      }}
    />

    <div class="band-actions-card">
      <span class="card-label">FILTER TYPE</span>
      <select
        class="type-select"
        value={selectedBand.type}
        onchange={(e) => updateSelectedBand((b) => (b.type = e.currentTarget.value as any))}
      >
        {#each bandTypes as t}
          <option value={t}>{t.replace('_', ' ')}</option>
        {/each}
      </select>

      <button
        class="toggle-band-btn"
        class:on={selectedBand.enabled}
        onclick={() => updateSelectedBand((b) => (b.enabled = !b.enabled))}
      >
        BAND {selectedBandIndex + 1}: {selectedBand.enabled ? 'ACTIVE' : 'BYPASS'}
      </button>
    </div>
  </div>
</div>

<style>
  .pro-eq-module {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    color: #e2e2ec;
  }

  .faceplate-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #191b22;
    padding: 10px 14px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .strip-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pulse-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #00f2fe;
    box-shadow: 0 0 8px rgba(0, 242, 254, 0.9);
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .title-row h2 {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: #00f2fe;
    margin: 0;
  }

  .precision-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 2px;
    background: #282a31;
    color: #00f2fe;
  }

  .sub-desc {
    font-family: 'Geist', sans-serif;
    font-size: 9.5px;
    color: #849495;
  }

  .strip-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .character-modes {
    display: flex;
    background: #0c0e15;
    padding: 2px;
    border-radius: 4px;
  }

  .mode-btn {
    border: none;
    background: transparent;
    color: #849495;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    padding: 4px 8px;
    border-radius: 2px;
    cursor: pointer;
  }

  .mode-btn.active {
    background: #00f2fe;
    color: #00373a;
    font-weight: 700;
  }

  .unmask-btn {
    border: 1px solid rgba(0, 242, 254, 0.3);
    background: #191b22;
    color: #849495;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    padding: 4px 10px;
    border-radius: 2px;
    cursor: pointer;
  }

  .unmask-btn.active {
    background: rgba(0, 242, 254, 0.15);
    color: #00f2fe;
    border-color: #00f2fe;
  }

  .eq-screen {
    position: relative;
    width: 100%;
    height: 200px;
    background: #0c0e15;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .screen-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .db-marker {
    position: absolute;
    right: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: rgba(132, 148, 149, 0.4);
  }

  .db-marker.plus { top: 25px; }
  .db-marker.zero { top: 95px; }
  .db-marker.minus { bottom: 25px; }

  .freq-lines {
    position: absolute;
    bottom: 35px;
    left: 20px;
    right: 20px;
    display: flex;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    color: rgba(132, 148, 149, 0.4);
  }

  .curve-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .eq-path-glow {
    filter: drop-shadow(0 0 6px rgba(0, 242, 254, 0.8));
  }

  .band-node {
    cursor: pointer;
  }

  .band-node.selected circle {
    fill: #00f2fe;
    stroke: #fff;
    filter: drop-shadow(0 0 8px #00f2fe);
  }

  .bands-selector-strip {
    position: relative;
    z-index: 5;
    background: rgba(12, 14, 21, 0.85);
    backdrop-filter: blur(4px);
    display: flex;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .band-tab {
    flex: 1;
    background: transparent;
    border: none;
    border-right: 1px solid rgba(255, 255, 255, 0.05);
    padding: 4px 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    color: #849495;
  }

  .band-tab span { font-size: 9px; font-weight: 700; }
  .band-tab small { font-size: 8px; color: #00f2fe; }

  .band-tab.active {
    background: rgba(0, 242, 254, 0.15);
    color: #00f2fe;
  }

  .band-tab.disabled {
    opacity: 0.35;
  }

  .rotary-rack {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }

  .band-actions-card {
    background: #191b22;
    padding: 10px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 6px;
  }

  .card-label {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 9px;
    font-weight: 700;
    color: #00f2fe;
  }

  .type-select {
    background: #0c0e15;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #e2e2ec;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    padding: 4px 6px;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .toggle-band-btn {
    border: none;
    background: #10b981;
    color: #003824;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 700;
    padding: 6px 8px;
    border-radius: 2px;
    cursor: pointer;
  }

  .toggle-band-btn:not(.on) {
    background: #282a31;
    color: #849495;
  }
</style>
