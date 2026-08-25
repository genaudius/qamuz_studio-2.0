<script lang="ts">
  import NativeDevices from './NativeDevices.svelte';
  import {
    isClaudeConfigured,
    isElevenLabsConfigured,
    readAIConfig,
    saveAIConfig
  } from '$lib/ai/config';
  import { maestroBaseUrl, maestroHealth, saveMaestroBaseUrl } from '$lib/ai/maestro';
  import { hydrateDawSessionsFromCloud, listDawSessions, persistDawSession } from '$lib/persistence/daw-db';
  import { currentStudioSession } from '$lib/persistence/sessions.svelte';
  import { patchSettings, settings } from '$lib/persistence/settings.svelte';
  import { goToSaasPath, isEmbedded, QAMUZ_SAAS_DEV_HOME, QAMUZ_SAAS_HOME } from '$lib/saas';
  import { midiInput, transport } from '$lib/stores';

  let supabaseUrl = $state(readAIConfig().supabaseUrl);
  let supabaseAnonKey = $state(readAIConfig().supabaseAnonKey);
  let anthropicKey = $state(readAIConfig().anthropicKey);
  let elevenLabsKey = $state(readAIConfig().elevenLabsKey);
  let maestroUrl = $state(settings.maestroBaseUrl ?? maestroBaseUrl());
  let modalUrl = $state(settings.modalGenerateUrl ?? '');
  let modalToken = $state(settings.modalApiToken ?? '');
  let maestroOk = $state<boolean | null>(null);
  let saved = $state(false);
  let dbStatus = $state(isEmbedded() ? 'SaaS Postgres (sin probar)' : 'IndexedDB local (sin probar)');
  let dbBusy = $state(false);

  const saasAudioPath = '/audio';

  async function save() {
    await saveAIConfig({
      supabaseUrl: supabaseUrl.trim(),
      supabaseAnonKey: supabaseAnonKey.trim(),
      anthropicKey: anthropicKey.trim(),
      elevenLabsKey: elevenLabsKey.trim()
    });
    await saveMaestroBaseUrl(maestroUrl);
    await patchSettings({
      modalGenerateUrl: modalUrl.trim(),
      modalApiToken: modalToken.trim()
    });
    saved = true;
    maestroOk = await maestroHealth();
    await testDatabase();
  }

  async function ping() {
    maestroOk = await maestroHealth();
  }

  async function testDatabase() {
    dbBusy = true;
    try {
      await persistDawSession(currentStudioSession.record);
      await hydrateDawSessionsFromCloud();
      const rows = await listDawSessions();
      const where = isEmbedded()
        ? 'Postgres del SaaS (tabla daw_session)'
        : 'IndexedDB local — abre Studio desde qamuz.ai para Postgres';
      dbStatus = `${where} · ${rows.length} sesión${rows.length === 1 ? '' : 'es'}`;
    } catch (error) {
      dbStatus = `Error: ${(error as Error).message}`;
    } finally {
      dbBusy = false;
    }
  }
</script>

