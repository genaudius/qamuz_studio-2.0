<script lang="ts">
  /**
   * EQAMUZ 01 // VOCAL FORGE
   * Real-time Advanced Pitch Correction, Formant Tuner & Vocal Processing Rack
   */
  import { eqamuzStore } from '../state.svelte';
  import KnobControl from '../components/KnobControl.svelte';
  import type { VocalModuleState } from '../types';

  const state = $derived<VocalModuleState>(eqamuzStore.currentModuleState);

  const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const scales: VocalModuleState['tuning']['scale'][] = ['MAJOR', 'MINOR', 'CHROMATIC', 'PENTATONIC'];
  const modes: VocalModuleState['tuning']['mode'][] = ['HARD TUNE', 'NATURAL', 'ROBOTIC', 'GENDER FX'];

  function setKey(k: string) {
    eqamuzStore.updateActiveModuleState((s: VocalModuleState) => {
      s.tuning.key = k;
    });
  }

  function setScale(sc: VocalModuleState['tuning']['scale']) {
    eqamuzStore.updateActiveModuleState((s: VocalModuleState) => {
      s.tuning.scale = sc;
    });
  }

  function setMode(m: VocalModuleState['tuning']['mode']) {
    eqamuzStore.updateActiveModuleState((s: VocalModuleState) => {
      s.tuning.mode = m;
    });
  }
</script>

