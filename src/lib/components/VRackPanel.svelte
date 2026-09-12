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
  import { makeInsert, type InsertKind } from '$lib/core/channel-fx';
  import { engine, projectStore, workspace } from '$lib/stores';
  import PresetQuickPicker from '$lib/eqamuz/components/PresetQuickPicker.svelte';

  const instruments = $derived(projectStore.project.vRack.instruments);

  let editingID = $state<string | null>(null);
  let nameDraft = $state('');
  let quickPickerState = $state<{
    trackId: string;
    insertId: string;
    kind: InsertKind;
  } | null>(null);

  const targetTrack = $derived(
    projectStore.project.tracks.find((t) => t.id === projectStore.selectedTrackID) ??
      projectStore.project.tracks[0]
  );

  const targetEqamuzInsert = $derived(
    targetTrack?.channelProcess?.inserts.find(
      (ins) => ins.kind === 'eqamuz' || ins.kind.startsWith('eqamuz-')
    )
  );

  function openRackPresets() {
    if (!targetTrack) return;
    if (targetEqamuzInsert) {
      quickPickerState = {
        trackId: targetTrack.id,
        insertId: targetEqamuzInsert.id,
        kind: targetEqamuzInsert.kind
      };
    } else {
      const slot = makeInsert('eqamuz-pro-eq');
      if (!slot) return;
      projectStore.updateChannelProcess(targetTrack.id, (cp) => {
        if (cp.inserts.length >= 4) return;
        cp.inserts = [...cp.inserts, slot];
      });
      projectStore.touchMixer();
      quickPickerState = {
        trackId: targetTrack.id,
        insertId: slot.id,
        kind: 'eqamuz-pro-eq'
      };
    }
  }

  function openRackEditor() {
    if (!targetTrack) return;
    if (targetEqamuzInsert) {
      workspace.openEqamuz(targetTrack.id, targetEqamuzInsert.id, targetEqamuzInsert.kind);
    } else {
      workspace.openEqamuz(targetTrack.id);
    }
  }

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

  <div class="slot plugin eqamuz-rack-slot" class:on={workspace.isEqamuzOpen}>
    <div class="slot-head">
      <span class="mark eqamuz-mark">⚡</span>
      <span class="slot-name">EQAMUZ DSP RACK</span>
      <span class="led" class:on={Boolean(targetEqamuzInsert?.enabled)}></span>
    </div>
    <div class="rack-slot-btns">
      <button
        type="button"
        class="rack-btn presets"
        title="Abrir selector de presets seguro"
        onclick={openRackPresets}
      >
        <Icon name="sliders" size={11} />
        <span>Presets</span>
      </button>
      <button
        type="button"
        class="rack-btn editor"
        title="Abrir editor completo"
        onclick={openRackEditor}
      >
        <span>Editor</span>
      </button>
    </div>
    <span class="routing">
      {targetTrack ? `Pista: ${targetTrack.name}` : 'Multi-Insert DSP'}
    </span>
  </div>

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

{#if quickPickerState}
  <PresetQuickPicker
    trackId={quickPickerState.trackId}
    insertId={quickPickerState.insertId}
    kind={quickPickerState.kind}
    onClose={() => (quickPickerState = null)}
    onOpenFullEditor={() => {
      const s = quickPickerState;
      quickPickerState = null;
      if (s) workspace.openEqamuz(s.trackId, s.insertId, s.kind);
    }}
  />
{/if}

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

  .eqamuz-rack-slot {
    border-color: rgba(245, 158, 11, 0.3);
    background: rgba(245, 158, 11, 0.04);
  }

  .eqamuz-rack-slot:hover,
  .eqamuz-rack-slot.on {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
  }

  .eqamuz-mark {
    background: rgba(245, 158, 11, 0.2);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.4);
  }

  .rack-slot-btns {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }

  .rack-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .rack-btn.presets {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.4);
    color: #f59e0b;
  }

  .rack-btn.presets:hover {
    background: rgba(245, 158, 11, 0.28);
    border-color: rgba(245, 158, 11, 0.6);
  }

  .rack-btn.editor {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #cbd5e1;
  }

  .rack-btn.editor:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }
</style>
