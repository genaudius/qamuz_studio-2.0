<script lang="ts">
  /**
   * AI assistant sidebar: chat, Generative Fill toggle, and connection settings.
   */

  import Icon from './Icon.svelte';
  import { chatWithClaude } from '$lib/ai/claude';
  import { isClaudeConfigured, isElevenLabsConfigured, readAIConfig, saveAIConfig } from '$lib/ai/config';
  import { executeDawAction, inferDawAction, planAndMaybeRender } from '$lib/ai/daw-actions';
  import { creditsLabel, getElevenLabsCredits, type ElevenLabsCredits } from '$lib/ai/elevenlabs';
  import { beatCountOfRange } from '$lib/ai/fill';
  import { formatPlan, maestroHealth } from '$lib/ai/maestro';
  import type { ChatMessage } from '$lib/ai/types';
  import { newUUID } from '$lib/core/uuid';
  import { onMount } from 'svelte';
  import { projectStore, transport } from '$lib/stores';

  let messages = $state<ChatMessage[]>([]);
  let draft = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let showSettings = $state(false);
  let credits = $state<ElevenLabsCredits | null>(null);
  let maestroOnline = $state(false);

  let supabaseUrl = $state(readAIConfig().supabaseUrl);
  let supabaseAnonKey = $state(readAIConfig().supabaseAnonKey);
  let anthropicKey = $state(readAIConfig().anthropicKey);
  let elevenLabsKey = $state(readAIConfig().elevenLabsKey);

  const range = $derived(projectStore.rangeSelection);
  const rangeTrack = $derived(
    range ? (projectStore.project.tracks.find((t) => t.id === range.trackID) ?? null) : null
  );

  $effect(() => {
    if (isElevenLabsConfigured()) void getElevenLabsCredits().then((info) => (credits = info));
  });

  function projectContext(): string {
    const tracks = projectStore.project.tracks
      .map((t) => `- ${t.name} (${t.type}, ${t.clips.length} clips)`)
      .join('\n');
    return `You are Maestro, the musical director inside Qamuz Studio.
Tempo: ${transport.bpm} BPM
Time signature: ${transport.timeSignature.numerator}/${transport.timeSignature.denominator}
Tracks:
${tracks}

You can tell the user to use Generative Fill, Mixer, Master, or ask GenAudius to render. Be brief.`;
  }

  function push(role: ChatMessage['role'], text: string) {
    messages = [...messages, { id: newUUID(), role, text, createdAt: new Date().toISOString() }];
  }

  async function send(text = draft.trim(), render = false) {
    if (!text || busy) return;
    draft = '';
    push('user', text);
    busy = true;
    error = null;

    try {
      const command = inferDawAction(text);
      if (command) {
        const result = await executeDawAction(command.name, command.args);
        push('assistant', result.message);
        return;
      }

      const wantsRender = render || /\b(crear|create|render|genera(r)? la canci)/i.test(text);
      try {
        const { plan, message } = await planAndMaybeRender(text, wantsRender);
        push('assistant', `${formatPlan(plan)}\n\n${message}`);
        return;
      } catch (maestroError) {
        if (!isClaudeConfigured()) throw maestroError;
        const history = messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }));
        const reply = await chatWithClaude(history, projectContext());
        push('assistant', reply);
      }
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void maestroHealth().then((ok) => (maestroOnline = ok));
    const seed = sessionStorage.getItem('qamuz.maestro.seed');
    if (seed) {
      sessionStorage.removeItem('qamuz.maestro.seed');
      draft = seed;
      const auto = sessionStorage.getItem('qamuz.maestro.autoPlan') === '1';
      sessionStorage.removeItem('qamuz.maestro.autoPlan');
      if (auto) void send(seed, false);
    }
  });

  async function saveSettings() {
    await saveAIConfig({
      supabaseUrl: supabaseUrl.trim(),
      supabaseAnonKey: supabaseAnonKey.trim(),
      anthropicKey: anthropicKey.trim(),
      elevenLabsKey: elevenLabsKey.trim()
    });
    showSettings = false;
    if (isElevenLabsConfigured()) {
      credits = await getElevenLabsCredits();
    }
  }

  function openFill() {
    if (!range) {
      projectStore.aiFillMode = true;
      return;
    }
    projectStore.showGenerateDialog = true;
  }
</script>

