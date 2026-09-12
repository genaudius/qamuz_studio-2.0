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
  import PresetQuickPicker from '$lib/eqamuz/components/PresetQuickPicker.svelte';

  const tracks = $derived(projectStore.project.tracks);
  const rack = $derived(projectStore.project.vRack.instruments);
  const master = $derived(projectStore.project.masterTrack);
  const fx = $derived(projectStore.project.fxBuses ?? makeFxBuses());
  const stripHeight = $derived(Math.max(90, projectStore.bottomPanelHeight - 168));

  let masterTab = $state<'effects' | 'all' | 'master'>('master');
  let addFor = $state<string | null>(null);
  let quickPickerState = $state<{
    trackId: string;
    insertId: string;
    kind: InsertKind;
  } | null>(null);

  const INSERT_CATEGORIES = [
    'EQ & Dynamics',
    'Character & Tone',
    'Time & Space',
    'Studio Suite',
    'Classic FX'
  ] as const;

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
  }

  function openProcess(trackId: string) {
    projectStore.selectTrack(trackId);
    workspace.openChannelStrip(trackId);
  }

  function openInsertInDevice(trackId: string, insertId: string, kind: string) {
    projectStore.selectTrack(trackId);
    workspace.openEqamuz(trackId, insertId, kind);
    if (projectStore.bottomPanelHeight < 340) {
      projectStore.bottomPanelHeight = 360;
    }
    workspace.open('device');
    projectStore.bottomPanel = 'device';
  }

  function addInsert(trackId: string, kind: InsertKind) {
    const slot = makeInsert(kind);
    if (!slot) return;
    projectStore.updateChannelProcess(trackId, (cp) => {
      if (cp.inserts.length >= 4) return;
      cp.inserts = [...cp.inserts, slot];
    });
    addFor = null;
    openInsertInDevice(trackId, slot.id, kind);
  }
</script>

