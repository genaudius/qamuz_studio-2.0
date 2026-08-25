<script lang="ts">
  /**
   * Piano roll for the selected MIDI clip.
   *
   * The grid is a canvas (cheap to redraw while zooming) and the notes are DOM
   * elements on top of it, which keeps hit testing, dragging and resizing simple
   * and accessible. Click empty space to draw a note, drag to move, drag the
   * right edge to resize, Alt bypasses the snap grid.
   */

  import Icon from './Icon.svelte';
  import { isBlackKey, isNoteEvent, noteName } from '$lib/core/midi';
  import { openTimelineBeats, shouldGrowHorizon } from '$lib/core/timeline';
  import { beatsPerBar, quantize, toBeats } from '$lib/core/time';
  import { engine, projectStore, transport, workspace } from '$lib/stores';

  const KEY_WIDTH = 44;
  const NOTE_HEIGHT = 12;
  const LOW_PITCH = 21;
  const HIGH_PITCH = 108;
  const RESIZE_ZONE = 6;

  let grid = $state<HTMLCanvasElement | null>(null);
  let scroller = $state<HTMLDivElement | null>(null);
  let keysPane = $state<HTMLDivElement | null>(null);
  let centered = false;

  let pixelsPerBeat = $state(60);
  let defaultDuration = $state(1);
  let velocity = $state(100);
  let horizonBeats = $state(0);
  let scrollLeft = $state(0);
  let viewWidth = $state(800);

  const found = $derived(
    projectStore.selectedClipIDs.length > 0
      ? projectStore.findClip(projectStore.selectedClipIDs[0])
      : null
  );
  const selectedTrack = $derived(
    projectStore.project.tracks.find((item) => item.id === projectStore.selectedTrackID) ?? null
  );
  const midiTrack = $derived.by(() => {
    const fromClip = found?.track;
    if (fromClip && (fromClip.type === 'midi' || fromClip.type === 'instrument')) return fromClip;
    if (selectedTrack && (selectedTrack.type === 'midi' || selectedTrack.type === 'instrument')) {
      return selectedTrack;
    }
    return null;
  });
  const clip = $derived.by(() => {
    if (found?.clip.content.kind === 'midi') return found.clip;
    return midiTrack?.clips.find((item) => item.content.kind === 'midi') ?? null;
  });
  const track = $derived(found?.track ?? midiTrack);

  const bpm = $derived(projectStore.project.tempo.bpm);
  const perBar = $derived(beatsPerBar(transport.timeSignature));
  const clipStartBeat = $derived(clip ? toBeats(clip.timeRange.start, bpm) : 0);
  const clipLengthBeats = $derived(clip ? toBeats(clip.timeRange.duration, bpm) : 0);

  const pitches = $derived.by(() => {
    const list: number[] = [];
    for (let pitch = HIGH_PITCH; pitch >= LOW_PITCH; pitch -= 1) list.push(pitch);
    return list;
  });

  const notes = $derived.by(() => {
    if (!clip || clip.content.kind !== 'midi') return [];
    return clip.content.midi.events.filter(isNoteEvent).map((event) => ({
      id: event.id,
      beat: event.beatPosition,
      pitch: event.type.note.pitch,
      duration: event.type.note.duration,
      velocity: event.type.note.velocity
    }));
  });

  const lastNoteEnd = $derived(notes.reduce((max, note) => Math.max(max, note.beat + note.duration), 0));
  const localPlayhead = $derived(Math.max(0, transport.smoothPlayheadBeats - clipStartBeat));
  const rollBeats = $derived(
    openTimelineBeats({
      contentEnd: Math.max(clipLengthBeats, lastNoteEnd),
      playhead: localPlayhead,
      horizon: horizonBeats,
      timeSignature: transport.timeSignature
    })
  );

  const gridHeight = $derived(pitches.length * NOTE_HEIGHT);
  const gridWidth = $derived(Math.max(400, rollBeats * pixelsPerBeat));
  const drawLeft = $derived(Math.max(0, scrollLeft - 200));
  const drawWidth = $derived(Math.min(gridWidth - drawLeft, Math.max(viewWidth, 400) + 400));

  /** Playhead position inside the roll. The grid has no end, so it stays visible. */
  const playheadX = $derived.by(() => {
    const local = transport.smoothPlayheadBeats - clipStartBeat;
    if (local < 0) return null;
    return local * pixelsPerBeat;
  });

  function yForPitch(pitch: number): number {
    return (HIGH_PITCH - pitch) * NOTE_HEIGHT;
  }

  function pitchForY(y: number): number {
    return Math.max(LOW_PITCH, Math.min(HIGH_PITCH, HIGH_PITCH - Math.floor(y / NOTE_HEIGHT)));
  }

  $effect(() => {
    const element = grid;
    if (!element) return;

    const dpr = window.devicePixelRatio || 1;
    element.width = Math.max(1, Math.round(drawWidth * dpr));
    element.height = Math.max(1, Math.round(gridHeight * dpr));

    const ctx = element.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, drawWidth, gridHeight);

    for (const pitch of pitches) {
      const y = yForPitch(pitch);
      ctx.fillStyle = isBlackKey(pitch) ? '#131313' : '#1c1b1b';
      ctx.fillRect(0, y, drawWidth, NOTE_HEIGHT);

      if (pitch % 12 === 0) {
        ctx.fillStyle = 'rgba(62, 72, 80, 0.9)';
        ctx.fillRect(0, y + NOTE_HEIGHT - 1, drawWidth, 1);
      }
    }

    const division = projectStore.snapDivision || 1;
    const startBeat = Math.floor(drawLeft / pixelsPerBeat);
    const endBeat = Math.ceil((drawLeft + drawWidth) / pixelsPerBeat) + 1;
    const stepStart = Math.floor(startBeat / division);

    for (let step = stepStart; step * division <= endBeat; step += 1) {
      const beat = step * division;
      const x = Math.round(beat * pixelsPerBeat - drawLeft) + 0.5;
      const isBar = Math.abs(beat % perBar) < 1e-6;
      const isBeat = Math.abs(beat % 1) < 1e-6;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, gridHeight);
      ctx.strokeStyle = isBar
        ? 'rgba(229, 226, 225, 0.28)'
        : isBeat
          ? 'rgba(135, 146, 155, 0.25)'
          : 'rgba(62, 72, 80, 0.45)';
      ctx.lineWidth = isBar ? 1 : 0.5;
      ctx.stroke();
    }
  });

  // Scroll to the notes the first time a clip is shown, so an empty roll opens
  // around middle C instead of at the top of the keyboard.
  $effect(() => {
    const pane = scroller;
    if (!pane || !clip || centered) return;

    const focusPitch = notes.length > 0 ? Math.round(notes[0].pitch) : 60;
    pane.scrollTop = Math.max(0, yForPitch(focusPitch) - pane.clientHeight / 2);
    centered = true;
  });

  $effect(() => {
    void clip?.id;
    centered = false;
    horizonBeats = 0;
  });

  function syncScroll() {
    if (keysPane && scroller) keysPane.scrollTop = scroller.scrollTop;
    if (!scroller) return;
    scrollLeft = scroller.scrollLeft;
    viewWidth = scroller.clientWidth;
    if (shouldGrowHorizon(scrollLeft, viewWidth, gridWidth)) {
      horizonBeats = Math.max(horizonBeats, rollBeats);
    }
  }

  function localPoint(event: PointerEvent | MouseEvent, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function snap(beat: number, bypass: boolean): number {
    const division = projectStore.snapDivision;
    return bypass || division === 0 ? beat : quantize(beat, division, 'floor');
  }

  function onGridPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;

    let owner = track;
    let target = clip;
    if (!target && midiTrack) {
      target = projectStore.ensureMIDIClip(midiTrack.id, 0, Math.max(64, defaultDuration + 4));
      owner = midiTrack;
    }
    if (!target || !owner) return;

    const point = localPoint(event, event.currentTarget as HTMLElement);
    const beat = Math.max(0, snap(point.x / pixelsPerBeat, event.altKey));
    const pitch = pitchForY(point.y);

    projectStore.addNote(target.id, beat, pitch, defaultDuration, velocity);
    engine.auditionNote(owner.id, pitch, 220);
  }

  type NoteDrag = {
    id: string;
    mode: 'move' | 'resize';
    pointerX: number;
    pointerY: number;
    beat: number;
    pitch: number;
    duration: number;
  };

  let noteDrag: NoteDrag | null = null;

  function onNotePointerDown(event: PointerEvent, note: (typeof notes)[number]) {
    if (!clip || event.button !== 0) return;
    event.stopPropagation();

    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    const mode = event.clientX > rect.right - RESIZE_ZONE ? 'resize' : 'move';

    element.setPointerCapture(event.pointerId);
    projectStore.selectNotes([note.id]);
    projectStore.beginInteraction(mode === 'move' ? 'Move Note' : 'Resize Note');

    noteDrag = {
      id: note.id,
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      beat: note.beat,
      pitch: note.pitch,
      duration: note.duration
    };
  }

  function onNotePointerMove(event: PointerEvent) {
    if (!noteDrag || !clip) return;

    const deltaBeats = (event.clientX - noteDrag.pointerX) / pixelsPerBeat;

    if (noteDrag.mode === 'resize') {
      const raw = Math.max(1 / 32, noteDrag.duration + deltaBeats);
      const division = projectStore.snapDivision;
      const next = event.altKey || division === 0 ? raw : Math.max(division, quantize(raw, division));
      projectStore.setNoteDuration(clip.id, noteDrag.id, next);
      return;
    }

    const beat = Math.max(0, snap(noteDrag.beat + deltaBeats, event.altKey));
    const pitchDelta = -Math.round((event.clientY - noteDrag.pointerY) / NOTE_HEIGHT);
    const pitch = Math.max(LOW_PITCH, Math.min(HIGH_PITCH, noteDrag.pitch + pitchDelta));

    projectStore.moveNote(clip.id, noteDrag.id, beat, pitch);
  }

  function onNotePointerUp(event: PointerEvent) {
    if (!noteDrag) return;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    noteDrag = null;
    projectStore.endInteraction();
  }

  function onNoteContext(event: MouseEvent, id: string) {
    event.preventDefault();
    if (clip) projectStore.deleteNotes(clip.id, [id]);
  }

  function createClip() {
    if (!midiTrack) return;
    projectStore.ensureMIDIClip(midiTrack.id, transport.playheadBeats, 4);
  }

  function closePanel() {
    projectStore.bottomPanel = 'none';
    if (workspace.module === 'mixer' || workspace.module === 'pianoRoll') workspace.open('arrange');
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!clip) return;
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    event.preventDefault();
    projectStore.deleteNotes(clip.id, projectStore.selectedNoteIDs);
  }
