<script lang="ts">
  /**
   * EQAMUZ 02 // LEAD EXCITER
   * Solo Guitar Suite, Harmonic Boost & Articulation Shaper
   */
  import { eqamuzStore } from '../state.svelte';
  import KnobControl from '../components/KnobControl.svelte';
  import type { LeadModuleState } from '../types';

  const state = $derived<LeadModuleState>(eqamuzStore.currentModuleState);
  const modes: LeadModuleState['soloMode'][] = ['WARM', 'HOT', 'CRUNCH', 'MODERN'];

  function setMode(m: LeadModuleState['soloMode']) {
    eqamuzStore.updateActiveModuleState((s: LeadModuleState) => {
      s.soloMode = m;
    });
  }
</script>

<div class="lead-module">
  <!-- Faceplate Header Strip -->
  <div class="faceplate-strip">
    <div class="strip-left">
      <div class="pulse-indicator"></div>
      <div>
        <div class="title-row">
          <h2>02 // EQAMUZ LEAD</h2>
          <span class="precision-pill">DSP 64-BIT PRECISION</span>
        </div>
        <span class="sub-desc">SOLO GUITAR SUITE &amp; HARMONIC LEAD EXCITER MATRIX</span>
      </div>
    </div>

    <div class="strip-right">
      <div class="character-modes">
        {#each modes as m}
          <button
            class="mode-btn"
            class:active={state.soloMode === m}
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
          eqamuzStore.updateActiveModuleState((s: LeadModuleState) => {
            s.bypass = !s.bypass;
          });
        }}
      >
        {state.bypass ? 'BYPASS' : 'ACTIVE'}
      </button>
    </div>
  </div>

  <!-- Central Visualizer Screen -->
  <div class="lead-screen">
    <div class="screen-grid">
      <div class="harmonic-graph">
        <svg viewBox="0 0 800 160" preserveAspectRatio="none" class="graph-svg">
          <defs>
            <linearGradient id="leadGlow" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.4" />
              <stop offset="100%" stop-color="#00f2fe" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M 0,140 Q 150,110 300,50 T 550,70 T 800,120"
            fill="none"
            stroke="#00f2fe"
            stroke-width="3"
            class="curve-glow"
          />
          <path d="M 0,140 Q 150,110 300,50 T 550,70 T 800,120 L 800,160 L 0,160 Z" fill="url(#leadGlow)" />
        </svg>
      </div>
    </div>

    <div class="screen-footer">
      <span>HARMONIC EXCITATION: <strong>+{(state.boostDb).toFixed(1)} dB</strong></span>
      <span>SOLO DRIVE: <strong>{Math.round(state.drive * 100)}%</strong></span>
      <span>DELAY TAP: <strong>{state.delayTimeMs} ms</strong></span>
    </div>
  </div>

  <!-- Rotary Controls -->
  <div class="rotary-rack">
    <KnobControl
      label="SOLO DRIVE"
      value={state.drive * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="OVERDRIVE"
      sublabel="HARMONIC GAIN"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: LeadModuleState) => {
          s.drive = v / 100;
        });
      }}
    />

    <KnobControl
      label="TONE CONTOUR"
      value={state.tone * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="BITE"
      sublabel="MID FOCUS"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: LeadModuleState) => {
          s.tone = v / 100;
        });
      }}
    />

    <KnobControl
      label="LEAD PRESENCE"
      value={state.presence * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="AIR"
      sublabel="TOP DEFINITION"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: LeadModuleState) => {
          s.presence = v / 100;
        });
      }}
    />

    <KnobControl
      label="CLEAN BOOST"
      value={state.boostDb}
      min={0}
      max={12}
      step={0.1}
      unit="dB"
      badge="OUTPUT"
      sublabel="STAGE LIFT"
      color="secondary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: LeadModuleState) => {
          s.boostDb = v;
        });
      }}
    />

    <KnobControl
      label="SOLO DELAY"
      value={state.delayMix * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="{state.delayTimeMs}ms"
      sublabel="ECHO AMBIENCE"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: LeadModuleState) => {
          s.delayMix = v / 100;
        });
      }}
    />
  </div>
</div>

<style>
  .lead-module {
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

  .lead-screen {
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

  .screen-grid {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .graph-svg {
    width: 100%;
    height: 100%;
  }

  .curve-glow {
    filter: drop-shadow(0 0 6px rgba(0, 242, 254, 0.8));
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