<div class="mixer">
  <div class="panel-title">
    <div class="panel-tabs">
      <button type="button" class="panel-tab-btn active">
        <Icon name="mixer" size={12} />
        <span>Mixer</span>
      </button>
      <button
        type="button"
        class="panel-tab-btn"
        title="Ver plugins abiertos debajo"
        onclick={() => {
          if (projectStore.bottomPanelHeight < 340) {
            projectStore.bottomPanelHeight = 360;
          }
          workspace.open('device');
          projectStore.bottomPanel = 'device';
        }}
      >
        <span class="tab-badge">⚡</span>
        <span>Plugins</span>
      </button>
      <button
        type="button"
        class="panel-tab-btn"
        title="Abrir Piano Roll"
        onclick={() => {
          workspace.open('pianoRoll');
          projectStore.bottomPanel = 'pianoRoll';
        }}
      >
        <Icon name="pianoroll" size={12} />
        <span>Piano Roll</span>
      </button>
    </div>
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
        <div class="strip-header-actions">
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
        </div>
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
          {#each cp?.inserts ?? [] as ins, slotIdx}
            <div class="ins-row">
              <button
                type="button"
                class="ins ins-btn"
                class:off={!ins.enabled}
                title={`Abrir ${ins.kind} debajo para manipular`}
                onclick={(e) => {
                  e.stopPropagation();
                  openInsertInDevice(track.id, ins.id, ins.kind);
                }}
              >
                <span class="ins-num">{slotIdx + 1}</span>
                <span class="ins-title">
                  {ins.kind === 'eqamuz'
                    ? '⚡ SUITE'
                    : ins.kind.startsWith('eqamuz-')
                      ? `⚡ ${ins.kind.replace('eqamuz-', '').toUpperCase()}`
                      : ins.kind}
                </span>
              </button>
              <button
                type="button"
                class="ins-preset-btn"
                title="Presets rápidos"
                onclick={(e) => {
                  e.stopPropagation();
                  if (ins.kind === 'eqamuz' || ins.kind.startsWith('eqamuz-')) {
                    quickPickerState = { trackId: track.id, insertId: ins.id, kind: ins.kind };
                  }
                }}
              >
                ⚡
              </button>
            </div>
          {/each}
          {#if (cp?.inserts.length ?? 0) < 4}
            <div class="add-slot">
              <button
                type="button"
                class="add"
                title="Agregar nuevo plugin a la cadena serial"
                onclick={(e) => {
                  e.stopPropagation();
                  addFor = addFor === track.id ? null : track.id;
                }}>+ ADD</button
              >
              {#if addFor === track.id}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="menu insert-catalog-menu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()}>
                  <div class="menu-head">CADENA SERIAL · SLOT {(cp?.inserts.length ?? 0) + 1}</div>
                  <div class="menu-scroll">
                    {#each INSERT_CATEGORIES as cat}
                      {@const items = INSERT_CATALOG.filter((i) => i.ready && i.category === cat)}
                      {#if items.length > 0}
                        <div class="cat-header">{cat}</div>
                        {#each items as item}
                          <button
                            type="button"
                            class="menu-item"
                            onclick={(e) => {
                              e.stopPropagation();
                              addInsert(track.id, item.kind);
                            }}
                          >
                            <span class="item-badge">{item.kind.startsWith('eqamuz') ? '⚡' : '◇'}</span>
                            <span class="item-name">{item.label}</span>
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

{#if quickPickerState}
  <PresetQuickPicker
    trackId={quickPickerState.trackId}
    insertId={quickPickerState.insertId}
    kind={quickPickerState.kind}
    onClose={() => (quickPickerState = null)}
    onOpenFullEditor={() => {
      const s = quickPickerState;
      quickPickerState = null;
      if (s) openInsertInDevice(s.trackId, s.insertId, s.kind);
    }}
  />
{/if}

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
  .strip-header-actions {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
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
  .panel-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .panel-tab-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 4px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-tertiary);
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .panel-tab-btn:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.05);
  }
  .panel-tab-btn.active {
    background: rgba(0, 242, 254, 0.12);
    border-color: rgba(0, 242, 254, 0.35);
    color: #00f2fe;
  }
  .tab-badge {
    color: #00f2fe;
    font-size: 10px;
  }
  .inserts {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    min-height: 28px;
  }
  .ins-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .ins-preset-btn {
    width: 16px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: #1e2636;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 3px;
    color: #00f2fe;
    font-size: 8px;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.12s ease;
  }
  .ins-preset-btn:hover {
    background: rgba(0, 242, 254, 0.2);
    border-color: #00f2fe;
  }
  .ins {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 8px;
    text-transform: uppercase;
    background: #181f2b;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    padding: 2px 4px;
    overflow: hidden;
    color: var(--text-secondary);
    text-align: left;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .ins:hover {
    background: #242e3f;
    border-color: rgba(245, 158, 11, 0.35);
    color: #fff;
  }
  .ins.off {
    opacity: 0.35;
  }
  .ins-num {
    font-size: 7.5px;
    font-weight: 700;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.12);
    border-radius: 2px;
    padding: 0 3px;
    flex-shrink: 0;
  }
  .ins-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    font-weight: 600;
  }
  .add {
    width: 100%;
    font-size: 8px;
    font-weight: 600;
    padding: 3px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed rgba(255, 255, 255, 0.15);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .add:hover {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.4);
    color: #f59e0b;
  }
  .add-slot {
    position: relative;
  }
  .insert-catalog-menu {
    position: absolute;
    z-index: 9999;
    left: 0;
    bottom: calc(100% + 4px);
    margin: 0;
    padding: 0;
    background: #0f131a;
    border: 1px solid rgba(245, 158, 11, 0.35);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.75);
    border-radius: 6px;
    width: 190px;
    max-height: 280px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .menu-head {
    padding: 6px 8px;
    background: #141923;
    font-size: 8.5px;
    font-weight: 700;
    color: #f59e0b;
    letter-spacing: 0.4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .menu-scroll {
    overflow-y: auto;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cat-header {
    font-size: 8px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    padding: 4px 6px 2px;
    letter-spacing: 0.5px;
  }
  .menu-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    text-align: left;
    background: transparent;
    border: 0;
    color: #cbd5e1;
    font-size: 9.5px;
    font-weight: 500;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.1s ease;
  }
  .menu-item:hover {
    background: rgba(245, 158, 11, 0.15);
    color: #fff;
  }
  .item-badge {
    color: #f59e0b;
    font-size: 9px;
  }
  .item-name {
    flex: 1;
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
