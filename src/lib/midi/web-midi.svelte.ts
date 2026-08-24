/**
 * MIDI input over the Web MIDI API.
 *
 * Note on and note off go straight to the engine so playing a keyboard is
 * audible immediately, and when the transport is recording they are also
 * written into a clip on the armed track. Chrome and Edge implement Web MIDI,
 * so this works in the Windows WebView2; Safari's WebKit does not, which is why
 * every call here tolerates the API being absent.
 */

import { engine, projectStore, transport } from '$lib/stores';

export interface MIDIInputDevice {
  id: string;
  name: string;
  manufacturer: string;
}

/** A note being held, waiting for its note off to fix the duration. */
interface HeldNote {
  pitch: number;
  velocity: number;
  startBeat: number;
}

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CONTROL_CHANGE = 0xb0;
const SUSTAIN = 64;
const ALL_NOTES_OFF = 123;

export class MIDIInputController {
  devices = $state<MIDIInputDevice[]>([]);
  /** Empty means "listen to every device", which is what a single keyboard wants. */
  selectedDeviceID = $state<string>('');
  isSupported = $state(false);
  isEnabled = $state(false);
  error = $state<string | null>(null);

  /** Last received note, for the monitor readout in the transport bar. */
  lastMessage = $state<{ pitch: number; velocity: number; on: boolean } | null>(null);
  activeNotes = $state<number[]>([]);

  #access: MIDIAccess | null = null;
  #held = new Map<number, HeldNote>();
  /** Clip receiving the current recording pass, per track. */
  #recordingClips = new Map<string, string>();
  #boundInputs = new Set<MIDIInput>();

  async enable(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      this.isSupported = false;
      this.error = 'This platform does not expose MIDI to the app';
      return false;
    }

    this.isSupported = true;

    try {
      this.#access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (error) {
      this.error = `MIDI access denied: ${(error as Error).message}`;
      return false;
    }

