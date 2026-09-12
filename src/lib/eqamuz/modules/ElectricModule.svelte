<script lang="ts">
  /**
   * EQAMUZ 03 // ELECTRIC DRIVE
   * Distortion, Amp Rig & High-Gain Harmonic Modeling
   */
  import { eqamuzStore } from '../state.svelte';
  import KnobControl from '../components/KnobControl.svelte';
  import type { ElectricModuleState } from '../types';

  const state = $derived<ElectricModuleState>(eqamuzStore.currentModuleState);
  const amps: ElectricModuleState['ampModel'][] = ['BRIT 800', 'CALI DUAL', 'CLEAN TUBE', 'FUZZ 68'];

  function setAmp(a: ElectricModuleState['ampModel']) {
    eqamuzStore.updateActiveModuleState((s: ElectricModuleState) => {
      s.ampModel = a;
    });
  }
</script>

<div class="electric-module">
  <!-- Faceplate Strip -->
  <div class="faceplate-strip">
    <div class="strip-left">
      <div class="pulse-indicator"></div>
      <div>
        <div class="title-row">
          <h2>03 // EQAMUZ ELECTRIC</h2>
          <span class="precision-pill">DSP 64-BIT PRECISION</span>
        </div>
        <span class="sub-desc">DISTORTION &amp; VINTAGE TUBE AMP RIG SIMULATION</span>
      </div>
    </div>

    <div class="strip-right">
      <div class="character-modes">
        {#each amps as a}
          <button
            class="mode-btn"
            class:active={state.ampModel === a}
            onclick={() => setAmp(a)}
          >
            {a}
          </button>
        {/each}
      </div>
      <button
        class="cab-btn"
        class:active={state.cabSim}
        onclick={() => {
          eqamuzStore.updateActiveModuleState((s: ElectricModuleState) => {
            s.cabSim = !s.cabSim;
          });
        }}
      >
        CAB 4X12: {state.cabSim ? 'ON' : 'OFF'}
      </button>
    </div>
  </div>

  <!-- Amp Head Screen -->
  <div class="amp-screen">
    <div class="grille-pattern">
      <div class="amp-logo-plate">
        <span class="plate-title">{state.ampModel}</span>
        <span class="plate-sub">HIGH-GAIN ALL-TUBE RIG</span>
      </div>
    </div>
    <div class="screen-footer">
      <span>PRE-AMP GAIN: <strong>{Math.round(state.gain * 100)}%</strong></span>
      <span>CABINET EMULATION: <strong>{state.cabSim ? 'CELESTION V30' : 'DIRECT'}</strong></span>
      <span>NOISE GATE: <strong>{state.noiseGateThresholdDb} dB</strong></span>
    </div>
  </div>

  <!-- 5 Rotary Bays -->
  <div class="rotary-rack">
    <KnobControl
      label="PRE-GAIN"
      value={state.gain * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="DRIVE"
      sublabel="STAGE 1"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: ElectricModuleState) => {
          s.gain = v / 100;
        });
      }}
    />

    <KnobControl
      label="BASS EQ"
      value={state.bass * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="120Hz"
      sublabel="PUNCH"
      color="secondary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: ElectricModuleState) => {
          s.bass = v / 100;
        });
      }}
    />

    <KnobControl
      label="MID EQ"
      value={state.mid * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="800Hz"
      sublabel="GROWL"
      color="secondary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: ElectricModuleState) => {
          s.mid = v / 100;
        });
      }}
    />

    <KnobControl
      label="TREBLE EQ"
      value={state.treble * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="3.5kHz"
      sublabel="CLARITY"
      color="secondary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: ElectricModuleState) => {
          s.treble = v / 100;
        });
      }}
    />

    <KnobControl
      label="NOISE GATE"
      value={state.noiseGateThresholdDb}
      min={-80}
      max={-20}
      step={1}
      unit="dB"
      badge="GATE"
      sublabel="CHOKE THRESHOLD"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: ElectricModuleState) => {
          s.noiseGateThresholdDb = v;
        });
      }}
    />
  </div>
</div>

<style>
  .electric-module {
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

  .cab-btn {
    border: 1px solid rgba(0, 242, 254, 0.3);
    background: #191b22;
    color: #849495;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    padding: 4px 10px;
    border-radius: 2px;
    cursor: pointer;
  }

  .cab-btn.active {
    background: rgba(0, 242, 254, 0.15);
    color: #00f2fe;
    border-color: #00f2fe;
  }

  .amp-screen {
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

  .grille-pattern {
    position: relative;
    width: 100%;
    height: 100%;
    background-image: radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 0);
    background-size: 6px 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .amp-logo-plate {
    background: #191b22;
    border: 1px solid rgba(0, 242, 254, 0.4);
    padding: 8px 24px;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.8), 0 0 10px rgba(0, 242, 254, 0.2);
  }

  .plate-title {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #00f2fe;
  }

  .plate-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    color: #849495;
    letter-spacing: 0.1em;
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
