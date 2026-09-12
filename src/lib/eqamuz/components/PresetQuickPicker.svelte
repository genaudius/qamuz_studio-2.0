<script lang="ts">
  /**
   * EQAMUZ DSP SUITE - Preset Quick Picker Popover
   *
   * Provides non-intrusive, instant preset auditioning and selection directly
   * from the DAW Mixer and Channel Strip rack without opening the giant full-screen chassis.
   * Protects user ears and audio levels with safe entry and clear bypass indicators.
   */

  import { onMount } from 'svelte';
  import { projectStore, workspace } from '$lib/stores';
  import {
    FACTORY_PRESETS,
    eqamuzKindToModuleId,
    getModuleDefinition
  } from '$lib/eqamuz/registry';
  import type { EQAMUZModuleId, EQAMUZPreset, EQAMUZSuiteState } from '$lib/eqamuz/types';
  import { syncEqamuzToAudioEngine } from '$lib/eqamuz/dsp-bridge';
  import type { InsertKind } from '$lib/core/channel-fx';

  interface Props {
    trackId: string;
    insertId: string;
    kind: InsertKind;
    onClose: () => void;
    onOpenFullEditor?: () => void;
  }

  let {
    trackId,
    insertId,
    kind,
    onClose,
    onOpenFullEditor
  }: Props = $props();

  const moduleId: EQAMUZModuleId = $derived(
    (kind === 'eqamuz' || kind === 'eqamuz-suite')
      ? 'pro_eq'
      : (eqamuzKindToModuleId(kind) ?? 'pro_eq')
  );

  const modDef = $derived(getModuleDefinition(moduleId));

  // Access current track & insert
  const track = $derived(projectStore.project.tracks.find((t) => t.id === trackId));
  const insertSlot = $derived(track?.channelProcess?.inserts.find((ins) => ins.id === insertId));
  const eqState = $derived(insertSlot?.params?.eqamuzState as EQAMUZSuiteState | undefined);

  // Active preset tracking
  let activePresetName = $state<string>('Default');
  $effect(() => {
    if (insertSlot?.params?.activePresetName) {
      activePresetName = insertSlot.params.activePresetName;
    }
  });
  let searchQuery = $state('');
  let selectedCategory = $state<'ALL' | 'factory' | 'artist' | 'user' | 'favorites'>('ALL');
  let lastAppliedId = $state<string | null>(null);

  // Load user presets from localStorage
  let userPresets = $state<EQAMUZPreset[]>([]);
  onMount(() => {
    try {
      const stored = localStorage.getItem('eqamuz_user_presets');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) userPresets = parsed;
      }
    } catch (e) {
      console.warn('[PresetQuickPicker] Failed to load user presets:', e);
    }
  });

  // Combine factory and user presets for this module
  const modulePresets = $derived.by(() => {
    const all = [...FACTORY_PRESETS, ...userPresets].filter((p) => {
      // If Suite, allow presets for any module or specifically active module
      if (kind === 'eqamuz' || kind === 'eqamuz-suite') {
        return p.moduleTarget === moduleId;
      }
      return p.moduleTarget === moduleId;
    });

    const q = searchQuery.toLowerCase().trim();
    return all.filter((p) => {
      if (selectedCategory === 'favorites' && !p.isFavorite) return false;
      if (selectedCategory !== 'ALL' && selectedCategory !== 'favorites' && p.bankType !== selectedCategory) {
        return false;
      }
      if (q) {
        const matchName = p.presetName.toLowerCase().includes(q);
        const matchTag = p.tags.some((t) => t.toLowerCase().includes(q));
        const matchAuthor = p.author.toLowerCase().includes(q);
        return matchName || matchTag || matchAuthor;
      }
      return true;
    });
  });

  const isBypassed = $derived(
    insertSlot ? (!insertSlot.enabled || Boolean(eqState?.masterBypass)) : false
  );

  function toggleBypass() {
    if (!insertSlot) return;
    projectStore.updateChannelProcess(trackId, (cp) => {
      const slot = cp.inserts.find((i) => i.id === insertId);
      if (!slot) return;
      slot.enabled = !slot.enabled;
      if (slot.params?.eqamuzState) {
        slot.params.eqamuzState.masterBypass = !slot.enabled;
      }
    });

    if (eqState) {
      syncEqamuzToAudioEngine({
        ...eqState,
        masterBypass: !insertSlot.enabled
      });
    }
    projectStore.touchMixer();
  }

  function applyPreset(preset: EQAMUZPreset) {
    if (!insertSlot) return;

    projectStore.updateChannelProcess(trackId, (cp) => {
      const slot = cp.inserts.find((i) => i.id === insertId);
      if (!slot) return;

      if (!slot.params) slot.params = {};
      slot.params.activePresetName = preset.presetName;

      let suite: EQAMUZSuiteState = slot.params.eqamuzState;
      if (!suite) return;

      const currentMap = suite.currentABState === 'A' ? suite.stateA : suite.stateB;
      if (currentMap && preset.moduleTarget in currentMap) {
        currentMap[preset.moduleTarget] = JSON.parse(JSON.stringify(preset.parametersPayload));
      }

      slot.params.eqamuzState = suite;
    });

    activePresetName = preset.presetName;
    lastAppliedId = preset.id;

    // Immediately push to audio engine without latency or clicks
    if (eqState) {
      syncEqamuzToAudioEngine(eqState);
    }
    projectStore.touchMixer();

    // Subtle feedback timeout
    setTimeout(() => {
      if (lastAppliedId === preset.id) lastAppliedId = null;
    }, 1200);
  }

  function removeInsert() {
    projectStore.updateChannelProcess(trackId, (cp) => {
      cp.inserts = cp.inserts.filter((i) => i.id !== insertId);
    });
    projectStore.touchMixer();
    onClose();
  }

  function handleOpenFull() {
    onClose();
    if (onOpenFullEditor) {
      onOpenFullEditor();
    } else {
      workspace.openEqamuz(trackId, insertId, kind);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop overlay to dismiss on outside click -->
<div
  class="quick-picker-backdrop"
  role="presentation"
  onclick={onClose}
></div>

<!-- Popover Container -->
<div
  class="quick-picker-popover"
  role="dialog"
  aria-modal="true"
  aria-label={`Presets para ${modDef.displayName}`}
  tabindex="-1"
  onclick={(e) => e.stopPropagation()}
  onkeydown={(e) => e.stopPropagation()}
>
  <!-- Header with Module Identity -->
  <header class="picker-header">
    <div class="mod-ident">
      <span class="mod-icon">⚡</span>
      <div class="mod-titles">
        <span class="mod-name">{modDef.displayName}</span>
        <span class="mod-tag">{modDef.category} · DSP v2.4</span>
      </div>
    </div>
    <div class="header-right">
      <button
        class="bypass-btn"
        class:bypassed={isBypassed}
        title={isBypassed ? 'Plugin en bypass (Audio seguro / sin procesar)' : 'Plugin activo en audio'}
        onclick={toggleBypass}
      >
        <span class="bypass-indicator"></span>
        {isBypassed ? 'BYPASS' : 'ACTIVE'}
      </button>
      <button class="close-btn" title="Cerrar" onclick={onClose}>✕</button>
    </div>
  </header>

  <!-- Safe Entry Information Badge -->
  <div class="safe-badge">
    <span class="safe-icon">🛡️</span>
    <span class="safe-text">
      Preset activo: <strong>{activePresetName}</strong>
    </span>
  </div>

  <!-- Search & Category Filter Strip -->
  <div class="filter-strip">
    <input
      type="text"
      class="search-input"
      placeholder="Buscar preset..."
      bind:value={searchQuery}
    />
    <div class="cat-chips">
      <button
        class="chip"
        class:active={selectedCategory === 'ALL'}
        onclick={() => (selectedCategory = 'ALL')}
      >
        Todos
      </button>
      <button
        class="chip"
        class:active={selectedCategory === 'factory'}
        onclick={() => (selectedCategory = 'factory')}
      >
        Factory
      </button>
      <button
        class="chip"
        class:active={selectedCategory === 'favorites'}
        onclick={() => (selectedCategory = 'favorites')}
      >
        ★ Favs
      </button>
      <button
        class="chip"
        class:active={selectedCategory === 'user'}
        onclick={() => (selectedCategory = 'user')}
      >
        User
      </button>
    </div>
  </div>

  <!-- Presets List -->
  <div class="presets-scroll" role="listbox" tabindex="0">
    {#if modulePresets.length === 0}
      <div class="no-presets">
        <span>No se encontraron presets para este módulo.</span>
      </div>
    {:else}
      {#each modulePresets as p (p.id)}
        {@const isActive = activePresetName === p.presetName}
        {@const isJustApplied = lastAppliedId === p.id}
        <button
          type="button"
          class="preset-item"
          class:active={isActive}
          class:just-applied={isJustApplied}
          role="option"
          aria-selected={isActive}
          onclick={() => applyPreset(p)}
        >
          <div class="preset-left">
            <span class="preset-dot" class:active={isActive}></span>
            <div class="preset-text">
              <span class="preset-name">{p.presetName.replace(/_/g, ' ')}</span>
              <div class="preset-tags">
                <span class="badge-type">{p.bankType}</span>
                {#each p.tags.slice(0, 2) as tag}
                  <span class="badge-tag">{tag}</span>
                {/each}
              </div>
            </div>
          </div>
          <div class="preset-right">
            {#if isJustApplied}
              <span class="applied-badge">✓ Aplicado</span>
            {:else if isActive}
              <span class="active-badge">Activo</span>
            {/if}
          </div>
        </button>
      {/each}
    {/if}
  </div>

  <!-- Bottom Actions -->
  <footer class="picker-footer">
    <button
      type="button"
      class="action-btn remove-btn"
      title="Eliminar este insert de la pista"
      onclick={removeInsert}
    >
      🗑️ Quitar
    </button>
    <button
      type="button"
      class="action-btn full-editor-btn"
      title="Abrir interfaz completa de knobs y curvas DSP"
      onclick={handleOpenFull}
    >
      🎛️ Chasis Completo
    </button>
  </footer>
</div>

<style>
  .quick-picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(2px);
  }

  .quick-picker-popover {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 380px;
    max-width: 92vw;
    max-height: 520px;
    background: #0d0f14;
    border: 1px solid rgba(245, 158, 11, 0.4);
    box-shadow:
      0 16px 36px rgba(0, 0, 0, 0.8),
      0 0 24px rgba(245, 158, 11, 0.12);
    border-radius: 10px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #e2e8f0;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #131720;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .mod-ident {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mod-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    background: rgba(245, 158, 11, 0.18);
    color: #f59e0b;
    font-size: 13px;
    border: 1px solid rgba(245, 158, 11, 0.35);
  }

  .mod-titles {
    display: flex;
    flex-direction: column;
  }

  .mod-name {
    font-size: 13px;
    font-weight: 700;
    color: #f8fafc;
    letter-spacing: 0.3px;
  }

  .mod-tag {
    font-size: 10px;
    color: #94a3b8;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bypass-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 700;
    border-radius: 4px;
    border: 1px solid rgba(34, 197, 94, 0.4);
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bypass-btn.bypassed {
    border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  .bypass-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 6px currentColor;
  }

  .close-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 14px;
    cursor: pointer;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .safe-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: rgba(245, 158, 11, 0.08);
    border-bottom: 1px solid rgba(245, 158, 11, 0.15);
    font-size: 11px;
    color: #cbd5e1;
  }

  .safe-icon {
    font-size: 12px;
  }

  .safe-text strong {
    color: #f59e0b;
  }

  .filter-strip {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 14px;
    background: #0f1218;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .search-input {
    width: 100%;
    padding: 6px 10px;
    background: #171c26;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    color: #fff;
    font-size: 12px;
    outline: none;
  }

  .search-input:focus {
    border-color: rgba(245, 158, 11, 0.6);
  }

  .cat-chips {
    display: flex;
    gap: 4px;
    overflow-x: auto;
  }

  .chip {
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    color: #94a3b8;
    font-size: 10px;
    cursor: pointer;
    white-space: nowrap;
  }

  .chip:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  .chip.active {
    background: rgba(245, 158, 11, 0.2);
    border-color: rgba(245, 158, 11, 0.4);
    color: #f59e0b;
    font-weight: 600;
  }

  .presets-scroll {
    flex: 1;
    overflow-y: auto;
    max-height: 250px;
    padding: 6px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .no-presets {
    padding: 20px;
    text-align: center;
    color: #64748b;
    font-size: 12px;
  }

  .preset-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: #131720;
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 6px;
    color: inherit;
    cursor: pointer;
    text-align: left;
    transition: all 0.12s ease;
  }

  .preset-item:hover {
    background: #1b212e;
    border-color: rgba(245, 158, 11, 0.3);
  }

  .preset-item.active {
    background: rgba(245, 158, 11, 0.12);
    border-color: rgba(245, 158, 11, 0.5);
  }

  .preset-item.just-applied {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.6);
  }

  .preset-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .preset-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
  }

  .preset-dot.active {
    background: #f59e0b;
    box-shadow: 0 0 6px #f59e0b;
  }

  .preset-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .preset-name {
    font-size: 12px;
    font-weight: 600;
    color: #f1f5f9;
  }

  .preset-tags {
    display: flex;
    gap: 4px;
  }

  .badge-type {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    color: #94a3b8;
    text-transform: uppercase;
  }

  .badge-tag {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(245, 158, 11, 0.08);
    color: #f59e0b;
  }

  .applied-badge {
    font-size: 10px;
    color: #4ade80;
    font-weight: 700;
  }

  .active-badge {
    font-size: 10px;
    color: #f59e0b;
    font-weight: 700;
  }

  .picker-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #11141c;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    gap: 8px;
  }

  .action-btn {
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .remove-btn {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.25);
    color: #f87171;
  }

  .remove-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
  }

  .full-editor-btn {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.4);
    color: #f59e0b;
  }

  .full-editor-btn:hover {
    background: rgba(245, 158, 11, 0.25);
    border-color: rgba(245, 158, 11, 0.6);
    color: #fbbf24;
  }
</style>
