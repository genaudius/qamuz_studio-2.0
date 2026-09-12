/**
 * The project document plus everything the UI selects, mutates and undoes.
 *
 * Every mutation goes through `mutate(name, fn)` so undo gets a named entry, and
 * drag gestures wrap themselves in `beginInteraction`/`endInteraction` so a
 * fader sweep is one undo step instead of sixty.
 */

import type { InstrumentName } from '$lib/audio/backend';
import { instrumentSlot } from '$lib/audio/instruments';
import {
  makeChannelProcess,
  makeFxBuses,
  type ChannelProcess,
  type FxBuses
} from '$lib/core/channel-fx';
import {
  makeAudioClip,
  makeAudioClipData,
  makeMIDIClip,
  type AudioFileReference,
  type Clip
} from '$lib/core/clip';
import { isNoteEvent, makeNoteEvent, type MIDIEvent, type NoteData } from '$lib/core/midi';
import {
  createNewProject,
  type Marker,
  type MarkerType,
  type Project
} from '$lib/core/project';
import { lastContentBeats } from '$lib/core/timeline';
import {
  GRID_DIVISIONS,
  clampPpq,
  fromBeats,
  rangeFromBeats,
  toBeats,
  type TimeRange
} from '$lib/core/time';
import {
  makeTrack,
  type InputSource,
  type MIDIOutputDestination,
  type Track,
  type TrackColor,
  type TrackType
} from '$lib/core/track';
import { makeRackInstrument, type RackInstrument } from '$lib/core/vrack';
import { newUUID } from '$lib/core/uuid';
import { UndoStack } from './undo.svelte';

export type BottomPanel = 'none' | 'mixer' | 'pianoRoll' | 'device';

/** Track kinds the arrange + menu can create. Aux/bus share engine type `bus`. */
export type CreateTrackKind = 'audio' | 'midi' | 'instrument' | 'aux' | 'bus';

/** A beat range on one track, used by Generative Fill and range edits. */
export interface RangeSelection {
  trackID: string;
  startBeat: number;
  endBeat: number;
}

const NEW_TRACK_COLORS: TrackColor[] = [
  'blue',
  'green',
  'orange',
  'yellow',
  'cyan',
  'purple',
  'pink',
  'red'
];

export class ProjectStore {
  project = $state<Project>(createNewProject());

  /** Absolute path of the open `.dawproj` package, null for an unsaved project. */
  packagePath = $state<string | null>(null);
  isDirty = $state(false);
  mixerRevision = $state(0);

  selectedTrackID = $state<string | null>(null);
  selectedClipIDs = $state<string[]>([]);
  selectedNoteIDs = $state<string[]>([]);
  rangeSelection = $state<RangeSelection | null>(null);
  /** When on, dragging a beat range on a lane opens Generative Fill. */
  aiFillMode = $state(false);
  isAIGenerating = $state(false);
  showGenerateDialog = $state(false);

  showVRack = $state(false);
  showInspector = $state(true);
  showAI = $state(false);
  bottomPanel = $state<BottomPanel>('none');
  bottomPanelHeight = $state(260);
  vRackWidth = $state(220);
  inspectorWidth = $state(250);
  aiWidth = $state(320);

  /** Horizontal zoom, in pixels per beat. */
  pixelsPerBeat = $state(40);
  /** Snap grid in beats; 0 disables snapping. Hold Alt to bypass it per gesture. */
  snapDivision = $state<number>(GRID_DIVISIONS.sixteenth);

  readonly undoStack = new UndoStack<Project>();

  #interactionDepth = 0;

  readonly selectedTrack = $derived(
    this.selectedTrackID
      ? (this.project.tracks.find((t) => t.id === this.selectedTrackID) ?? null)
      : null
  );

  readonly selectedClips = $derived(
    this.project.tracks.flatMap((t) => t.clips.filter((c) => this.selectedClipIDs.includes(c.id)))
  );

  readonly canUndo = $derived(this.undoStack.canUndo);
  readonly canRedo = $derived(this.undoStack.canRedo);

  constructor() {
    this.#assignDefaultInstruments();
    this.selectedTrackID = this.project.tracks[0]?.id ?? null;
  }

  /**
   * MIDI tracks with no instrument would be silent. A project from the 1.0 build
   * may reference plugins that do not exist here, so only truly empty slots are
   * filled, and this does not count as an edit.
   */
  #assignDefaultInstruments(): void {
    const defaults: InstrumentName[] = ['piano', 'bass', 'pad', 'pluck', 'lead', 'epiano'];
    let index = 0;

