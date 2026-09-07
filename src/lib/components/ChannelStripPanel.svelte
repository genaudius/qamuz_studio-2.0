<script lang="ts">
  /**
   * Channel Strip / PROCESS panel — EQ, Dynamics, Inserts, sends (Limbus flow, Qamuz look).
   */
  import {
    INSERT_CATALOG,
    makeChannelProcess,
    makeInsert,
    type InsertKind
  } from '$lib/core/channel-fx';
  import { TRACK_COLOR_HEX, type Track } from '$lib/core/track';
  import { projectStore } from '$lib/stores';
  import Icon from './Icon.svelte';

  interface Props {
    track: Track;
    onClose?: () => void;
  }

  let { track, onClose }: Props = $props();

  let tab = $state<'eq' | 'dynamics' | 'inserts'>('eq');
  let bandIndex = $state(0);
  let addOpen = $state(false);

  const cp = $derived(track.channelProcess ?? makeChannelProcess());

  function patch(mutator: (c: ReturnType<typeof makeChannelProcess>) => void) {
    projectStore.updateChannelProcess(track.id, (c) => {
      mutator(c);
    });
  }

  function addInsert(kind: InsertKind) {
    const slot = makeInsert(kind);
    if (!slot) return;
    patch((c) => {
      if (c.inserts.length >= 4) return;
      c.inserts = [...c.inserts, slot];
    });
    addOpen = false;
    tab = 'inserts';
  }
</script>

