<script lang="ts">
  /**
   * Maestro session gate: continue last song, pick a session, choose library /
   * playlist tracks, or describe a new idea before opening the arrange.
   */

  import { onMount } from 'svelte';
  import {
    availableName,
    makeBaseName,
    sessionGate,
    upsertSession,
    type StudioSession
  } from '$lib/persistence/sessions.svelte';
  import { openProject, openProjectAtPath, recentProjects } from '$lib/persistence/documents.svelte';
  import { isTauri } from '$lib/persistence/tauri';
  import { arrangeHasAudio } from '$lib/ai/session-inventory';
  import { saasApi } from '$lib/saas-api';
  import { openMixSessionFromSong, openStemSessionFromSong } from '$lib/audio/open-stems-session';
  import { workProgress } from '$lib/stores/work-progress.svelte';

  interface Props {
    onOpen: (session: StudioSession, isNew: boolean) => void;
  }

  type LibrarySong = {
    id: string;
    title: string;
    durationMs?: number | null;
    prompt?: string | null;
    genre?: string | null;
    isInstrumental?: boolean;
    imageUrl?: string | null;
  };

  type PlaylistBucket = {
    id: string;
    name: string;
    tracks: LibrarySong[];
  };

  let { onOpen }: Props = $props();
  let idea = $state('');
  let sessionName = $state('');
  let nameWarning = $state('');
  let query = $state('');
  let songQuery = $state('');
  let library = $state<LibrarySong[]>([]);
  let playlists = $state<PlaylistBucket[]>([]);
  let songsLoading = $state(false);
  let songsError = $state('');
  let selectedPlaylistId = $state<string | 'library'>('library');
  let launchingId = $state<string | null>(null);

  const sessions = $derived(sessionGate.items);
  const importedReady = $derived(arrangeHasAudio());
  const filtered = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    if (!needle) return sessions;
    return sessions.filter(
      (item) =>
        item.name.toLocaleLowerCase('es').includes(needle) ||
        item.idea.toLocaleLowerCase('es').includes(needle) ||
        (item.title ?? '').toLocaleLowerCase('es').includes(needle)
    );
  });
  const filteredRecents = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    if (!needle) return recentProjects.items;
    return recentProjects.items.filter(
      (item) =>
        item.name.toLocaleLowerCase('es').includes(needle) ||
        item.path.toLocaleLowerCase('es').includes(needle)
    );
  });

  const visibleSongs = $derived.by(() => {
    const source =
      selectedPlaylistId === 'library'
        ? library
        : playlists.find((p) => p.id === selectedPlaylistId)?.tracks || [];
    const needle = songQuery.trim().toLocaleLowerCase('es');
    if (!needle) return source;
    return source.filter(
      (song) =>
        song.title.toLocaleLowerCase('es').includes(needle) ||
        (song.prompt || '').toLocaleLowerCase('es').includes(needle) ||
        (song.genre || '').toLocaleLowerCase('es').includes(needle)
    );
  });

  async function loadSongs() {
    songsLoading = true;
    songsError = '';
    try {
      const response = await saasApi({ path: '/api/studio/songs' });
      const body = response.json as
        | { library?: LibrarySong[]; playlists?: PlaylistBucket[]; error?: string }
        | undefined;
      if (response.status !== 200) {
        songsError = body?.error || response.error || 'No pude cargar tus canciones';
        return;
      }
      library = Array.isArray(body?.library) ? body!.library! : [];
      playlists = Array.isArray(body?.playlists) ? body!.playlists! : [];
    } catch (error) {
      songsError = error instanceof Error ? error.message : 'No pude cargar tus canciones';
    } finally {
      songsLoading = false;
    }
  }

  onMount(() => {
    if (sessionGate.view === 'songs') void loadSongs();
  });

  $effect(() => {
    if (sessionGate.view === 'songs' && !library.length && !songsLoading && !songsError) {
      void loadSongs();
    }
  });

  function continueToName() {
    if (!idea.trim()) return;
    nameWarning = '';
    sessionGate.view = 'name';
  }

  function openExisting(item: StudioSession) {
    if (importedReady) {
      sessionGate.close();
      return;
    }
    onOpen(upsertSession(item), false);
    sessionGate.close();
  }

  function createSession() {
    const requested = sessionName.trim();
    const finalName = availableName(requested, idea, sessions);
    if (requested && finalName.toLocaleLowerCase('es') !== requested.toLocaleLowerCase('es')) {
      nameWarning = `“${requested}” ya está en uso. He preparado “${finalName}”. Pulsa otra vez para aceptarlo o escribe otro nombre.`;
      sessionName = finalName;
      return;
    }
    const now = new Date().toISOString();
    onOpen(
      upsertSession({
        name: finalName,
        idea: idea.trim(),
        createdAt: now,
        updatedAt: now,
        stage: 'planning'
      }),
      true
    );
    sessionGate.close();
  }

  async function openSong(song: LibrarySong, extractStems: boolean) {
    if (launchingId) return;
    launchingId = song.id;
    sessionGate.close();
    try {
      const payload = {
        musicId: song.id,
        session: song.title,
        idea: song.prompt || song.title,
        genre: song.genre || undefined,
        instrumental: Boolean(song.isInstrumental),
        imageUrl: song.imageUrl || undefined
      };
      if (extractStems) await openStemSessionFromSong(payload);
      else await openMixSessionFromSong(payload);
    } catch (error) {
      workProgress.fail((error as Error).message);
      sessionGate.open('songs');
    } finally {
      launchingId = null;
    }
  }
