<script lang="ts">
  /**
   * Mixer with Limbus-style PROCESS / inserts / FX buses (Qamuz chrome).
   */
  import Fader from './Fader.svelte';
  import Icon from './Icon.svelte';
  import PanKnob from './PanKnob.svelte';
  import { instrumentLabel, rackInstrumentSound } from '$lib/audio/instruments';
  import { INSERT_CATALOG, makeChannelProcess, makeFxBuses, makeInsert, type InsertKind } from '$lib/core/channel-fx';
  import { TRACK_COLOR_HEX } from '$lib/core/track';
  import { engine, projectStore, workspace } from '$lib/stores';

  const tracks = $derived(projectStore.project.tracks);
  const rack = $derived(projectStore.project.vRack.instruments);
  const master = $derived(projectStore.project.masterTrack);
  const fx = $derived(projectStore.project.fxBuses ?? makeFxBuses());
  const stripHeight = $derived(Math.max(90, projectStore.bottomPanelHeight - 168));

  let masterTab = $state<'effects' | 'all' | 'master'>('master');
  let addFor = $state<string | null>(null);

  function meter(id: string): number {
    return engine.meters[id]?.peak ?? 0;
  }

  function setMasterVolume(value: number) {
    projectStore.mutate('Change Master Volume', () => {
      projectStore.project.masterTrack.volume = Math.max(0, Math.min(2, value));
    });
  }

  function closePanel() {
    projectStore.bottomPanel = 'none';
    if (workspace.module === 'mixer' || workspace.module === 'pianoRoll') workspace.open('arrange');
  }

  function openProcess(trackId: string) {
    projectStore.selectTrack(trackId);
    workspace.openChannelStrip(trackId);
  }

  function addInsert(trackId: string, kind: InsertKind) {
    const slot = makeInsert(kind);
    if (!slot) return;
    projectStore.updateChannelProcess(trackId, (cp) => {
      if (cp.inserts.length >= 4) return;
      cp.inserts = [...cp.inserts, slot];
    });
    addFor = null;
  }
</script>