<div class="maestro">
<div class="panel-title">
  <Icon name="sparkles" size={12} />
  <span>Maestro</span>
  <span class="live" class:on={maestroOnline}>{maestroOnline ? 'GenAudius' : 'offline'}</span>
  {#if credits}
    <span class="credits">{creditsLabel(credits)} credits</span>
  {/if}
  <span class="flex"></span>
  <button class="icon-btn" title="Connection settings" onclick={() => (showSettings = !showSettings)}>
    <Icon name="inspector" size={12} />
  </button>
</div>

<div class="body">
  <button
    class="fill-toggle"
    class:on={projectStore.aiFillMode}
    title="Drag a beat range on a track to generate"
    onclick={() => {
      projectStore.aiFillMode = !projectStore.aiFillMode;
      if (!projectStore.aiFillMode) projectStore.setRangeSelection(null);
    }}
  >
    <Icon name="wand" size={13} />
    Generative Fill {projectStore.aiFillMode ? 'on' : 'off'}
  </button>

  {#if range && rangeTrack}
    <button class="range-chip" onclick={openFill}>
      {rangeTrack.name}: {beatCountOfRange()} beats
      {projectStore.isAIGenerating ? ' · generating…' : ' · generate'}
    </button>
  {:else if projectStore.aiFillMode}
    <p class="hint">Drag across a track to choose beats, then describe what you want.</p>
  {/if}

  {#if showSettings}
    <section class="settings">
      <p class="hint">
        Prefer the Supabase edge proxies from the 1.0 project. Keys stay in local settings, never in git.
      </p>
      <label class="field">
        <span class="field-label">Supabase URL</span>
        <input bind:value={supabaseUrl} placeholder="https://xxxx.supabase.co" />
      </label>
      <label class="field">
        <span class="field-label">Supabase anon key</span>
        <input bind:value={supabaseAnonKey} type="password" autocomplete="off" />
      </label>
      <label class="field">
        <span class="field-label">Anthropic key (fallback)</span>
        <input bind:value={anthropicKey} type="password" autocomplete="off" />
      </label>
      <label class="field">
        <span class="field-label">ElevenLabs key (fallback)</span>
        <input bind:value={elevenLabsKey} type="password" autocomplete="off" />
      </label>
      <button class="chip" onclick={() => void saveSettings()}>Save connection</button>
      <p class="status">
        Claude: {isClaudeConfigured() ? 'ready' : 'not configured'} ·
        ElevenLabs: {isElevenLabsConfigured() ? 'ready' : 'not configured'}
      </p>
    </section>
  {/if}

  <div class="log">
    {#if messages.length === 0}
      <p class="hint">Soy Maestro. Dime la idea de la canción, o pide play, mixer, master, una pista nueva.</p>
    {/if}
    {#each messages as message (message.id)}
      <div class="bubble {message.role}">{message.text}</div>
    {/each}
    {#if busy}
      <div class="bubble assistant dim">Thinking…</div>
    {/if}
  </div>

  {#if error}
    <p class="warn">{error}</p>
  {/if}

  <form
    class="composer"
    onsubmit={(e) => {
      e.preventDefault();
      void send();
    }}
  >
    <input
      bind:value={draft}
      placeholder="Idea, comando o “crear” para renderizar…"
    />
    <button class="icon-btn" type="submit" disabled={!draft.trim() || busy} title="Send">
      <Icon name="send" size={13} />
    </button>
  </form>
</div>
</div>

<style>
  .maestro {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    min-height: 0;
    flex: 1;
  }

  .flex {
    flex: 1;
  }

  .credits {
    font-size: 10px;
    color: var(--time);
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(83, 225, 111, 0.12);
  }

  .live {
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .live.on {
    color: var(--time);
  }

  .fill-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--bg-control);
    color: var(--text-secondary);
    font-size: 12px;
  }

  .fill-toggle.on {
    background: rgba(201, 160, 255, 0.18);
    color: var(--ai);
    box-shadow: inset 0 0 0 1px var(--ai);
  }

  .range-chip {
    padding: 6px 10px;
    border-radius: 6px;
    background: rgba(201, 160, 255, 0.12);
    color: var(--ai);
    font-size: 11px;
    text-align: left;
  }

  .hint,
  .status {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-tertiary);
  }

  .settings {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--stroke);
  }

  .log {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 80px;
  }

  .bubble {
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .bubble.user {
    align-self: flex-end;
    background: var(--accent-dim);
    color: var(--text-primary);
  }

  .bubble.assistant {
    align-self: flex-start;
    background: var(--bg-control);
  }

  .bubble.dim {
    color: var(--text-tertiary);
  }

  .warn {
    margin: 0;
    font-size: 11px;
    color: var(--warn);
  }

  .composer {
    display: flex;
    gap: 4px;
  }

  .chip {
    align-self: flex-start;
    padding: 4px 8px;
    border-radius: 5px;
    background: var(--bg-control);
    font-size: 11px;
  }
</style>