<div class="strip-panel" style:--accent={TRACK_COLOR_HEX[track.color]}>
  <header>
    <button class="icon-btn" title="Cerrar" onclick={() => onClose?.()}>
      <Icon name="close" size={14} />
    </button>
    <div class="titles">
      <h2>{track.name}</h2>
      <span>Channel Strip · PROCESS</span>
    </div>
    <button
      class="phase"
      class:on={cp.phaseInvert}
      onclick={() => patch((c) => (c.phaseInvert = !c.phaseInvert))}
    >
      ø Fase
    </button>
  </header>

  <div class="body">
    <aside class="io">
      <label class="field">
        <span>PRE-GAIN</span>
        <input
          type="range"
          min="-24"
          max="24"
          step="0.1"
          value={cp.preGainDb}
          oninput={(e) =>
            patch((c) => (c.preGainDb = Number((e.currentTarget as HTMLInputElement).value)))}
        />
        <em>{cp.preGainDb.toFixed(1)} dB</em>
      </label>
      <div class="ms">
        <button class:on={track.isMuted} onclick={() => projectStore.toggleTrackMute(track.id)}>M</button>
        <button class:on={track.isSolo} onclick={() => projectStore.toggleTrackSolo(track.id)}>S</button>
      </div>
      <label class="field">
        <span>REV</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={cp.sends.reverb}
          oninput={(e) =>
            patch((c) => (c.sends.reverb = Number((e.currentTarget as HTMLInputElement).value)))}
        />
      </label>
      <label class="field">
        <span>DLY</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={cp.sends.delay}
          oninput={(e) =>
            patch((c) => (c.sends.delay = Number((e.currentTarget as HTMLInputElement).value)))}
        />
      </label>
    </aside>

    <section class="main">
      <nav class="tabs">
        <button class:on={tab === 'eq'} onclick={() => (tab = 'eq')}>EQ</button>
        <button class:on={tab === 'dynamics'} onclick={() => (tab = 'dynamics')}>Dynamics</button>
        <button class:on={tab === 'inserts'} onclick={() => (tab = 'inserts')}>Inserts</button>
      </nav>

      {#if tab === 'eq'}
        <div class="eq">
          <label class="enable">
            <input
              type="checkbox"
              checked={cp.eq.enabled}
              onchange={(e) =>
                patch((c) => (c.eq.enabled = (e.currentTarget as HTMLInputElement).checked))}
            />
            Enable EQ
          </label>
          <div class="bands">
            {#each cp.eq.bands as _, i}
              <button class:on={bandIndex === i} onclick={() => (bandIndex = i)}>B{i + 1}</button>
            {/each}
          </div>
          {#if cp.eq.bands[bandIndex]}
            {@const band = cp.eq.bands[bandIndex]}
            <label class="field">
              <span>Freq</span>
              <input
                type="range"
                min="20"
                max="16000"
                step="1"
                value={band.freq}
                oninput={(e) =>
                  patch((c) => {
                    c.eq.bands[bandIndex].freq = Number((e.currentTarget as HTMLInputElement).value);
                  })}
              />
              <em>{Math.round(band.freq)} Hz</em>
            </label>
            <label class="field">
              <span>Gain</span>
              <input
                type="range"
                min="-18"
                max="18"
                step="0.1"
                value={band.gainDb}
                oninput={(e) =>
                  patch((c) => {
                    c.eq.bands[bandIndex].gainDb = Number((e.currentTarget as HTMLInputElement).value);
                    c.eq.enabled = true;
                  })}
              />
              <em>{band.gainDb.toFixed(1)} dB</em>
            </label>
            <label class="field">
              <span>Q</span>
              <input
                type="range"
                min="0.1"
                max="8"
                step="0.01"
                value={band.q}
                oninput={(e) =>
                  patch((c) => {
                    c.eq.bands[bandIndex].q = Number((e.currentTarget as HTMLInputElement).value);
                  })}
              />
              <em>{band.q.toFixed(2)}</em>
            </label>
          {/if}
        </div>
      {:else if tab === 'dynamics'}
        <div class="comp">
          <label class="enable">
            <input
              type="checkbox"
              checked={cp.comp.enabled}
              onchange={(e) =>
                patch((c) => (c.comp.enabled = (e.currentTarget as HTMLInputElement).checked))}
            />
            Enable COMP
          </label>
          <label class="field">
            <span>THRESHOLD</span>
            <input
              type="range"
              min="-60"
              max="0"
              step="0.5"
              value={cp.comp.thresholdDb}
              oninput={(e) =>
                patch((c) => {
                  c.comp.thresholdDb = Number((e.currentTarget as HTMLInputElement).value);
                  c.comp.enabled = true;
                })}
            />
            <em>{cp.comp.thresholdDb.toFixed(1)} dB</em>
          </label>
          <label class="field">
            <span>RATIO</span>
            <input
              type="range"
              min="1"
              max="20"
              step="0.1"
              value={cp.comp.ratio}
              oninput={(e) =>
                patch((c) => (c.comp.ratio = Number((e.currentTarget as HTMLInputElement).value)))}
            />
            <em>{cp.comp.ratio.toFixed(1)}:1</em>
          </label>
          <label class="field">
            <span>ATTACK</span>
            <input
              type="range"
              min="0.1"
              max="100"
              step="0.1"
              value={cp.comp.attackMs}
              oninput={(e) =>
                patch((c) => (c.comp.attackMs = Number((e.currentTarget as HTMLInputElement).value)))}
            />
            <em>{cp.comp.attackMs.toFixed(1)} ms</em>
          </label>
          <label class="field">
            <span>RELEASE</span>
            <input
              type="range"
              min="5"
              max="500"
              step="1"
              value={cp.comp.releaseMs}
              oninput={(e) =>
                patch((c) => (c.comp.releaseMs = Number((e.currentTarget as HTMLInputElement).value)))}
            />
            <em>{cp.comp.releaseMs.toFixed(0)} ms</em>
          </label>
          <label class="field">
            <span>GAIN</span>
            <input
              type="range"
              min="0"
              max="24"
              step="0.1"
              value={cp.comp.makeupDb}
              oninput={(e) =>
                patch((c) => (c.comp.makeupDb = Number((e.currentTarget as HTMLInputElement).value)))}
            />
            <em>{cp.comp.makeupDb.toFixed(1)} dB</em>
          </label>
        </div>
      {:else}
        <div class="inserts">
          {#each cp.inserts as ins, i}
            <div class="insert-row">
              <button
                class="bypass"
                class:off={!ins.enabled}
                onclick={() =>
                  patch((c) => {
                    c.inserts[i].enabled = !c.inserts[i].enabled;
                  })}
              >
                {ins.enabled ? 'ON' : 'BYP'}
              </button>
              <span class="kind">{INSERT_CATALOG.find((x) => x.kind === ins.kind)?.label ?? ins.kind}</span>
              <button
                class="remove"
                onclick={() => patch((c) => (c.inserts = c.inserts.filter((_, j) => j !== i)))}
              >
                ×
              </button>
              <div class="params">
                {#each Object.entries(ins.params) as [key, val]}
                  <label>
                    <span>{key}</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={val}
                      oninput={(e) =>
                        patch((c) => {
                          c.inserts[i].params[key] = Number(
                            (e.currentTarget as HTMLInputElement).value
                          );
                        })}
                    />
                  </label>
                {/each}
              </div>
            </div>
          {/each}
          {#if cp.inserts.length < 4}
            <div class="add-wrap">
              <button class="add" onclick={() => (addOpen = !addOpen)}>+ ADD</button>
              {#if addOpen}
                <ul class="menu">
                  {#each INSERT_CATALOG as item}
                    <li>
                      <button
                        disabled={!item.ready}
                        onclick={() => addInsert(item.kind)}
                      >
                        {item.label}{item.ready ? '' : ' (próximo)'}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .strip-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface-1, #12161c);
    color: var(--text, #e8eef4);
    border-left: 1px solid var(--border, #2a3340);
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border, #2a3340);
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  .titles h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .titles span {
    font-size: 11px;
    opacity: 0.65;
  }
  .icon-btn,
  .phase,
  .ms button,
  .tabs button,
  .bands button,
  .add,
  .bypass,
  .remove {
    background: var(--surface-2, #1a222c);
    border: 1px solid var(--border, #2a3340);
    color: inherit;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
  }
  .phase.on,
  .ms button.on,
  .tabs button.on,
  .bands button.on {
    background: color-mix(in srgb, var(--accent) 35%, #1a222c);
    border-color: var(--accent);
  }
  .body {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 12px;
    padding: 12px;
    overflow: auto;
    flex: 1;
  }
  .io {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ms {
    display: flex;
    gap: 6px;
  }
  .ms button {
    flex: 1;
    padding: 8px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.9;
  }
  .field input[type='range'] {
    width: 100%;
  }
  .field em {
    font-style: normal;
    opacity: 0.7;
    text-transform: none;
  }
  .tabs {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }
  .tabs button {
    padding: 6px 10px;
  }
  .enable {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 10px;
    font-size: 12px;
  }
  .bands {
    display: flex;
    gap: 4px;
    margin-bottom: 12px;
  }
  .bands button {
    flex: 1;
    padding: 6px;
  }
  .eq,
  .comp,
  .inserts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .insert-row {
    border: 1px solid var(--border, #2a3340);
    border-radius: 8px;
    padding: 8px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 6px;
    align-items: center;
  }
  .kind {
    font-size: 12px;
  }
  .bypass.off {
    opacity: 0.5;
  }
  .params {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .params label {
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: 8px;
    font-size: 10px;
    text-transform: uppercase;
  }
  .add-wrap {
    position: relative;
  }
  .add {
    width: 100%;
    padding: 10px;
  }
  .menu {
    list-style: none;
    margin: 6px 0 0;
    padding: 6px;
    background: var(--surface-2, #1a222c);
    border: 1px solid var(--border, #2a3340);
    border-radius: 8px;
    max-height: 220px;
    overflow: auto;
  }
  .menu button {
    width: 100%;
    text-align: left;
    background: transparent;
    border: 0;
    color: inherit;
    padding: 8px;
    border-radius: 4px;
    cursor: pointer;
  }
  .menu button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .menu button:not(:disabled):hover {
    background: #243040;
  }
</style>
