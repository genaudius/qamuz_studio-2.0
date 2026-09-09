<script lang="ts">
  /**
   * Transport bar. Port of DAWUI/Views/Transport/TransportView.swift: the same
   * control order, the same BARS/TIME/BPM/SIG readouts, and BPM editing on
   * double click.
   */

  import Icon from './Icon.svelte';
  import SongContextBadge from './SongContextBadge.svelte';
  import RecentProjects from './RecentProjects.svelte';
  import MIDIMonitor from './MIDIMonitor.svelte';
  import UserMenu from './UserMenu.svelte';
  import { engine, projectStore, transport, workspace } from '$lib/stores';
  import { formatBarsBeats, formatClock, PPQ_PRESETS, secondsToBeats } from '$lib/core/time';
  import { persistDawSession, persistFullSession } from '$lib/persistence/daw-db';
  import { confirmRenameDespiteDuplicate } from '$lib/persistence/session-duplicates';
  import {
    currentStudioSession,
    isDuplicateSessionTitle,
    renameCurrentSession,
    sessionGate
  } from '$lib/persistence/sessions.svelte';
  import { documentStatus } from '$lib/persistence/documents.svelte';

  let editingTempo = $state(false);
  let tempoText = $state('');
  let tempoInput = $state<HTMLInputElement | null>(null);
  let tapTimes: number[] = [];
  let editingName = $state(false);
  let nameText = $state('');
  let nameInput = $state<HTMLInputElement | null>(null);

  // The readouts follow the smooth playhead, which is why they move at display
  // rate instead of jumping one audio buffer at a time.
  const musicalBeats = $derived(
    transport.smoothPlayheadBeats -
      secondsToBeats(projectStore.project.timelineOriginSeconds, transport.bpm)
  );
  const bars = $derived(
    formatBarsBeats(musicalBeats, transport.timeSignature, projectStore.project.ppq)
  );
  const clock = $derived(formatClock((transport.smoothPlayheadBeats / transport.bpm) * 60));

  function startNameEdit() {
    nameText = projectStore.project.name;
    editingName = true;
    queueMicrotask(() => nameInput?.select());
  }

  async function commitName() {
    const next = nameText.trim();
    editingName = false;
    if (!next || next === projectStore.project.name) return;
    const except = currentStudioSession.record?.name;
    if (isDuplicateSessionTitle(next, except)) {
      if (!(await confirmRenameDespiteDuplicate(next, except))) {
        nameText = projectStore.project.name;
        return;
      }
    }
    const saved = renameCurrentSession(next);
    const finalName = saved?.name || next;
    projectStore.rename(finalName);
    if (saved && saved.name !== next) {
      documentStatus.message = `“${next}” ya estaba en el historial; guardé esta sesión como “${saved.name}”.`;
      documentStatus.tone = 'idle';
    }
    void persistFullSession().catch((error) => {
      console.warn(error);
      void persistDawSession();
    });
  }

  function onNameKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitName();
    } else if (event.key === 'Escape') editingName = false;
  }

  function startTempoEdit() {
    tempoText = transport.bpm.toFixed(1);
    editingTempo = true;
    queueMicrotask(() => tempoInput?.select());
  }

  function commitTempo() {
    const value = Number.parseFloat(tempoText);
    if (Number.isFinite(value)) {
      transport.setTempo(value);
      projectStore.setTempo(transport.bpm);
      transport.syncBarOneFromSeconds(
        projectStore.project.timelineOriginSeconds,
        transport.bpm
      );
    }
    editingTempo = false;
  }

  function onTempoKey(event: KeyboardEvent) {
    if (event.key === 'Enter') commitTempo();
    else if (event.key === 'Escape') editingTempo = false;
  }

  function nudgeTempo(delta: number) {
    transport.nudgeTempo(delta);
    projectStore.setTempo(transport.bpm);
    transport.syncBarOneFromSeconds(projectStore.project.timelineOriginSeconds, transport.bpm);
  }

  function tapTempo() {
    const now = performance.now();
    // A gap longer than two seconds means a new count-in, not a slow tempo.
    if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) tapTimes = [];
    tapTimes = [...tapTimes, now].slice(-5);

    transport.tapTempo(tapTimes);
    if (tapTimes.length >= 2) {
      projectStore.setTempo(transport.bpm);
      transport.syncBarOneFromSeconds(projectStore.project.timelineOriginSeconds, transport.bpm);
    }
  }

  function cycleTimeSignature() {
    const options = [
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
      { numerator: 6, denominator: 8 },
      { numerator: 5, denominator: 4 },
      { numerator: 7, denominator: 8 }
    ];
    const current = options.findIndex(
      (o) =>
        o.numerator === transport.timeSignature.numerator &&
        o.denominator === transport.timeSignature.denominator
    );
    const next = options[(current + 1) % options.length];

    transport.timeSignature = next;
    projectStore.setTimeSignature(next.numerator, next.denominator);
    engine.backend.setMetronomeGrid(transport.bpm, next);
  }

  function cyclePpq() {
    const current = PPQ_PRESETS.indexOf(
      projectStore.project.ppq as (typeof PPQ_PRESETS)[number]
    );
    const next = PPQ_PRESETS[(current < 0 ? 0 : current + 1) % PPQ_PRESETS.length];
    projectStore.setPpq(next);
  }

  async function toggleRecord() {
    if (transport.isRecording) transport.stopRecording();
    else {
      await engine.backend.resume();
      transport.startRecording();
    }
  }

  async function togglePlay() {
    if (sessionGate.visible) sessionGate.close();
    await engine.backend.resume();
    transport.togglePlayPause();
  }