<div class="vocal-module">
  <!-- Faceplate Header Strip -->
  <div class="faceplate-strip">
    <div class="strip-left">
      <div class="pulse-indicator"></div>
      <div>
        <div class="title-row">
          <h2>01 // EQAMUZ VOCAL</h2>
          <span class="precision-pill">DSP 64-BIT PRECISION</span>
        </div>
        <span class="sub-desc">REAL-TIME ADVANCED PITCH CORRECTION &amp; FORMANT TUNER MATRIX</span>
      </div>
    </div>

    <div class="strip-right">
      <!-- Musical Scale & Key Controls -->
      <div class="musical-tuning-bar">
        <label class="tuning-tag">
          <span>KEY:</span>
          <select value={state.tuning.key} onchange={(e) => setKey(e.currentTarget.value)}>
            {#each keys as k}
              <option value={k}>{k}</option>
            {/each}
          </select>
        </label>

        <label class="tuning-tag">
          <span>SCALE:</span>
          <select value={state.tuning.scale} onchange={(e) => setScale(e.currentTarget.value as any)}>
            {#each scales as sc}
              <option value={sc}>{sc}</option>
            {/each}
          </select>
        </label>

        <div class="hz-pill">{state.tuning.referenceHz.toFixed(1)} Hz</div>
      </div>

      <!-- Character Mode Tabs -->
      <div class="character-modes">
        {#each modes as m}
          <button
            class="mode-btn"
            class:active={state.tuning.mode === m}
            onclick={() => setMode(m)}
          >
            {m}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Real-Time Chromatic Note Graph & Pitch Runner Screen -->
  <div class="pitch-screen">
    <!-- Note Lanes Background Grid -->
    <div class="lanes-grid">
      <div class="lane"><span>B4 (493.88 Hz)</span><span class="cents">+100c</span></div>
      <div class="lane"><span>A4 (440.00 Hz)</span><span class="cents">+50c</span></div>
      <div class="lane"><span>G4 (392.00 Hz)</span><span class="cents">0c</span></div>
      <div class="lane"><span>F4 (349.23 Hz)</span><span class="cents">-50c</span></div>
      <div class="lane"><span>E4 (329.63 Hz)</span><span class="cents">-100c</span></div>
      <div class="lane"><span>D4 (293.66 Hz)</span><span class="cents">-150c</span></div>
      <div class="lane target-root">
        <span class="root-name">{state.tuning.key}4 [TARGET ROOT]</span>
        <span class="root-status">SNAPPED</span>
      </div>
    </div>

    <!-- Pitch Trajectory Graph SVG Vector -->
    <div class="svg-layer">
      <svg class="pitch-svg" viewBox="0 0 1000 240" preserveAspectRatio="none">
        <defs>
          <linearGradient id="vocalPitchGlow" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.3"></stop>
            <stop offset="100%" stop-color="#00f2fe" stop-opacity="0.0"></stop>
          </linearGradient>
        </defs>
        <!-- Target Snapped Pitch Step Line (Cyan Glow) -->
        <path
          d="M 0,200 L 220,200 L 250,150 L 420,150 L 450,100 L 620,100 L 640,200 L 1000,200"
          stroke="#00f2fe"
          stroke-width="3.5"
          fill="none"
          class="glow-path"
        />
        <!-- Raw Human Input Vibrato Curve (Green Dotted) -->
        <path
          d="M 0,208 Q 60,212 120,206 T 220,202 Q 235,180 250,145 Q 320,155 370,148 T 430,146 Q 445,120 460,96 Q 520,105 580,98 T 630,102 Q 640,160 655,202 Q 740,206 820,198 T 920,204 L 1000,200"
          opacity="0.65"
          stroke="#4edea3"
          stroke-dasharray="3 3"
          stroke-width="1.5"
          fill="none"
        />
        <!-- Shaded fill under locked note area -->
        <path d="M 640,200 L 1000,200 L 1000,240 L 640,240 Z" fill="url(#vocalPitchGlow)"></path>
      </svg>
    </div>

    <!-- Live Tracking Tracker Dot -->
    <div class="tracker-node" style="left: 78%; top: 82%;">
      <div class="tracker-pulse">
        <div class="tracker-core"></div>
      </div>
      <div class="tracker-pill">
        {state.tuning.key}4 +1.8c (LOCK 99.4%)
      </div>
    </div>

    <!-- HUD Telemetry Footer -->
    <div class="screen-hud-footer">
      <div class="hud-left">
        <span class="active-tag"><span class="dot"></span>TRACKING: DETECTED</span>
        <span>RETUNE: <strong>{state.tuning.retuneSpeedMs.toFixed(1)} ms</strong></span>
        <span>HUMANIZE: <strong>{state.tuning.humanizePercent}%</strong></span>
      </div>
      <div class="hud-right">
        <span>CORRECTION: <strong>{state.tuning.correctionRate}%</strong></span>
        <span class="lat-tag">LATENCY: 1.2ms</span>
      </div>
    </div>
  </div>

  <!-- Lower Tactile Rotary Bays (5 Knobs) -->
  <div class="rotary-rack">
    <!-- Knob 1: Retune Speed -->
    <KnobControl
      label="RETUNE SPEED"
      value={state.tuning.retuneSpeedMs}
      min={0}
      max={50}
      step={0.1}
      unit="ms"
      badge={state.tuning.retuneSpeedMs === 0 ? 'HARD' : 'SMOOTH'}
      sublabel={state.tuning.retuneSpeedMs === 0 ? 'INSTANT SNAP' : 'VOCAL TRACK'}
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: VocalModuleState) => {
          s.tuning.retuneSpeedMs = v;
        });
      }}
    />

    <!-- Knob 2: Formant Shift -->
    <KnobControl
      label="FORMANT"
      value={state.toneAndDynamics.formantSemitones}
      min={-12}
      max={12}
      step={0.1}
      unit="ST"
      badge="TIMBRE"
      sublabel="GENDER SHIFT"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: VocalModuleState) => {
          s.toneAndDynamics.formantSemitones = v;
        });
      }}
    />

    <!-- Knob 3: De-Esser -->
    <KnobControl
      label="DE-ESSER"
      value={state.toneAndDynamics.deEsserThresholdDb}
      min={-40}
      max={0}
      step={0.5}
      unit="dB"
      badge="{Math.round(state.toneAndDynamics.deEsserFreqHz / 1000)} kHz"
      sublabel="SIBILANCE CUT"
      color="secondary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: VocalModuleState) => {
          s.toneAndDynamics.deEsserThresholdDb = v;
        });
      }}
    />

    <!-- Knob 4: Air EQ -->
    <KnobControl
      label="AIR EQ"
      value={state.toneAndDynamics.airEqGainDb}
      min={-6}
      max={12}
      step={0.1}
      unit="dB"
      badge="16.0 kHz"
      sublabel="SHEEN / PRESENCE"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: VocalModuleState) => {
          s.toneAndDynamics.airEqGainDb = v;
        });
      }}
    />

    <!-- Knob 5: Opto Compressor -->
    <KnobControl
      label="OPTO COMP"
      value={state.toneAndDynamics.optoCompThresholdDb}
      min={-36}
      max={0}
      step={0.5}
      unit="dB"
      badge="GR -4.2dB"
      sublabel="PEAK THRESHOLD"
      color="primary"
      onChange={(v) => {
        eqamuzStore.updateActiveModuleState((s: VocalModuleState) => {
          s.toneAndDynamics.optoCompThresholdDb = v;
        });
      }}
    />
  </div>

  <!-- Sub-Processing Chain Chassis -->
  <div class="sub-chassis">
    <div class="sub-modules-list">
      <!-- Sub-module 1: Dynamic Leveler -->
      <button
        class="sub-item"
        class:active={state.auxModules.vocalOptoLeveler}
        onclick={() => {
          eqamuzStore.updateActiveModuleState((s: VocalModuleState) => {
            s.auxModules.vocalOptoLeveler = !s.auxModules.vocalOptoLeveler;
          });
        }}
      >
        <span class="status-dot"></span>
        <div class="sub-info">
          <span class="sub-name">VOCAL OPTO LEVELER</span>
          <span class="sub-metric">ACTIVE // -4.2 dB GAIN REDUCTION</span>
        </div>
      </button>

      <div class="sub-divider"></div>

      <!-- Sub-module 2: Doubler / Harmonizer -->
      <button
        class="sub-item"
        class:active={state.auxModules.harmonizerDoubler}
        onclick={() => {
          eqamuzStore.updateActiveModuleState((s: VocalModuleState) => {
            s.auxModules.harmonizerDoubler = !s.auxModules.harmonizerDoubler;
          });
        }}
      >
        <span class="status-dot cyan"></span>
        <div class="sub-info">
          <span class="sub-name">HARMONIZER &amp; STEREO DOUBLER</span>
          <span class="sub-metric cyan">2 VOICES // SPREAD 120% // ±1 OCT</span>
        </div>
      </button>

      <div class="sub-divider"></div>

      <!-- Sub-module 3: Space & Ambience -->
      <button
        class="sub-item"
        class:active={state.auxModules.spatialAmbiance}
        onclick={() => {
          eqamuzStore.updateActiveModuleState((s: VocalModuleState) => {
            s.auxModules.spatialAmbiance = !s.auxModules.spatialAmbiance;
          });
        }}
      >
        <span class="status-dot bright"></span>
        <div class="sub-info">
          <span class="sub-name">PLATE REVERB &amp; DOTTED DELAY</span>
          <span class="sub-metric">DECAY 2.8s // MIX 22% // 1/4D</span>
        </div>
      </button>
    </div>

    <div class="routing-badge">
      ROUTING MATRIX // INTERNAL 64-BIT
    </div>
  </div>
