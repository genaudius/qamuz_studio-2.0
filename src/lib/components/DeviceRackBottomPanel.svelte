<script lang="ts">
  /**
   * QAMUZ Studio 2.0 — Ableton-Style Bottom Device Rack (Device View)
   * Displays the track's serial insert chain and the active plugin's complete interactive controls
   * (knobs, curves, meters, sliders) directly at the bottom dock without floating windows.
   */
  import { onMount, onDestroy } from 'svelte';
  import { projectStore, workspace } from '$lib/stores';
  import { eqamuzStore } from '$lib/eqamuz/state.svelte';
  import {
    INSERT_CATALOG,
    makeInsert,
    type InsertKind,
    type InsertSlot
  } from '$lib/core/channel-fx';
  import { FACTORY_PRESETS } from '$lib/eqamuz/registry';
  import type { EQAMUZModuleId, EQAMUZPreset } from '$lib/eqamuz/types';

  const INSERT_CATEGORIES = [
    'EQ & Dynamics',
    'Character & Tone',
    'Time & Space',
    'Studio Suite',
    'Classic FX'
  ] as const;

  function insertName(kind: string): string {
    if (kind === 'eqamuz') return '⚡ SUITE';
    if (kind.startsWith('eqamuz-')) return `⚡ ${kind.replace('eqamuz-', '').toUpperCase()}`;
    return kind;
  }

  // Individual Module Components
  import ProEqModule from '$lib/eqamuz/modules/ProEqModule.svelte';
  import CompModule from '$lib/eqamuz/modules/CompModule.svelte';
  import SaturatorModule from '$lib/eqamuz/modules/SaturatorModule.svelte';
  import DelayModule from '$lib/eqamuz/modules/DelayModule.svelte';
  import ReverbModule from '$lib/eqamuz/modules/ReverbModule.svelte';
  import VocalModule from '$lib/eqamuz/modules/VocalModule.svelte';
  import LeadModule from '$lib/eqamuz/modules/LeadModule.svelte';
  import ElectricModule from '$lib/eqamuz/modules/ElectricModule.svelte';
  import ImagerModule from '$lib/eqamuz/modules/ImagerModule.svelte';
  import LimiterModule from '$lib/eqamuz/modules/LimiterModule.svelte';

  // Current track
  const track = $derived(
    projectStore.project.tracks.find((t) => t.id === workspace.eqamuzTrackId) ??
      projectStore.selectedTrack ??
      projectStore.project.tracks[0]
  );

  const inserts = $derived<InsertSlot[]>(track?.channelProcess?.inserts ?? []);

  // Active insert selection
  let selectedInsertId = $state<string | null>(null);
  let addMenuOpen = $state(false);
  let presetMenuOpen = $state(false);

  // Derive target insert
  const activeInsert = $derived.by(() => {
    if (!inserts.length) return null;
    if (selectedInsertId) {
      const found = inserts.find((i) => i.id === selectedInsertId);
      if (found) return found;
    }
    if (workspace.eqamuzTarget?.insertId) {
      const target = inserts.find((i) => i.id === workspace.eqamuzTarget?.insertId);
      if (target) return target;
    }
    return inserts[0];
  });

  // Map insert kind to EQAMUZ Module ID
  function kindToModuleId(kind: string): EQAMUZModuleId {
    if (kind === 'eqamuz-comp' || kind === 'eqamuz_comp') return 'comp';
    if (kind === 'eqamuz-saturator' || kind === 'eqamuz_saturator') return 'saturator';
    if (kind === 'eqamuz-delay' || kind === 'eqamuz_delay') return 'delay';
    if (kind === 'eqamuz-reverb' || kind === 'eqamuz_reverb') return 'reverb';
    if (kind === 'eqamuz-vocal' || kind === 'eqamuz_vocal') return 'vocal';
    if (kind === 'eqamuz-lead' || kind === 'eqamuz_lead') return 'lead';
    if (kind === 'eqamuz-electric' || kind === 'eqamuz_electric') return 'electric';
    if (kind === 'eqamuz-imager' || kind === 'eqamuz_imager') return 'imager';
    if (kind === 'eqamuz-limiter' || kind === 'eqamuz_limiter') return 'limiter';
    return 'pro_eq';
  }

  // Bind to active insert whenever track or activeInsert changes
  $effect(() => {
    if (track && activeInsert) {
      const modId = kindToModuleId(activeInsert.kind);
      eqamuzStore.bindToInsert(track.id, activeInsert.id, modId);
      eqamuzStore.setActiveModule(modId);
      if (activeInsert.params?.activePresetName) {
        const p = FACTORY_PRESETS.find(
          (x) => x.presetName === activeInsert.params?.activePresetName
        );
        if (p) eqamuzStore.activePresetId = p.id;
      }
    }
  });

  onMount(() => {
    eqamuzStore.startTelemetry();
    if (inserts.length > 0 && !selectedInsertId) {
      selectedInsertId = inserts[0].id;
    }
  });

  onDestroy(() => {
    eqamuzStore.stopTelemetry();
  });

  function selectInsert(ins: InsertSlot) {
    selectedInsertId = ins.id;
    if (track) {
      const modId = kindToModuleId(ins.kind);
      workspace.openEqamuz(track.id, ins.id, modId);
    }
  }

  function toggleInsertBypass(ins: InsertSlot, e: MouseEvent) {
    e.stopPropagation();
    if (!track) return;
    projectStore.updateChannelProcess(track.id, (cp) => {
      const target = cp.inserts.find((i) => i.id === ins.id);
      if (target) target.enabled = !target.enabled;
    });
  }

  function removeInsert(insId: string, e: MouseEvent) {
    e.stopPropagation();
    if (!track) return;
    projectStore.updateChannelProcess(track.id, (cp) => {
      cp.inserts = cp.inserts.filter((i) => i.id !== insId);
    });
    if (selectedInsertId === insId) {
      selectedInsertId = inserts[0]?.id ?? null;
    }
  }

  function addInsert(kind: InsertKind) {
    if (!track) return;
    addMenuOpen = false;
    projectStore.updateChannelProcess(track.id, (cp) => {
      if (cp.inserts.length >= 4) return;
      const newSlot = makeInsert(kind);
      if (!newSlot) return;
      cp.inserts.push(newSlot);
      selectedInsertId = newSlot.id;
      const modId = kindToModuleId(kind);
      workspace.openEqamuz(track.id, newSlot.id, modId);
    });
  }

  const activeModuleTarget = $derived(
    activeInsert ? kindToModuleId(activeInsert.kind) : 'pro_eq'
  );

  const modulePresets = $derived(
    FACTORY_PRESETS.filter((p) => p.moduleTarget === activeModuleTarget)
  );

  function applyPreset(preset: EQAMUZPreset) {
    eqamuzStore.loadPreset(preset);
    if (activeInsert && activeInsert.params) {
      activeInsert.params.activePresetName = preset.presetName;
    }
    presetMenuOpen = false;
  }
