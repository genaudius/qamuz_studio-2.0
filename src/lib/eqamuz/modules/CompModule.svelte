<script lang="ts">
  /**
   * EQAMUZ 05 // COMP
   * Opto/VCA Studio Compressor & Bus Dynamics Engine
   */
  import { eqamuzStore } from '../state.svelte';
  import KnobControl from '../components/KnobControl.svelte';
  import type { CompModuleState } from '../types';

  const state = $derived<CompModuleState>(eqamuzStore.currentModuleState);
  const modes: CompModuleState['circuitMode'][] = ['OPTO', 'VCA', 'FET', 'VALVE'];

  function setMode(m: CompModuleState['circuitMode']) {
    eqamuzStore.updateActiveModuleState((s: CompModuleState) => {
      s.circuitMode = m;
    });
  }

  const thrX = $derived(((state.thresholdDb + 60) / 60) * 400);
  const thrY = $derived(160 - ((state.thresholdDb + 60) / 60) * 160);
  const kneeSlope = $derived(1 / state.ratio);
</script>

<div class="comp-module">
  <!-- Faceplate Strip -->
  <div class="faceplate-strip">
    <div class="strip-left">
      <div class="pulse-indicator"></div>
      <div>
        <div class="title-row">
          <h2>05 // EQAMUZ COMP</h2>
          <span class="precision-pill">DSP 64-BIT PRECISION</span>
        </div>
        <span class="sub-desc">OPTO/VCA PRECISION DYNAMICS ENGINE &amp; HARMONIC LEVELER</span>
      </div>
    </div>

    <div class="strip-right">
      <div class="character-modes">
        {#each modes as m}
          <button
            class="mode-btn"
            class:active={state.circuitMode === m}
            onclick={() => setMode(m)}
          >
            {m}
          </button>
        {/each}
      </div>
      <button
        class="bypass-btn"
        class:off={state.bypass}
        onclick={() => {
          eqamuzStore.updateActiveModuleState((s: CompModuleState) => {
            s.bypass = !s.bypass;
          });
        }}
      >
        {state.bypass ? 'BYPASS' : 'ACTIVE'}
      </button>
    </div>
  </div>

  <!-- Dynamics Transfer & GR Meter Screen -->
  <div class="comp-screen">
    <div class="transfer-graph">
      <svg viewBox="0 0 400 160" preserveAspectRatio="none" class="transfer-svg">
        <!-- 1:1 diagonal -->
        <line x1="0" y1="160" x2="400" y2="0" stroke="rgba(255,255,255,0.1)" stroke-dasharray="3 3" />
        <!-- Knee compression curve -->
        <path
          d="M 0,160 L {thrX},{thrY} L 400,{thrY - (400 - thrX) * kneeSlope}"
          fill="none"
          stroke="#00f2fe"
          stroke-width="3"
        />
      </svg>
    </div>

    <!-- Live Gain Reduction Needle / Bar -->
    <div class="gr-meter-bay">
      <span class="gr-label">GAIN REDUCTION</span>
      <div class="gr-ladder">
        <div class="gr-bar" style:width="42%"></div>
      </div>
      <span class="gr-num">-4.2 dB</span>
    </div>

    <div class="screen-footer">
      <span>THRESHOLD: <strong>{state.thresholdDb.toFixed(1)} dB</strong></span>
      <span>RATIO: <strong>{state.ratio.toFixed(1)}:1</strong></span>
      <span>ATTACK: <strong>{state.attackMs.toFixed(1)} ms</strong></span>
      <span>RELEASE: <strong>{state.releaseMs.toFixed(0)} ms</strong></span>
    </div>
  </div>

  <!-- 5 Rotary Bays -->
  <div class="rotary-rack">
    <KnobControl
      label="THRESHOLD"
      value={state.thresholdDb}
      min={-60}
      max={0}
      step={0.5}
      unit="dB"
      badge="PEAK"
      sublabel="COMPRESS ONSET"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: CompModuleState) => {
          s.thresholdDb = v;
        });
      }}
    />

    <KnobControl
      label="RATIO"
      value={state.ratio}
      min={1}
      max={20}
      step={0.5}
      unit=":1"
      badge="SLOPE"
      sublabel="COMPRESSION FACTOR"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: CompModuleState) => {
          s.ratio = v;
        });
      }}
    />

    <KnobControl
      label="ATTACK"
      value={state.attackMs}
      min={0.1}
      max={100}
      step={0.5}
      unit="ms"
      badge="RESPONSE"
      sublabel="TRANSIENT SNAP"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: CompModuleState) => {
          s.attackMs = v;
        });
      }}
    />

    <KnobControl
      label="RELEASE"
      value={state.releaseMs}
      min={10}
      max={1200}
      step={10}
      unit="ms"
      badge="RECOVERY"
      sublabel="PUMPING TIME"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: CompModuleState) => {
          s.releaseMs = v;
        });
      }}
    />

    <KnobControl
      label="MAKEUP GAIN"
      value={state.makeupDb}
      min={0}
      max={24}
      step={0.5}
      unit="dB"
      badge="OUTPUT"
      sublabel="LEVEL BOOST"
      color="secondary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: CompModuleState) => {
          s.makeupDb = v;
        });
      }}
    />
  </div>
</div>

<style>
  .comp-module {
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

  .comp-screen {
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

  .transfer-graph {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .transfer-svg {
    width: 100%;
    height: 100%;
  }

  .gr-meter-bay {
    position: absolute;
    top: 12px;
    right: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(25, 27, 34, 0.85);
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .gr-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    color: #849495;
  }

  .gr-ladder {
    width: 80px;
    height: 8px;
    background: #11131a;
    border-radius: 4px;
    overflow: hidden;
    display: flex;
    justify-content: flex-end;
  }

  .gr-bar {
    height: 100%;
    background: #ef4444;
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.8);
  }

  .gr-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #ef4444;
    font-weight: 700;
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
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }
</style>