<div class="wrap">
  <h2>Ajustes de conexión</h2>
  <p class="sub">Maestro habla con GenAudius. Las sesiones del DAW se guardan en la base del SaaS cuando Studio va embebido.</p>

  <section class="block">
    <h3>Base de datos del DAW</h3>
    <p class="sub">
      No hay un Postgres dentro del DAW. El audio sigue en el proyecto; nombres de pistas, mezcla e idea van a
      <code>daw_session</code> en QAMUZ AI.
    </p>
    <p class="status">{dbStatus}</p>
    <div class="row">
      <button class="ghost" disabled={dbBusy} onclick={() => void testDatabase()}>
        {dbBusy ? 'Probando…' : 'Probar y sincronizar'}
      </button>
      <button class="ghost" onclick={() => void goToSaasPath(saasAudioPath)}>Crear música sin DAW</button>
    </div>
  </section>

  <section class="block">
    <h3>Audio</h3>
    <p class="sub">Salida nativa (desktop) y buffer del motor, como en Studio 1.0.</p>
    <NativeDevices />
    <label>
      <span>Metrónomo</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={transport.metronomeVolume}
        oninput={(e) => transport.setMetronomeVolume(Number(e.currentTarget.value))}
      />
    </label>
  </section>

  <section class="block">
    <h3>MIDI</h3>
    <p class="sub">Teclado y controladores conectados a este equipo.</p>
    {#if !midiInput.isSupported}
      <p class="status">Este navegador no expone MIDI. En Windows usa Edge/Chrome o la app de escritorio.</p>
    {:else}
      <div class="row">
        <button class="ghost" onclick={() => void midiInput.enable()}>Buscar dispositivos</button>
      </div>
      {#if midiInput.devices.length}
        <label>
          <span>Entrada MIDI</span>
          <select
            value={midiInput.selectedDeviceID}
            onchange={(e) => midiInput.selectDevice(e.currentTarget.value)}
          >
            <option value="">Todos los dispositivos</option>
            {#each midiInput.devices as device (device.id)}
              <option value={device.id}>{device.name}</option>
            {/each}
          </select>
        </label>
      {:else}
        <p class="status">{midiInput.error ?? 'No hay dispositivos MIDI.'}</p>
      {/if}
    {/if}
  </section>

  <label>
    <span>GenAudius / Maestro URL</span>
    <input bind:value={maestroUrl} placeholder="/genaudius-api o https://…modal.run" />
  </label>
  <label>
    <span>Modal generate URL (opcional)</span>
    <input bind:value={modalUrl} placeholder="https://….modal.run/v1/generate" />
  </label>
  <label>
    <span>Modal token</span>
    <input bind:value={modalToken} type="password" autocomplete="off" />
  </label>
  <label>
    <span>Supabase URL (Claude / ElevenLabs)</span>
    <input bind:value={supabaseUrl} placeholder="https://xxxx.supabase.co" />
  </label>
  <label>
    <span>Supabase anon key</span>
    <input bind:value={supabaseAnonKey} type="password" autocomplete="off" />
  </label>
  <label>
    <span>Anthropic (fallback)</span>
    <input bind:value={anthropicKey} type="password" autocomplete="off" />
  </label>
  <label>
    <span>ElevenLabs (fallback)</span>
    <input bind:value={elevenLabsKey} type="password" autocomplete="off" />
  </label>

  <div class="row">
    <button onclick={() => void save()}>Guardar</button>
    <button class="ghost" onclick={() => void ping()}>Probar Maestro</button>
  </div>
  <p class="status">
    Claude: {isClaudeConfigured() ? 'listo' : 'no'} ·
    ElevenLabs: {isElevenLabsConfigured() ? 'listo' : 'no'} ·
    Maestro: {maestroOk === null ? '—' : maestroOk ? 'en línea' : 'sin conexión'}
    {saved ? ' · guardado' : ''}
  </p>
  <p class="sub">
    SaaS: {import.meta.env.DEV ? QAMUZ_SAAS_DEV_HOME : QAMUZ_SAAS_HOME}audio
  </p>
</div>

<style>
  .wrap {
    padding: 28px;
    max-width: 560px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: auto;
    flex: 1;
  }
  h2,
  h3 {
    margin: 0;
  }
  h3 {
    font-size: 13px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 10px;
    background: var(--bg-control);
  }
  .sub,
  .status {
    color: var(--text-secondary);
    font-size: 13px;
    margin: 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    color: var(--text-tertiary);
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  button,
  select {
    padding: 8px 14px;
    border-radius: 8px;
    background: var(--accent-strong);
    color: var(--on-primary);
  }
  select {
    background: var(--bg-inset);
    color: var(--text-primary);
    border: 1px solid var(--stroke);
  }
  .ghost {
    background: var(--bg-inset);
    color: var(--text-primary);
  }
  button:disabled {
    opacity: 0.5;
  }
  code {
    font-size: 11px;
  }
</style>