    this.#access.onstatechange = () => this.#refresh();
    this.#refresh();
    this.isEnabled = true;
    this.error = null;
    return true;
  }

  disable(): void {
    for (const input of this.#boundInputs) input.onmidimessage = null;
    this.#boundInputs.clear();

    if (this.#access) this.#access.onstatechange = null;
    this.#access = null;

    this.allNotesOff();
    this.isEnabled = false;
  }

  selectDevice(id: string): void {
    this.selectedDeviceID = id;
    this.#refresh();
  }

  #refresh(): void {
    if (!this.#access) return;

    const inputs = [...this.#access.inputs.values()];

    this.devices = inputs.map((input) => ({
      id: input.id,
      name: input.name ?? 'MIDI input',
      manufacturer: input.manufacturer ?? ''
    }));

    for (const input of this.#boundInputs) input.onmidimessage = null;
    this.#boundInputs.clear();

    const listening =
      this.selectedDeviceID === ''
        ? inputs
        : inputs.filter((input) => input.id === this.selectedDeviceID);

    for (const input of listening) {
      input.onmidimessage = (event) => this.#onMessage(event);
      this.#boundInputs.add(input);
    }
  }

  /** The track that receives input: the armed one, else the selection. */
  #targetTrack(): string | null {
    const armed = projectStore.project.tracks.find(
      (t) => t.isArmed && (t.type === 'midi' || t.type === 'instrument')
    );
    if (armed) return armed.id;

    const selected = projectStore.selectedTrack;
    if (selected && (selected.type === 'midi' || selected.type === 'instrument')) {
      return selected.id;
    }
    return null;
  }

  #onMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length < 2) return;

    const status = data[0] & 0xf0;
    const pitch = data[1];
    const velocity = data.length > 2 ? data[2] : 0;

    // Running status: note on with zero velocity means note off.
    if (status === NOTE_ON && velocity > 0) {
      this.#noteOn(pitch, velocity);
    } else if (status === NOTE_OFF || (status === NOTE_ON && velocity === 0)) {
      this.#noteOff(pitch);
    } else if (status === CONTROL_CHANGE && pitch === ALL_NOTES_OFF) {
      this.allNotesOff();
    } else if (status === CONTROL_CHANGE && pitch === SUSTAIN) {
      // Sustain is handled by the instrument envelopes, so it is forwarded raw.
      const trackID = this.#targetTrack();
      if (trackID) engine.backend.sendImmediateMIDI(trackID, CONTROL_CHANGE, pitch, velocity);
    }
  }

  #noteOn(pitch: number, velocity: number): void {
    const trackID = this.#targetTrack();
    if (!trackID) return;

    engine.noteOn(trackID, pitch, velocity);

    this.lastMessage = { pitch, velocity, on: true };
    if (!this.activeNotes.includes(pitch)) this.activeNotes = [...this.activeNotes, pitch];

    if (transport.isRecording) {
      this.#held.set(pitch, { pitch, velocity, startBeat: transport.playheadBeats });
    }
  }

  #noteOff(pitch: number): void {
    const trackID = this.#targetTrack();
    if (trackID) engine.noteOff(trackID, pitch);

    this.lastMessage = { pitch, velocity: 0, on: false };
    this.activeNotes = this.activeNotes.filter((p) => p !== pitch);

    const held = this.#held.get(pitch);
    if (!held) return;
    this.#held.delete(pitch);

    if (trackID) this.#commitNote(trackID, held, transport.playheadBeats);
  }

  /** Writes a finished note into the recording clip, creating it if needed. */
  #commitNote(trackID: string, held: HeldNote, endBeat: number): void {
    const duration = Math.max(1 / 32, endBeat - held.startBeat);
    const clipID = this.#recordingClip(trackID, held.startBeat);
    if (!clipID) return;

    const found = projectStore.findClip(clipID);
    if (!found) return;

    const clipStart = (found.clip.timeRange.start.samples / projectStore.project.sampleRate / 60) *
      projectStore.project.tempo.bpm;

    projectStore.addNote(
      clipID,
      held.startBeat - clipStart,
      held.pitch,
      duration,
      held.velocity
    );

    // Grow the clip so the note stays inside it.
    const lengthBeats =
      (found.clip.timeRange.duration.samples / projectStore.project.sampleRate / 60) *
      projectStore.project.tempo.bpm;
    const needed = held.startBeat - clipStart + duration;
    if (needed > lengthBeats) {
      projectStore.setClipLength(clipID, Math.ceil(needed));
    }
  }

  /**
   * One clip per track per recording pass. An existing clip under the playhead
   * is reused so overdubbing adds to it rather than stacking regions.
   */
  #recordingClip(trackID: string, atBeat: number): string | null {
    const existing = this.#recordingClips.get(trackID);
    if (existing && projectStore.findClip(existing)) return existing;

    const track = projectStore.project.tracks.find((t) => t.id === trackID);
    if (!track) return null;

    const bpm = projectStore.project.tempo.bpm;
    const sampleRate = projectStore.project.sampleRate;

    const covering = track.clips.find((clip) => {
      if (clip.content.kind !== 'midi') return false;
      const start = (clip.timeRange.start.samples / sampleRate / 60) * bpm;
      const length = (clip.timeRange.duration.samples / sampleRate / 60) * bpm;
      return atBeat >= start && atBeat < start + length;
    });

    if (covering) {
      this.#recordingClips.set(trackID, covering.id);
      return covering.id;
    }

    const clip = projectStore.addEmptyMIDIClip(trackID, Math.floor(atBeat), 4);
    if (!clip) return null;

    this.#recordingClips.set(trackID, clip.id);
    return clip.id;
  }

  /** Called when a recording pass ends: closes held notes and forgets the clips. */
  finishRecording(): void {
    const endBeat = transport.playheadBeats;

    for (const held of this.#held.values()) {
      const trackID = this.#targetTrack();
      if (trackID) this.#commitNote(trackID, held, endBeat);
    }

    this.#held.clear();
    this.#recordingClips.clear();
  }

  allNotesOff(): void {
    for (const pitch of this.activeNotes) {
      const trackID = this.#targetTrack();
      if (trackID) engine.noteOff(trackID, pitch);
    }
    this.activeNotes = [];
    this.#held.clear();
  }
}
