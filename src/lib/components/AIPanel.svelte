<script lang="ts">
  /**
   * Maestro sidebar: conversational DAW agent, credits, and per-song work history.
   */

  import Icon from './Icon.svelte';
  import { chatWithClaude } from '$lib/ai/claude';
  import { isClaudeConfigured, isElevenLabsConfigured, readAIConfig, saveAIConfig } from '$lib/ai/config';
  import { executeDawAction, inferDawAction, planAndMaybeRender, wantsSongPlan } from '$lib/ai/daw-actions';
  import {
    interpretMaestroTurn,
    isAffirmative,
    isNegative,
    continueEditingTurn,
    advanceArrangePending,
    commitArrangeIntent,
    type PendingConfirm
  } from '$lib/ai/maestro-reason';
  import { creditsLabel, getElevenLabsCredits, type ElevenLabsCredits } from '$lib/ai/elevenlabs';
  import { beatCountOfRange } from '$lib/ai/fill';
  import { formatPlan, maestroHealth } from '$lib/ai/maestro';
  import { maestroSessionContext } from '$lib/ai/mix-agent';
  import { lowBalanceNotice, maestroWallet } from '$lib/ai/maestro-wallet.svelte';
  import type { ChatMessage } from '$lib/ai/types';
  import { newUUID } from '$lib/core/uuid';
  import { wait } from '$lib/core/wait';
  import {
    appendWorkEvent,
    currentStudioSession,
    maestroHistoryKey,
    type MaestroSeed,
    type WorkEvent
  } from '$lib/persistence/sessions.svelte';
  import { describeInventory } from '$lib/ai/session-inventory';
  import { getLastLyrics, voiceFollowUpActions, wantsMidiArrange, workModeLabel } from '$lib/ai/song-sketch';
  import { goToSaasPath } from '$lib/saas';
  import { studioHelp } from '$lib/stores/help.svelte';
  import { onMount } from 'svelte';
  import { projectStore, workspace } from '$lib/stores';

  let messages = $state<ChatMessage[]>([]);
  let draft = $state('');
  let busy = $state(false);
  let busyLabel = $state('Pensando…');
  let error = $state<string | null>(null);
  let showSettings = $state(false);
  let showHistory = $state(true);
  let credits = $state<ElevenLabsCredits | null>(null);
  let maestroOnline = $state(false);
  let historyName = $state('');
  let pending = $state<PendingConfirm | null>(null);
  let workModeChip = $state(workModeLabel());

  let supabaseUrl = $state(readAIConfig().supabaseUrl);
  let supabaseAnonKey = $state(readAIConfig().supabaseAnonKey);
  let anthropicKey = $state(readAIConfig().anthropicKey);
  let elevenLabsKey = $state(readAIConfig().elevenLabsKey);

  const range = $derived(projectStore.rangeSelection);
  const rangeTrack = $derived(
    range ? (projectStore.project.tracks.find((t) => t.id === range.trackID) ?? null) : null
  );
  const workLog = $derived(currentStudioSession.record?.workLog ?? []);
  const songTitle = $derived(
    currentStudioSession.record?.title || currentStudioSession.record?.name || historyName || 'esta canción'
  );

  const continueActions = [
    { id: 'edit', label: 'Seguir editando', prompt: 'Continuemos editando el arreglo y la canción.' },
    { id: 'mode_midi', label: 'Arreglo MIDI', prompt: 'vamos a hacer un arreglo en midi' },
    { id: 'mix', label: 'Mezclar', prompt: 'Mézclame esta canción suave y con aire, según lo que hay en la sesión.' },
    { id: 'master', label: 'Masterizar', prompt: 'Quiero masterizar cuando tú me indiques el estilo.' },
    { id: 'publish', label: 'Publicar / descargar', prompt: 'Quiero revisar publicación y descarga cuando yo lo confirme.' }
  ];

  $effect(() => {
    if (isElevenLabsConfigured()) void getElevenLabsCredits().then((info) => (credits = info));
  });

  $effect(() => {
    if (!historyName) return;
    const snapshot = messages.map((item) => ({
      id: item.id,
      role: item.role,
      text: item.text,
      createdAt: item.createdAt,
      chips: item.chips
    }));
    localStorage.setItem(maestroHistoryKey(historyName), JSON.stringify({ history: snapshot }));
  });

  $effect(() => {
    const prompt = studioHelp.pendingAsk;
    if (!prompt) return;
    queueMicrotask(() => {
      if (studioHelp.pendingAsk !== prompt) return;
      studioHelp.pendingAsk = null;
      void send(prompt, false);
    });
  });

  function projectContext(): string {
    return maestroSessionContext();
  }

  function push(
    role: ChatMessage['role'],
    text: string,
    extra: Pick<ChatMessage, 'chips' | 'actions'> = {}
  ) {
    messages = [
      ...messages,
      { id: newUUID(), role, text, createdAt: new Date().toISOString(), ...extra }
    ];
  }

  function formatWhen(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

  function loadHistory(sessionName: string) {
    historyName = sessionName;
    try {
      const saved = JSON.parse(localStorage.getItem(maestroHistoryKey(sessionName)) || '{}') as {
        history?: ChatMessage[];
      };
      messages = Array.isArray(saved.history) ? saved.history : [];
    } catch {
      messages = [];
    }
  }

  function consumeSeed(seed: MaestroSeed) {
    if (seed.isNew) {
      historyName = seed.sessionName;
      messages = [];
      if (seed.sessionName) {
        push('assistant', `Sesión “${seed.sessionName}” lista. Dime qué quieres hacer con ella; no mezclo ni reproduzco hasta que lo pidas.`, {
          chips: ['Nueva sesión', 'Maestro']
        });
      }
      if (seed.idea) draft = seed.idea;
      return;
    }
    if (seed.sessionName) loadHistory(seed.sessionName);
    const alreadyAsked = messages.some((item) => item.text.includes('¿Con qué seguimos'));
    if (!alreadyAsked) {
      const logHint = (currentStudioSession.record?.workLog?.length ?? 0)
        ? ' Abajo tienes el historial de esta canción.'
        : '';
      push(
        'assistant',
        `Reabrí “${seed.sessionName || 'QAMUZ'}”.${logHint} ¿Con qué seguimos? Dime la acción; no impongo mezcla, master ni export.`,
        { actions: continueActions }
      );
    }
  }

  async function pickAction(action: { id: string; label: string; prompt: string }) {
    messages = messages.map((item) => (item.actions ? { ...item, actions: undefined } : item));
    if (action.id === 'confirm_delete') {
      await confirmPending();
      return;
    }
    if (action.id === 'cancel_delete') {
      cancelPending();
      return;
    }
    if (action.id === 'mount_voice') {
      const lyrics = (pending && pending.kind === 'lyrics' ? pending.lyrics : '') || getLastLyrics();
      const result = await executeDawAction('mount_voice', { lyrics });
      pending = { kind: 'lyrics', idea: pending && pending.kind === 'lyrics' ? pending.idea : '', lyrics: getLastLyrics() };
      push('assistant', result.message, { chips: ['Voz', 'Letra'], actions: voiceFollowUpActions() });
      return;
    }
    if (action.id === 'compose_chat') {
      const lyrics = (pending && pending.kind === 'lyrics' ? pending.lyrics : '') || getLastLyrics();
      try {
        sessionStorage.setItem(
          'qamuz.compose.seed',
          JSON.stringify({ idea: lyrics, source: 'maestro', at: new Date().toISOString() })
        );
      } catch {
        /* ignore */
      }
      push(
        'assistant',
        lyrics
          ? `${lyrics}\n\nGuardé esta letra. Te abro el chat de composición de QAMUZ AI para pulirla. La pista Voz ya está en el arrange.`
          : 'Te abro el chat de composición de QAMUZ AI. La pista Voz ya está en el arrange.',
        { chips: ['Composición'], actions: voiceFollowUpActions() }
      );
      await goToSaasPath('newchat');
      return;
    }
    if (action.id === 'sing_song') {
      const lyrics = (pending && pending.kind === 'lyrics' ? pending.lyrics : '') || getLastLyrics();
      const idea = lyrics
        ? `Canta esta canción completa con voz, siguiendo esta letra:\n\n${lyrics}`
        : 'Canta la bachata que estamos armando, con voz completa';
      if (busy) {
        await createSong(idea, true);
        return;
      }
      await send(idea, true);
      return;
    }
    if (action.id === 'record_voice') {
      const result = await executeDawAction('arm_voice', {});
      push('assistant', result.message, { chips: ['Grabar'], actions: voiceFollowUpActions() });
      return;
    }
    if (action.id.startsWith('arr_') || action.id.startsWith('start_') || action.id.startsWith('help_')) {
      await send(action.prompt, false);
      return;
    }
    if (action.id === 'mode_midi_write') {
      if (pending && pending.kind === 'arrange') {
        await runMaestroFollow(commitArrangeIntent(pending.intent));
        return;
      }
      await send('vamos a hacer un arreglo en midi', false);
      return;
    }
    if (action.id === 'mode_midi' || action.id === 'mode_genaudius' || action.id.startsWith('card_')) {
      await send(action.prompt, false);
      return;
    }
    if (action.id === 'mix') {
      await send(action.prompt, false);
      return;
    }
    if (action.id === 'edit') {
      workspace.open('arrange');
      const turn = continueEditingTurn();
      push('assistant', turn.message, { actions: turn.kind === 'answer' ? turn.actions : undefined, chips: turn.chips });
      return;
    }
    if (action.id === 'master') {
      workspace.open('mastering');
      push('assistant', 'Te dejé MASTER PRO abierto. Cuando quieras, dime el estilo (Q-Warm, Q-Balance, Q-Open) o el loudness. No masterizo solo.');
      return;
    }
    if (action.id === 'publish') {
      workspace.open('export');
      push('assistant', 'Te dejé export listo. Elige WAV o MP3 cuando la canción esté; no publico ni descargo hasta que lo confirmes.');
      return;
    }
    push('assistant', `Anoté “${action.label}”. Dime el detalle y lo hago.`);
  }

  function refreshMode() {
    workModeChip = workModeLabel();
  }

  async function runMaestroFollow(follow: ReturnType<typeof commitArrangeIntent>) {
    if (follow.kind === 'confirm') {
      pending = follow.pending;
      refreshMode();
      push('assistant', follow.message, { actions: follow.actions, chips: follow.chips });
      return;
    }
    if (follow.kind === 'answer') {
      pending = null;
      refreshMode();
      push('assistant', follow.message, { actions: follow.actions, chips: follow.chips });
      return;
    }
    pending = null;
    busyLabel = 'Escribiendo la parte…';
    const result = await executeDawAction(follow.name, follow.args);
    if (follow.name === 'write_part' || follow.name === 'lay_form' || follow.name === 'mount_voice') {
      appendWorkEvent('edit', result.message);
    }
    if (follow.name === 'mount_voice') {
      pending = {
        kind: 'lyrics',
        idea: typeof follow.args.idea === 'string' ? follow.args.idea : '',
        lyrics: typeof follow.args.lyrics === 'string' ? follow.args.lyrics : getLastLyrics()
      };
    }
    refreshMode();
    push('assistant', result.message, {
      chips: follow.chips || (follow.name === 'mount_voice' ? ['Voz', 'Letra'] : ['Arrange', 'MIDI']),
      actions: follow.actions || (follow.name === 'mount_voice' ? voiceFollowUpActions() : undefined)
    });
  }

  async function charge(action: 'mix' | 'stems' | 'plan' | 'render' | 'edit'): Promise<boolean> {
    const result = await maestroWallet.spend(action);
    if (!result.ok) {
      push('assistant', result.message, { chips: ['Saldo'] });
      return false;
    }
    if (result.low) {
      push('assistant', lowBalanceNotice(result.remaining), { chips: ['Saldo bajo'] });
    }
    return true;
  }

  async function createSong(text: string, render: boolean) {
    const spendKey = render ? 'render' : 'plan';
    busyLabel = render ? 'Creando la canción…' : 'Interpretando la idea…';
    if (!(await charge(spendKey))) return;
    try {
      const { plan, message, chips } = await planAndMaybeRender(text, render);
      appendWorkEvent(render ? 'render' : 'plan', message, maestroWallet.unlimited ? 0 : maestroWallet.costOf(spendKey));
      push('assistant', `${formatPlan(plan)}\n\n${message}`, { chips });
      refreshMode();
    } catch (maestroError) {
      if (!isClaudeConfigured()) throw maestroError;
      const history = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }));
      const reply = await chatWithClaude(history, projectContext());
      push('assistant', reply);
    }
  }

  async function runMix(text: string) {
    busyLabel = 'Pensando en lo que pediste…';
    await wait(480);
    if (!(await charge('mix'))) return;
    busyLabel = 'Escuchando las pistas…';
    await wait(720);
    busyLabel = 'Ajustando niveles con aire…';
    await wait(640);
    const result = await executeDawAction('mix_session', { prompt: text });
    appendWorkEvent('mix', result.message, maestroWallet.unlimited ? 0 : maestroWallet.costOf('mix'));
    push('assistant', result.message, { chips: ['Mezcla'] });
  }

  async function confirmPending() {
    if (!pending || pending.kind !== 'delete_track') return;
    const request = pending;
    pending = null;
    busy = true;
    busyLabel = `Borrando “${request.trackName}”…`;
    try {
      const result = await executeDawAction('delete_track', {
        track_id: request.trackId,
        track_name: request.trackName
      });
      appendWorkEvent('edit', result.message);
      push('assistant', result.message, { chips: ['Borrado', request.trackName] });
    } finally {
      busy = false;
    }
  }

  function cancelPending() {
    const name = pending && pending.kind === 'delete_track' ? pending.trackName : null;
    pending = null;
    push(
      'assistant',
      name ? `Dejé el track “${name}”. No borré nada.` : 'Cancelado. No borré nada.'
    );
  }

  function conversationalReply(text: string): string {
    const inventory = describeInventory();
    const selected = projectStore.selectedTrack;
    if (selected) {
      return `Te escuché: “${text.trim().slice(0, 140)}”. Tengo “${selected.name}” seleccionada. ${inventory} Dime el instrumento, la sección, o si la borro te pido confirmación.`;
    }
    return `Te escuché: “${text.trim().slice(0, 140)}”. ${inventory} Elige una pista o dime qué instrumento creamos.`;
  }

  async function send(text = draft.trim(), render = false) {
    if (!text || busy) return;
    draft = '';
    push('user', text);
    busy = true;
    busyLabel = 'Pensando…';
    error = null;
    projectStore.showAI = true;

    try {
      await wait(280);
      if (render) {
        pending = null;
        await createSong(text, true);
        return;
      }
      if (pending) {
        if (pending.kind === 'delete_track') {
          if (isAffirmative(text) || text.trim() === '__confirm_delete') {
            await confirmPending();
            return;
          }
          if (isNegative(text) || text.trim() === '__cancel') {
            cancelPending();
            return;
          }
        }
        if (pending.kind === 'arrange') {
          if (wantsMidiArrange(text) || text.trim() === '__midi_then_write') {
            await runMaestroFollow(commitArrangeIntent(pending.intent));
            return;
          }
          const follow = advanceArrangePending(pending, text);
          if (follow.kind === 'confirm') {
            pending = follow.pending;
            push('assistant', follow.message, { actions: follow.actions, chips: follow.chips });
            return;
          }
          pending = null;
          if (follow.kind === 'command') {
            await runMaestroFollow(follow);
            return;
          }
        }
        if (pending.kind === 'lyrics') {
          if (text.trim() === '__lyrics_mount' || /monta(r)? la voz/.test(text.toLowerCase())) {
            await pickAction({ id: 'mount_voice', label: 'Crear pista Voz', prompt: '__lyrics_mount' });
            return;
          }
          if (text.trim() === '__lyrics_compose') {
            await pickAction({ id: 'compose_chat', label: 'Pulir en composición', prompt: '__lyrics_compose' });
            return;
          }
          if (text.trim() === '__lyrics_sing') {
            await pickAction({ id: 'sing_song', label: 'Cantar con GenAudius', prompt: '__lyrics_sing' });
            return;
          }
          if (text.trim() === '__lyrics_record') {
            await pickAction({ id: 'record_voice', label: 'Grabar encima', prompt: '__lyrics_record' });
            return;
          }
        }
        const followUp = interpretMaestroTurn(text);
        if (followUp?.kind === 'answer') {
          push('assistant', followUp.message, { chips: followUp.chips });
          return;
        }
        pending = null;
      }

      const turn = interpretMaestroTurn(text);
      if (turn?.kind === 'confirm') {
        pending = turn.pending;
        refreshMode();
        push('assistant', turn.message, { actions: turn.actions, chips: turn.chips });
        return;
      }
      if (turn?.kind === 'answer') {
        refreshMode();
        push('assistant', turn.message, { chips: turn.chips, actions: turn.actions });
        return;
      }

      const command = turn?.kind === 'command' ? turn : inferDawAction(text);
      if (command?.name === 'mix_session') {
        await runMix(text);
        return;
      }
      if (command) {
        if (command.name === 'edit_selection' && !(await charge('edit'))) return;
        busyLabel = 'Trabajando…';
        const result = await executeDawAction(command.name, command.args);
        if (command.name === 'edit_selection' && result.ok) {
          appendWorkEvent('edit', result.message, maestroWallet.unlimited ? 0 : 2);
        } else if (
          command.name === 'write_part' ||
          command.name === 'lay_form' ||
          command.name === 'mount_voice'
        ) {
          appendWorkEvent('edit', result.message);
        }
        if (command.name === 'mount_voice') {
          const lyrics = typeof command.args.lyrics === 'string' ? command.args.lyrics : getLastLyrics();
          pending = {
            kind: 'lyrics',
            idea: typeof command.args.idea === 'string' ? command.args.idea : '',
            lyrics
          };
        }
        const chips =
          ('chips' in command && command.chips) ||
          (command.name === 'mount_voice'
            ? ['Voz', 'Letra']
            : command.name === 'write_part' || command.name === 'lay_form'
              ? ['Arrange']
              : undefined);
        const actions =
          ('actions' in command && command.actions) ||
          (command.name === 'mount_voice' ? voiceFollowUpActions() : undefined);
        push('assistant', result.message, { chips, actions });
        refreshMode();
        return;
      }

      const wantsRender = render || /\b(crear|create|render|genera(?:r)? la canci)/i.test(text);
      if (wantsRender || wantsSongPlan(text)) {
        await createSong(text, wantsRender);
        return;
      }

      if (isClaudeConfigured()) {
        busyLabel = 'Pensando…';
        const history = messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }));
        const reply = await chatWithClaude(history, projectContext());
        push('assistant', reply);
        return;
      }

      push('assistant', conversationalReply(text));
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  function readStoredSeed(): MaestroSeed | null {
    try {
      const packed = sessionStorage.getItem('qamuz.maestro.launch');
      if (packed) {
        sessionStorage.removeItem('qamuz.maestro.launch');
        sessionStorage.removeItem('qamuz.maestro.seed');
        sessionStorage.removeItem('qamuz.maestro.autoPlan');
        return JSON.parse(packed) as MaestroSeed;
      }
    } catch {
      // Fall through to the older two-key seed.
    }
    const idea = sessionStorage.getItem('qamuz.maestro.seed');
    if (!idea) return null;
    sessionStorage.removeItem('qamuz.maestro.seed');
    const auto = sessionStorage.getItem('qamuz.maestro.autoPlan') === '1';
    sessionStorage.removeItem('qamuz.maestro.autoPlan');
    return { idea, autoPlan: auto, isNew: auto, sessionName: '' };
  }

  function kindLabel(kind: WorkEvent['kind']): string {
    switch (kind) {
      case 'mix':
        return 'Mezcla';
      case 'stems':
        return 'Stems';
      case 'import':
        return 'Importación';
      case 'plan':
        return 'Plan';
      case 'render':
        return 'Creación';
      case 'edit':
        return 'Edición';
      default:
        return 'Nota';
    }
  }

  onMount(() => {
    void maestroHealth().then((ok) => (maestroOnline = ok));
    void maestroWallet.refresh();

    const stored = readStoredSeed();
    if (stored) consumeSeed(stored);

    const onSeed = (event: Event) => {
      sessionStorage.removeItem('qamuz.maestro.launch');
      sessionStorage.removeItem('qamuz.maestro.seed');
      sessionStorage.removeItem('qamuz.maestro.autoPlan');
      const detail = (event as CustomEvent<MaestroSeed>).detail;
      if (detail) consumeSeed(detail);
    };
    window.addEventListener('qamuz:maestro-seed', onSeed);
    const onImport = (event: Event) => {
      const detail = (event as CustomEvent<{ summary?: string; autoMix?: boolean }>).detail;
      if (!detail?.summary) return;
      if (currentStudioSession.record?.name) historyName = currentStudioSession.record.name;
      push('assistant', detail.summary, { chips: ['Importación', 'Sesión'] });
      appendWorkEvent('import', detail.summary);
    };
    window.addEventListener('qamuz:stems-imported', onImport);
    return () => {
      window.removeEventListener('qamuz:maestro-seed', onSeed);
      window.removeEventListener('qamuz:stems-imported', onImport);
    };
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
  <span class="mode-chip" class:midi={workModeChip === 'Arreglo MIDI'} class:genaudius={workModeChip === 'GenAudius'}>{workModeChip}</span>
  <span class="live" class:on={maestroOnline}>{maestroOnline ? 'online' : 'offline'}</span>
  <span class="credits" class:low={maestroWallet.low} class:empty={maestroWallet.empty}>
    {#if maestroWallet.unlimited}
      Ilimitado
    {:else if maestroWallet.ready}
      {maestroWallet.balance} cr.
    {:else}
      Saldo…
    {/if}
  </span>
  {#if credits}
    <span class="credits faint">{creditsLabel(credits)} EL</span>
  {/if}
  <span class="flex"></span>
  <button class="icon-btn" title="Ayuda del DAW (F1)" onclick={() => studioHelp.show('maestro')}>
    <Icon name="help" size={12} />
  </button>
  <button class="icon-btn" title="Connection settings" onclick={() => (showSettings = !showSettings)}>
    <Icon name="inspector" size={12} />
  </button>
</div>

<div class="body">
  {#if maestroWallet.low || maestroWallet.empty}
    <button class="balance-warn" class:empty={maestroWallet.empty} onclick={() => void goToSaasPath('settings/billing')}>
      {maestroWallet.empty
        ? 'Sin saldo. Recarga créditos para mezclar o extraer stems.'
        : `Saldo bajo: ${maestroWallet.balance} créditos. Recarga para no cortar el trabajo.`}
    </button>
  {/if}

  <button
    class="fill-toggle"
    class:on={projectStore.aiFillMode}
    title="Clic en un clip para seleccionarlo, o activa Fill y arrastra una región"
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
  {:else if projectStore.selectedTrack}
    <p class="hint">
      Pista seleccionada: “{projectStore.selectedTrack.name}”. Ya la conozco: si me pides borrar el track, te confirmo antes.
    </p>
  {:else if projectStore.aiFillMode}
    <p class="hint">Arrastra sobre el lane para marcar beats. Los clips dejan pasar el gesto, como en Studio 1.0.</p>
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

  {#if workLog.length}
    <details class="history" bind:open={showHistory}>
      <summary>Historial de “{songTitle}” · {workLog.length}</summary>
      <ol>
        {#each [...workLog].reverse() as item (item.id)}
          <li>
            <span class="when">{formatWhen(item.at)}</span>
            <span class="kind">{kindLabel(item.kind)}</span>
            <span class="what">{item.summary}</span>
            {#if item.credits}
              <span class="cost">−{item.credits} cr.</span>
            {/if}
          </li>
        {/each}
      </ol>
    </details>
  {/if}

  <div class="log">
    {#if messages.length === 0}
      <p class="hint">Soy Maestro. Escribe y pulsa Enviar (hablar conmigo). Crear es solo la canción completa con GenAudius. Si tienes duda, escribe “ayuda” o pulsa F1.</p>
    {/if}
    {#each messages as message (message.id)}
      <div class="bubble {message.role}">
        {message.text}
        {#if message.chips?.length}
          <div class="chips">
            {#each message.chips as chip}
              <span class="tag">{chip}</span>
            {/each}
          </div>
        {/if}
        {#if message.actions?.length}
          <div class="choices">
            {#each message.actions as action}
              <button
                class="choice"
              class:primary={action.id === 'confirm_delete' || action.id === 'publish' || action.id === 'sing_song' || action.id === 'mode_midi_write'}
                onclick={() => void pickAction(action)}
              >
                {action.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
    {#if busy}
      <div class="bubble assistant dim thinking">
        <span class="dot"></span>
        {busyLabel}
      </div>
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
      placeholder="Enviar a Maestro: mézclame suave, ayuda, agrega un bajo…"
    />
    <button class="send" type="submit" disabled={!draft.trim() || busy} title="Enviar a Maestro: editar, mezclar, preguntar. No genera la canción.">
      Enviar
    </button>
    <button
      class="create"
      type="button"
      disabled={busy}
      title="Crear la canción completa con GenAudius. No es para editar pistas."
      onclick={() => void send(draft.trim() || [...messages].reverse().find((m) => m.role === 'user')?.text || '', true)}
    >
      Crear
    </button>
  </form>
  <p class="composer-legend">
    <strong>Enviar</strong> habla con Maestro (arreglo MIDI).
    <strong>Crear</strong> pide la canción a GenAudius.
    <button type="button" class="legend-help" onclick={() => studioHelp.show('send-create')}>Ayuda</button>
  </p>
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

  .credits.faint {
    color: var(--text-tertiary);
    background: var(--bg-control);
  }

  .credits.low {
    color: #f0c14b;
    background: rgba(240, 193, 75, 0.16);
  }

  .credits.empty {
    color: var(--warn);
    background: rgba(255, 90, 90, 0.14);
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

  .mode-chip {
    font-size: 9px;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--stroke);
    color: var(--text-secondary);
    text-transform: none;
  }

  .mode-chip.midi {
    color: var(--accent, #c4b5fd);
    border-color: color-mix(in srgb, var(--accent, #c4b5fd) 40%, transparent);
  }

  .mode-chip.genaudius {
    color: var(--time);
    border-color: color-mix(in srgb, var(--time) 40%, transparent);
  }

  .balance-warn {
    text-align: left;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 11px;
    line-height: 1.4;
    background: rgba(240, 193, 75, 0.14);
    color: #f0c14b;
  }

  .balance-warn.empty {
    background: rgba(255, 90, 90, 0.14);
    color: var(--warn);
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

  .history {
    border-radius: 8px;
    background: var(--bg-control);
    padding: 6px 8px;
    max-height: 160px;
    overflow: auto;
  }

  .history summary {
    cursor: pointer;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .history ol {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .history li {
    display: grid;
    gap: 2px;
    font-size: 10px;
    line-height: 1.35;
  }

  .when,
  .cost {
    color: var(--text-tertiary);
  }

  .kind {
    color: var(--ai);
    font-weight: 650;
  }

  .what {
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
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

  .thinking {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .thinking .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ai);
    animation: pulse 1s ease-in-out infinite;
  }

  .chips,
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .tag {
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(201, 160, 255, 0.16);
    color: var(--ai);
    font-size: 10px;
  }

  .choice {
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--bg-inset);
    color: var(--text-secondary);
    font-size: 11px;
  }

  .choice.primary {
    background: linear-gradient(90deg, #7c3aed, var(--accent-strong));
    color: white;
  }

  .send {
    padding: 0 12px;
    border-radius: 6px;
    background: linear-gradient(90deg, #7c3aed, var(--accent-strong));
    color: white;
    font-size: 11px;
    font-weight: 700;
    flex: none;
  }

  .send:disabled {
    opacity: 0.4;
  }

  .create {
    padding: 0 10px;
    border-radius: 6px;
    background: var(--bg-control);
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 650;
    box-shadow: inset 0 0 0 1px var(--stroke);
    flex: none;
  }

  .create:hover:not(:disabled) {
    color: var(--text-primary);
  }

  .create:disabled {
    opacity: 0.4;
  }

  .composer {
    display: flex;
    gap: 4px;
  }

  .composer input {
    flex: 1;
    min-width: 0;
  }

  .composer-legend {
    margin: 6px 0 0;
    font-size: 10px;
    line-height: 1.4;
    color: var(--text-tertiary);
  }

  .legend-help {
    margin-left: 4px;
    padding: 0;
    background: none;
    color: var(--ai);
    font-size: 10px;
    font-weight: 650;
  }

  .warn {
    margin: 0;
    font-size: 11px;
    color: var(--warn);
  }

  .chip {
    align-self: flex-start;
    padding: 4px 8px;
    border-radius: 5px;
    background: var(--bg-control);
    font-size: 11px;
  }

  @keyframes pulse {
    50% {
      opacity: 0.35;
      transform: scale(1.2);
    }
  }
</style>
