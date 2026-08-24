<script lang="ts">
  import {
    isClaudeConfigured,
    isElevenLabsConfigured,
    readAIConfig,
    saveAIConfig
  } from '$lib/ai/config';
  import { maestroBaseUrl, maestroHealth, saveMaestroBaseUrl } from '$lib/ai/maestro';
  import { patchSettings, settings } from '$lib/persistence/settings.svelte';

  let supabaseUrl = $state(readAIConfig().supabaseUrl);
  let supabaseAnonKey = $state(readAIConfig().supabaseAnonKey);
  let anthropicKey = $state(readAIConfig().anthropicKey);
  let elevenLabsKey = $state(readAIConfig().elevenLabsKey);
  let maestroUrl = $state(settings.maestroBaseUrl ?? maestroBaseUrl());
  let modalUrl = $state(settings.modalGenerateUrl ?? '');
  let modalToken = $state(settings.modalApiToken ?? '');
  let maestroOk = $state<boolean | null>(null);
  let saved = $state(false);

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
  }

  async function ping() {
    maestroOk = await maestroHealth();
  }
</script>

<div class="wrap">
  <h2>Ajustes de conexión</h2>
  <p class="sub">Maestro habla con GenAudius (local o Modal). Claude y ElevenLabs siguen como apoyo.</p>

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
    <span>Supabase URL</span>
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
  h2 {
    margin: 0;
  }
  .sub,
  .status {
    color: var(--text-secondary);
    font-size: 13px;
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
  }
  button {
    padding: 8px 14px;
    border-radius: 8px;
    background: var(--accent-strong);
    color: var(--on-primary);
  }
  .ghost {
    background: var(--bg-control);
    color: var(--text-primary);
  }
</style>
