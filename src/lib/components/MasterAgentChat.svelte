<script lang="ts">
  /**
   * Maestro as the QAMUZ MASTER PRO assistant.
   */

  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { runMasterAgent } from '$lib/ai/master-agent';
  import { maestroHealth } from '$lib/ai/maestro';
  import type { ChatMessage } from '$lib/ai/types';
  import { newUUID } from '$lib/core/uuid';
  import { masterSession } from '$lib/stores/master.svelte';

  let messages = $state<ChatMessage[]>([]);
  let draft = $state('');
  let busy = $state(false);
  let maestroOnline = $state(false);

  function push(role: ChatMessage['role'], text: string) {
    messages = [...messages, { id: newUUID(), role, text, createdAt: new Date().toISOString() }];
  }

  async function send(text = draft.trim()) {
    if (!text || busy) return;
    draft = '';
    push('user', text);
    busy = true;
    try {
      const reply = await runMasterAgent(text);
      push('assistant', reply);
    } catch (error) {
      push('assistant', (error as Error).message);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void maestroHealth().then((ok) => (maestroOnline = ok));
    push(
      'assistant',
      'Soy Maestro en QAMUZ MASTER PRO. Importa el audio a la izquierda — librería, archivo o mix del arrange — y te ayudo a elegir estilo, EQ y masterizar.'
    );
  });
</script>

<aside class="agent">
  <header>
    <Icon name="sparkles" size={13} />
    <div>
      <strong>Maestro</strong>
      <em>Agente MASTER PRO</em>
    </div>
    <span class="live" class:on={maestroOnline}>{maestroOnline ? 'live' : 'local'}</span>
  </header>

  <p class="now">{masterSession.hasSource ? masterSession.sourceName : 'Sin audio cargado'}</p>

  <div class="log">
    {#each messages as message (message.id)}
      <div class="bubble {message.role}">{message.text}</div>
    {/each}
    {#if busy}
      <div class="bubble assistant dim">Trabajando…</div>
    {/if}
  </div>

  <form
    onsubmit={(event) => {
      event.preventDefault();
      void send();
    }}
  >
    <input bind:value={draft} placeholder="Masteriza, Q-Warm, loudness 0.7…" />
    <button type="submit" disabled={!draft.trim() || busy} title="Enviar">
      <Icon name="send" size={13} />
    </button>
  </form>
</aside>

<style>
  .agent {
    display: flex;
    flex-direction: column;
    width: 280px;
    flex: none;
    background: var(--bg-panel);
    border-left: 1px solid var(--stroke);
    min-height: 0;
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 12px 8px;
  }

  strong {
    display: block;
    font-size: 13px;
  }

  em {
    display: block;
    font-style: normal;
    font-size: 10px;
    color: var(--text-tertiary);
  }

  .live {
    margin-left: auto;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .live.on {
    color: var(--play);
  }

  .now {
    margin: 0 12px 8px;
    padding: 6px 8px;
    border-radius: var(--radius);
    background: var(--accent-faint);
    color: var(--text-secondary);
    font-size: 11px;
  }

  .log {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 12px;
    min-height: 0;
  }

  .bubble {
    padding: 8px 10px;
    border-radius: var(--radius);
    font-size: 12px;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .bubble.user {
    align-self: flex-end;
    background: var(--accent-dim);
  }

  .bubble.assistant {
    align-self: flex-start;
    background: var(--bg-elevated);
  }

  .bubble.dim {
    color: var(--text-tertiary);
  }

  form {
    display: flex;
    gap: 6px;
    padding: 10px 12px 12px;
  }

  input {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border-radius: var(--radius);
    background: var(--bg-inset);
    color: var(--text-primary);
    font-size: 12px;
  }

  button {
    width: 34px;
    border-radius: var(--radius);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    display: grid;
    place-items: center;
  }
</style>
