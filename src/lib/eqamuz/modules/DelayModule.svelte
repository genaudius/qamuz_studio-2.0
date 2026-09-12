<script lang="ts">
  /**
   * EQAMUZ 07 // DELAY MATRIX
   * Stereo Echo Matrix with BPM Sync & Dual-Mode Filtering
   */
  import { eqamuzStore } from '../state.svelte';
  import KnobControl from '../components/KnobControl.svelte';
  import type { DelayModuleState } from '../types';

  const state = $derived<DelayModuleState>(eqamuzStore.currentModuleState);
  const divisions: DelayModuleState['division'][] = ['1/4', '1/8', '1/8D', '1/16', '1/2'];
  const modes: DelayModuleState['mode'][] = ['STEREO', 'PING_PONG', 'DUAL_MONO'];

  function setDivision(d: DelayModuleState['division']) {
    eqamuzStore.updateActiveModuleState((s: DelayModuleState) => {
      s.division = d;
    });
  }

  function setMode(m: DelayModuleState['mode']) {
    eqamuzStore.updateActiveModuleState((s: DelayModuleState) => {
      s.mode = m;
    });
  }
</script>

<div class="delay-module">
  <!-- Faceplate Strip -->
  <div class="faceplate-strip">
    <div class="strip-left">
      <div class="pulse-indicator"></div>
      <div>
        <div class="title-row">
          <h2>07 // EQAMUZ DELAY</h2>
          <span class="precision-pill">DSP 64-BIT PRECISION</span>
        </div>
        <span class="sub-desc">STEREO ECHO MATRIX &amp; RHYTHMIC TAPE DELAY REPEATER</span>
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
            {m.replace('_', ' ')}
          </button>
        {/each}
      </div>
      <button
        class="sync-btn"
        class:active={state.sync}
        onclick={() => {
          eqamuzStore.updateActiveModuleState((s: DelayModuleState) => {
            s.sync = !s.sync;
          });
        }}
      >
        BPM SYNC: {state.sync ? 'LOCKED' : 'FREE'}
      </button>
    </div>
  </div>

  <!-- Delay Visualizer Screen -->
  <div class="delay-screen">
    <div class="echo-taps-viz">
      {#each [1, 0.7, 0.45, 0.3, 0.18, 0.1] as tap, idx}
        <div
          class="echo-tap-bar"
          style:height="{tap * 100}%"
          style:left="{15 + idx * 14}%"
          style:opacity={tap}
        ></div>
      {/each}
    </div>

    <div class="division-pills-bar">
      {#each divisions as d}
        <button
          class="div-pill"
          class:active={state.division === d}
          onclick={() => setDivision(d)}
        >
          {d}
        </button>
      {/each}
    </div>

    <div class="screen-footer">
      <span>TIME DIVISION: <strong>{state.sync ? state.division : `${state.timeMs}ms`}</strong></span>
      <span>FEEDBACK REPEATS: <strong>{Math.round(state.feedback * 100)}%</strong></span>
      <span>DAMPING FILTER: <strong>{state.filterHz} Hz</strong></span>
    </div>
  </div>

  <!-- Rotary Rack -->
  <div class="rotary-rack">
    <KnobControl
      label="DELAY TIME"
      value={state.timeMs}
      min={10}
      max={2000}
      step={10}
      unit="ms"
      badge={state.division}
      sublabel="TAP INTERVAL"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: DelayModuleState) => {
          s.timeMs = v;
        });
      }}
    />

    <KnobControl
      label="FEEDBACK"
      value={state.feedback * 100}
      min={0}
      max={95}
      step={1}
      unit="%"
      badge="REPEATS"
      sublabel="RECYCLE LEVEL"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: DelayModuleState) => {
          s.feedback = v / 100;
        });
      }}
    />

    <KnobControl
      label="LOWPASS DAMP"
      value={state.filterHz}
      min={500}
      max={15000}
      step={100}
      unit="Hz"
      badge="FILTER"
      sublabel="TAPE ROLLOFF"
      color="secondary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: DelayModuleState) => {
          s.filterHz = v;
        });
      }}
    />

    <KnobControl
      label="ECHO MIX"
      value={state.mix * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="WET"
      sublabel="DRY / WET"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: DelayModuleState) => {
          s.mix = v / 100;
        });
      }}
    />

    <div class="tap-card">
      <span class="tap-title">TAP TEMPO</span>
      <button class="tap-trigger-btn">
        TAP
      </button>
      <span class="tap-hint">MANUAL CLOCK</span>
    </div>
  </div>
</div>

<style>
  .delay-module {
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

  .sync-btn {
    border: 1px solid rgba(0, 242, 254, 0.3);
    background: #191b22;
    color: #849495;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    padding: 4px 10px;
    border-radius: 2px;
    cursor: pointer;
  }

  .sync-btn.active {
    background: rgba(0, 242, 254, 0.15);
    color: #00f2fe;
    border-color: #00f2fe;
  }

  .delay-screen {
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

  .echo-taps-viz {
    position: absolute;
    inset: 0;
    bottom: 30px;
  }

  .echo-tap-bar {
    position: absolute;
    bottom: 10px;
    width: 12px;
    background: #00f2fe;
    border-radius: 2px 2px 0 0;
    box-shadow: 0 0 8px rgba(0, 242, 254, 0.6);
  }

  .division-pills-bar {
    position: relative;
    z-index: 5;
    margin: 12px 14px;
    display: flex;
    gap: 4px;
  }

  .div-pill {
    background: #191b22;
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #849495;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    padding: 3px 8px;
    border-radius: 2px;
    cursor: pointer;
  }

  .div-pill.active {
    background: #00f2fe;
    color: #00373a;
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

  .tap-card {
    background: #191b22;
    padding: 10px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
  }

  .tap-title {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 9px;
    font-weight: 700;
    color: #00f2fe;
  }

  .tap-trigger-btn {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    border: 2px solid #00f2fe;
    background: #11131a;
    color: #00f2fe;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 11px;
    cursor: pointer;
    box-shadow: 0 0 10px rgba(0, 242, 254, 0.3);
  }

  .tap-trigger-btn:active {
    background: #00f2fe;
    color: #00373a;
  }

  .tap-hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: #849495;
  }
</style>
