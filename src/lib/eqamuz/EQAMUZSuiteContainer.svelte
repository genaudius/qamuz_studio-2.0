<script lang="ts">
  /**
   * EQAMUZ DSP SUITE v2.4.0-PRO
   * Precision Studio Audio Rack Container
   */
  import { onMount, onDestroy } from 'svelte';
  import { eqamuzStore } from './state.svelte';
  import SuiteTopHeader from './components/SuiteTopHeader.svelte';
  import ModuleSlotMatrix from './components/ModuleSlotMatrix.svelte';
  import PresetAndBankManager from './components/PresetAndBankManager.svelte';
  import SuiteBottomTelemetryBar from './components/SuiteBottomTelemetryBar.svelte';

  // 10 Independent Plugin Modules
  import VocalModule from './modules/VocalModule.svelte';
  import LeadModule from './modules/LeadModule.svelte';
  import ElectricModule from './modules/ElectricModule.svelte';
  import ProEqModule from './modules/ProEqModule.svelte';
  import CompModule from './modules/CompModule.svelte';
  import SaturatorModule from './modules/SaturatorModule.svelte';
  import DelayModule from './modules/DelayModule.svelte';
  import ReverbModule from './modules/ReverbModule.svelte';
  import ImagerModule from './modules/ImagerModule.svelte';
  import LimiterModule from './modules/LimiterModule.svelte';

  interface Props {
    trackId?: string;
    insertId?: string;
    moduleKind?: string;
    onClose?: () => void;
  }

  let { trackId = '', insertId = '', moduleKind = '', onClose }: Props = $props();
  let showRackMatrix = $state(false);

  onMount(() => {
    eqamuzStore.startTelemetry();
    if (trackId && insertId) {
      eqamuzStore.bindToInsert(trackId, insertId, moduleKind as any);
    } else if (trackId) {
      eqamuzStore.bindToTrack(trackId);
    }
  });

  onDestroy(() => {
    eqamuzStore.stopTelemetry();
  });

  const activeId = $derived(eqamuzStore.activePluginId);
  const isStandalone = $derived(eqamuzStore.state.isStandalonePlugin);
</script>

<div class="eqamuz-suite-container" class:is-standalone={isStandalone}>
  <!-- Top Chassis Bar -->
  <SuiteTopHeader {onClose} />

  {#if isStandalone}
    <div class="standalone-banner">
      <span class="banner-pill">STANDALONE INSERT</span>
      <span class="banner-hint">Direct Track Insert: {eqamuzStore.activeModuleDefinition?.displayName ?? 'DSP Module'}</span>
      <button class="rack-toggle-btn" onclick={() => (showRackMatrix = !showRackMatrix)}>
        {showRackMatrix ? '◀ HIDE RACK' : '▶ SHOW RACK MATRIX'}
      </button>
    </div>
  {/if}

  <!-- Main Multi-Pane Body -->
  <div class="suite-main-body">
    <!-- Left: Module Slot Matrix (10 Plugins) -->
    {#if !isStandalone || showRackMatrix}
      <ModuleSlotMatrix />
    {/if}

    <!-- Center: Active Plugin Dynamic Stage -->
    <main class="active-plugin-stage">
      {#if activeId === 'vocal'}
        <VocalModule />
      {:else if activeId === 'lead'}
        <LeadModule />
      {:else if activeId === 'electric'}
        <ElectricModule />
      {:else if activeId === 'pro_eq'}
        <ProEqModule />
      {:else if activeId === 'comp'}
        <CompModule />
      {:else if activeId === 'saturator'}
        <SaturatorModule />
      {:else if activeId === 'delay'}
        <DelayModule />
      {:else if activeId === 'reverb'}
        <ReverbModule />
      {:else if activeId === 'imager'}
        <ImagerModule />
      {:else if activeId === 'limiter'}
        <LimiterModule />
      {/if}
    </main>

    <!-- Right: Preset & Bank Manager -->
    <PresetAndBankManager />
  </div>

  <!-- Bottom Telemetry & Status Hardware Bar -->
  <SuiteBottomTelemetryBar />
</div>

<style>
  .eqamuz-suite-container {
    width: 100%;
    height: 100%;
    min-height: 540px;
    background: #11131a;
    display: flex;
    flex-direction: column;
    color: #e2e2ec;
    font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
    user-select: none;
    overflow: hidden;
    position: relative;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .suite-main-body {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
    background: #11131a;
  }

  .active-plugin-stage {
    flex: 1;
    padding: 12px;
    overflow-y: auto;
    background: #11131a;
    display: flex;
    flex-direction: column;
  }

  .standalone-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px;
    background: rgba(0, 240, 255, 0.05);
    border-bottom: 1px solid rgba(0, 240, 255, 0.15);
    font-size: 11px;
  }

  .banner-pill {
    background: rgba(0, 240, 255, 0.2);
    color: #00f0ff;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .banner-hint {
    color: #8e90a6;
    font-weight: 500;
  }

  .rack-toggle-btn {
    background: #1a1c28;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #e2e2ec;
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.15s ease;
  }

  .rack-toggle-btn:hover {
    background: #25283a;
    border-color: #00f0ff;
    color: #00f0ff;
  }
</style>
