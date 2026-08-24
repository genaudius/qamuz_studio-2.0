<script lang="ts">
  /**
   * MIDI input picker with an activity light, the transport bar's MIDI selector
   * from the 1.0 build. The light shows the last note received so a silent
   * keyboard can be told apart from a silent instrument.
   */

  import Icon from './Icon.svelte';
  import { noteName } from '$lib/core/midi';
  import { midiInput } from '$lib/stores';

  const active = $derived(midiInput.activeNotes.length > 0);
  const label = $derived.by(() => {
    if (!midiInput.isSupported) return 'No MIDI';
    if (midiInput.devices.length === 0) return 'No devices';
    const message = midiInput.lastMessage;
    return message?.on ? `${noteName(message.pitch)} ${message.velocity}` : 'MIDI in';
  });
</script>

<div class="midi" title={midiInput.error ?? 'MIDI input'}>
  <span class="light" class:active></span>

  {#if midiInput.devices.length > 0}
    <select
      value={midiInput.selectedDeviceID}
      onchange={(e) => midiInput.selectDevice(e.currentTarget.value)}
    >
      <option value="">All devices</option>
      {#each midiInput.devices as device (device.id)}
        <option value={device.id}>{device.name}</option>
      {/each}
    </select>
  {:else}
    <button
      class="enable"
      title={midiInput.isSupported ? 'Look for MIDI devices' : 'Web MIDI is unavailable here'}
      onclick={() => midiInput.enable()}
    >
      <Icon name="keyboard" size={11} />
      Scan
    </button>
  {/if}

  <span class="readout">{label}</span>
</div>

<style>
  .midi {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .light {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-tertiary);
    flex: none;
    transition: background 80ms linear;
  }

  .light.active {
    background: var(--time);
    box-shadow: 0 0 5px rgba(50, 215, 75, 0.9);
  }

  select {
    max-width: 120px;
    padding: 2px 4px;
    font-size: 10px;
    background: var(--bg-control);
  }

  .enable {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 3px 6px;
    border-radius: 4px;
    background: var(--bg-control);
    color: var(--text-secondary);
    font-size: 10px;
  }

  .enable:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .readout {
    min-width: 52px;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-tertiary);
  }
</style>