</script>

<div class="gate">
  <div class="card" class:wide={sessionGate.view === 'songs'}>
    <header>
      <p>QAMUZ · MAESTRO</p>
      <h1>QAMUZ Studio</h1>
    </header>

    <div class="body">
      {#if sessionGate.view === 'home'}
        {#if importedReady}
          <p class="notice">Ya tienes audio en el arrange. Escúchalo con Play. El título se cambia con doble clic en el nombre de arriba.</p>
          <button class="primary" onclick={() => sessionGate.close()}>Ir al editor</button>
        {:else}
        <p class="notice">¿Continuamos con la última sesión, abrimos una canción de tu biblioteca, o creamos algo nuevo?</p>
        {#if sessions[0]}
          <button class="last" onclick={() => openExisting(sessions[0])}>
            <span>Continuar última sesión</span>
            <strong>{sessions[0].name}</strong>
            <em>{sessions[0].idea}</em>
          </button>
        {/if}
        <div class="row">
          <button class="ghost" onclick={() => (sessionGate.view = 'list')}>
            Sesiones ({sessions.length})
          </button>
          <button
            class="ghost"
            onclick={() => {
              sessionGate.view = 'songs';
              void loadSongs();
            }}
          >
            Canciones
          </button>
          <button
            class="primary"
            onclick={() => {
              idea = '';
              sessionName = '';
              sessionGate.view = 'idea';
            }}
          >
            + Nueva
          </button>
        </div>
        {/if}
      {:else if sessionGate.view === 'songs'}
        <div class="toolbar">
          <div>
            <h2>Tus canciones</h2>
            <p>Biblioteca y playlists. Ábrelas en el editor o extrae stems.</p>
          </div>
          <button class="ghost" onclick={() => (sessionGate.view = 'home')}>Volver</button>
        </div>
        <input bind:value={songQuery} placeholder="Buscar canción, género o letra…" />
        <div class="tabs">
          <button
            class="tab"
            class:on={selectedPlaylistId === 'library'}
            onclick={() => (selectedPlaylistId = 'library')}
          >
            Biblioteca ({library.length})
          </button>
          {#each playlists as playlist (playlist.id)}
            <button
              class="tab"
              class:on={selectedPlaylistId === playlist.id}
              onclick={() => (selectedPlaylistId = playlist.id)}
            >
              {playlist.name} ({playlist.tracks.length})
            </button>
          {/each}
        </div>
        {#if songsLoading}
          <p class="notice">Cargando canciones…</p>
        {:else if songsError}
          <p class="warn">{songsError}</p>
          <button class="ghost" onclick={() => void loadSongs()}>Reintentar</button>
        {:else}
          <div class="list songs">
            {#each visibleSongs as song (song.id)}
              <div class="song-row">
                {#if song.imageUrl}
                  <img src={song.imageUrl} alt="" />
                {:else}
                  <div class="art-fallback">Q</div>
                {/if}
                <div class="song-meta">
                  <strong>{song.title}</strong>
                  <em>{song.genre || 'Sin género'}{song.isInstrumental ? ' · instrumental' : ''}</em>
                </div>
                <div class="song-actions">
                  <button
                    class="ghost"
                    disabled={launchingId === song.id}
                    onclick={() => void openSong(song, false)}
                  >
                    Abrir
                  </button>
                  <button
                    class="primary"
                    disabled={launchingId === song.id}
                    onclick={() => void openSong(song, true)}
                  >
                    {launchingId === song.id ? '…' : 'Stems'}
                  </button>
                </div>
              </div>
            {:else}
              <p class="notice">No hay canciones en esta lista.</p>
            {/each}
          </div>
        {/if}
      {:else if sessionGate.view === 'list' || sessionGate.view === 'open'}
        <div class="toolbar">
          <div>
            <h2>{sessionGate.view === 'open' ? 'Abrir' : 'Tus sesiones'}</h2>
            <p>Busca una sesión guardada aquí, en la nube o un .dawproj de este equipo.</p>
          </div>
          <button class="ghost" onclick={() => (sessionGate.view = 'home')}>Volver</button>
        </div>
        <input
          bind:value={query}
          placeholder="Buscar por nombre, idea o título…"
        />
        <button class="primary" onclick={() => void openProject()}>
          {isTauri() ? 'Buscar .dawproj en este equipo' : 'Abrir project.json / carpeta'}
        </button>
        {#if filteredRecents.length}
          <p class="kicker">Recientes en este equipo</p>
          <div class="list">
            {#each filteredRecents as item (item.path)}
              <button class="last" onclick={() => void openProjectAtPath(item.path)}>
                <strong>{item.name}</strong>
                <em>{item.path}</em>
              </button>
            {/each}
          </div>
        {/if}
        <p class="kicker">Sesiones de Maestro</p>
        <div class="list">
          {#each filtered as item (item.name)}
            <button class="last" onclick={() => openExisting(item)}>
              <span class="row-main">
                {#if item.imageUrl}
                  <img class="thumb" src={item.imageUrl} alt="" />
                {/if}
                <span>
                  <strong>{item.name}</strong>
                  <em>{item.idea}{item.tempo ? ` · ${item.tempo} BPM` : ''}{item.musicId ? ' · biblioteca' : ''}</em>
                </span>
              </span>
            </button>
          {/each}
          {#if !filtered.length}
            <p class="notice">No hay sesiones con esa búsqueda.</p>
          {/if}
        </div>
      {:else if sessionGate.view === 'idea'}
        <p class="notice">Esta será una sesión nueva. Dime qué quieres que haga en esta canción y prepararé el proyecto.</p>
        <label for="studioIdea">Tu idea musical</label>
        <textarea
          id="studioIdea"
          bind:value={idea}
          rows="5"
          placeholder="Ej.: Una bachata romántica y bailable sobre un amor que regresa…"
        ></textarea>
        <div class="row">
          {#if sessions.length}
            <button class="ghost" onclick={() => (sessionGate.view = 'home')}>Atrás</button>
          {/if}
          <button class="primary" disabled={!idea.trim()} onclick={continueToName}>Continuar</button>
        </div>
      {:else}
        <p class="notice">¿Cómo quieres llamar esta sesión? Si lo dejas vacío crearé un título QAMUZ derivado de la idea.</p>
        <label for="studioName">Nombre de la sesión <span>(opcional)</span></label>
        <input
          id="studioName"
          bind:value={sessionName}
          placeholder={makeBaseName(idea)}
          oninput={() => (nameWarning = '')}
          onkeydown={(event) => event.key === 'Enter' && createSession()}
        />
        {#if nameWarning}
          <p class="warn">{nameWarning}</p>
        {/if}
        <div class="row">
          <button class="ghost" onclick={() => (sessionGate.view = 'idea')}>Atrás</button>
          <button class="primary" onclick={createSession}>Abrir sesión y trabajar</button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .gate {
    position: absolute;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 24px;
    padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
    background:
      radial-gradient(circle at 50% 38%, rgba(8, 12, 26, 0.35), rgba(3, 5, 10, 0.78) 70%),
      var(--bg-window);
  }

  .card {
    width: min(520px, 100%);
    overflow: hidden;
    border: 1px solid rgba(201, 160, 255, 0.28);
    border-radius: 24px;
    background: rgba(19, 19, 19, 0.92);
    box-shadow: 0 35px 110px rgba(0, 0, 0, 0.74), 0 0 65px rgba(104, 72, 220, 0.18);
  }

  .card.wide {
    width: min(720px, 100%);
  }

  header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--stroke);
  }

  header p {
    margin: 0;
    color: var(--ai);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.22em;
  }

  h1,
  h2 {
    margin: 8px 0 0;
    font-size: 24px;
    color: var(--text-primary);
  }

  h2 {
    font-size: 18px;
  }

  .body {
    display: grid;
    gap: 16px;
    padding: 22px;
  }

  .notice,
  .last {
    padding: 15px;
    border: 1px solid rgba(0, 174, 239, 0.2);
    border-radius: 16px;
    background: rgba(0, 174, 239, 0.06);
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.55;
    text-align: left;
  }

  .last {
    border-color: rgba(201, 160, 255, 0.28);
    background: rgba(201, 160, 255, 0.08);
  }

  .row-main {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .row-main .thumb {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    object-fit: cover;
    flex: none;
  }

  .row-main strong,
  .row-main em {
    display: block;
  }

  .last span,
  .last em {
    display: block;
    color: var(--text-tertiary);
  }

  .last span {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ai);
  }

  .last strong {
    display: block;
    margin: 5px 0;
    color: var(--text-primary);
    font-size: 18px;
  }

  .kicker {
    margin: 8px 0 0;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ai);
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .row:has(> :nth-child(3)) {
    grid-template-columns: 1fr 1fr 1fr;
  }

  .row > :only-child {
    grid-column: 1 / -1;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .toolbar p {
    margin: 4px 0 0;
    color: var(--text-tertiary);
    font-size: 13px;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tab {
    border: 1px solid var(--stroke);
    border-radius: 999px;
    padding: 8px 12px;
    background: var(--bg-control);
    color: var(--text-secondary);
    font-size: 12px;
  }

  .tab.on {
    border-color: transparent;
    background: linear-gradient(90deg, #7c3aed, var(--accent-strong));
    color: white;
  }

  .list {
    display: grid;
    gap: 8px;
    max-height: 300px;
    overflow: auto;
  }

  .list.songs {
    max-height: 360px;
  }

  .song-row {
    display: grid;
    grid-template-columns: 48px 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 10px;
    border: 1px solid rgba(201, 160, 255, 0.2);
    border-radius: 14px;
    background: rgba(201, 160, 255, 0.06);
  }

  .song-row img,
  .art-fallback {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    object-fit: cover;
  }

  .art-fallback {
    display: grid;
    place-items: center;
    background: #222;
    color: #3ae0d5;
    font-weight: 800;
  }

  .song-meta strong,
  .song-meta em {
    display: block;
  }

  .song-meta strong {
    color: var(--text-primary);
    font-size: 14px;
  }

  .song-meta em {
    color: var(--text-tertiary);
    font-size: 12px;
    font-style: normal;
  }

  .song-actions {
    display: flex;
    gap: 6px;
  }

  .ghost,
  .primary {
    border: 1px solid var(--stroke);
    border-radius: 12px;
    padding: 12px 16px;
    background: var(--bg-control);
    color: var(--text-secondary);
  }

  .song-actions .ghost,
  .song-actions .primary {
    padding: 8px 10px;
    font-size: 12px;
  }

  .primary {
    border: 0;
    background: linear-gradient(90deg, #7c3aed, var(--accent-strong));
    color: white;
    font-weight: 750;
  }

  .primary:disabled,
  .ghost:disabled {
    opacity: 0.4;
  }

  label {
    font-size: 13px;
    color: var(--text-secondary);
  }

  label span {
    color: var(--text-tertiary);
  }

  textarea,
  input {
    width: 100%;
    border: 1px solid var(--stroke);
    border-radius: 16px;
    padding: 14px;
    background: var(--bg-inset);
    color: var(--text-primary);
    outline: none;
  }

  textarea {
    min-height: 118px;
    resize: none;
  }

  textarea:focus,
  input:focus {
    border-color: var(--ai);
  }

  .warn {
    margin: 0;
    padding: 12px;
    border: 1px solid rgba(255, 180, 170, 0.3);
    border-radius: 12px;
    background: rgba(255, 180, 170, 0.1);
    color: var(--warn);
    font-size: 13px;
  }
</style>
