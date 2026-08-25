<script lang="ts">
  import { workProgress } from '$lib/stores/work-progress.svelte';
</script>

{#if workProgress.active}
  <div class="overlay" role="status" aria-live="polite">
    <div class="card">
      <p class="kicker">Maestro</p>
      <h2>{workProgress.title}</h2>
      {#if workProgress.detail}
        <p class="detail">{workProgress.detail}</p>
      {/if}
      <ol>
        {#each workProgress.steps as step}
          <li class={step.state}>
            <span class="mark"></span>
            {step.label}
          </li>
        {/each}
      </ol>
      {#if workProgress.error}
        <p class="err">{workProgress.error}</p>
        <button type="button" onclick={() => workProgress.stop()}>Cerrar</button>
      {:else}
        <p class="wait">Trabajando… no cierres esta canción.</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    background: rgba(10, 10, 12, 0.62);
    backdrop-filter: blur(8px);
  }

  .card {
    width: min(420px, calc(100% - 32px));
    padding: 22px 24px;
    border-radius: 16px;
    background: var(--bg-panel);
    border: 1px solid var(--stroke);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  }

  .kicker {
    margin: 0 0 4px;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ai);
  }

  h2 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 650;
  }

  .detail,
  .wait {
    margin: 0 0 12px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-secondary);
  }

  ol {
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-tertiary);
  }

  li.active {
    color: var(--text-primary);
  }

  li.done {
    color: var(--time);
  }

  .mark {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--bg-inset);
    flex: none;
  }

  li.active .mark {
    background: var(--ai);
    box-shadow: 0 0 0 4px rgba(201, 160, 255, 0.22);
    animation: pulse 1.1s ease-in-out infinite;
  }

  li.done .mark {
    background: var(--time);
  }

  .err {
    margin: 0 0 12px;
    font-size: 12px;
    color: var(--warn);
  }

  button {
    padding: 7px 12px;
    border-radius: 8px;
    background: var(--bg-control);
    color: var(--text-primary);
    font-size: 12px;
  }

  @keyframes pulse {
    50% {
      transform: scale(1.15);
    }
  }
</style>