    for (const track of this.project.tracks) {
      if (track.type !== 'midi' && track.type !== 'instrument') continue;
      if (!track.instrumentSlot) {
        track.instrumentSlot = instrumentSlot(defaults[index % defaults.length]);
      }
      index += 1;
    }
  }

  // --- undo plumbing ---

  /** Detached plain copy, safe to keep in the undo stack. */
  snapshot(): Project {
    return $state.snapshot(this.project) as Project;
  }

  mutate(name: string, fn: () => void): void {
    if (this.#interactionDepth === 0) {
      this.undoStack.push(name, this.snapshot());
    }
    fn();
    this.touch();
  }

  /** Opens a gesture: one undo entry covers every mutation until it ends. */
  beginInteraction(name: string): void {
    if (this.#interactionDepth === 0) {
      this.undoStack.push(name, this.snapshot());
    }
    this.#interactionDepth += 1;
  }

  endInteraction(): void {
    this.#interactionDepth = Math.max(0, this.#interactionDepth - 1);
  }

  touch(): void {
    this.project.modifiedAt = new Date().toISOString();
    this.isDirty = true;
  }

  undo(): void {
    const entry = this.undoStack.undo(this.snapshot());
    if (entry) this.#restore(entry.snapshot);
  }

  redo(): void {
    const entry = this.undoStack.redo(this.snapshot());
    if (entry) this.#restore(entry.snapshot);
  }

  #restore(snapshot: Project): void {
    this.project = snapshot;
    this.isDirty = true;
    this.#pruneSelection();
  }

  #pruneSelection(): void {
    const trackIDs = new Set(this.project.tracks.map((t) => t.id));
    if (this.selectedTrackID && !trackIDs.has(this.selectedTrackID)) {
      this.selectedTrackID = this.project.tracks[0]?.id ?? null;
    }

    const clipIDs = new Set(this.project.tracks.flatMap((t) => t.clips.map((c) => c.id)));
    this.selectedClipIDs = this.selectedClipIDs.filter((id) => clipIDs.has(id));
  }

  // --- document ---

  load(project: Project, packagePath: string | null): void {
    this.project = project;
    this.packagePath = packagePath;
    this.isDirty = false;
    this.undoStack.clear();
    this.selectedTrackID = project.dawState.selectedTrackID ?? project.tracks[0]?.id ?? null;
    this.selectedClipIDs = [];
    this.selectedNoteIDs = [];
    this.rangeSelection = null;
    this.showVRack = project.dawState.showVRack;
    this.showInspector = project.dawState.showInspector;
    this.bottomPanel = project.dawState.showMixer ? 'mixer' : 'none';
    this.#assignDefaultInstruments();
  }

  newProject(): void {
    this.load(createNewProject(), null);
  }

  markSaved(packagePath: string): void {
    this.packagePath = packagePath;
    this.isDirty = false;
  }

  /** Folds live UI state into `dawState` so it travels with the file. */
  captureUIState(playheadBeats: number): void {
    this.project.dawState.showVRack = this.showVRack;
    this.project.dawState.showInspector = this.showInspector;
    this.project.dawState.showMixer = this.bottomPanel === 'mixer';
    this.project.dawState.zoomLevel = this.pixelsPerBeat / 40;
    this.project.dawState.playheadPosition = playheadBeats;
    if (this.selectedTrackID) {
      this.project.dawState.selectedTrackID = this.selectedTrackID;
    } else {
      delete this.project.dawState.selectedTrackID;
    }
  }

  rename(name: string): void {
    this.mutate('Rename Project', () => {
      this.project.name = name;
    });
  }

  setTempo(bpm: number): void {
    this.mutate('Change Tempo', () => {
      this.project.tempo.bpm = bpm;
    });
  }

  setTimeSignature(numerator: number, denominator: number): void {
    this.mutate('Change Time Signature', () => {
      this.project.timeSignature = { numerator, denominator };
    });
  }

  setPpq(ppq: number): void {
    this.mutate('Change PPQ', () => {
      this.project.ppq = clampPpq(ppq);
    });
  }

  setTimelineOriginSeconds(seconds: number): void {
    this.mutate('Change 1|1 origin', () => {
      this.project.timelineOriginSeconds = Math.max(0, seconds);
    });
  }

  // --- selection ---

  selectTrack(id: string | null): void {
    this.selectedTrackID = id;
  }

  selectClip(id: string, additive = false): void {
    this.selectedClipIDs = additive
      ? this.selectedClipIDs.includes(id)
        ? this.selectedClipIDs.filter((c) => c !== id)
        : [...this.selectedClipIDs, id]
      : [id];

    const owner = this.project.tracks.find((t) => t.clips.some((c) => c.id === id));
    if (owner) this.selectedTrackID = owner.id;
  }

  /** Click a clip so Maestro knows which track/region to add or change. */
  selectClipForMaestro(clipID: string): void {
    this.selectClip(clipID);
    const found = this.findClip(clipID);
    if (!found) return;
    const bpm = this.project.tempo.bpm;
    const startBeat = toBeats(found.clip.timeRange.start, bpm);
    const endBeat = startBeat + Math.max(0.25, toBeats(found.clip.timeRange.duration, bpm));
    this.rangeSelection = { trackID: found.track.id, startBeat, endBeat };
  }

  /** If the user selected a clip or track but has not dragged a range yet. */
  ensureRangeForMaestro(): RangeSelection | null {
    if (this.rangeSelection) return this.rangeSelection;
    const clipID = this.selectedClipIDs[0];
    if (clipID) {
      this.selectClipForMaestro(clipID);
      return this.rangeSelection;
    }
    const track = this.selectedTrack;
    if (!track?.clips.length) return null;
    const bpm = this.project.tempo.bpm;
    let startBeat = Number.POSITIVE_INFINITY;
    let endBeat = 0;
    for (const clip of track.clips) {
      const start = toBeats(clip.timeRange.start, bpm);
      const end = start + toBeats(clip.timeRange.duration, bpm);
      startBeat = Math.min(startBeat, start);
      endBeat = Math.max(endBeat, end);
    }
    if (!(startBeat < endBeat)) return null;
    this.rangeSelection = { trackID: track.id, startBeat, endBeat };
    return this.rangeSelection;
  }

  clearClipSelection(): void {
    this.selectedClipIDs = [];
  }

  selectNotes(ids: string[]): void {
    this.selectedNoteIDs = ids;
  }

  setRangeSelection(selection: RangeSelection | null): void {
    this.rangeSelection = selection;
  }

  /** Marks 0 → last clip so Export can bounce the whole song. */
  selectToSongEnd(): RangeSelection | null {
    const track =
      this.selectedTrack ?? this.project.tracks.find((item) => item.clips.length > 0) ?? this.project.tracks[0];
    if (!track) return null;
    const endBeat = Math.max(lastContentBeats(this.project), 1);
    this.rangeSelection = { trackID: track.id, startBeat: 0, endBeat };
    this.selectedTrackID = track.id;
    return this.rangeSelection;
  }

  // --- tracks ---

  addTrack(type: TrackType = 'midi', name?: string): Track {
    const index = this.project.tracks.length;
    const label = type === 'audio' ? 'Audio' : type === 'bus' ? 'Bus' : type === 'instrument' ? 'Instrumento' : 'Midi';
    const sameType = this.project.tracks.filter((t) => t.type === type).length + 1;
    const track = makeTrack(
      name?.trim() || `${label} ${sameType}`,
      type,
      NEW_TRACK_COLORS[index % NEW_TRACK_COLORS.length]
    );
    if (type === 'midi' || type === 'instrument') {
      track.instrumentSlot = instrumentSlot('piano');
    }

    this.mutate('Add Track', () => {
      this.project.tracks.push(track);
    });
    this.selectedTrackID = track.id;
    return track;
  }

  addTrackByKind(kind: CreateTrackKind): Track {
    if (kind === 'aux' || kind === 'bus') {
      const prefix = kind === 'aux' ? 'Aux' : 'Bus';
      const count =
        this.project.tracks.filter(
          (track) => track.type === 'bus' && new RegExp(`^${prefix}\\b`, 'i').test(track.name)
        ).length + 1;
      return this.addTrack('bus', `${prefix} ${count}`);
    }
    return this.addTrack(kind);
  }

  deleteTrack(id: string): void {
    this.mutate('Delete Track', () => {
      this.project.tracks = this.project.tracks.filter((t) => t.id !== id);
    });
    this.#pruneSelection();
  }

  duplicateTrack(id: string): void {
    const source = this.project.tracks.find((t) => t.id === id);
    if (!source) return;

    const copy = structuredClone($state.snapshot(source)) as Track;
    copy.id = newUUID();
    copy.name = `${source.name} copy`;
    copy.clips = copy.clips.map((clip) => ({ ...clip, id: newUUID() }));
    if (copy.channelProcess?.inserts) {
      copy.channelProcess.inserts = copy.channelProcess.inserts.map((ins) => {
        const newInsertId = newUUID();
        const newParams = { ...ins.params };
        if (newParams.eqamuzState && typeof newParams.eqamuzState === 'object') {
          newParams.eqamuzState = {
            ...newParams.eqamuzState,
            instanceId: `inst-${newInsertId.slice(0, 8)}`,
            trackId: copy.id,
            insertId: newInsertId
          };
        }
        return {
          ...ins,
          id: newInsertId,
          params: newParams
        };
      });
    }

    this.mutate('Duplicate Track', () => {
      const index = this.project.tracks.findIndex((t) => t.id === id);
      this.project.tracks.splice(index + 1, 0, copy);
    });
    this.selectedTrackID = copy.id;
  }

  moveTrack(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;

    this.mutate('Reorder Tracks', () => {
      const [moved] = this.project.tracks.splice(fromIndex, 1);
      this.project.tracks.splice(toIndex, 0, moved);
    });
  }

  #withTrack(id: string, fn: (track: Track) => void): void {
    const track = this.project.tracks.find((t) => t.id === id);
    if (track) fn(track);
  }

  renameTrack(id: string, name: string): void {
    this.mutate('Rename Track', () => this.#withTrack(id, (t) => (t.name = name)));
  }

  setTrackVolume(id: string, volume: number): void {
    this.mutate('Change Volume', () =>
      this.#withTrack(id, (t) => (t.volume = Math.max(0, Math.min(2, volume))))
    );
  }

  setTrackPan(id: string, pan: number): void {
    this.mutate('Change Pan', () =>
      this.#withTrack(id, (t) => (t.pan = Math.max(-1, Math.min(1, pan))))
    );
  }

  applyMixMoves(
    moves: Array<{
      id: string;
      volume: number;
      pan: number;
      channelProcess?: ChannelProcess;
    }>
  ): void {
    this.mutate('Maestro Mix', () => {
      for (const move of moves) {
        this.#withTrack(move.id, (track) => {
          track.volume = Math.max(0, Math.min(2, move.volume));
          track.pan = Math.max(-1, Math.min(1, move.pan));
          if (move.channelProcess) {
            track.channelProcess = structuredClone(move.channelProcess);
          }
        });
      }
    });
  }

  updateChannelProcess(id: string, mutator: (cp: ChannelProcess) => void): void {
    this.mutate('Channel Process', () =>
      this.#withTrack(id, (t) => {
        if (!t.channelProcess) t.channelProcess = makeChannelProcess();
        mutator(t.channelProcess);
      })
    );
    this.mixerRevision += 1;
  }

  touchMixer(): void {
    this.mixerRevision += 1;
  }

  setFxBuses(mutator: (buses: FxBuses) => void): void {
    this.mutate('FX Buses', () => {
      if (!this.project.fxBuses) this.project.fxBuses = makeFxBuses();
      mutator(this.project.fxBuses);
    });
    this.mixerRevision += 1;
  }

  toggleTrackMute(id: string): void {
    this.mutate('Mute Track', () => this.#withTrack(id, (t) => (t.isMuted = !t.isMuted)));
  }

  toggleTrackSolo(id: string): void {
    this.mutate('Solo Track', () => this.#withTrack(id, (t) => (t.isSolo = !t.isSolo)));
  }

  toggleTrackArm(id: string): void {
    this.mutate('Arm Track', () => this.#withTrack(id, (t) => (t.isArmed = !t.isArmed)));
  }

  setTrackColor(id: string, color: TrackColor): void {
    this.mutate('Change Track Color', () => this.#withTrack(id, (t) => (t.color = color)));
  }

  setTrackHeight(id: string, height: number): void {
    this.mutate('Resize Track', () =>
      this.#withTrack(id, (t) => (t.height = Math.max(48, Math.min(400, height))))
    );
  }

  setTrackInput(id: string, source: InputSource | undefined): void {
    this.mutate('Change Track Input', () =>
      this.#withTrack(id, (t) => {
        if (source) t.inputSource = source;
        else delete t.inputSource;
      })
    );
  }

  /** Internal instruments are stored in the plugin slot, see audio/instruments.ts. */
  setTrackInstrument(id: string, instrument: InstrumentName): void {
    this.mutate('Change Instrument', () =>
      this.#withTrack(id, (t) => (t.instrumentSlot = instrumentSlot(instrument)))
    );
  }

  setRackInstrumentSound(id: string, instrument: InstrumentName): void {
    this.mutate('Change Instrument', () => {
      const rack = this.project.vRack.instruments.find((i) => i.id === id);
      if (rack) rack.pluginSlot = instrumentSlot(instrument);
    });
  }

  setTrackMIDIOutput(id: string, destination: MIDIOutputDestination | undefined): void {
    this.mutate('Change MIDI Output', () =>
      this.#withTrack(id, (t) => {
        if (destination) t.midiOutput = destination;
        else delete t.midiOutput;
      })
    );
  }

  get hasSoloedTracks(): boolean {
    return this.project.tracks.some((t) => t.isSolo);
  }

  isAudible(track: Track): boolean {
    if (track.isMuted) return false;
    return this.hasSoloedTracks ? track.isSolo : true;
  }

  // --- clips ---

  addClip(trackID: string, clip: Clip, actionName = 'Add Clip'): void {
    this.mutate(actionName, () => this.#withTrack(trackID, (t) => t.clips.push(clip)));
    this.selectedClipIDs = [clip.id];
  }

  /** Empty MIDI region, the double-click gesture on a MIDI lane. */
  addEmptyMIDIClip(trackID: string, startBeat: number, lengthBeats = 4): Clip | null {
    const track = this.project.tracks.find((t) => t.id === trackID);
    if (!track) return null;

    const clip = makeMIDIClip(
      `${track.name} ${track.clips.length + 1}`,
      rangeFromBeats(startBeat, lengthBeats, this.project.tempo.bpm, this.project.sampleRate)
    );

    this.addClip(trackID, clip);
    return clip;
  }

  /**
   * Track-based piano roll: reuse the first MIDI clip, or create a master clip
   * starting at beat 0 the way TrackPianoRollView does in the 1.0 clone.
   */
  ensureMIDIClip(trackID: string, startBeat = 0, lengthBeats = 16): Clip | null {
    const track = this.project.tracks.find((t) => t.id === trackID);
    if (!track) return null;
    const existing = track.clips.find((clip) => clip.content.kind === 'midi');
    if (existing) {
      this.selectClip(existing.id);
      return existing;
    }
    return this.addEmptyMIDIClip(trackID, startBeat, lengthBeats);
  }

  /**
   * Registers an imported file in the project manifest and drops a clip for it
   * on a track, as one undo step.
   */
  addImportedAudio(trackID: string, reference: AudioFileReference, startBeat: number): Clip | null {
    const track = this.project.tracks.find((t) => t.id === trackID);
    if (!track) return null;

    const bpm = this.project.tempo.bpm;
    const sampleRate = this.project.sampleRate;
    const lengthBeats = (reference.lengthInSamples / reference.sampleRate / 60) * bpm;

    const clip = makeAudioClip(
      reference.originalPath.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, ''),
      rangeFromBeats(Math.max(0, startBeat), Math.max(0.05, lengthBeats), bpm, sampleRate),
      makeAudioClipData(reference)
    );

    this.mutate('Import Audio', () => {
      if (!this.project.audioFiles.some((f) => f.fileID === reference.fileID)) {
        this.project.audioFiles.push(reference);
      }
      track.clips.push(clip);
    });

    this.selectedClipIDs = [clip.id];
    return clip;
  }

  /** Rewrites a manifest entry after the file is copied into the package. */
  setAudioFileRelativePath(fileID: string, relativePath: string): void {
    const file = this.project.audioFiles.find((f) => f.fileID === fileID);
    if (file) file.relativePath = relativePath;

    for (const track of this.project.tracks) {
      for (const clip of track.clips) {
        if (clip.content.kind === 'audio' && clip.content.audio.fileReference.fileID === fileID) {
          clip.content.audio.fileReference.relativePath = relativePath;
        }
      }
    }
  }

  deleteClip(clipID: string): void {
    this.mutate('Delete Clip', () => {
      for (const track of this.project.tracks) {
        track.clips = track.clips.filter((c) => c.id !== clipID);
      }
    });
    this.selectedClipIDs = this.selectedClipIDs.filter((id) => id !== clipID);
  }

  deleteSelectedClips(): void {
    if (this.selectedClipIDs.length === 0) return;
    const ids = new Set(this.selectedClipIDs);

    this.mutate(ids.size > 1 ? 'Delete Clips' : 'Delete Clip', () => {
      for (const track of this.project.tracks) {
        track.clips = track.clips.filter((c) => !ids.has(c.id));
      }
    });
    this.selectedClipIDs = [];
  }

  #withClip(clipID: string, fn: (clip: Clip, track: Track) => void): void {
    for (const track of this.project.tracks) {
      const clip = track.clips.find((c) => c.id === clipID);
      if (clip) {
        fn(clip, track);
        return;
      }
    }
  }

  findClip(clipID: string): { track: Track; clip: Clip } | null {
    for (const track of this.project.tracks) {
      const clip = track.clips.find((c) => c.id === clipID);
      if (clip) return { track, clip };
    }
    return null;
  }

  setClipStart(clipID: string, startBeat: number): void {
    this.mutate('Move Clip', () =>
      this.#withClip(clipID, (clip) => {
        clip.timeRange.start = fromBeats(
          Math.max(0, startBeat),
          this.project.tempo.bpm,
          this.project.sampleRate
        );
      })
    );
  }

  /** Keep stems locked together while the Conductor count-in is inserted. */
  shiftAllClipsByBeats(delta: number): void {
    if (!Number.isFinite(delta) || Math.abs(delta) < 1e-9) return;
    const bpm = this.project.tempo.bpm;
    const sampleRate = this.project.sampleRate;
    this.mutate('Align clips to bar', () => {
      for (const track of this.project.tracks) {
        for (const clip of track.clips) {
          const start = Math.max(0, toBeats(clip.timeRange.start, bpm) + delta);
          clip.timeRange.start = fromBeats(start, bpm, sampleRate);
        }
      }
    });
  }

  setClipLength(clipID: string, lengthBeats: number): void {
    this.mutate('Resize Clip', () =>
      this.#withClip(clipID, (clip) => {
        clip.timeRange.duration = fromBeats(
          Math.max(0.25, lengthBeats),
          this.project.tempo.bpm,
          this.project.sampleRate
        );
      })
    );
  }

  setClipRange(clipID: string, range: TimeRange): void {
    this.mutate('Move Clip', () =>
      this.#withClip(clipID, (clip) => {
        clip.timeRange = range;
      })
    );
  }

  /** Moves a clip to another track, keeping its position on the timeline. */
  moveClipToTrack(clipID: string, targetTrackID: string, startBeat: number): void {
    this.mutate('Move Clip', () => {
      let moved: Clip | null = null;

      for (const track of this.project.tracks) {
        const index = track.clips.findIndex((c) => c.id === clipID);
        if (index >= 0) {
          moved = track.clips.splice(index, 1)[0];
          break;
        }
      }
      if (!moved) return;

      moved.timeRange.start = fromBeats(
        Math.max(0, startBeat),
        this.project.tempo.bpm,
        this.project.sampleRate
      );

      const target = this.project.tracks.find((t) => t.id === targetTrackID);
      if (target) target.clips.push(moved);
    });
  }

  renameClip(clipID: string, name: string): void {
    this.mutate('Rename Clip', () => this.#withClip(clipID, (clip) => (clip.name = name)));
  }

  setClipGain(clipID: string, gain: number): void {
    this.mutate('Change Clip Gain', () =>
      this.#withClip(clipID, (clip) => (clip.gain = Math.max(0, Math.min(4, gain))))
    );
  }

  toggleClipMute(clipID: string): void {
    this.mutate('Mute Clip', () =>
      this.#withClip(clipID, (clip) => (clip.isMuted = !clip.isMuted))
    );
  }

  duplicateClip(clipID: string): void {
    const found = this.findClip(clipID);
    if (!found) return;

    const copy = structuredClone($state.snapshot(found.clip)) as Clip;
    copy.id = newUUID();
    const lengthBeats = toBeats(found.clip.timeRange.duration, this.project.tempo.bpm);
    const startBeats = toBeats(found.clip.timeRange.start, this.project.tempo.bpm);
    copy.timeRange.start = fromBeats(
      startBeats + lengthBeats,
      this.project.tempo.bpm,
      this.project.sampleRate
    );

    this.addClip(found.track.id, copy, 'Duplicate Clip');
  }

  /** Cuts a clip in two at an absolute beat position. */
  splitClip(clipID: string, atBeat: number): void {
    const found = this.findClip(clipID);
    if (!found) return;

    const bpm = this.project.tempo.bpm;
    const start = toBeats(found.clip.timeRange.start, bpm);
    const length = toBeats(found.clip.timeRange.duration, bpm);
    if (atBeat <= start + 0.01 || atBeat >= start + length - 0.01) return;

    const right = structuredClone($state.snapshot(found.clip)) as Clip;
    right.id = newUUID();

    this.mutate('Split Clip', () => {
      this.#withClip(clipID, (clip) => {
        clip.timeRange.duration = fromBeats(atBeat - start, bpm, this.project.sampleRate);
      });

      right.timeRange.start = fromBeats(atBeat, bpm, this.project.sampleRate);
      right.timeRange.duration = fromBeats(start + length - atBeat, bpm, this.project.sampleRate);

      if (right.content.kind === 'midi') {
        const offset = atBeat - start;
        right.content.midi.events = right.content.midi.events
          .filter((e) => e.beatPosition >= offset)
          .map((e) => ({ ...e, beatPosition: e.beatPosition - offset }));
      }

      this.#withClip(clipID, (clip) => {
        if (clip.content.kind === 'midi') {
          const offset = atBeat - start;
          clip.content.midi.events = clip.content.midi.events.filter(
            (e) => e.beatPosition < offset
          );
        }
      });

      const track = this.project.tracks.find((t) => t.id === found.track.id);
      track?.clips.push(right);
    });
  }

  // --- MIDI notes ---

  #withMIDIEvents(clipID: string, fn: (events: MIDIEvent[]) => void): void {
    this.#withClip(clipID, (clip) => {
      if (clip.content.kind === 'midi') fn(clip.content.midi.events);
    });
  }

  addNote(clipID: string, beat: number, pitch: number, duration = 1, velocity = 100): void {
    const event = makeNoteEvent(Math.max(0, beat), pitch, velocity, duration);
    this.mutate('Add Note', () =>
      this.#withClip(clipID, (clip) => {
        if (clip.content.kind !== 'midi') return;
        clip.content.midi.events.push(event);
        const need = Math.max(0, beat) + Math.max(1 / 32, duration) + 4;
        const length = toBeats(clip.timeRange.duration, this.project.tempo.bpm);
        if (need > length) {
          clip.timeRange.duration = fromBeats(need, this.project.tempo.bpm, this.project.sampleRate);
        }
      })
    );
    this.selectedNoteIDs = [event.id];
  }

  deleteNotes(clipID: string, noteIDs: string[]): void {
    if (noteIDs.length === 0) return;
    const ids = new Set(noteIDs);

    this.mutate(ids.size > 1 ? 'Delete Notes' : 'Delete Note', () =>
      this.#withClip(clipID, (clip) => {
        if (clip.content.kind !== 'midi') return;
        clip.content.midi.events = clip.content.midi.events.filter((e) => !ids.has(e.id));
      })
    );
    this.selectedNoteIDs = this.selectedNoteIDs.filter((id) => !ids.has(id));
  }

  moveNote(clipID: string, noteID: string, beat: number, pitch: number): void {
    this.mutate('Move Note', () =>
      this.#withMIDIEvents(clipID, (events) => {
        const event = events.find((e) => e.id === noteID);
        if (!event || !isNoteEvent(event)) return;
        event.beatPosition = Math.max(0, beat);
        event.type.note.pitch = Math.max(0, Math.min(127, Math.round(pitch)));
      })
    );
  }

  setNoteDuration(clipID: string, noteID: string, duration: number): void {
    this.mutate('Resize Note', () =>
      this.#withMIDIEvents(clipID, (events) => {
        const event = events.find((e) => e.id === noteID);
        if (!event || !isNoteEvent(event)) return;
        event.type.note.duration = Math.max(1 / 32, duration);
      })
    );
  }

  setNoteVelocity(clipID: string, noteID: string, velocity: number): void {
    this.mutate('Change Velocity', () =>
      this.#withMIDIEvents(clipID, (events) => {
        const event = events.find((e) => e.id === noteID);
        if (!event || !isNoteEvent(event)) return;
        event.type.note.velocity = Math.max(1, Math.min(127, Math.round(velocity)));
      })
    );
  }

  /** Replaces the notes inside a beat range, used by AI generation. */
  replaceNotesInRange(
    clipID: string,
    startBeat: number,
    endBeat: number,
    notes: { beat: number; pitch: number; duration: number; velocity: number }[],
    actionName = 'Generate MIDI'
  ): void {
    this.mutate(actionName, () =>
      this.#withClip(clipID, (clip) => {
        if (clip.content.kind !== 'midi') return;

        const kept = clip.content.midi.events.filter(
          (e) => e.beatPosition < startBeat || e.beatPosition >= endBeat
        );
        const added = notes.map((n) =>
          makeNoteEvent(startBeat + n.beat, n.pitch, n.velocity, n.duration)
        );
        clip.content.midi.events = [...kept, ...added];
      })
    );
  }

  /**
   * Places AI-generated notes on a track. Creates a MIDI clip if the range is
   * empty, otherwise writes into the overlapping clip so piano-roll edits stay
   * on one region.
   */
  insertGeneratedMIDI(
    trackID: string,
    startBeat: number,
    endBeat: number,
    notes: { beat: number; pitch: number; duration: number; velocity: number }[],
    name: string,
    replace: boolean
  ): void {
    const track = this.project.tracks.find((t) => t.id === trackID);
    if (!track) return;

    const bpm = this.project.tempo.bpm;
    const sampleRate = this.project.sampleRate;
    const lengthBeats = Math.max(0.25, endBeat - startBeat);

    const overlapping = track.clips.find((clip) => {
      if (clip.content.kind !== 'midi') return false;
      const clipStart = toBeats(clip.timeRange.start, bpm);
      const clipEnd = clipStart + toBeats(clip.timeRange.duration, bpm);
      return clipStart < endBeat && clipEnd > startBeat;
    });

    if (!overlapping) {
      const clip = makeMIDIClip(name || 'Generated MIDI', rangeFromBeats(startBeat, lengthBeats, bpm, sampleRate));
      clip.content = {
        kind: 'midi',
        midi: {
          events: notes.map((n) => makeNoteEvent(n.beat, n.pitch, n.velocity, n.duration))
        }
      };
      this.addClip(trackID, clip, replace ? 'Edit MIDI' : 'Generate MIDI');
      return;
    }

    const clipStart = toBeats(overlapping.timeRange.start, bpm);
    const relStart = startBeat - clipStart;
    const relEnd = endBeat - clipStart;
    const relative = notes.map((n) => ({
      beat: n.beat + relStart,
      pitch: n.pitch,
      duration: n.duration,
      velocity: n.velocity
    }));

    if (replace) {
      this.replaceNotesInRange(overlapping.id, relStart, relEnd, relative, 'Edit MIDI');
    } else {
      this.mutate('Generate MIDI', () => {
        this.#withMIDIEvents(overlapping.id, (events) => {
          for (const n of relative) {
            events.push(makeNoteEvent(n.beat, n.pitch, n.velocity, n.duration));
          }
        });
        overlapping.name = name || overlapping.name;
      });
    }

    this.selectedClipIDs = [overlapping.id];
    this.selectedTrackID = trackID;
  }

  notesInRange(clipID: string, startBeat: number, endBeat: number): NoteData[] {
    const found = this.findClip(clipID);
    if (!found || found.clip.content.kind !== 'midi') return [];

    return found.clip.content.midi.events
      .filter((e) => isNoteEvent(e) && e.beatPosition >= startBeat && e.beatPosition < endBeat)
      .map((e) => (e as MIDIEvent & { type: { note: NoteData } }).type.note);
  }

  // --- V-Rack ---

  addRackInstrument(name?: string): RackInstrument {
    const instrument = makeRackInstrument(
      name ?? `Instrument ${this.project.vRack.instruments.length + 1}`
    );
    this.mutate('Add Rack Instrument', () => {
      this.project.vRack.instruments.push(instrument);
    });
    return instrument;
  }

  removeRackInstrument(id: string): void {
    this.mutate('Remove Rack Instrument', () => {
      this.project.vRack.instruments = this.project.vRack.instruments.filter((i) => i.id !== id);

      for (const track of this.project.tracks) {
        if (track.midiOutput?.kind === 'rackInstrument' && track.midiOutput.id === id) {
          delete track.midiOutput;
        }
      }
    });
  }

  renameRackInstrument(id: string, name: string): void {
    this.mutate('Rename Rack Instrument', () => {
      const instrument = this.project.vRack.instruments.find((i) => i.id === id);
      if (instrument) instrument.name = name;
    });
  }

  setRackInstrumentVolume(id: string, volume: number): void {
    this.mutate('Change Instrument Volume', () => {
      const instrument = this.project.vRack.instruments.find((i) => i.id === id);
      if (instrument) instrument.volume = Math.max(0, Math.min(2, volume));
    });
  }

  toggleRackInstrumentMute(id: string): void {
    this.mutate('Mute Instrument', () => {
      const instrument = this.project.vRack.instruments.find((i) => i.id === id);
      if (instrument) instrument.isMuted = !instrument.isMuted;
    });
  }

  // --- markers ---

  addMarker(beat: number, name?: string, type: MarkerType = 'generic'): void {
    const marker: Marker = {
      id: newUUID(),
      name: name ?? `Marker ${this.project.markers.length + 1}`,
      beatPosition: beat,
      color: 'blue',
      type
    };
    this.mutate('Add Marker', () => this.project.markers.push(marker));
  }

  removeMarker(id: string): void {
    this.mutate('Delete Marker', () => {
      this.project.markers = this.project.markers.filter((m) => m.id !== id);
    });
  }
}
