<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { studioNotice, type StudioNoticeTone } from '$lib/ui/studio-notice.svelte';

  const toneAccent: Record<StudioNoticeTone, string> = {
    info: 'var(--accent, #3ae0d5)',
    success: '#34d399',
    warning: '#fbbf24',
    danger: '#fb7185'
  };

  function onKey(event: KeyboardEvent) {
    if (!studioNotice.open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      studioNotice.settle(false);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      studioNotice.settle(true);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if studioNotice.open && studioNotice.request}
  {@const req = studioNotice.request}
  {@const tone = req.tone ?? 'info'}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="notice-root" transition:fade={{ duration: 150 }} onclick={() => studioNotice.settle(false)}>
    <div class="notice-backdrop"></div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="notice-card"
      style={`--tone:${toneAccent[tone]}`}
      transition:scale={{ duration: 170, start: 0.96 }}
      role="alertdialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="studio-notice-title"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="notice-glow"></div>
      <h2 id="studio-notice-title">{req.title}</h2>
      {#if req.description}
        <p>{req.description}</p>
      {/if}
      <div class="notice-actions">
        {#if req.showCancel !== false && req.cancelLabel !== null}
          <button type="button" class="ghost" onclick={() => studioNotice.settle(false)}>
            {req.cancelLabel || 'Cancelar'}
          </button>
        {/if}
        <button type="button" class="primary" onclick={() => studioNotice.settle(true)}>
          {req.confirmLabel || 'Continuar'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .notice-root {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: grid;
    place-items: center;
    padding: 1rem;
  }
  .notice-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(10px);
  }
  .notice-card {
    position: relative;
    width: min(420px, 100%);
    overflow: hidden;
    border-radius: 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(18, 18, 20, 0.96);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
    padding: 1.5rem 1.4rem 1.25rem;
    color: #f4f4f5;
  }
  .notice-glow {
    position: absolute;
    inset: 0 0 auto;
    height: 5rem;
    background: linear-gradient(180deg, color-mix(in oklab, var(--tone) 28%, transparent), transparent);
    pointer-events: none;
  }
  h2 {
    position: relative;
    margin: 0;
    font-size: 1.15rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  p {
    position: relative;
    margin: 0.55rem 0 0;
    color: rgba(255, 255, 255, 0.65);
    font-size: 0.9rem;
    line-height: 1.45;
  }
  .notice-actions {
    position: relative;
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.25rem;
  }
  button {
    border: 0;
    border-radius: 0.75rem;
    padding: 0.55rem 0.9rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .ghost {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.82);
  }
  .ghost:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .primary {
    background: var(--tone);
    color: #0a0a0a;
  }
  .primary:hover {
    filter: brightness(1.06);
  }
</style>
