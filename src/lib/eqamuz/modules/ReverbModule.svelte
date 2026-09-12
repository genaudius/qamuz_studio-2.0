<script lang="ts">
  /**
   * EQAMUZ 08 // SPACE REVERB
   * Spatial Decay Chamber, Algorithmic Plate & Shimmer Reflections
   */
  import { eqamuzStore } from '../state.svelte';
  import KnobControl from '../components/KnobControl.svelte';
  import type { ReverbModuleState } from '../types';

  const state = $derived<ReverbModuleState>(eqamuzStore.currentModuleState);
  const algorithms: ReverbModuleState['algorithm'][] = ['CONCERT', 'PLATE', 'CHAMBER', 'ROOM', 'SHIMMER'];

  function setAlgorithm(a: ReverbModuleState['algorithm']) {
    eqamuzStore.updateActiveModuleState((s: ReverbModuleState) => {
      s.algorithm = a;
    });
  }
</script>

<div class="reverb-module">
  <!-- Faceplate Strip -->
  <div class="faceplate-strip">
    <div class="strip-left">
      <div class="pulse-indicator"></div>
      <div>
        <div class="title-row">
          <h2>08 // EQAMUZ REVERB</h2>
          <span class="precision-pill">DSP 64-BIT PRECISION</span>
        </div>
        <span class="sub-desc">SPATIAL DECAY CHAMBER &amp; MULTI-ALGORITHMIC DIFFUSION ENGINE</span>
      </div>
    </div>

    <div class="strip-right">
      <div class="character-modes">
        {#each algorithms as a}
          <button
            class="mode-btn"
            class:active={state.algorithm === a}
            onclick={() => setAlgorithm(a)}
          >
            {a}
          </button>
        {/each}
      </div>
      <button
        class="bypass-btn"
        class:off={state.bypass}
        onclick={() => {
          eqamuzStore.updateActiveModuleState((s: ReverbModuleState) => {
            s.bypass = !s.bypass;
          });
        }}
      >
        {state.bypass ? 'BYPASS' : 'ACTIVE'}
      </button>
    </div>
  </div>

  <!-- Reverb Decay Chamber Screen -->
  <div class="reverb-screen">
    <div class="decay-mesh">
      <svg viewBox="0 0 800 180" preserveAspectRatio="none" class="mesh-svg">
        <defs>
          <linearGradient id="reverbGlow" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.4" />
            <stop offset="100%" stop-color="#3c0091" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        <!-- Decay tail envelope -->
        <path
          d="M 0,20 Q 80,40 200,100 T 500,150 T 800,175"
          fill="none"
          stroke="#00f2fe"
          stroke-width="3"
        />
        <path d="M 0,20 Q 80,40 200,100 T 500,150 T 800,175 L 800,180 L 0,180 Z" fill="url(#reverbGlow)" />
      </svg>
    </div>

    <div class="screen-footer">
      <span>ALGORITHM: <strong>{state.algorithm}</strong></span>
      <span>RT60 DECAY: <strong>{state.decaySec.toFixed(1)} s</strong></span>
      <span>PRE-DELAY: <strong>{state.preDelayMs} ms</strong></span>
      <span>ROOM SIZE: <strong>{Math.round(state.size * 100)}%</strong></span>
    </div>
  </div>

  <!-- Rotary Rack -->
  <div class="rotary-rack">
    <KnobControl
      label="DECAY TIME"
      value={state.decaySec}
      min={0.2}
      max={12.0}
      step={0.1}
      unit="s"
      badge="RT60"
      sublabel="DIFFUSION TAIL"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: ReverbModuleState) => {
          s.decaySec = v;
        });
      }}
    />

    <KnobControl
      label="ROOM SIZE"
      value={state.size * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="DIMENSION"
      sublabel="EARLY REFLECT"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: ReverbModuleState) => {
          s.size = v / 100;
        });
      }}
    />

    <KnobControl
      label="HF DAMPING"
      value={state.damping * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="ABSORB"
      sublabel="HIGH-END LOSS"
      color="secondary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: ReverbModuleState) => {
          s.damping = v / 100;
        });
      }}
    />

    <KnobControl
      label="STEREO WIDTH"
      value={state.width * 100}
      min={0}
      max={150}
      step={1}
      unit="%"
      badge="SPREAD"
      sublabel="PANORAMA"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: ReverbModuleState) => {
          s.width = v / 100;
        });
      }}
    />

    <KnobControl
      label="REVERB MIX"
      value={state.mix * 100}
      min={0}
      max={100}
      step={1}
      unit="%"
      badge="WET"
      sublabel="DRY / WET"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: ReverbModuleState) => {
          s.mix = v / 100;
        });
      }}
    />
  </div>
</div>

<style>
  .reverb-module {
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

  .reverb-screen {
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

  .decay-mesh {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .mesh-svg {
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
