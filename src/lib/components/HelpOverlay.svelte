<script lang="ts">
  /**
   * Full-DAW help: the system map, and a button to ask Maestro the same question.
   */

  import Icon from './Icon.svelte';
  import { HELP_TOPICS } from '$lib/ai/studio-help';
  import { studioHelp } from '$lib/stores/help.svelte';

  const topic = $derived(HELP_TOPICS.find((item) => item.id === studioHelp.topicId) ?? HELP_TOPICS[0]);

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      studioHelp.hide();
    }
  }
</script>

{#if studioHelp.open}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Ayuda de QAMUZ Studio" tabindex="-1" onkeydown={onKey}>
    <div class="card">
      <header>
        <div>
          <p class="kicker">Ayuda · F1</p>
          <h2>Mapa de QAMUZ Studio</h2>
        </div>
        <button class="icon" title="Cerrar" onclick={() => studioHelp.hide()}>
          <Icon name="close" size={14} />
        </button>
      </header>

      <div class="split">
        <nav aria-label="Temas">
          {#each HELP_TOPICS as item}
            <button class="topic" class:on={item.id === topic.id} onclick={() => (studioHelp.topicId = item.id)}>
              <strong>{item.title}</strong>
              <span>{item.summary}</span>
            </button>
          {/each}
        </nav>
        <article>
          <h3>{topic.title}</h3>
          <p class="body">{topic.body}</p>
          <div class="row">
            <button class="ask" onclick={() => studioHelp.askMaestro(topic.ask)}>Preguntarle a Maestro</button>
            <button class="ghost" onclick={() => studioHelp.hide()}>Cerrar</button>
          </div>
        </article>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 45;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(10, 10, 12, 0.62);
    backdrop-filter: blur(8px);
  }

  .card {
    width: min(920px, 100%);
    max-height: min(640px, 100%);
    display: flex;
    flex-direction: column;
    background: var(--bg-elevated);
    border: 1px solid var(--stroke);
    border-radius: 14px;
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--stroke);
  }

  .kicker {
    margin: 0;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ai);
  }

  h2 {
    margin: 2px 0 0;
    font-size: 16px;
  }

  .icon {
    padding: 6px;
    border-radius: 8px;
    color: var(--text-tertiary);
  }

  .icon:hover {
    background: var(--bg-control);
    color: var(--text-primary);
  }

  .split {
    display: grid;
    grid-template-columns: minmax(180px, 240px) 1fr;
    min-height: 0;
    flex: 1;
  }

  nav {
    overflow: auto;
    border-right: 1px solid var(--stroke);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .topic {
    text-align: left;
    padding: 8px 10px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--text-secondary);
  }

  .topic strong {
    font-size: 12px;
    color: var(--text-primary);
  }

  .topic span {
    font-size: 10px;
    line-height: 1.35;
  }

  .topic:hover,
  .topic.on {
    background: var(--accent-dim);
  }

  article {
    overflow: auto;
    padding: 16px 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  h3 {
    margin: 0;
    font-size: 15px;
  }

  .body {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-secondary);
    white-space: pre-wrap;
  }

  .row {
    display: flex;
    gap: 8px;
    margin-top: auto;
  }

  .ask {
    padding: 8px 12px;
    border-radius: 8px;
    background: linear-gradient(90deg, #7c3aed, var(--accent-strong));
    color: white;
    font-size: 12px;
    font-weight: 650;
  }

  .ghost {
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--bg-control);
    color: var(--text-secondary);
    font-size: 12px;
  }

  @media (max-width: 720px) {
    .split {
      grid-template-columns: 1fr;
    }

    nav {
      max-height: 160px;
      border-right: 0;
      border-bottom: 1px solid var(--stroke);
    }
  }
</style>