</script>

<div class="device-dock-container">
  <!-- Dock Top Bar / Ableton-Style Tabs -->
  <header class="dock-header">
    <div class="dock-tabs">
      <button
        type="button"
        class="dock-tab"
        onclick={() => {
          workspace.open('mixer');
          projectStore.bottomPanel = 'mixer';
        }}
      >
        <span class="tab-icon">🎛️</span>
        <span class="tab-label">Mezclador</span>
      </button>

      <button
        type="button"
        class="dock-tab active"
        onclick={() => {
          workspace.open('device');
          projectStore.bottomPanel = 'device';
        }}
      >
        <span class="tab-icon">⚡</span>
        <span class="tab-label">Cadena de Plugins</span>
        {#if track}
          <span class="track-badge">{track.name}</span>
        {/if}
      </button>

      <button
        type="button"
        class="dock-tab"
        onclick={() => {
          workspace.open('pianoRoll');
          projectStore.bottomPanel = 'pianoRoll';
        }}
      >
        <span class="tab-icon">🎹</span>
        <span class="tab-label">Piano Roll</span>
      </button>
    </div>

    <!-- Track Selector & Close -->
    <div class="dock-actions">
      {#if track}
        <div class="track-selector">
          <span class="sel-label">Pista:</span>
          <select
            value={track.id}
            onchange={(e) => {
              const id = e.currentTarget.value;
              projectStore.selectTrack(id);
              workspace.openEqamuz(id);
              selectedInsertId = null;
            }}
          >
            {#each projectStore.project.tracks as t}
              <option value={t.id}>{t.name} ({t.type})</option>
            {/each}
          </select>
        </div>
      {/if}

      <button
        type="button"
        class="dock-close-btn"
        title="Cerrar panel inferior"
        onclick={() => {
          workspace.open('arrange');
          projectStore.bottomPanel = 'none';
        }}
      >
        ✕
      </button>
    </div>
  </header>

  <!-- Horizontal Device Chain Strip (Ableton Rack) -->
  <div class="device-chain-strip">
    <div class="chain-lead">
      <span class="chain-label">CADENA SERIAL</span>
      <span class="chain-count">{inserts.length}/4</span>
    </div>

    <div class="chain-scroll">
      {#each inserts as ins, idx}
        {@const isSelected = activeInsert?.id === ins.id}
        <div
          class="device-tile"
          class:selected={isSelected}
          class:bypassed={!ins.enabled}
          onclick={() => selectInsert(ins)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && selectInsert(ins)}
        >
          <div class="tile-header">
            <button
              type="button"
              class="tile-power-led"
              class:on={ins.enabled}
              title={ins.enabled ? 'Bypass' : 'Activar'}
              onclick={(e) => toggleInsertBypass(ins, e)}
            ></button>
            <span class="tile-index">{idx + 1}</span>
            <span class="tile-name">{insertName(ins.kind)}</span>
            <button
              type="button"
              class="tile-remove-btn"
              title="Eliminar de la cadena"
              onclick={(e) => removeInsert(ins.id, e)}
            >
              ✕
            </button>
          </div>

          <div class="tile-meta">
            <span class="tile-preset">
              {ins.params?.activePresetName ?? 'Default'}
            </span>
          </div>
        </div>
      {/each}

      {#if inserts.length < 4}
        <div class="add-device-wrapper">
          <button
            type="button"
            class="add-device-btn"
            onclick={() => (addMenuOpen = !addMenuOpen)}
          >
            + AGREGAR PLUGIN
          </button>

          {#if addMenuOpen}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="add-dropdown-menu"
              role="menu"
              tabindex="-1"
              onclick={(e) => e.stopPropagation()}
            >
              <div class="dropdown-header">CATÁLOGO DE PROCESADORES</div>
              <div class="dropdown-scroll">
                {#each INSERT_CATEGORIES as cat}
                  {@const items = INSERT_CATALOG.filter((i) => i.ready && i.category === cat)}
                  {#if items.length > 0}
                    <div class="cat-title">{cat}</div>
                    {#each items as item}
                      <button
                        type="button"
                        class="menu-btn"
                        onclick={() => addInsert(item.kind)}
                      >
                        <span class="menu-icon">⚡</span>
                        <span class="menu-text">{item.label}</span>
                      </button>
                    {/each}
                  {/if}
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Active Device Stage (Interactive Controls) -->
  <main class="active-device-stage">
    {#if activeInsert}
      <!-- Module Top Utility Bar -->
      <div class="module-utility-bar">
        <div class="util-left">
          <span class="module-code">EQAMUZ // {activeModuleTarget.toUpperCase()}</span>
          <span class="module-title-badge">{insertName(activeInsert.kind)}</span>
        </div>

        <div class="util-right">
          <!-- Preset Selector -->
          <div class="preset-dropdown-wrap">
            <button
              type="button"
              class="preset-trigger-btn"
              onclick={() => (presetMenuOpen = !presetMenuOpen)}
            >
              <span class="preset-icon">📋</span>
              <span class="preset-name">
                {activeInsert.params?.activePresetName ?? 'Default'}
              </span>
              <span class="caret">▼</span>
            </button>

            {#if presetMenuOpen}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="preset-pop-menu"
                role="menu"
                tabindex="-1"
                onclick={(e) => e.stopPropagation()}
              >
                <div class="pop-header">PRESETS DE FÁBRICA</div>
                <div class="pop-scroll">
                  {#each modulePresets as p}
                    <button
                      type="button"
                      class="preset-option-btn"
                      class:active={activeInsert.params?.activePresetName === p.presetName}
                      onclick={() => applyPreset(p)}
                    >
                      <span class="opt-name">{p.presetName.replace(/_/g, ' ')}</span>
                      <span class="opt-tags">{p.tags.slice(0, 2).join(' · ')}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>

          <!-- A/B Switch -->
          <div class="ab-switch">
            <button
              type="button"
              class="ab-btn"
              class:on={eqamuzStore.currentAB === 'A'}
              onclick={() => eqamuzStore.switchAB('A')}
            >
              A
            </button>
            <button
              type="button"
              class="ab-btn"
              class:on={eqamuzStore.currentAB === 'B'}
              onclick={() => eqamuzStore.switchAB('B')}
            >
              B
            </button>
          </div>

          <!-- Active/Bypass -->
          <button
            type="button"
            class="stage-power-btn"
            class:active={activeInsert.enabled}
            onclick={(e) => toggleInsertBypass(activeInsert, e)}
          >
            {activeInsert.enabled ? 'ACTIVE' : 'BYPASS'}
          </button>
        </div>
      </div>

      <!-- Render Selected Plugin Module -->
      <div class="module-viewport">
        {#if activeModuleTarget === 'pro_eq'}
          <ProEqModule />
        {:else if activeModuleTarget === 'comp'}
          <CompModule />
        {:else if activeModuleTarget === 'saturator'}
          <SaturatorModule />
        {:else if activeModuleTarget === 'delay'}
          <DelayModule />
        {:else if activeModuleTarget === 'reverb'}
          <ReverbModule />
        {:else if activeModuleTarget === 'vocal'}
          <VocalModule />
        {:else if activeModuleTarget === 'lead'}
          <LeadModule />
        {:else if activeModuleTarget === 'electric'}
          <ElectricModule />
        {:else if activeModuleTarget === 'imager'}
          <ImagerModule />
        {:else if activeModuleTarget === 'limiter'}
          <LimiterModule />
        {:else}
          <ProEqModule />
        {/if}
      </div>
    {:else}
      <!-- Empty Track State -->
      <div class="empty-chain-stage">
        <div class="empty-card">
          <div class="empty-icon">⚡</div>
          <h3>Cadena de Plugins Vacía</h3>
          <p>
            Esta pista ({track?.name ?? 'Pista'}) no tiene procesadores en su cadena serial.
            Agrega un ecualizador, compresor o efecto para comenzar a manipular el sonido directamente aquí debajo.
          </p>
          <div class="empty-actions">
            <button
              type="button"
              class="empty-add-btn"
              onclick={() => (addMenuOpen = true)}
            >
              + AGREGAR PLUGIN A LA PISTA
            </button>
          </div>
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  .device-dock-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #0d0f14;
    color: #e2e2ec;
    font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
    user-select: none;
    overflow: hidden;
  }

  /* Dock Top Bar */
  .dock-header {
    height: 36px;
    background: #14161f;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    flex-shrink: 0;
  }

  .dock-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .dock-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 4px;
    background: transparent;
    border: 1px solid transparent;
    color: #8e92a4;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .dock-tab:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.04);
  }

  .dock-tab.active {
    background: rgba(0, 242, 254, 0.12);
    border-color: rgba(0, 242, 254, 0.35);
    color: #00f2fe;
  }

  .track-badge {
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(0, 242, 254, 0.2);
    color: #00f2fe;
    font-size: 10px;
    font-weight: 700;
  }

  .dock-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .track-selector {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #8e92a4;
  }

  .track-selector select {
    background: #1c1f2b;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #ffffff;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 11px;
    cursor: pointer;
    outline: none;
  }

  .dock-close-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    background: transparent;
    border: 1px solid transparent;
    color: #8e92a4;
    font-size: 12px;
    cursor: pointer;
  }

  .dock-close-btn:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Horizontal Device Chain Strip (Ableton Rack) */
  .device-chain-strip {
    height: 52px;
    background: #11131a;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 12px;
    flex-shrink: 0;
  }

  .chain-lead {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .chain-label {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #5b6074;
  }

  .chain-count {
    font-size: 11px;
    font-weight: 700;
    color: #00f2fe;
  }

  .chain-scroll {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    flex: 1;
    height: 100%;
    padding-right: 12px;
  }

  .device-tile {
    min-width: 140px;
    height: 38px;
    background: #191c26;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 3px 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .device-tile:hover {
    border-color: rgba(255, 255, 255, 0.2);
    background: #1f2330;
  }

  .device-tile.selected {
    border-color: #00f2fe;
    background: rgba(0, 242, 254, 0.08);
    box-shadow: 0 0 10px rgba(0, 242, 254, 0.2);
  }

  .device-tile.bypassed {
    opacity: 0.6;
    filter: grayscale(0.5);
  }

  .tile-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tile-power-led {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #444754;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: all 0.15s ease;
  }

  .tile-power-led.on {
    background: #00f2fe;
    box-shadow: 0 0 6px #00f2fe;
  }

  .tile-index {
    font-size: 9px;
    font-weight: 800;
    color: #8e92a4;
  }

  .tile-name {
    font-size: 11px;
    font-weight: 700;
    color: #e2e2ec;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .tile-remove-btn {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    background: transparent;
    border: none;
    color: #6a6f82;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tile-remove-btn:hover {
    color: #ff4757;
    background: rgba(255, 71, 87, 0.15);
  }

  .tile-meta {
    display: flex;
    align-items: center;
    margin-top: 1px;
  }

  .tile-preset {
    font-size: 9px;
    color: #8e92a4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .add-device-wrapper {
    position: relative;
  }

  .add-device-btn {
    height: 38px;
    padding: 0 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px dashed rgba(255, 255, 255, 0.15);
    border-radius: 5px;
    color: #8e92a4;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .add-device-btn:hover {
    color: #00f2fe;
    border-color: #00f2fe;
    background: rgba(0, 242, 254, 0.06);
  }

  .add-dropdown-menu {
    position: absolute;
    top: 44px;
    left: 0;
    width: 240px;
    background: #141722;
    border: 1px solid rgba(0, 242, 254, 0.3);
    border-radius: 6px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.8);
    z-index: 99999;
    padding: 8px;
  }

  .dropdown-header {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #00f2fe;
    padding-bottom: 6px;
    margin-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .dropdown-scroll {
    max-height: 240px;
    overflow-y: auto;
  }

  .cat-title {
    font-size: 8.5px;
    font-weight: 800;
    color: #5f657a;
    padding: 6px 4px 2px;
  }

  .menu-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: #e2e2ec;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
  }

  .menu-btn:hover {
    background: rgba(0, 242, 254, 0.15);
    color: #00f2fe;
  }

  .menu-icon {
    color: #00f2fe;
    font-size: 11px;
  }

  /* Active Device Stage */
  .active-device-stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    background: #0d0f14;
  }

  .module-utility-bar {
    height: 38px;
    background: #141620;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    flex-shrink: 0;
  }

  .util-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .module-code {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #8e92a4;
  }

  .module-title-badge {
    padding: 2px 8px;
    border-radius: 3px;
    background: rgba(0, 242, 254, 0.15);
    color: #00f2fe;
    font-size: 10px;
    font-weight: 700;
  }

  .util-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .preset-dropdown-wrap {
    position: relative;
  }

  .preset-trigger-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: #1d212e;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: #e2e2ec;
    font-size: 11px;
    cursor: pointer;
  }

  .preset-trigger-btn:hover {
    border-color: #00f2fe;
  }

  .preset-pop-menu {
    position: absolute;
    top: 32px;
    right: 0;
    width: 220px;
    background: #141722;
    border: 1px solid rgba(0, 242, 254, 0.3);
    border-radius: 6px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.8);
    z-index: 99999;
    padding: 8px;
  }

  .pop-header {
    font-size: 9px;
    font-weight: 800;
    color: #00f2fe;
    padding-bottom: 4px;
    margin-bottom: 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .pop-scroll {
    max-height: 220px;
    overflow-y: auto;
  }

  .preset-option-btn {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 6px 8px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: #e2e2ec;
    cursor: pointer;
  }

  .preset-option-btn:hover {
    background: rgba(0, 242, 254, 0.15);
    color: #00f2fe;
  }

  .preset-option-btn.active {
    background: rgba(0, 242, 254, 0.2);
    color: #00f2fe;
  }

  .opt-name {
    font-size: 11px;
    font-weight: 700;
  }

  .opt-tags {
    font-size: 9px;
    color: #7b8196;
  }

  .ab-switch {
    display: flex;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .ab-btn {
    padding: 3px 8px;
    background: #1a1d28;
    border: none;
    color: #7b8196;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
  }

  .ab-btn.on {
    background: #00f2fe;
    color: #000000;
  }

  .stage-power-btn {
    padding: 4px 10px;
    border-radius: 4px;
    background: #2a2d3b;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #8e92a4;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
  }

  .stage-power-btn.active {
    background: rgba(0, 242, 254, 0.15);
    border-color: #00f2fe;
    color: #00f2fe;
  }

  .module-viewport {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
  }

  /* Empty State */
  .empty-chain-stage {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
  }

  .empty-card {
    max-width: 440px;
    text-align: center;
    background: #141722;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 24px 20px;
  }

  .empty-icon {
    font-size: 32px;
    color: #00f2fe;
    margin-bottom: 8px;
  }

  .empty-card h3 {
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
    margin: 0 0 8px;
  }

  .empty-card p {
    font-size: 12px;
    color: #8e92a4;
    line-height: 1.5;
    margin: 0 0 16px;
  }

  .empty-add-btn {
    padding: 8px 18px;
    border-radius: 5px;
    background: #00f2fe;
    color: #000000;
    border: none;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
    letter-spacing: 0.04em;
    transition: all 0.15s ease;
  }

  .empty-add-btn:hover {
    background: #4ef6ff;
    box-shadow: 0 0 12px rgba(0, 242, 254, 0.5);
  }
</style>
