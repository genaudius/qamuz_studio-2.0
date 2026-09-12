<script lang="ts">
  /**
   * EQAMUZ Left Module Slot Matrix (10 Plugin Chain)
   */
  import { eqamuzStore } from '../state.svelte';
  import { getAllModules } from '../registry';
  import type { EQAMUZModuleId } from '../types';

  const modules = getAllModules();

  function isModuleActive(id: EQAMUZModuleId): boolean {
    return eqamuzStore.activePluginId === id;
  }

  function isModuleEnabled(id: EQAMUZModuleId): boolean {
    const currentAB = eqamuzStore.state.currentABState === 'A' ? eqamuzStore.state.stateA : eqamuzStore.state.stateB;
    const mod = currentAB[id] as any;
    return mod?.enabled !== false && !mod?.bypass;
  }

  function getModuleMetric(id: EQAMUZModuleId): string {
    const currentAB = eqamuzStore.state.currentABState === 'A' ? eqamuzStore.state.stateA : eqamuzStore.state.stateB;
    const mod = currentAB[id] as any;
    switch (id) {
      case 'vocal': return isModuleActive(id) ? 'ACTIVE' : 'TUNE';
      case 'lead': return `+${mod.boostDb.toFixed(1)}dB`;
      case 'electric': return mod.ampModel;
      case 'pro_eq': return '8 BANDS';
      case 'comp': return 'GR -4dB';
      case 'saturator': return mod.characterMode;
      case 'delay': return mod.division;
      case 'reverb': return `${mod.decaySec.toFixed(1)}s`;
      case 'imager': return `${mod.widthPercent}%`;
      case 'limiter': return `${mod.ceilingDb.toFixed(1)} dBFS`;
    }
  }
</script>

<div class="slot-matrix">
  <div class="matrix-header">
    <span class="matrix-title">MODULE SLOT MATRIX</span>
    <span class="matrix-count">10 ENGAGED</span>
  </div>

  <nav class="slots-list">
    {#each modules as mod}
      {@const active = isModuleActive(mod.id)}
      {@const enabled = isModuleEnabled(mod.id)}
      <div
        class="slot-card"
        class:active
        onclick={() => eqamuzStore.setActiveModule(mod.id)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && eqamuzStore.setActiveModule(mod.id)}
      >
        <div class="slot-left">
          <!-- Power toggle button -->
          <button
            class="slot-power-btn"
            class:on={enabled}
            title="{enabled ? 'Bypass' : 'Enable'} {mod.displayName}"
            onclick={(e) => {
              e.stopPropagation();
              eqamuzStore.toggleModulePower(mod.id);
            }}
          >
            ⏻
          </button>

          <div class="slot-titles">
            <div class="name-row">
              <span class="slot-name">{mod.slotLabel}</span>
              {#if active}
                <span class="active-dot"></span>
              {/if}
            </div>
            <span class="slot-sub">{mod.subtitle}</span>
          </div>
        </div>

        <span class="metric-pill" class:cyan={active}>
          {getModuleMetric(mod.id)}
        </span>
      </div>
    {/each}
  </nav>
</div>

<style>
  .slot-matrix {
    width: 270px;
    flex-shrink: 0;
    background: #0c0e15;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.4);
    overflow-y: auto;
    user-select: none;
  }

  .matrix-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    margin-bottom: 4px;
  }

  .matrix-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    color: #849495;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .matrix-count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #00f2fe;
    font-weight: 600;
  }

  .slots-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .slot-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #191b22;
    padding: 7px 10px;
    border-radius: 3px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s ease;
  }

  .slot-card:hover {
    background: #282a31;
  }

  .slot-card.active {
    background: #282a31;
    border-color: rgba(0, 242, 254, 0.4);
    box-shadow: 0 0 10px rgba(0, 242, 254, 0.15);
  }

  .slot-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .slot-power-btn {
    border: none;
    background: transparent;
    font-size: 13px;
    cursor: pointer;
    color: #849495;
    padding: 2px;
    line-height: 1;
    transition: color 0.15s ease;
  }

  .slot-power-btn.on {
    color: #10b981;
    text-shadow: 0 0 6px rgba(16, 185, 129, 0.8);
  }

  .slot-titles {
    display: flex;
    flex-direction: column;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .slot-name {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: #e2e2ec;
  }

  .slot-card.active .slot-name {
    color: #00f2fe;
  }

  .active-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #00f2fe;
    box-shadow: 0 0 6px #00f2fe;
  }

  .slot-sub {
    font-family: 'Geist', sans-serif;
    font-size: 8.5px;
    color: #849495;
  }

  .metric-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    padding: 2px 5px;
    border-radius: 2px;
    background: #11131a;
    color: #849495;
    white-space: nowrap;
  }

  .metric-pill.cyan {
    background: rgba(0, 242, 254, 0.15);
    color: #00f2fe;
    font-weight: 700;
  }
</style>