</script>

<header class="transport">
  <div class="group">
    <button class="icon-btn" title="Return to zero" onclick={() => transport.returnToZero()}>
      <Icon name="skip-back" size={14} />
    </button>
    <button class="icon-btn" title="Rewind one bar" onclick={() => transport.nudgePlayheadBars(-1)}>
      <Icon name="rewind" size={14} />
    </button>
    <button class="icon-btn play" title="Play / pause (Space)" onclick={togglePlay}>
      <Icon name={transport.isPlaying ? 'pause' : 'play'} size={18} />
    </button>
    <button
      class="icon-btn record"
      class:armed={transport.isRecording}
      title="Record"
      onclick={toggleRecord}
    >
      <Icon name="record" size={16} />
    </button>
    <button
      class="icon-btn"
      title="Forward one bar"
      onclick={() => transport.nudgePlayheadBars(1)}
    >
      <Icon name="forward" size={14} />
    </button>
  </div>

  <div class="divider-v"></div>

  <div class="group">
    <div class="readout bars">
      <span class="readout-label">BARS</span>
      <span class="readout-value">{bars}</span>
    </div>
    <div class="readout time">
      <span class="readout-label">TIME</span>
      <span class="readout-value">{clock}</span>
    </div>
  </div>

  <div class="divider-v"></div>

  <div class="group">
    <button class="step" title="Slower" onclick={() => nudgeTempo(-1)}>
      <Icon name="minus" size={10} />
    </button>

    <div class="readout tempo">
      <span class="readout-label">BPM</span>
      {#if editingTempo}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          bind:this={tempoInput}
          bind:value={tempoText}
          class="tempo-input"
          autofocus
          onblur={commitTempo}
          onkeydown={onTempoKey}
        />
      {:else}
        <span
          class="readout-value tempo-value"
          role="button"
          tabindex="0"
          title="Double click to type a tempo"
          ondblclick={startTempoEdit}
          onkeydown={(e) => e.key === 'Enter' && startTempoEdit()}
        >
          {transport.bpm.toFixed(1)}
        </span>
      {/if}
    </div>

    <button class="step" title="Faster" onclick={() => nudgeTempo(1)}>
      <Icon name="plus" size={10} />
    </button>

    <button class="tap" title="Tap tempo" onclick={tapTempo}>TAP</button>

    <button class="readout sig" title="Change time signature (Conductor)" onclick={cycleTimeSignature}>
      <span class="readout-label">SIG</span>
      <span class="sig-value">
        {transport.timeSignature.numerator}/{transport.timeSignature.denominator}
      </span>
    </button>

    <button
      class="readout sig ppq"
      title="Ticks per quarter — 480 MIDI clone, 960 Pro Tools"
      onclick={cyclePpq}
    >
      <span class="readout-label">PPQ</span>
      <span class="sig-value">{projectStore.project.ppq}</span>
    </button>
  </div>

  <div class="divider-v"></div>

  <div class="group">
    <button
      class="icon-btn"
      class:active={transport.isLoopEnabled}
      title="Loop"
      onclick={() => transport.toggleLoop()}
    >
      <Icon name="loop" size={14} />
    </button>
    <button
      class="icon-btn"
      class:active={transport.isMetronomeEnabled}
      title="Metronome"
      onclick={() => transport.toggleMetronome()}
    >
      <Icon name="metronome" size={14} />
    </button>
  </div>

  <div class="divider-v"></div>

  <MIDIMonitor />

  <div class="divider-v"></div>

  <div class="group">
    <button
      class="icon-btn"
      title={projectStore.canUndo
        ? `Undo ${projectStore.undoStack.undoActionName}`
        : 'Nothing to undo'}
      disabled={!projectStore.canUndo}
      onclick={() => projectStore.undo()}
    >
      <Icon name="undo" size={12} />
    </button>
    <button
      class="icon-btn"
      title={projectStore.canRedo
        ? `Redo ${projectStore.undoStack.redoActionName}`
        : 'Nothing to redo'}
      disabled={!projectStore.canRedo}
      onclick={() => projectStore.redo()}
    >
      <Icon name="redo" size={12} />
    </button>
  </div>

  <div class="group">
    <button
      class="icon-btn"
      class:active={projectStore.showInspector && workspace.showsArrange}
      title="Inspector"
      onclick={() => (projectStore.showInspector = !projectStore.showInspector)}
    >
      <Icon name="inspector" size={14} />
    </button>
    <button
      class="icon-btn ai"
      class:active={projectStore.aiFillMode}
      title="Generative Fill — drag a beat range on a track"
      onclick={() => {
        projectStore.aiFillMode = !projectStore.aiFillMode;
        if (projectStore.aiFillMode) {
          workspace.open('arrange');
          projectStore.showAI = true;
        } else projectStore.setRangeSelection(null);
      }}
    >
      <Icon name="wand" size={14} />
    </button>
  </div>

  <div class="spacer"></div>

  <div class="group project-group">
    <SongContextBadge variant="compact" />
    <RecentProjects />
    {#if editingName}
      <input
        bind:this={nameInput}
        bind:value={nameText}
        class="name-input"
        aria-label="Nombre de la sesión"
        onblur={() => void commitName()}
        onkeydown={onNameKey}
      />
    {:else}
      <button
        class="project-name"
        title="Doble clic para cambiar el título de la sesión"
        ondblclick={startNameEdit}
      >
        {#if !(currentStudioSession.record?.musicId || currentStudioSession.record?.imageUrl)}
          {projectStore.project.name}{projectStore.isDirty ? ' *' : ''}
        {:else}
          {projectStore.isDirty ? '● ' : ''}Sesión
        {/if}
      </button>
    {/if}
    <UserMenu />
  </div>
</header>

<style>
  .transport {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 16px;
    padding: 8px 16px;
    min-height: 56px;
    position: relative;
    z-index: 20;
    background: var(--bg-highest);
    border-bottom: 1px solid var(--stroke);
    flex: none;
    overflow: visible;
  }

  @media (max-width: 900px) {
    .transport {
      flex-wrap: wrap;
      gap: 8px 10px;
      padding: 8px 10px;
      min-height: 0;
      row-gap: 8px;
    }

    .transport .divider-v,
    .transport .spacer {
      display: none;
    }

    .group {
      gap: 4px;
    }

    .bars,
    .time {
      min-width: 0;
    }

    .time .readout-value {
      font-size: 18px;
    }

    .transport :global(.icon-btn) {
      width: 36px;
      height: 36px;
    }

    .transport :global(.icon-btn.play) {
      width: 42px;
      height: 42px;
    }

    .project-name {
      max-width: 42vw;
      font-size: 12px;
    }
  }

  .group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .spacer {
    flex: 1;
  }

  .transport :global(.icon-btn) {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid var(--stroke);
    background: var(--bg-control);
  }

  .transport :global(.icon-btn.play) {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    color: var(--play);
    box-shadow: 0 0 10px rgba(83, 225, 111, 0.35);
    border: 1px solid var(--stroke);
    background: var(--bg-control);
  }

  .record {
    color: var(--record);
  }

  .record.armed {
    color: var(--record);
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }

  .bars {
    min-width: 108px;
  }

  .time {
    min-width: 120px;
  }

  .time .readout-value {
    color: var(--accent);
    font-size: 24px;
    font-weight: 500;
  }

  .tempo {
    min-width: 62px;
  }

  .tempo-value {
    color: var(--tempo);
    font-size: 16px;
    cursor: text;
  }

  .tempo-input {
    width: 54px;
    padding: 0;
    text-align: center;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--tempo);
    border-radius: 0;
    color: var(--tempo);
    font-family: var(--font-mono);
    font-size: 16px;
    font-weight: 700;
  }

  .sig {
    min-width: 38px;
  }

  .ppq {
    min-width: 48px;
  }

  .sig-value {
    font-family: var(--font-mono);
    font-size: 14px;
    font-weight: 700;
  }

  .step {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    color: var(--text-secondary);
  }

  .step:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .tap {
    padding: 4px 6px;
    border-radius: var(--radius);
    background: var(--bg-inset);
    color: var(--text-secondary);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
  }

  .tap:hover {
    color: var(--tempo);
  }

  .project-name {
    font-size: 12px;
    color: var(--text-secondary);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: transparent;
    padding: 2px 4px;
    border-radius: 4px;
  }

  .project-name:hover {
    color: var(--text-primary);
    background: var(--bg-control);
  }

  .name-input {
    width: 200px;
    padding: 2px 6px;
    font-size: 12px;
    background: var(--bg-inset);
    color: var(--text-primary);
    border: 1px solid var(--accent);
    border-radius: 4px;
  }

  .icon-btn.ai.active {
    background: rgba(201, 160, 255, 0.16);
    color: var(--ai);
  }
</style>
