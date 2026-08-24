<script lang="ts">
  /**
   * Track header. Port of DAWUI/Views/Timeline/TrackHeaderView.swift: colour
   * strip, name with double-click rename, a type-specific middle row, and the
   * arm/mute/solo row with a mini meter.
   */

  import Icon from './Icon.svelte';
  import MiniMeter from './MiniMeter.svelte';
  import { instrumentLabel, trackInstrument } from '$lib/audio/instruments';
  import { TRACK_COLOR_HEX, type Track } from '$lib/core/track';
  import { engine, projectStore } from '$lib/stores';

  interface Props {
    track: Track;
    index: number;
    onDragStart: (index: number) => void;
    onDragOver: (index: number) => void;
    onDrop: () => void;
    isDragging: boolean;
    isDropTarget: boolean;
  }

  let { track, index, onDragStart, onDragOver, onDrop, isDragging, isDropTarget }: Props = $props();

  let editingName = $state(false);
  let nameDraft = $state('');

  const isSelected = $derived(projectStore.selectedTrackID === track.id);
  const isMIDI = $derived(track.type === 'midi' || track.type === 'instrument');
  const level = $derived(engine.meters[track.id]?.peak ?? 0);

  const outputLabel = $derived.by(() => {
    if (track.midiOutput?.kind !== 'rackInstrument') return 'Track';
    const rack = projectStore.project.vRack.instruments.find(
      (i) => track.midiOutput?.kind === 'rackInstrument' && i.id === track.midiOutput.id
    );
    const channel =
      track.midiOutput.kind === 'rackInstrument' ? track.midiOutput.channel : 1;
    return `${rack?.name ?? 'Rack'} Ch ${channel}`;
  });

  function startRename() {
    nameDraft = track.name;
    editingName = true;
  }

  function commitRename() {
    const name = nameDraft.trim();
    if (name && name !== track.name) projectStore.renameTrack(track.id, name);
    editingName = false;
  }
</script>

<div
  class="header"
  class:selected={isSelected}
  class:dragging={isDragging}
  style:height="{track.height}px"
  role="button"
  tabindex="0"
  draggable="true"
  onclick={() => projectStore.selectTrack(track.id)}
  onkeydown={(e) => e.key === 'Enter' && projectStore.selectTrack(track.id)}
  ondragstart={() => onDragStart(index)}
  ondragover={(e) => {
    e.preventDefault();
    onDragOver(index);
  }}
  ondrop={(e) => {
    e.preventDefault();
    onDrop();
  }}
>
  {#if isDropTarget}
    <div class="drop-line"></div>
  {/if}

  <div class="body">
    <span class="color-strip" style:background={TRACK_COLOR_HEX[track.color]}></span>

    <div class="rows">
      <div class="row name-row">
        {#if editingName}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            bind:value={nameDraft}
            class="name-input"
            autofocus
            onblur={commitRename}
            onkeydown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') editingName = false;
            }}
          />
        {:else}
          <span
            class="name"
            role="button"
            tabindex="0"
            title="Double click to rename"
            ondblclick={startRename}
            onkeydown={(e) => e.key === 'F2' && startRename()}
          >
            {track.name}
          </span>
        {/if}
      </div>

      <div class="row">
        {#if isMIDI}
          <span class="dot" class:armed={track.isArmed}></span>
          <span class="pill instrument" title="Instrument">
            <Icon name="keyboard" size={9} />
            {instrumentLabel(trackInstrument(track))}
          </span>
          <span class="pill routing" title="MIDI output">{outputLabel}</span>
        {:else if track.type === 'audio'}
          <Icon name="waveform" size={10} />
          <span class="pill">
            {track.inputSource?.kind === 'vRackSum'
              ? 'V-Rack Sum'
              : track.inputSource?.kind === 'audioDevice'
                ? `Input ${track.inputSource.channelIndex + 1}`
                : 'No Input'}
          </span>
        {:else}
          <Icon name="mixer" size={10} />
          <span class="type">{track.type}</span>
        {/if}
      </div>

      <div class="row controls">
        <button
          class="ctl arm"
          class:on={track.isArmed}
          title="Record arm"
          onclick={(e) => {
            e.stopPropagation();
            projectStore.toggleTrackArm(track.id);
          }}
        >
          <Icon name="record" size={11} />
        </button>
        <button
          class="ctl letter mute"
          class:on={track.isMuted}
          title="Mute"
          onclick={(e) => {
            e.stopPropagation();
            projectStore.toggleTrackMute(track.id);
          }}
        >
          M
        </button>
        <button
          class="ctl letter solo"
          class:on={track.isSolo}
          title="Solo"
          onclick={(e) => {
            e.stopPropagation();
            projectStore.toggleTrackSolo(track.id);
          }}
        >
          S
        </button>
        <span class="flex"></span>
        <MiniMeter {level} variant={track.isArmed ? 'input' : 'output'} />
      </div>
    </div>
  </div>
</div>

<style>
  .header {
    position: relative;
    border-bottom: 1px solid var(--stroke);
    background: var(--bg-control);
    flex: none;
    cursor: default;
  }

  .header.selected {
    background: var(--accent-dim);
  }

  .header.dragging {
    opacity: 0.5;
  }

  .drop-line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--accent);
    z-index: 2;
  }

  .body {
    display: flex;
    gap: 6px;
    padding: 8px;
    height: 100%;
  }

  .color-strip {
    width: 4px;
    border-radius: 2px;
    flex: none;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    color: var(--text-secondary);
  }

  .name-row {
    height: 15px;
  }

  .name {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: text;
  }

  .name-input {
    width: 100%;
    padding: 0 2px;
    font-size: 12px;
    font-weight: 500;
    background: var(--bg-inset);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.07);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 96px;
  }

  .pill.instrument {
    background: rgba(165, 94, 234, 0.28);
    color: var(--text-primary);
  }

  .pill.routing {
    font-size: 9px;
    max-width: 70px;
  }

  .type {
    font-size: 10px;
    text-transform: capitalize;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
    flex: none;
  }

  .dot.armed {
    background: #4caf50;
    box-shadow: 0 0 4px rgba(76, 175, 80, 0.8);
  }

  .controls {
    margin-top: auto;
  }

  .flex {
    flex: 1;
  }

  .ctl {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    color: var(--text-tertiary);
  }

  .ctl:hover {
    background: var(--bg-elevated);
  }

  .letter {
    font-size: 10px;
    font-weight: 700;
  }

  .arm.on {
    color: var(--record);
  }

  .mute.on {
    color: #ff9800;
  }

  .solo.on {
    color: #ffd54f;
  }
</style>
