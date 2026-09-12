<script lang="ts">
  /**
   * EQAMUZ 06 // SATURATOR
   * Harmonic Drive, Analog Tape & Tube Warmth Engine
   */
  import { eqamuzStore } from '../state.svelte';
  import KnobControl from '../components/KnobControl.svelte';
  import type { SaturatorModuleState } from '../types';

  const state = $derived<SaturatorModuleState>(eqamuzStore.currentModuleState);
  const modes: SaturatorModuleState['characterMode'][] = ['TAPE II', 'TUBE', 'TRANSISTOR', 'DIGITAL CLIP'];

  function setMode(m: SaturatorModuleState['characterMode']) {
    eqamuzStore.updateActiveModuleState((s: SaturatorModuleState) => {
      s.characterMode = m;
    });
  }
</script>

<div class="saturator-module">
  <!-- Faceplate Strip -->
  <div class="faceplate-strip">
    <div class="strip-left">
      <div class="pulse-indicator"></div>
      <div>
        <div class="title-row">
          <h2>06 // EQAMUZ SATURATOR</h2>
          <span class="precision-pill">DSP 64-BIT PRECISION</span>
        </div>
        <span class="sub-desc">ANALOG TAPE, WARM TUBE &amp; MULTI-STAGE HARMONIC COLORATION</span>
      </div>
    </div>

    <div class="strip-right">
      <div class="character-modes">
        {#each modes as m}
          <button
            class="mode-btn"
            class:active={state.characterMode === m}
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
          eqamuzStore.updateActiveModuleState((s: SaturatorModuleState) => {
            s.bypass = !s.bypass;
          });
        }}
      >
        {state.bypass ? 'BYPASS' : 'ACTIVE'}
      </button>
    </div>
  </div>

  <!-- Transfer Curve & Warmth Display -->
  <div class="sat-screen">
    <svg viewBox="0 0 400 160" preserveAspectRatio="none" class="sat-svg">
      <defs>
        <linearGradient id="satGlow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#00f2fe" stop-opacity="0" />
        </linearGradient>
      </defs>
      <!-- S-curve sigmoid transfer -->
      <path
        d="M 0,160 Q 150,140 200,80 T 400,0"
        fill="none"
        stroke="#00f2fe"
        stroke-width="3"
      />
    </svg>

    <div class="screen-footer">
      <span>TAPE SATURATION: <strong>{Math.round(state.drive * 100)}%</strong></span>
      <span>WARMTH LIFT: <strong>{Math.round(state.warmth * 100)}%</strong></span>
      <span>HARMONIC PROFILE: <strong>{state.characterMode}</strong></span>
    </div>
  </div>

  <!-- Rotary Rack -->
  <div class="rotary-rack">
    <KnobControl
      label="DRIVE GAIN"
      value={state.drive * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="SAT"
      sublabel="DRIVE FORCE"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: SaturatorModuleState) => {
          s.drive = v / 100;
        });
      }}
    />

    <KnobControl
      label="TONE COLOR"
      value={state.tone * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="COLOR"
      sublabel="HARMONIC SPECTRUM"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: SaturatorModuleState) => {
          s.tone = v / 100;
        });
      }}
    />

    <KnobControl
      label="TUBE WARMTH"
      value={state.warmth * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="ANALOG"
      sublabel="LOW-END WEIGHT"
      color="secondary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: SaturatorModuleState) => {
          s.warmth = v / 100;
        });
      }}
    />

    <KnobControl
      label="DRY / WET"
      value={state.mix * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="MIX"
      sublabel="PARALLEL SAT"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: SaturatorModuleState) => {
          s.mix = v / 100;
        });
      }}
    />

    <KnobControl
      label="OUTPUT TRIM"
      value={state.outputGainDb}
      min={-12}
      max={12}
      step={0.1}
      unit="dB"
      badge="TRIM"
      sublabel="POST MAKEUP"
      color="secondary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: SaturatorModuleState) => {
          s.outputGainDb = v;
        });
      }}
    />
  </div>
</div>

<style>
  .saturator-module {
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

  .sat-screen {
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

  .sat-svg {
    position: absolute;
    inset: 0;
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
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }
</style>
