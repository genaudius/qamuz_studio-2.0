<script lang="ts">
  /**
   * V-Rack: the multi-timbral instrument rack. Tracks can point their MIDI output
   * at a rack instrument instead of their own slot, which is how the 1.0 build
   * shares one instrument across several tracks.
   */

  import Icon from './Icon.svelte';
  import MiniMeter from './MiniMeter.svelte';
  import { INSTRUMENTS, type InstrumentName } from '$lib/audio/backend';
  import { rackInstrumentSound } from '$lib/audio/instruments';
  import { engine, projectStore, workspace } from '$lib/stores';

  const instruments = $derived(projectStore.project.vRack.instruments);

  let editingID = $state<string | null>(null);
  let nameDraft = $state('');

  function startRename(id: string, current: string) {
    editingID = id;
    nameDraft = current;
  }

  function commitRename() {
    if (editingID) {
      const name = nameDraft.trim();
      if (name) projectStore.renameRackInstrument(editingID, name);
    }
    editingID = null;
  }

  /** How many tracks currently route to an instrument. */
  function routedTracks(id: string): number {
    return projectStore.project.tracks.filter(
      (t) => t.midiOutput?.kind === 'rackInstrument' && t.midiOutput.id === id
    ).length;
  }
</script>

<div class="rack">
<div class="panel-title">
  <Icon name="keyboard" size={12} />
  <span>V-Rack</span>
  <button
    class="icon-btn add"
    title="Add instrument"
    onclick={() => projectStore.addRackInstrument()}
  >
    <Icon name="plus" size={12} />
  </button>
</div>

<div class="list">
  <button
    class="slot plugin"
    class:on={workspace.module === 'mastering'}
    onclick={() => workspace.open('mastering')}
  >
    <div class="slot-head">
      <span class="mark">Q</span>
      <span class="slot-name">QAMUZ MASTER PRO</span>
      <span class="led" class:on={workspace.module === 'mastering'}></span>
    </div>
    <span class="routing">Insert · mastering</span>
  </button>

  {#if instruments.length === 0}
    <p class="empty">
      No instruments. Add one, then point a MIDI track's output at it from the inspector.
    </p>
  {/if}

  {#each instruments as instrument (instrument.id)}
    <div class="slot">
      <div class="slot-head">
        {#if editingID === instrument.id}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            bind:value={nameDraft}
            autofocus
            onblur={commitRename}
            onkeydown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') editingID = null;
            }}
          />
        {:else}
          <span
            class="slot-name"
            role="button"
            tabindex="0"
            title="Double click to rename"
            ondblclick={() => startRename(instrument.id, instrument.name)}
            onkeydown={(e) => e.key === 'F2' && startRename(instrument.id, instrument.name)}
          >
            {instrument.name}
          </span>
        {/if}

        <button
          class="icon-btn small"
          title="Remove"
          onclick={() => projectStore.removeRackInstrument(instrument.id)}
        >
          <Icon name="close" size={10} />
        </button>
      </div>

      <select
        value={rackInstrumentSound(instrument)}
        onchange={(e) =>
          projectStore.setRackInstrumentSound(
            instrument.id,
            e.currentTarget.value as InstrumentName
          )}
      >
        {#each INSTRUMENTS as sound (sound.id)}
          <option value={sound.id}>{sound.label}</option>
        {/each}
      </select>

      <div class="slot-controls">
        <button
          class="mute"
          class:on={instrument.isMuted}
          title="Mute"
          onclick={() => projectStore.toggleRackInstrumentMute(instrument.id)}
        >
          M
        </button>

        <input
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={instrument.volume}
          oninput={(e) =>
            projectStore.setRackInstrumentVolume(instrument.id, Number(e.currentTarget.value))}
          onpointerdown={() => projectStore.beginInteraction('Change Instrument Volume')}
          onpointerup={() => projectStore.endInteraction()}
        />

        <MiniMeter level={engine.meters[instrument.id]?.peak ?? 0} />
      </div>

      <span class="routing">
        {routedTracks(instrument.id)} track{routedTracks(instrument.id) === 1 ? '' : 's'} routed
      </span>
    </div>
  {/each}
</div>
</div>

<style>
  .rack {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .add {
    margin-left: auto;
    width: 20px;
    height: 20px;
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty {
    margin: 12px 4px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-tertiary);
  }

  .slot {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border-radius: 6px;
    background: var(--bg-control);
    border: 1px solid var(--stroke);
  }

  .slot.plugin {
    text-align: left;
    cursor: pointer;
  }

  .slot.plugin:hover,
  .slot.plugin.on {
    border-color: var(--accent);
    background: var(--accent-faint);
  }

  .mark {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: var(--accent-strong);
    color: var(--on-primary);
    font-size: 10px;
    font-weight: 800;
    display: grid;
    place-items: center;
    flex: none;
  }

  .led {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--bg-elevated);
    flex: none;
  }

  .led.on {
    background: var(--play);
    box-shadow: 0 0 8px var(--play);
  }

  .slot-head {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .slot-name {
    flex: 1;
    font-size: 11px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: text;
  }

  .slot-head input {
    flex: 1;
    font-size: 11px;
  }

  .icon-btn.small {
    width: 18px;
    height: 18px;
  }

  .slot-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .mute {
    width: 20px;
    height: 18px;
    border-radius: 3px;
    background: var(--bg-inset);
    color: var(--text-tertiary);
    font-size: 9px;
    font-weight: 700;
  }

  .mute.on {
    background: rgba(255, 180, 170, 0.24);
    color: var(--mute);
  }

  .slot-controls input[type='range'] {
    flex: 1;
    min-width: 0;
    padding: 0;
    background: transparent;
    border: none;
    accent-color: var(--accent);
  }

  .routing {
    font-size: 9px;
    color: var(--text-tertiary);
  }

  select {
    font-size: 11px;
  }
</style>
