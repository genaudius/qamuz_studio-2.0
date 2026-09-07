<script lang="ts">
  /**
   * Song profile chip — sits above the track list like the session’s “master”
   * identity: cover, title, artist. Used in the arrange header column.
   */

  import { account } from '$lib/account.svelte';
  import { persistFullSession } from '$lib/persistence/daw-db';
  import { currentStudioSession } from '$lib/persistence/sessions.svelte';
  import { documentStatus } from '$lib/persistence/documents.svelte';
  import { projectStore } from '$lib/stores';

  interface Props {
    /** `header` = track-column profile; `lane` = matching strip on the timeline; `compact` = transport. */
    variant?: 'header' | 'lane' | 'compact';
  }

  let { variant = 'header' }: Props = $props();

  const session = $derived(currentStudioSession.record);
  const visible = $derived(Boolean(session?.musicId || session?.imageUrl));
  const title = $derived(session?.title || session?.name || projectStore.project.name || 'Canción');
  const artist = $derived(account.displayName);
  const cover = $derived(session?.imageUrl || '');

  let saving = $state(false);

  async function saveNow() {
    if (saving) return;
    saving = true;
    try {
      const saved = await persistFullSession();
      documentStatus.message = `Guardé “${saved.name}” en Studio + QAMUZ`;
      documentStatus.tone = 'success';
    } catch (error) {
      documentStatus.message = (error as Error).message || 'No pude guardar';
      documentStatus.tone = 'error';
    } finally {
      saving = false;
    }
  }
</script>

{#if visible}
  {#if variant === 'lane'}
    <div class="song-lane" style:--cover={cover ? `url("${cover}")` : 'none'} aria-hidden="true">
      <div class="song-lane-shade">
        <span class="song-lane-title">{title}</span>
        <span class="song-lane-artist">{artist}</span>
      </div>
    </div>
  {:else if variant === 'compact'}
    <div class="song-compact" title={`${title} · ${artist}`}>
      <div class="art">
        {#if cover}
          <img src={cover} alt="" />
        {:else}
          <span class="fallback">{title.slice(0, 1).toUpperCase()}</span>
        {/if}
      </div>
      <div class="meta">
        <span class="title">{title}</span>
        <span class="artist">{artist}</span>
      </div>
    </div>
  {:else}
    <aside class="song-header" aria-label="Perfil de la canción">
      <div class="art">
        {#if cover}
          <img src={cover} alt="" />
        {:else}
          <span class="fallback">{title.slice(0, 1).toUpperCase()}</span>
        {/if}
      </div>
      <div class="meta">
        <p class="kicker">Sesión</p>
        <p class="title" title={title}>{title}</p>
        <p class="artist" title={artist}>{artist}</p>
      </div>
      <button type="button" class="save" disabled={saving} onclick={() => void saveNow()}>
        {saving ? '…' : 'Guardar'}
      </button>
    </aside>
  {/if}
{/if}

<style>
  .song-header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 56px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--stroke);
    background: linear-gradient(180deg, var(--bg-elevated), var(--bg-panel));
    flex: none;
    min-width: 0;
  }

  .art {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    overflow: hidden;
    flex: none;
    background: var(--bg-inset);
    border: 1px solid var(--stroke);
  }

  .art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .fallback {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    font-weight: 800;
    font-size: 14px;
    color: var(--accent);
  }

  .meta {
    min-width: 0;
    flex: 1;
  }

  .kicker {
    margin: 0;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .title,
  .artist {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
  }

  .artist {
    margin-top: 1px;
    font-size: 10px;
    color: var(--text-tertiary);
  }

  .save {
    flex: none;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--stroke);
    background: var(--accent-dim);
    color: var(--accent);
    font-size: 10px;
    font-weight: 700;
  }

  .save:disabled {
    opacity: 0.55;
  }

  .song-lane {
    height: 56px;
    flex: none;
    position: sticky;
    top: 30px;
    z-index: 4;
    border-bottom: 1px solid var(--stroke);
    background:
      linear-gradient(90deg, rgba(8, 10, 16, 0.78), rgba(8, 10, 16, 0.4) 45%, rgba(8, 10, 16, 0.62)),
      var(--cover) center / cover no-repeat,
      var(--bg-inset);
  }

  .song-lane-shade {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
    padding: 0 16px;
    gap: 2px;
  }

  .song-lane-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
  }

  .song-lane-artist {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .song-compact {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    max-width: 180px;
    padding: 3px 8px 3px 3px;
    border-radius: 999px;
    border: 1px solid var(--stroke);
    background: var(--bg-control);
  }

  .song-compact .art {
    width: 28px;
    height: 28px;
    border-radius: 50%;
  }

  .song-compact .title {
    font-size: 11px;
  }

  .song-compact .artist {
    font-size: 9px;
  }

  .song-compact .meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  @media (max-width: 900px) {
    .song-header {
      height: 52px;
      padding: 5px 6px;
      gap: 6px;
    }

    .song-header .art {
      width: 38px;
      height: 38px;
      border-radius: 9px;
    }

    .song-lane {
      height: 52px;
    }

    .song-compact {
      max-width: 120px;
    }

    .song-compact .artist {
      display: none;
    }
  }
</style>
