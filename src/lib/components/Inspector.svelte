<script lang="ts">
  /**
   * Track inspector. Port of the inspector column in MainWindowView.swift: name,
   * colour, volume and pan, routing, and the clip details for the selection.
   */

  import Fader from './Fader.svelte';
  import Icon from './Icon.svelte';
  import NativeDevices from './NativeDevices.svelte';
  import PanKnob from './PanKnob.svelte';
  import { INSTRUMENTS, type InstrumentName } from '$lib/audio/backend';
  import { trackInstrument } from '$lib/audio/instruments';
  import { trackLayoutLabel } from '$lib/audio/stems';
  import { toBeats } from '$lib/core/time';
  import { TRACK_COLORS, TRACK_COLOR_HEX, type InputSource } from '$lib/core/track';
  import { engine, projectStore } from '$lib/stores';

  const track = $derived(projectStore.selectedTrack);
  const isMIDI = $derived(track?.type === 'midi' || track?.type === 'instrument');
  const peak = $derived(track ? (engine.meters[track.id]?.peak ?? 0) : 0);
  const rackInstruments = $derived(projectStore.project.vRack.instruments);

  const clip = $derived(
    projectStore.selectedClipIDs.length === 1
      ? projectStore.findClip(projectStore.selectedClipIDs[0])
      : null
  );

  const clipStartBeat = $derived(
    clip ? toBeats(clip.clip.timeRange.start, projectStore.project.tempo.bpm) : 0
  );
  const clipLengthBeats = $derived(
    clip ? toBeats(clip.clip.timeRange.duration, projectStore.project.tempo.bpm) : 0
  );

  const AUDIO_INPUTS: { label: string; value: string; source: InputSource }[] = [
    { label: 'None', value: 'none', source: { kind: 'none' } },
    { label: 'Input 1', value: 'in0', source: { kind: 'audioDevice', channelIndex: 0 } },
    { label: 'Input 2', value: 'in1', source: { kind: 'audioDevice', channelIndex: 1 } },
    { label: 'V-Rack Sum', value: 'vrack', source: { kind: 'vRackSum' } }
  ];

  function inputValue(source: InputSource | undefined): string {
    if (!source) return 'none';
    if (source.kind === 'vRackSum') return 'vrack';
    if (source.kind === 'audioDevice') return `in${source.channelIndex}`;
    return 'none';
  }

  function onMIDIOutputChange(value: string) {
    if (!track) return;
    if (value === 'track') {
      projectStore.setTrackMIDIOutput(track.id, { kind: 'trackInstrument' });
      return;
    }
    projectStore.setTrackMIDIOutput(track.id, {
      kind: 'rackInstrument',
      id: value,
      channel: 1
    });
  }
</script>

<div class="panel-title">
  <Icon name="inspector" size={12} />
  <span>Inspector</span>
</div>

