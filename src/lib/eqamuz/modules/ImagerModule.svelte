<script lang="ts">
  /**
   * EQAMUZ 09 // IMAGER
   * Phase Imager, Vectorscope & Stereo Field Expander
   */
  import { eqamuzStore } from '../state.svelte';
  import KnobControl from '../components/KnobControl.svelte';
  import type { ImagerModuleState } from '../types';

  const state = $derived<ImagerModuleState>(eqamuzStore.currentModuleState);
</script>

<div class="imager-module">
  <!-- Faceplate Strip -->
  <div class="faceplate-strip">
    <div class="strip-left">
      <div class="pulse-indicator"></div>
      <div>
        <div class="title-row">
          <h2>09 // EQAMUZ IMAGER</h2>
          <span class="precision-pill">DSP 64-BIT PRECISION</span>
        </div>
        <span class="sub-desc">STEREO FIELD EXPANSION, PHASE CORRELATION &amp; MONO BASS FOCUS</span>
      </div>
    </div>

    <div class="strip-right">
      <button
        class="mono-bass-btn"
        class:active={state.monoBass}
        onclick={() => {
          eqamuzStore.updateActiveModuleState((s: ImagerModuleState) => {
            s.monoBass = !s.monoBass;
          });
        }}
      >
        MONO BASS (&lt;{state.crossoverHz}Hz): {state.monoBass ? 'LOCKED' : 'OFF'}
      </button>
      <button
        class="bypass-btn"
        class:off={state.bypass}
        onclick={() => {
          eqamuzStore.updateActiveModuleState((s: ImagerModuleState) => {
            s.bypass = !s.bypass;
          });
        }}
      >
        {state.bypass ? 'BYPASS' : 'ACTIVE'}
      </button>
    </div>
  </div>

  <!-- Polar Vectorscope Display Screen -->
  <div class="imager-screen">
    <div class="vectorscope-grid">
      <!-- Polar crosshairs -->
      <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(255,255,255,0.06)" />
      <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.06)" />
      <!-- Lissajous Cloud SVG -->
      <svg viewBox="0 0 400 180" class="scope-svg">
        <ellipse
          cx="200"
          cy="90"
          rx="{60 * (state.widthPercent / 100)}"
          ry="75"
          fill="none"
          stroke="#00f2fe"
          stroke-width="2"
          transform="rotate(45 200 90)"
          style:filter="drop-shadow(0 0 8px rgba(0,242,254,0.6))"
        />
        <ellipse
          cx="200"
          cy="90"
          rx="{20 * (state.widthPercent / 100)}"
          ry="60"
          fill="none"
          stroke="#4edea3"
          stroke-width="1.5"
          transform="rotate(-45 200 90)"
          opacity="0.7"
        />
      </svg>
    </div>

    <!-- Correlation Meter HUD Bar -->
    <div class="correlation-bay">
      <span class="cor-label">-1.0 (OUT OF PHASE)</span>
      <div class="cor-track">
        <div class="cor-marker" style:left="88%"></div>
      </div>
      <span class="cor-label">+1.0 (PERFECT MONO)</span>
      <span class="cor-readout">+0.88 CORRELATION</span>
    </div>

    <div class="screen-footer">
      <span>STEREO SPREAD: <strong>{state.widthPercent}%</strong></span>
      <span>MONO BASS FREQ: <strong>{state.crossoverHz} Hz</strong></span>
      <span>PAN BALANCE: <strong>{state.balance === 0 ? 'CENTER' : `${state.balance > 0 ? 'R' : 'L'} ${Math.abs(Math.round(state.balance * 100))}%`}</strong></span>
    </div>
  </div>

  <!-- Rotary Rack -->
  <div class="rotary-rack">
    <KnobControl
      label="STEREO WIDTH"
      value={state.widthPercent}
      min={0}
      max={200}
      step={1}
      unit="%"
      badge="SPREAD"
      sublabel="SIDE AMPLITUDE"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: ImagerModuleState) => {
          s.widthPercent = v;
        });
      }}
    />

    <KnobControl
      label="PAN BALANCE"
      value={state.balance * 100}
      min={-100}
      max={100}
      step={1}
      unit="%"
      badge="L/R"
      sublabel="STEREO CENTER"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: ImagerModuleState) => {
          s.balance = v / 100;
        });
      }}
    />

    <KnobControl
      label="BASS CROSSOVER"
      value={state.crossoverHz}
      min={80}
      max={300}
      step={5}
      unit="Hz"
      badge="MONO"
      sublabel="CROSSOVER SPLIT"
      color="secondary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: ImagerModuleState) => {
          s.crossoverHz = v;
        });
      }}
    />
  </div>
</div>

<style>
  .imager-module {
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

  .mono-bass-btn {
    border: 1px solid rgba(0, 242, 254, 0.3);
    background: #191b22;
    color: #849495;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    padding: 4px 10px;
    border-radius: 2px;
    cursor: pointer;
  }

  .mono-bass-btn.active {
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

  .imager-screen {
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

  .vectorscope-grid {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .scope-svg {
    width: 100%;
    height: 100%;
  }

  .correlation-bay {
    position: relative;
    z-index: 5;
    margin: 8px 14px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(25, 27, 34, 0.7);
    padding: 3px 8px;
    border-radius: 2px;
  }

  .cor-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: #849495;
  }

  .cor-track {
    position: relative;
    width: 120px;
    height: 4px;
    background: #11131a;
    border-radius: 2px;
  }

  .cor-marker {
    position: absolute;
    top: -2px;
    width: 4px;
    height: 8px;
    background: #4edea3;
    border-radius: 1px;
    box-shadow: 0 0 4px #4edea3;
  }

  .cor-readout {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    color: #4edea3;
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
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
</style>
