<script lang="ts">
  /**
   * EQAMUZ Right Preset & Bank Manager Panel
   */
  import { eqamuzStore } from '../state.svelte';

  let showSavePrompt = $state(false);
  let newPresetName = $state('');

  const factoryCount = $derived(
    eqamuzStore.presets.filter((p) => p.moduleTarget === eqamuzStore.activePluginId && p.bankType === 'factory').length
  );
  const artistCount = $derived(
    eqamuzStore.presets.filter((p) => p.moduleTarget === eqamuzStore.activePluginId && p.bankType === 'artist').length
  );
  const userCount = $derived(
    eqamuzStore.presets.filter((p) => p.moduleTarget === eqamuzStore.activePluginId && p.bankType === 'user').length
  );

  function handleSavePreset() {
    if (!newPresetName.trim()) return;
    eqamuzStore.saveUserPreset(newPresetName.trim());
    newPresetName = '';
    showSavePrompt = false;
  }
</script>

<div class="preset-panel">
  <!-- Panel Header -->
  <div class="panel-header">
    <div class="header-title">
      <span class="folder-icon">📁</span>
      <span>PRESETS &amp; BANKS</span>
    </div>
    <div class="header-actions">
      <button class="icon-btn" title="Export Bank JSON">⬆</button>
      <button class="icon-btn" title="Import Bank JSON">⬇</button>
    </div>
  </div>

  <!-- Search Filter Field -->
  <div class="search-box">
    <span class="search-icon">🔍</span>
    <input
      type="text"
      placeholder="Filter {eqamuzStore.activePluginId} presets..."
      bind:value={eqamuzStore.presetSearchQuery}
    />
  </div>

  <!-- Bank Folders -->
  <div class="folder-tree">
    <span class="tree-heading">PRESET SOURCES</span>
    <div class="folders-list">
      <button
        class="folder-row"
        class:active={eqamuzStore.selectedBank === 'factory'}
        onclick={() => (eqamuzStore.selectedBank = eqamuzStore.selectedBank === 'factory' ? 'ALL' : 'factory')}
      >
        <span class="folder-left">📂 FACTORY BANKS</span>
        <span class="folder-count">{factoryCount}</span>
      </button>

      <button
        class="folder-row"
        class:active={eqamuzStore.selectedBank === 'artist'}
        onclick={() => (eqamuzStore.selectedBank = eqamuzStore.selectedBank === 'artist' ? 'ALL' : 'artist')}
      >
        <span class="folder-left">★ ARTIST SIGNATURES</span>
        <span class="folder-count">{artistCount}</span>
      </button>

      <button
        class="folder-row"
        class:active={eqamuzStore.selectedBank === 'user'}
        onclick={() => (eqamuzStore.selectedBank = eqamuzStore.selectedBank === 'user' ? 'ALL' : 'user')}
      >
        <span class="folder-left">💾 USER BANKS</span>
        <span class="folder-count green">{userCount}</span>
      </button>
    </div>
  </div>

  <!-- Presets List -->
  <div class="presets-container">
    <span class="tree-heading">AVAILABLE PRESETS</span>
    <div class="presets-list">
      {#each eqamuzStore.filteredPresets as preset (preset.id)}
        {@const isSelected = eqamuzStore.activePresetId === preset.id}
        <div
          class="preset-item"
          class:selected={isSelected}
          onclick={() => eqamuzStore.loadPreset(preset)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && eqamuzStore.loadPreset(preset)}
        >
          <div class="preset-left">
            <button
              class="star-btn"
              class:fav={preset.isFavorite}
              onclick={(e) => {
                e.stopPropagation();
                eqamuzStore.toggleFavoritePreset(preset.id);
              }}
            >
              ★
            </button>
            <div class="preset-texts">
              <span class="p-name">{preset.presetName}</span>
              <span class="p-desc">{preset.tags.join(', ')}</span>
            </div>
          </div>
          {#if isSelected}
            <span class="check-icon">✓</span>
          {:else}
            <span class="bank-tag">{preset.bankType.slice(0, 4).toUpperCase()}</span>
          {/if}
        </div>
      {/each}

      {#if eqamuzStore.filteredPresets.length === 0}
        <div class="empty-state">
          <span>No presets found</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Save Action -->
  <div class="save-bay">
    {#if showSavePrompt}
      <div class="save-input-row">
        <input
          type="text"
          placeholder="PRESET_NAME"
          bind:value={newPresetName}
          onkeydown={(e) => e.key === 'Enter' && handleSavePreset()}
        />
        <button class="confirm-btn" onclick={handleSavePreset}>SAVE</button>
        <button class="cancel-btn" onclick={() => (showSavePrompt = false)}>✕</button>
      </div>
    {:else}
      <button class="save-btn" onclick={() => (showSavePrompt = true)}>
        <span>💾 SAVE CURRENT AS PRESET</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .preset-panel {
    width: 290px;
    flex-shrink: 0;
    background: #0c0e15;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.4);
    border-left: 1px solid rgba(255, 255, 255, 0.05);
    user-select: none;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: #e2e2ec;
  }

  .folder-icon {
    font-size: 13px;
    color: #00f2fe;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .icon-btn {
    border: none;
    background: #191b22;
    color: #849495;
    padding: 3px 6px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 9.5px;
  }

  .icon-btn:hover {
    background: #282a31;
    color: #e2e2ec;
  }

  .search-box {
    position: relative;
    width: 100%;
  }

  .search-icon {
    position: absolute;
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 10px;
    color: #849495;
  }

  .search-box input {
    width: 100%;
    background: #191b22;
    border: 1px solid rgba(255, 255, 255, 0.05);
    color: #e2e2ec;
    font-family: 'Geist', sans-serif;
    font-size: 10px;
    padding: 6px 8px 6px 26px;
    border-radius: 3px;
    outline: none;
  }

  .search-box input:focus {
    border-color: rgba(0, 242, 254, 0.4);
  }

  .folder-tree {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tree-heading {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: #849495;
    letter-spacing: 0.08em;
  }

  .folders-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .folder-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #191b22;
    border: 1px solid transparent;
    padding: 5px 8px;
    border-radius: 2px;
    color: #e2e2ec;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    cursor: pointer;
  }

  .folder-row:hover {
    background: #282a31;
  }

  .folder-row.active {
    background: rgba(0, 242, 254, 0.12);
    color: #00f2fe;
    border-color: rgba(0, 242, 254, 0.3);
  }

  .folder-count {
    color: #849495;
    font-size: 9px;
  }

  .folder-count.green {
    color: #4edea3;
  }

  .presets-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: hidden;
  }

  .presets-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .preset-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #191b22;
    padding: 6px 8px;
    border-radius: 2px;
    border: 1px solid transparent;
    cursor: pointer;
  }

  .preset-item:hover {
    background: #282a31;
  }

  .preset-item.selected {
    background: #282a31;
    border-color: rgba(0, 242, 254, 0.4);
  }

  .preset-left {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
  }

  .star-btn {
    border: none;
    background: transparent;
    font-size: 11px;
    color: #849495;
    cursor: pointer;
    line-height: 1;
    padding: 0;
  }

  .star-btn.fav {
    color: #00f2fe;
    text-shadow: 0 0 6px #00f2fe;
  }

  .preset-texts {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .p-name {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 10px;
    font-weight: 700;
    color: #e2e2ec;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .preset-item.selected .p-name {
    color: #00f2fe;
  }

  .p-desc {
    font-family: 'Geist', sans-serif;
    font-size: 8px;
    color: #849495;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .check-icon {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #00f2fe;
    font-weight: 700;
  }

  .bank-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5px;
    color: #849495;
    background: #11131a;
    padding: 1px 4px;
    border-radius: 2px;
  }

  .empty-state {
    padding: 16px;
    text-align: center;
    font-family: 'Geist', sans-serif;
    font-size: 10px;
    color: #849495;
  }

  .save-bay {
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    padding-top: 6px;
  }

  .save-btn {
    width: 100%;
    background: #191b22;
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #00f2fe;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 700;
    padding: 8px;
    border-radius: 2px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .save-btn:hover {
    background: #282a31;
    border-color: #00f2fe;
  }

  .save-input-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .save-input-row input {
    flex: 1;
    background: #191b22;
    border: 1px solid #00f2fe;
    color: #e2e2ec;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    padding: 6px 8px;
    border-radius: 2px;
    outline: none;
  }

  .confirm-btn {
    background: #00f2fe;
    color: #00373a;
    border: none;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 700;
    padding: 6px 8px;
    border-radius: 2px;
    cursor: pointer;
  }

  .cancel-btn {
    background: #282a31;
    color: #849495;
    border: none;
    font-size: 10px;
    padding: 6px 8px;
    border-radius: 2px;
    cursor: pointer;
  }
</style>
