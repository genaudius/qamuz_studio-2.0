<script lang="ts">
  /**
   * Mixer: one channel strip per track, then the V-Rack instruments, then the
   * master. Mirrors the mixer sheet in the 1.0 build.
   */

  import Fader from './Fader.svelte';
  import Icon from './Icon.svelte';
  import PanKnob from './PanKnob.svelte';
  import { instrumentLabel, rackInstrumentSound, trackInstrument } from '$lib/audio/instruments';
  import { TRACK_COLOR_HEX } from '$lib/core/track';
  import { engine, projectStore } from '$lib/stores';

  const tracks = $derived(projectStore.project.tracks);
  const rack = $derived(projectStore.project.vRack.instruments);
  const master = $derived(projectStore.project.masterTrack);

  const stripHeight = $derived(Math.max(90, projectStore.bottomPanelHeight - 108));

  function meter(id: string): number {
    return engine.meters[id]?.peak ?? 0;
  }

  function setMasterVolume(value: number) {
    projectStore.mutate('Change Master Volume', () => {
      projectStore.project.masterTrack.volume = Math.max(0, Math.min(2, value));
    });
  }
</script>

<div class="mixer">
<div class="panel-title">
  <Icon name="mixer" size={12} />
  <span>Mixer</span>
  <span class="count">{tracks.length + rack.length} channels</span>
</div>

<div class="strips">
  {#each tracks as track (track.id)}
    <div
      class="strip"
      class:selected={projectStore.selectedTrackID === track.id}
      role="button"
      tabindex="-1"
      onclick={() => projectStore.selectTrack(track.id)}
      onkeydown={(e) => e.key === 'Enter' && projectStore.selectTrack(track.id)}
    >
      <span class="strip-color" style:background={TRACK_COLOR_HEX[track.color]}></span>
      <span class="strip-name" title={track.name}>{track.name}</span>

      {#if track.type === 'midi' || track.type === 'instrument'}
        <span class="strip-sub">{instrumentLabel(trackInstrument(track))}</span>
      {:else}
        <span class="strip-sub">{track.type}</span>
      {/if}

      <PanKnob
        value={track.pan}
        size={26}
        onInput={(v) => projectStore.setTrackPan(track.id, v)}
        onGestureStart={() => projectStore.beginInteraction('Change Pan')}
        onGestureEnd={() => projectStore.endInteraction()}
      />

      <Fader
        value={track.volume}
        peak={meter(track.id)}
        height={stripHeight}
        onInput={(v) => projectStore.setTrackVolume(track.id, v)}
        onGestureStart={() => projectStore.beginInteraction('Change Volume')}
        onGestureEnd={() => projectStore.endInteraction()}
      />

      <div class="strip-buttons">
        <button
          class="toggle"
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
          class="toggle solo"
          class:on={track.isSolo}
          title="Solo"
          onclick={(e) => {
            e.stopPropagation();
            projectStore.toggleTrackSolo(track.id);
          }}
        >
          S
        </button>
      </div>
    </div>
  {/each}

  {#if rack.length > 0}
    <div class="separator"></div>

    {#each rack as instrument (instrument.id)}
      <div class="strip rack">
        <span class="strip-color rack-color"></span>
        <span class="strip-name" title={instrument.name}>{instrument.name}</span>
        <span class="strip-sub">{instrumentLabel(rackInstrumentSound(instrument))}</span>

        <PanKnob value={0} size={26} showLabel={false} onInput={() => {}} />

        <Fader
          value={instrument.volume}
          peak={meter(instrument.id)}
          height={stripHeight}
          onInput={(v) => projectStore.setRackInstrumentVolume(instrument.id, v)}
          onGestureStart={() => projectStore.beginInteraction('Change Instrument Volume')}
          onGestureEnd={() => projectStore.endInteraction()}
        />

        <div class="strip-buttons">
          <button
            class="toggle"
            class:on={instrument.isMuted}
            title="Mute"
            onclick={() => projectStore.toggleRackInstrumentMute(instrument.id)}
          >
            M
          </button>
        </div>
      </div>
    {/each}
  {/if}

  <div class="separator"></div>

  <div class="strip master">
    <span class="strip-color master-color"></span>
    <span class="strip-name">Master</span>
    <span class="strip-sub">Output</span>

    <PanKnob value={0} size={26} showLabel={false} onInput={() => {}} />

    <Fader
      value={master.volume}
      peak={engine.masterMeter.peak}
      height={stripHeight}
      onInput={setMasterVolume}
      onGestureStart={() => projectStore.beginInteraction('Change Master Volume')}
      onGestureEnd={() => projectStore.endInteraction()}
    />

    <div class="strip-buttons">
      <span class="master-tag">OUT</span>
    </div>
  </div>
</div>
</div>

<style>
  .mixer {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .count {
    margin-left: auto;
    font-size: 10px;
    color: var(--text-tertiary);
  }

  .strips {
    display: flex;
    gap: 1px;
    flex: 1;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 8px;
    background: var(--bg-inset);
  }

  .strip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    width: 74px;
    flex: none;
    padding: 6px 4px;
    border-radius: var(--radius-lg);
    background: var(--bg-control);
  }

  .strip.selected {
    background: var(--accent-dim);
  }

  .strip.master {
    background: var(--bg-highest);
  }

  .strip-color {
    width: 100%;
    height: 3px;
    border-radius: 2px;
  }

  .rack-color {
    background: var(--ai);
  }

  .master-color {
    background: var(--record);
  }

  .strip-name {
    max-width: 100%;
    font-size: 10px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .strip-sub {
    max-width: 100%;
    font-size: 8px;
    color: var(--text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .strip-buttons {
    display: flex;
    gap: 3px;
    margin-top: auto;
  }

  .toggle {
    width: 20px;
    height: 16px;
    border-radius: 3px;
    background: var(--bg-inset);
    color: var(--text-tertiary);
    font-size: 9px;
    font-weight: 700;
  }

  .toggle.on {
    background: rgba(255, 180, 170, 0.22);
    color: var(--mute);
  }

  .toggle.solo.on {
    background: rgba(114, 254, 136, 0.22);
    color: var(--solo);
  }

  .master-tag {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-tertiary);
  }

  .separator {
    width: 1px;
    background: var(--stroke);
    margin: 0 6px;
    flex: none;
  }
</style>
