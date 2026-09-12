<script lang="ts">
  /**
   * EQAMUZ Bottom Status & Telemetry Hardware Strip
   */
  import { eqamuzStore } from '../state.svelte';
  import type { OversampleFactor } from '../types';

  const tel = $derived(eqamuzStore.telemetry);
  const factors: OversampleFactor[] = [1, 2, 4, 8];

  // Normalized width 0-100% for peak meters (-60dB to 0dB)
  function meterWidth(db: number): number {
    return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  }

  const activePreset = $derived(
    eqamuzStore.presets.find((p) => p.id === eqamuzStore.activePresetId)
  );

  function stepPreset(dir: -1 | 1) {
    const list = eqamuzStore.filteredPresets;
    if (list.length === 0) return;
    const currentIndex = list.findIndex((p) => p.id === eqamuzStore.activePresetId);
    let nextIndex = currentIndex + dir;
    if (nextIndex < 0) nextIndex = list.length - 1;
    if (nextIndex >= list.length) nextIndex = 0;
    eqamuzStore.loadPreset(list[nextIndex]);
  }
</script>

<div class="telemetry-bar">
  <!-- Input/Output Peak Ladder Meters -->
  <div class="meters-bay">
    <!-- IN Meter -->
    <div class="meter-group">
      <span class="meter-name">IN L/R</span>
      <div class="ladder-bars">
        <div class="ladder-track">
          <div class="ladder-fill green" style:width="{meterWidth(tel.inPeakLeftDb)}%"></div>
        </div>
        <div class="ladder-track">
          <div class="ladder-fill green" style:width="{meterWidth(tel.inPeakRightDb)}%"></div>
        </div>
      </div>
      <span class="meter-val">{tel.inPeakLeftDb.toFixed(1)} dBFS</span>
    </div>

    <!-- OUT Meter -->
    <div class="meter-group">
      <span class="meter-name">OUT L/R</span>
      <div class="ladder-bars">
        <div class="ladder-track">
          <div class="ladder-fill cyan" style:width="{meterWidth(tel.outPeakLeftDb)}%"></div>
        </div>
        <div class="ladder-track">
          <div class="ladder-fill cyan" style:width="{meterWidth(tel.outPeakRightDb)}%"></div>
        </div>
      </div>
      <span class="meter-val cyan">{tel.outPeakLeftDb.toFixed(1)} dBFS</span>
    </div>
  </div>

  <!-- Central Preset Stepper -->
  <div class="stepper-bay">
    <button class="step-btn" title="Previous Preset" onclick={() => stepPreset(-1)}>
      ◀
    </button>
    <span class="preset-stepper-name">
      {activePreset?.presetName || 'DEFAULT'}
    </span>
    <button class="step-btn" title="Next Preset" onclick={() => stepPreset(1)}>
      ▶
    </button>
  </div>

  <!-- Oversampling, Precision & DSP Load Controls -->
  <div class="engine-ctrls-bay">
    <!-- Oversampling Multi-Toggle -->
    <div class="os-group" title="Oversampling: 1X native rate active. High-ratio oversampling coming soon.">
      <span class="os-label">OS:</span>
      {#each factors as f}
        <button
          class="os-btn"
          class:active={f === 1}
          class:pending={f !== 1}
          title={f === 1 ? '1X Native WebAudio Sampling (Active)' : `${f}X Oversampling (DSP Not Yet Connected — Coming Soon)`}
          onclick={() => {
            if (f === 1) eqamuzStore.setOversampling(1);
          }}
        >
          {f}X
        </button>
      {/each}
    </div>

    <!-- Precision -->
    <div class="precision-pill" title="Web Audio API Float32Array AudioBuffer stream">
      <span class="pill-dot"></span>
      <span>32-BIT FLOAT AUDIO</span>
    </div>

    <!-- CPU Load -->
    <div class="cpu-pill" title="Dynamic real-time DSP load estimate based on active tracks and transport">
      <span class="cpu-label">CPU:</span>
      <span class="cpu-val">{tel.cpuLoadPercent !== null ? `${tel.cpuLoadPercent.toFixed(1)}%` : '--'}</span>
    </div>
  </div>
</div>

<style>
  .telemetry-bar {
    width: 100%;
    background: #0c0e15;
    padding: 6px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.5);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    user-select: none;
  }

  .meters-bay, .engine-ctrls-bay {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .meter-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .meter-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    color: #849495;
  }

  .ladder-bars {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 70px;
  }

  .ladder-track {
    width: 100%;
    height: 4px;
    background: #191b22;
    border-radius: 2px;
    overflow: hidden;
  }

  .ladder-fill {
    height: 100%;
    transition: width 0.08s ease-out;
  }

  .ladder-fill.green {
    background: #4edea3;
    box-shadow: 0 0 4px #4edea3;
  }

  .ladder-fill.cyan {
    background: #00f2fe;
    box-shadow: 0 0 4px #00f2fe;
  }

  .meter-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #e2e2ec;
    min-width: 44px;
    text-align: right;
  }

  .meter-val.cyan {
    color: #00f2fe;
    font-weight: 700;
  }

  .stepper-bay {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #191b22;
    padding: 3px 8px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .step-btn {
    border: none;
    background: transparent;
    color: #849495;
    font-size: 9px;
    cursor: pointer;
    padding: 2px 4px;
  }

  .step-btn:hover {
    color: #00f2fe;
  }

  .preset-stepper-name {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 10px;
    font-weight: 600;
    color: #e2e2ec;
    min-width: 140px;
    text-align: center;
  }

  .os-group {
    display: flex;
    align-items: center;
    background: #191b22;
    padding: 2px 4px;
    border-radius: 2px;
    gap: 2px;
  }

  .os-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    color: #849495;
    margin-right: 2px;
  }

  .os-btn {
    border: none;
    background: transparent;
    color: #849495;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    padding: 2px 4px;
    border-radius: 2px;
    cursor: pointer;
  }

  .os-btn.active {
    background: #00f2fe;
    color: #00373a;
    font-weight: 700;
  }

  .os-btn.pending {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .precision-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #191b22;
    padding: 3px 8px;
    border-radius: 2px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #e2e2ec;
  }

  .pill-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #4edea3;
    box-shadow: 0 0 4px #4edea3;
  }

  .cpu-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
  }

  .cpu-label {
    color: #849495;
  }

  .cpu-val {
    color: #00f2fe;
    font-weight: 700;
  }
</style>