</script>

<div class="piano">
<div class="panel-title">
  <Icon name="pianoroll" size={12} />
  <span>Piano Roll</span>
  {#if clip}
    <span class="clip-label">{clip.name}</span>
  {:else if midiTrack}
    <span class="clip-label">{midiTrack.name}</span>
  {/if}

  <span class="spacer"></span>

  <label class="control">
    Length
    <select bind:value={defaultDuration}>
      <option value={4}>1/1</option>
      <option value={2}>1/2</option>
      <option value={1}>1/4</option>
      <option value={0.5}>1/8</option>
      <option value={0.25}>1/16</option>
    </select>
  </label>

  <label class="control">
    Vel
    <input type="number" min="1" max="127" bind:value={velocity} class="vel" />
  </label>

  {#if midiTrack && !clip}
    <button class="create" onclick={createClip}>Crear clip MIDI</button>
  {/if}

  <button class="icon-btn" title="Zoom out" onclick={() => (pixelsPerBeat = Math.max(16, pixelsPerBeat / 1.25))}>
    <Icon name="zoom-out" size={12} />
  </button>
  <button class="icon-btn" title="Zoom in" onclick={() => (pixelsPerBeat = Math.min(400, pixelsPerBeat * 1.25))}>
    <Icon name="zoom-in" size={12} />
  </button>
  <button class="panel-close" title="Cerrar piano roll" onclick={closePanel}>
    <Icon name="close" size={13} />
  </button>
</div>

{#if !midiTrack}
  <div class="empty">
    <p>Selecciona una pista MIDI o Instrument</p>
    <span>El piano roll sigue la pista, como en el clon 1.0. Haz clic en Midi 1–4 o doble clic en un clip.</span>
  </div>
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="roll" role="group" tabindex="-1" onkeydown={onKeyDown}>
    <div class="keys" bind:this={keysPane} style:width="{KEY_WIDTH}px">
      <div style:height="{gridHeight}px">
        {#each pitches as pitch (pitch)}
          <button
            class="key"
            class:black={isBlackKey(pitch)}
            style:height="{NOTE_HEIGHT}px"
            onpointerdown={() => track && engine.noteOn(track.id, pitch, velocity)}
            onpointerup={() => track && engine.noteOff(track.id, pitch)}
            onpointerleave={() => track && engine.noteOff(track.id, pitch)}
          >
            {#if pitch % 12 === 0}
              <span class="key-label">{noteName(pitch)}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <div class="grid-scroll" bind:this={scroller} onscroll={syncScroll}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="grid-inner" style:width="{gridWidth}px" style:height="{gridHeight}px" onpointerdown={onGridPointerDown}>
        <canvas
          bind:this={grid}
          style:left="{drawLeft}px"
          style:width="{drawWidth}px"
          style:height="{gridHeight}px"
        ></canvas>

        {#each notes as note (note.id)}
          <div
            class="note"
            class:selected={projectStore.selectedNoteIDs.includes(note.id)}
            style:left="{note.beat * pixelsPerBeat}px"
            style:top="{yForPitch(note.pitch) + 1}px"
            style:width="{Math.max(4, note.duration * pixelsPerBeat - 1)}px"
            style:height="{NOTE_HEIGHT - 2}px"
            style:opacity={0.45 + (note.velocity / 127) * 0.55}
            role="button"
            tabindex="-1"
            title="{noteName(note.pitch)} vel {note.velocity}"
            onpointerdown={(e) => onNotePointerDown(e, note)}
            onpointermove={onNotePointerMove}
            onpointerup={onNotePointerUp}
            oncontextmenu={(e) => onNoteContext(e, note.id)}
          ></div>
        {/each}

        {#if playheadX !== null}
          <div class="playhead" style:transform="translateX({playheadX}px)"></div>
        {/if}
      </div>
    </div>
  </div>
{/if}
</div>

<style>
  .piano {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .clip-label {
    color: var(--text-primary);
    font-weight: 500;
  }

  .spacer {
    flex: 1;
  }

  .control {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: var(--text-tertiary);
  }

  .control select {
    padding: 1px 2px;
    font-size: 10px;
  }

  .vel {
    width: 42px;
    padding: 1px 3px;
    font-size: 10px;
  }

  .empty {
    margin: auto;
    max-width: 360px;
    padding: 24px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty span {
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1.45;
  }

  .create {
    padding: 4px 8px;
    border-radius: var(--radius);
    background: var(--accent-dim);
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
  }

  .roll {
    display: flex;
    flex: 1;
    min-height: 0;
    outline: none;
  }

  .keys {
    flex: none;
    overflow: hidden;
    background: var(--bg-inset);
    border-right: 1px solid var(--stroke);
  }

  .key {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    width: 100%;
    padding-right: 3px;
    background: #e5e2e1;
    border-bottom: 1px solid rgba(19, 19, 19, 0.35);
    color: #131313;
  }

  .key:hover {
    background: var(--accent);
  }

  .key.black {
    background: #201f1f;
    color: var(--text-tertiary);
  }

  .key.black:hover {
    background: var(--accent);
  }

  .key-label {
    font-family: var(--font-mono);
    font-size: 8px;
  }

  .grid-scroll {
    flex: 1;
    overflow: auto;
    min-width: 0;
  }

  .grid-inner {
    position: relative;
  }

  canvas {
    position: absolute;
    top: 0;
    display: block;
    pointer-events: none;
  }

  .note {
    position: absolute;
    border-radius: 2px;
    background: var(--accent);
    border: 1px solid color-mix(in srgb, var(--clip-color) 55%, black);
    cursor: grab;
  }

  .note.selected {
    background: var(--tempo);
    border-color: var(--text-primary);
  }

  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--record);
    pointer-events: none;
  }
</style>
