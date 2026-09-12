<script lang="ts">
  /**
   * EQAMUZ 10 // LIMITER
   * True Peak Brickwall Limiter & Final Maximizer
   */
  import { eqamuzStore } from '../state.svelte';
  import KnobControl from '../components/KnobControl.svelte';
  import type { LimiterModuleState } from '../types';

  const state = $derived<LimiterModuleState>(eqamuzStore.currentModuleState);
  const modes: LimiterModuleState['mode'][] = ['TRANSPARENT', 'AGGRESSIVE', 'WARM'];

  function setMode(m: LimiterModuleState['mode']) {
    eqamuzStore.updateActiveModuleState((s: LimiterModuleState) => {
      s.mode = m;
    });
  }
</script>

<div class="limiter-module">
  <!-- Faceplate Strip -->
  <div class="faceplate-strip">
    <div class="strip-left">
      <div class="pulse-indicator"></div>
      <div>
        <div class="title-row">
          <h2>10 // EQAMUZ LIMITER</h2>
          <span class="precision-pill">TRUE PEAK BRICKWALL</span>
        </div>
        <span class="sub-desc">PRECISION CEILING, INTER-SAMPLE PEAK SUPPRESSION &amp; MAXIMIZER</span>
      </div>
    </div>

    <div class="strip-right">
      <div class="character-modes">
        {#each modes as m}
          <button
            class="mode-btn"
            class:active={state.mode === m}
            onclick={() => setMode(m)}
          >
            {m}
          </button>
        {/each}
      </div>
      <button
        class="tp-btn"
        class:active={state.truePeak}
        onclick={() => {
          eqamuzStore.updateActiveModuleState((s: LimiterModuleState) => {
            s.truePeak = !s.truePeak;
          });
        }}
      >
        ISP TRUE PEAK: {state.truePeak ? '4X OVERSAMPLE' : 'OFF'}
      </button>
      <button
        class="bypass-btn"
        class:off={state.bypass}
        onclick={() => {
          eqamuzStore.updateActiveModuleState((s: LimiterModuleState) => {
            s.bypass = !s.bypass;
          });
        }}
      >
        {state.bypass ? 'BYPASS' : 'ACTIVE'}
      </button>
    </div>
  </div>

  <!-- Brickwall Visualizer Screen -->
  <div class="limiter-screen">
    <div class="ceiling-line" style:top="20%">
      <span class="line-label">CEILING: {state.ceilingDb.toFixed(1)} dBTP</span>
    </div>

    <div class="peaks-waveform-mock">
      <svg viewBox="0 0 800 120" preserveAspectRatio="none" class="peaks-svg">
        <path
          d="M 0,60 L 50,25 L 80,75 L 120,20 L 160,85 L 200,18 L 240,70 L 300,22 L 350,65 L 420,20 L 480,75 L 540,24 L 600,60 L 680,21 L 740,70 L 800,50"
          fill="none"
          stroke="#00f2fe"
          stroke-width="1.8"
          opacity="0.8"
        />
      </svg>
    </div>

    <div class="screen-footer">
      <span>INPUT GAIN: <strong>+{state.inputGainDb.toFixed(1)} dB</strong></span>
      <span>CEILING: <strong>{state.ceilingDb.toFixed(1)} dBTP</strong></span>
      <span>LOOKAHEAD: <strong>{state.lookaheadMs.toFixed(1)} ms</strong></span>
      <span>RELEASE: <strong>{state.releaseMs} ms</strong></span>
    </div>
  </div>

  <!-- Rotary Rack -->
  <div class="rotary-rack">
    <KnobControl
      label="INPUT GAIN"
      value={state.inputGainDb}
      min={0}
      max={18}
      step={0.1}
      unit="dB"
      badge="DRIVE"
      sublabel="PRE-LIMIT GAIN"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: LimiterModuleState) => {
          s.inputGainDb = v;
        });
      }}
    />

    <KnobControl
      label="OUT CEILING"
      value={state.ceilingDb}
      min={-6.0}
      max={0.0}
      step={0.1}
      unit="dBTP"
      badge="BRICKWALL"
      sublabel="PEAK MARGIN"
      color="secondary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: LimiterModuleState) => {
          s.ceilingDb = v;
        });
      }}
    />

    <KnobControl
      label="RELEASE TIME"
      value={state.releaseMs}
      min={5}
      max={500}
      step={5}
      unit="ms"
      badge="SMOOTH"
      sublabel="RECOVERY CURVE"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: LimiterModuleState) => {
          s.releaseMs = v;
        });
      }}
    />

    <KnobControl
      label="LOOKAHEAD"
      value={state.lookaheadMs}
      min={0}
      max={5}
      step={0.1}
      unit="ms"
      badge="BUFFER"
      sublabel="TRANSIENT CATCH"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: LimiterModuleState) => {
          s.lookaheadMs = v;
        });
      }}
    />
  </div>
</div>

<style>
  .limiter-module {
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

  .tp-btn {
    border: 1px solid rgba(0, 242, 254, 0.3);
    background: #191b22;
    color: #849495;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    padding: 4px 10px;
    border-radius: 2px;
    cursor: pointer;
  }

  .tp-btn.active {
    background: rgba(0, 242, 254, 0.15);
    color: #00f2fe;
    border-color: #00f2fe;
  }

  .bypass-btn {
    border: none;
    background: #10b981;
    color: #003824;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 2px;
    cursor: pointer;
  }

  .bypass-btn.off {
    background: #ef4444;
    color: #fff;
  }

  .limiter-screen {
    position: relative;
    width: 100%;
    height: 180px;
    background: #0c0e15;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .ceiling-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: #ef4444;
    box-shadow: 0 0 6px #ef4444;
    display: flex;
    justify-content: flex-end;
    padding-right: 12px;
  }

  .line-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    color: #ef4444;
    font-weight: 700;
    background: #0c0e15;
    padding: 0 4px;
    transform: translateY(-50%);
  }

  .peaks-waveform-mock {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .peaks-svg {
    width: 100%;
    height: 100%;
  }

  .screen-footer {
    position: relative;
    z-index: 5;
    background: rgba(12, 14, 21, 0.85);
    padding: 4px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    color: #849495;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .screen-footer strong {
    color: #00f2fe;
  }

  .rotary-rack {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
</style>
