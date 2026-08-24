<script lang="ts">
  import { onMount } from 'svelte';
  import {
    listNativeAudioDevices,
    nativeAudioStatus,
    type NativeAudioDevice,
    type NativeBackendStatus
  } from '$lib/audio/native-backend';
  import { tauriInvoke } from '$lib/persistence/tauri';

  let devices = $state<NativeAudioDevice[]>([]);
  let status = $state<NativeBackendStatus | null>(null);
  let message = $state<string | null>(null);

  async function refresh() {
    devices = await listNativeAudioDevices();
    status = await nativeAudioStatus();
  }

  onMount(() => {
    void refresh();
  });

  async function startNative() {
    try {
      message = await tauriInvoke<string>('start_native_output_stream');
      await refresh();
    } catch (error) {
      message = (error as Error).message;
    }
  }

  async function stopNative() {
    try {
      await tauriInvoke('stop_native_output_stream');
      message = 'Native stream stopped';
      await refresh();
    } catch (error) {
      message = (error as Error).message;
    }
  }

  const outputs = $derived(devices.filter((d) => d.isOutput));
  const inputs = $derived(devices.filter((d) => !d.isOutput));
</script>

<section>
  <span class="section-title">Native audio (cpal)</span>
  {#if status}
    <p class="note">{status.host} · {status.message}</p>
  {:else}
    <p class="note">Device list is available in the desktop app.</p>
  {/if}

  {#if outputs.length > 0}
    <span class="field-label">Outputs</span>
    <ul>
      {#each outputs as device (device.id)}
        <li class:default={device.isDefault}>
          {device.name}
          <span>{device.sampleRate} Hz · {device.maxChannels} ch</span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if inputs.length > 0}
    <span class="field-label">Inputs</span>
    <ul>
      {#each inputs as device (device.id)}
        <li class:default={device.isDefault}>
          {device.name}
          <span>{device.sampleRate} Hz · {device.maxChannels} ch</span>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="clip-actions">
    <button onclick={() => void startNative()}>Claim device</button>
    <button onclick={() => void stopNative()}>Release</button>
  </div>

  {#if message}
    <p class="note">{message}</p>
  {/if}

  <p class="note">
    Mixing still runs in Web Audio. The silent cpal stream is the socket for the
    low-latency graph and VST3 hosting.
  </p>
</section>

<style>
  ul {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
  }

  li {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px 0;
    font-size: 11px;
    color: var(--text-secondary);
  }

  li.default {
    color: var(--text-primary);
  }

  li span {
    font-size: 10px;
    color: var(--text-tertiary);
  }

  .note {
    margin: 0 0 8px;
    font-size: 10px;
    line-height: 1.4;
    color: var(--text-tertiary);
  }
</style>