<div class="mixer">
  <div class="panel-title">
    <Icon name="mixer" size={12} />
    <span>Mixer</span>
    <span class="count">{tracks.length + rack.length} channels</span>
    <button class="panel-close" title="Cerrar mixer" onclick={closePanel}>
      <Icon name="close" size={13} />
    </button>
  </div>

  <div class="strips">
    {#each tracks as track (track.id)}
      {@const cp = track.channelProcess ?? makeChannelProcess()}
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
        <button
          class="process"
          title="PROCESS"
          onclick={(e) => {
            e.stopPropagation();
            openProcess(track.id);
          }}
        >
          PROCESS
        </button>
        <label class="pre" title="Pre-gain">
          <span>PRE</span>
          <input
            type="range"
            min="-12"
            max="12"
            step="0.1"
            value={cp?.preGainDb ?? 0}
            onclick={(e) => e.stopPropagation()}
            oninput={(e) => {
              const v = Number((e.currentTarget as HTMLInputElement).value);
              projectStore.updateChannelProcess(track.id, (c) => (c.preGainDb = v));
            }}
          />
        </label>
        <button
          class="eq-mini"
          class:on={cp?.eq.enabled}
          title="EQ"
          onclick={(e) => {
            e.stopPropagation();
            projectStore.updateChannelProcess(track.id, (c) => (c.eq.enabled = !c.eq.enabled));
          }}
        >
          {cp?.eq.enabled ? 'EQ ON' : 'EQ OFF'}
        </button>
        <div class="inserts">
          {#each cp?.inserts ?? [] as ins}
            <span class="ins" class:off={!ins.enabled}>{ins.kind}</span>
          {/each}
          {#if (cp?.inserts.length ?? 0) < 4}
            <div class="add-slot">
              <button
                class="add"
                onclick={(e) => {
                  e.stopPropagation();
                  addFor = addFor === track.id ? null : track.id;
                }}>+ ADD</button
              >
              {#if addFor === track.id}
                <ul class="menu">
                  {#each INSERT_CATALOG.filter((i) => i.ready) as item}
                    <li>
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          addInsert(track.id, item.kind);
                        }}>{item.label}</button
                      >
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}
        </div>

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

    <div class="master-block">
      <div class="master-tabs">
        <button class:on={masterTab === 'effects'} onclick={() => (masterTab = 'effects')}>EFFECTS</button>
        <button class:on={masterTab === 'all'} onclick={() => (masterTab = 'all')}>ALL</button>
        <button class:on={masterTab === 'master'} onclick={() => (masterTab = 'master')}>MASTER</button>
      </div>

      {#if masterTab === 'effects' || masterTab === 'all'}
        <div class="fx-buses">
          <div class="bus rev">
            <span>REVERB</span>
            <select
              value={fx.reverb.algorithm}
              onchange={(e) =>
                projectStore.setFxBuses((b) => {
                  b.reverb.algorithm = (e.currentTarget as HTMLSelectElement).value as typeof b.reverb.algorithm;
                })}
            >
              <option value="hall">Hall</option>
              <option value="room">Room</option>
              <option value="plate">Plate</option>
            </select>
            <label
              >Size<input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={fx.reverb.size}
                oninput={(e) =>
                  projectStore.setFxBuses(
                    (b) => (b.reverb.size = Number((e.currentTarget as HTMLInputElement).value))
                  )}
              /></label
            >
            <label
              >Decay<input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={fx.reverb.decay}
                oninput={(e) =>
                  projectStore.setFxBuses(
                    (b) => (b.reverb.decay = Number((e.currentTarget as HTMLInputElement).value))
                  )}
              /></label
            >
            <label
              >Bus<input
                type="range"
                min="-24"
                max="0"
                step="0.5"
                value={fx.reverb.busVolDb}
                oninput={(e) =>
                  projectStore.setFxBuses(
                    (b) => (b.reverb.busVolDb = Number((e.currentTarget as HTMLInputElement).value))
                  )}
              /></label
            >
          </div>
          <div class="bus dly">
            <span>DELAY</span>
            <select
              value={String(fx.delay.syncBeats)}
              onchange={(e) =>
                projectStore.setFxBuses((b) => {
                  b.delay.syncBeats = Number((e.currentTarget as HTMLSelectElement).value);
                })}
            >
              <option value="0.5">1/2</option>
              <option value="0.25">1/4</option>
              <option value="0.125">1/8</option>
              <option value="0.375">1/4·</option>
            </select>
            <label
              >Fdbk<input
                type="range"
                min="0"
                max="0.95"
                step="0.01"
                value={fx.delay.feedback}
                oninput={(e) =>
                  projectStore.setFxBuses(
                    (b) => (b.delay.feedback = Number((e.currentTarget as HTMLInputElement).value))
                  )}
              /></label
            >
            <label
              >Bus<input
                type="range"
                min="-24"
                max="0"
                step="0.5"
                value={fx.delay.busVolDb}
                oninput={(e) =>
                  projectStore.setFxBuses(
                    (b) => (b.delay.busVolDb = Number((e.currentTarget as HTMLInputElement).value))
                  )}
              /></label
            >
          </div>
        </div>
      {/if}

      {#if masterTab === 'master' || masterTab === 'all'}
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
      {/if}
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
    gap: 4px;
    width: 86px;
    flex: none;
    padding: 6px 4px;
    border-radius: var(--radius-lg);
    background: var(--bg-control);
    position: relative;
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
  }
  .process {
    width: 100%;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 3px 0;
    border-radius: 4px;
    background: var(--bg-inset);
    color: var(--text-secondary);
    border: 1px solid var(--stroke);
    cursor: pointer;
  }
  .pre {
    display: flex;
    flex-direction: column;
    width: 100%;
    font-size: 8px;
    color: var(--text-tertiary);
  }
  .pre input {
    width: 100%;
  }
  .eq-mini {
    width: 100%;
    font-size: 8px;
    padding: 4px 0;
    border-radius: 4px;
    background: #2a3140;
    color: var(--text-tertiary);
    border: 0;
    cursor: pointer;
  }
  .eq-mini.on {
    background: rgba(0, 174, 239, 0.25);
    color: var(--accent);
  }
  .inserts {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    min-height: 28px;
  }
  .ins {
    font-size: 7px;
    text-transform: uppercase;
    background: #1e2633;
    border-radius: 3px;
    padding: 2px 3px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ins.off {
    opacity: 0.4;
  }
  .add {
    width: 100%;
    font-size: 8px;
    padding: 3px;
    border-radius: 3px;
    background: transparent;
    border: 1px dashed var(--stroke);
    color: var(--text-tertiary);
    cursor: pointer;
  }
  .add-slot {
    position: relative;
  }
  .menu {
    position: absolute;
    z-index: 20;
    left: 0;
    bottom: 100%;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--bg-highest);
    border: 1px solid var(--stroke);
    border-radius: 6px;
    min-width: 140px;
  }
  .menu button {
    width: 100%;
    text-align: left;
    background: transparent;
    border: 0;
    color: inherit;
    font-size: 10px;
    padding: 6px;
    cursor: pointer;
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
    color: var(--text-tertiary);
  }
  .separator {
    width: 1px;
    background: var(--stroke);
    margin: 0 6px;
    flex: none;
  }
  .master-block {
    display: flex;
    gap: 8px;
    align-items: stretch;
    flex: none;
  }
  .master-tabs {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .master-tabs button {
    font-size: 9px;
    padding: 6px 8px;
    border-radius: 4px;
    background: var(--bg-control);
    border: 1px solid var(--stroke);
    color: var(--text-tertiary);
    cursor: pointer;
  }
  .master-tabs button.on {
    color: var(--text);
    border-color: var(--accent);
  }
  .fx-buses {
    display: flex;
    gap: 6px;
  }
  .bus {
    width: 110px;
    padding: 6px;
    border-radius: 8px;
    background: var(--bg-control);
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 9px;
  }
  .bus.rev {
    background: color-mix(in srgb, #9b7bff 12%, var(--bg-control));
  }
  .bus.dly {
    background: color-mix(in srgb, #00aeef 12%, var(--bg-control));
  }
  .bus label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--text-tertiary);
  }
  .bus select,
  .bus input {
    width: 100%;
  }
</style>