</div>

<style>
  .vocal-module {
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
    animation: pulse 2s infinite ease-in-out;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.5; transform: scale(0.9); }
    50% { opacity: 1; transform: scale(1.1); }
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
    letter-spacing: -0.01em;
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
    letter-spacing: 0.02em;
  }

  .strip-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .musical-tuning-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #0c0e15;
    padding: 3px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.04);
  }

  .tuning-tag {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #191b22;
    padding: 3px 8px;
    border-radius: 2px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #849495;
  }

  .tuning-tag select {
    background: transparent;
    border: none;
    color: #00f2fe;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 11px;
    outline: none;
    cursor: pointer;
  }

  .hz-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #4edea3;
    padding: 3px 8px;
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
    transition: all 0.15s ease;
  }

  .mode-btn.active {
    background: #00f2fe;
    color: #00373a;
    font-weight: 700;
    box-shadow: 0 0 8px rgba(0, 242, 254, 0.5);
  }

  /* Pitch Screen */
  .pitch-screen {
    position: relative;
    width: 100%;
    height: 220px;
    background: #0c0e15;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .lanes-grid {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 8px 12px;
    pointer-events: none;
    opacity: 0.45;
  }

  .lane {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    padding-bottom: 1px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    color: #849495;
  }

  .lane.target-root {
    background: rgba(0, 242, 254, 0.08);
    border-top: 1px solid rgba(0, 242, 254, 0.35);
    border-bottom: 1px solid rgba(0, 242, 254, 0.35);
    color: #00f2fe;
    font-weight: 700;
  }

  .svg-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .pitch-svg {
    width: 100%;
    height: 100%;
  }

  .glow-path {
    filter: drop-shadow(0 0 8px rgba(0, 242, 254, 0.8));
  }

  .tracker-node {
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .tracker-pulse {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #0c0e15;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 10px #00f2fe;
  }

  .tracker-core {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #00f2fe;
  }

  .tracker-pill {
    position: absolute;
    top: -26px;
    left: -32px;
    background: #00f2fe;
    color: #00373a;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 2px;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  }

  .screen-hud-footer {
    position: relative;
    z-index: 5;
    background: rgba(12, 14, 21, 0.85);
    backdrop-filter: blur(4px);
    padding: 4px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    color: #849495;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .hud-left, .hud-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .hud-left strong, .hud-right strong {
    color: #00f2fe;
  }

  .active-tag {
    color: #4edea3;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .active-tag .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #4edea3;
    box-shadow: 0 0 4px #4edea3;
  }

  .lat-tag {
    color: #4edea3;
  }

  /* Rotary Rack */
  .rotary-rack {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }

  /* Sub-Chassis */
  .sub-chassis {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #0c0e15;
    padding: 10px 14px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .sub-modules-list {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .sub-item {
    background: transparent;
    border: none;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    text-align: left;
    opacity: 0.6;
    transition: opacity 0.15s ease;
  }

  .sub-item.active {
    opacity: 1;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #4edea3;
    box-shadow: 0 0 6px #4edea3;
  }

  .status-dot.cyan {
    background: #00f2fe;
    box-shadow: 0 0 6px #00f2fe;
  }

  .status-dot.bright {
    background: #e0fdff;
    box-shadow: 0 0 6px #e0fdff;
  }

  .sub-info {
    display: flex;
    flex-direction: column;
  }

  .sub-name {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 10.5px;
    font-weight: 600;
    color: #e2e2ec;
  }

  .sub-metric {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    color: #4edea3;
  }

  .sub-metric.cyan {
    color: #00f2fe;
  }

  .sub-divider {
    width: 1px;
    height: 24px;
    background: rgba(255, 255, 255, 0.08);
  }

  .routing-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #849495;
    background: #191b22;
    padding: 3px 8px;
    border-radius: 2px;
  }
</style>
