<script lang="ts">
  /**
   * EQAMUZ Top Component Chassis Bar
   */
  import { eqamuzStore } from '../state.svelte';

  interface Props {
    onClose?: () => void;
  }

  let { onClose }: Props = $props();
  let isSyncing = $state(false);

  async function handleSync() {
    isSyncing = true;
    await eqamuzStore.syncToProjectDb();
    setTimeout(() => {
      isSyncing = false;
    }, 600);
  }
</script>

<div class="suite-top-bar">
  <!-- Brand & Instance ID -->
  <div class="bar-left">
    <div class="brand-group">
      <div class="pulse-dot"></div>
      <span class="brand-title">
        {eqamuzStore.state.isStandalonePlugin && eqamuzStore.activeModuleDefinition
          ? eqamuzStore.activeModuleDefinition.displayName
          : 'EQAMUZ DSP SUITE'}
      </span>
      <span class="version-tag">
        {eqamuzStore.state.isStandalonePlugin
          ? 'INDIVIDUAL INSERT // VST3-AU'
          : 'MASTER CONTAINER // VST3-AU'}
      </span>
    </div>

    <div class="v-divider"></div>

    <div class="meta-tags">
      <span class="meta-label">INST:</span>
      <span class="meta-val">{eqamuzStore.state.instanceId || '#001-DSP'}</span>
      <span class="meta-label ml">LATENCY:</span>
      <span class="meta-val lat">{eqamuzStore.telemetry.bufferLatencyMs} ms</span>
    </div>
  </div>

  <!-- A/B, Sync, Master Bypass & Close -->
  <div class="bar-right">
    <!-- Sync Button -->
    <button class="sync-btn" onclick={handleSync} title="Save plugin state directly into project document">
      <span class="icon" class:spin={isSyncing}>↻</span>
      <span>{eqamuzStore.state.syncStatus === 'SYNCED' ? 'PROJECT DOC SAVED' : 'SAVE TO PROJECT'}</span>
    </button>

    <!-- A/B State Comparer -->
    <div class="ab-manager">
      <button
        class="ab-btn"
        class:active={eqamuzStore.currentAB === 'A'}
        onclick={() => eqamuzStore.switchAB('A')}
      >
        STATE A
      </button>
      <button
        class="ab-btn"
        class:active={eqamuzStore.currentAB === 'B'}
        onclick={() => eqamuzStore.switchAB('B')}
      >
        STATE B
      </button>
      <button
        class="copy-btn"
        title="Copy state A to B"
        onclick={() => eqamuzStore.copyAtoB()}
      >
        ⎘
      </button>
    </div>

    <!-- Master Power / Bypass -->
    <button
      class="master-bypass-btn"
      class:bypassed={eqamuzStore.state.masterBypass}
      onclick={() => eqamuzStore.toggleMasterBypass()}
    >
      <span class="power-led" class:red={eqamuzStore.state.masterBypass}>⏻</span>
      <span>{eqamuzStore.state.masterBypass ? 'GLOBAL BYPASS' : 'CONTAINER ACTIVE'}</span>
    </button>

    {#if onClose}
      <button class="close-rack-btn" title="Close EQAMUZ Rack" onclick={onClose}>
        ✕
      </button>
    {/if}
  </div>
</div>

<style>
  .suite-top-bar {
    width: 100%;
    background: #0c0e15;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    user-select: none;
  }

  .bar-left, .bar-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #00f2fe;
    box-shadow: 0 0 8px rgba(0, 242, 254, 0.8);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }

  .brand-title {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: #e0fdff;
    letter-spacing: -0.01em;
  }

  .version-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    color: #849495;
    background: #191b22;
    padding: 2px 6px;
    border-radius: 2px;
  }

  .v-divider {
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.1);
  }

  .meta-tags {
    display: flex;
    align-items: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
  }

  .meta-label {
    color: #849495;
    margin-right: 4px;
  }

  .meta-label.ml {
    margin-left: 10px;
  }

  .meta-val {
    color: #e2e2ec;
  }

  .meta-val.lat {
    color: #4edea3;
  }

  .sync-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #191b22;
    border: 1px solid rgba(255, 255, 255, 0.05);
    color: #e2e2ec;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    padding: 4px 10px;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sync-btn:hover {
    background: #282a31;
    color: #00f2fe;
  }

  .sync-btn .icon {
    color: #4edea3;
    font-size: 11px;
  }

  .sync-btn .icon.spin {
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .ab-manager {
    display: flex;
    align-items: center;
    background: #191b22;
    padding: 2px;
    border-radius: 2px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .ab-btn {
    border: none;
    background: transparent;
    color: #849495;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    padding: 3px 8px;
    border-radius: 2px;
    cursor: pointer;
  }

  .ab-btn.active {
    background: #00f2fe;
    color: #00373a;
    font-weight: 700;
  }

  .copy-btn {
    border: none;
    background: transparent;
    color: #849495;
    font-size: 11px;
    padding: 2px 6px;
    cursor: pointer;
  }

  .copy-btn:hover {
    color: #e2e2ec;
  }

  .master-bypass-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #191b22;
    border: 1px solid rgba(255, 255, 255, 0.05);
    color: #e2e2ec;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 2px;
    cursor: pointer;
  }

  .master-bypass-btn.bypassed {
    background: #93000a;
    color: #ffdad6;
  }

  .power-led {
    color: #10b981;
    font-size: 11px;
  }

  .power-led.red {
    color: #ef4444;
  }

  .close-rack-btn {
    border: none;
    background: #191b22;
    color: #849495;
    width: 24px;
    height: 24px;
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 11px;
  }

  .close-rack-btn:hover {
    background: #ef4444;
    color: #fff;
  }
</style>