<div class="scroll">
  {#if !track}
    <p class="empty">Select a track</p>
  {:else}
    <section>
      <label class="field">
        <span class="field-label">Name</span>
        <input
          value={track.name}
          onchange={(e) => projectStore.renameTrack(track.id, e.currentTarget.value)}
        />
      </label>

      <div class="field">
        <span class="field-label">Tipo</span>
        <span class="mono">{trackLayoutLabel(track)}</span>
      </div>

      <div class="field">
        <span class="field-label">Colour</span>
        <div class="swatches">
          {#each TRACK_COLORS as color (color)}
            <button
              class="swatch"
              class:on={track.color === color}
              style:background={TRACK_COLOR_HEX[color]}
              title={color}
              aria-label={color}
              onclick={() => projectStore.setTrackColor(track.id, color)}
            ></button>
          {/each}
        </div>
      </div>

      <div class="field">
        <span class="field-label">Height</span>
        <input
          type="range"
          min="48"
          max="240"
          step="4"
          value={track.height}
          oninput={(e) => projectStore.setTrackHeight(track.id, Number(e.currentTarget.value))}
        />
      </div>
    </section>

    <section class="levels">
      <div class="fader-cell">
        <span class="field-label">Volume</span>
        <Fader
          value={track.volume}
          {peak}
          height={130}
          onInput={(v) => projectStore.setTrackVolume(track.id, v)}
          onGestureStart={() => projectStore.beginInteraction('Change Volume')}
          onGestureEnd={() => projectStore.endInteraction()}
        />
      </div>

      <div class="knob-cell">
        <span class="field-label">Pan</span>
        <PanKnob
          value={track.pan}
          size={34}
          onInput={(v) => projectStore.setTrackPan(track.id, v)}
          onGestureStart={() => projectStore.beginInteraction('Change Pan')}
          onGestureEnd={() => projectStore.endInteraction()}
        />

        <div class="toggles">
          <button
            class="toggle"
            class:on={track.isMuted}
            onclick={() => projectStore.toggleTrackMute(track.id)}
          >
            M
          </button>
          <button
            class="toggle solo"
            class:on={track.isSolo}
            onclick={() => projectStore.toggleTrackSolo(track.id)}
          >
            S
          </button>
          <button
            class="toggle arm"
            class:on={track.isArmed}
            onclick={() => projectStore.toggleTrackArm(track.id)}
          >
            <Icon name="record" size={10} />
          </button>
        </div>
      </div>
    </section>

    <section>
      {#if isMIDI}
        <label class="field">
          <span class="field-label">Instrument</span>
          <select
            value={trackInstrument(track)}
            onchange={(e) =>
              projectStore.setTrackInstrument(
                track.id,
                e.currentTarget.value as InstrumentName
              )}
          >
            {#each INSTRUMENTS as instrument (instrument.id)}
              <option value={instrument.id}>{instrument.label}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span class="field-label">MIDI output</span>
          <select
            value={track.midiOutput?.kind === 'rackInstrument' ? track.midiOutput.id : 'track'}
            onchange={(e) => onMIDIOutputChange(e.currentTarget.value)}
          >
            <option value="track">Track instrument</option>
            {#each rackInstruments as instrument (instrument.id)}
              <option value={instrument.id}>{instrument.name}</option>
            {/each}
          </select>
        </label>

        {#if track.midiOutput?.kind === 'rackInstrument'}
          <label class="field">
            <span class="field-label">Channel</span>
            <input
              type="number"
              min="1"
              max="16"
              value={track.midiOutput.channel}
              onchange={(e) => {
                if (track.midiOutput?.kind !== 'rackInstrument') return;
                projectStore.setTrackMIDIOutput(track.id, {
                  kind: 'rackInstrument',
                  id: track.midiOutput.id,
                  channel: Math.max(1, Math.min(16, Number(e.currentTarget.value)))
                });
              }}
            />
          </label>
        {/if}
      {:else if track.type === 'audio'}
        <label class="field">
          <span class="field-label">Input</span>
          <select
            value={inputValue(track.inputSource)}
            onchange={(e) => {
              const option = AUDIO_INPUTS.find((i) => i.value === e.currentTarget.value);
              projectStore.setTrackInput(track.id, option?.source);
            }}
          >
            {#each AUDIO_INPUTS as input (input.value)}
              <option value={input.value}>{input.label}</option>
            {/each}
          </select>
        </label>
      {/if}
    </section>

    {#if clip}
      <section>
        <span class="section-title">Clip</span>

        <label class="field">
          <span class="field-label">Name</span>
          <input
            value={clip.clip.name}
            onchange={(e) => projectStore.renameClip(clip.clip.id, e.currentTarget.value)}
          />
        </label>

        <div class="field row">
          <span class="field-label">Position</span>
          <span class="mono">{clipStartBeat.toFixed(2)}</span>
          <span class="field-label">Length</span>
          <span class="mono">{clipLengthBeats.toFixed(2)}</span>
        </div>

        <label class="field">
          <span class="field-label">Gain</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={clip.clip.gain}
            oninput={(e) => projectStore.setClipGain(clip.clip.id, Number(e.currentTarget.value))}
          />
        </label>

        <div class="clip-actions">
          <button onclick={() => projectStore.toggleClipMute(clip.clip.id)}>
            {clip.clip.isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button onclick={() => projectStore.duplicateClip(clip.clip.id)}>Duplicate</button>
          <button class="danger" onclick={() => projectStore.deleteClip(clip.clip.id)}>
            <Icon name="trash" size={11} />
          </button>
        </div>
      </section>
    {/if}

    <section>
      <div class="clip-actions">
        <button onclick={() => projectStore.duplicateTrack(track.id)}>Duplicate track</button>
        <button class="danger" onclick={() => projectStore.deleteTrack(track.id)}>
          <Icon name="trash" size={11} />
        </button>
      </div>
    </section>
  {/if}

  <NativeDevices />
</div>

<style>
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--stroke);
  }

  section:last-child {
    border-bottom: none;
  }

  .section-title {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .empty {
    margin: 20px 0;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 11px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .field.row {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }

  .field-label {
    font-size: 10px;
    color: var(--text-tertiary);
  }

  .mono {
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .swatch {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1px solid transparent;
  }

  .swatch.on {
    border-color: var(--text-primary);
    box-shadow: 0 0 0 1px var(--bg-panel);
  }

  .levels {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  .fader-cell,
  .knob-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .knob-cell {
    padding-top: 2px;
  }

  .toggles {
    display: flex;
    gap: 3px;
    margin-top: 6px;
  }

  .toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 18px;
    border-radius: 4px;
    background: var(--bg-control);
    color: var(--text-secondary);
    font-size: 10px;
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

  .toggle.arm.on {
    background: rgba(255, 180, 170, 0.22);
    color: var(--record);
  }

  .clip-actions {
    display: flex;
    gap: 4px;
  }

  .clip-actions button {
    padding: 4px 8px;
    border-radius: 4px;
    background: var(--bg-control);
    color: var(--text-secondary);
    font-size: 11px;
  }

  .clip-actions button:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .clip-actions .danger:hover {
    background: rgba(255, 180, 170, 0.2);
    color: var(--record);
  }

  input[type='range'] {
    padding: 0;
    background: transparent;
    border: none;
    accent-color: var(--accent);
  }
</style>
