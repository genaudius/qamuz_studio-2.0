/**
 * Keeps the audio backend in step with the project.
 *
 * Two jobs. Mixer state (tracks, volume, pan, mute, instrument) is pushed
 * reactively whenever the project changes. The playback schedule (MIDI events
 * and audio clips) is rebuilt whenever the transport starts, seeks, the tempo
 * moves, or the project is edited during playback, which is the same strategy
 * PlaybackEngine.swift uses.
 */

import { isNoteEvent } from '$lib/core/midi';
import { channelProcessPayload, fxBusesPayload, makeChannelProcess } from '$lib/core/channel-fx';
import { fromBeats, toBeats, toSampleRate } from '$lib/core/time';
import type { Track } from '$lib/core/track';
import type { ProjectStore } from '$lib/stores/project.svelte';
import type { TransportStore } from '$lib/stores/transport.svelte';
import { noteOffEvent, noteOnEvent, type ScheduledMIDIEvent } from './backend';
import { rackInstrumentSound, trackInstrument } from './instruments';
import { WebAudioBackend } from './web-audio-backend';

/** Extra tail so a note release is not cut off at the schedule edge. */
const SCHEDULE_TAIL_BEATS = 2;

export class EngineController {
  readonly backend = new WebAudioBackend();

  /** Meter levels, refreshed on a timer so components can just read them. */
  meters = $state<Record<string, { peak: number; rms: number }>>({});
  masterMeter = $state({ peak: 0, rms: 0, truePeak: 0 });
  spectrum = $state<number[]>([]);
  isReady = $state(false);
  startupError = $state<string | null>(null);

  #project: ProjectStore | null = null;
  #transport: TransportStore | null = null;
  #disposeRoot: (() => void) | null = null;
  #meterTimer: number | null = null;
  #unsubscribe: (() => void) | null = null;

  async init(project: ProjectStore, transport: TransportStore): Promise<void> {
    this.#project = project;
    this.#transport = transport;

    try {
      await this.backend.start();
      this.isReady = true;
    } catch (error) {
      this.startupError = (error as Error).message;
      return;
    }

    transport.bind(this.backend);
    this.backend.setMetronomeGrid(transport.bpm, transport.timeSignature);

    this.#unsubscribe = transport.on((event) => {
      if (event === 'play' || event === 'seek') {
        this.rebuildSchedule();
      } else if (event === 'tempoChanged') {
        this.backend.setMetronomeGrid(transport.bpm, transport.timeSignature);
        if (transport.isPlaying) this.rebuildSchedule();
      } else if (event === 'stop' || event === 'pause') {
        this.backend.clearScheduledMIDIEvents();
        this.backend.clearAudioClips();
      }
    });

    this.#disposeRoot = $effect.root(() => {
      // Mixer sync: touches every field the engine cares about, so any edit
      // to a track re-runs this and the worklet stays authoritative-free.
      $effect(() => {
        void project.mixerRevision;
        const tracks = project.project.tracks;
        const instruments = project.project.vRack.instruments;

        const live = new Set<string>();

        for (const track of tracks) {
          live.add(track.id);
          this.backend.createTrack(track.id);
          this.backend.setTrackVolume(track.id, track.volume);
          this.backend.setTrackPan(track.id, track.pan);
          this.backend.setTrackMute(track.id, !project.isAudible(track));
          this.backend.setTrackInstrument(track.id, trackInstrument(track));
          const cp = track.channelProcess ?? makeChannelProcess();
          this.backend.setTrackChannelProcess(track.id, channelProcessPayload(cp));
        }

        for (const instrument of instruments) {
          live.add(instrument.id);
          this.backend.createTrack(instrument.id);
          this.backend.setTrackVolume(instrument.id, instrument.volume);
          this.backend.setTrackPan(instrument.id, 0);
          this.backend.setTrackMute(instrument.id, instrument.isMuted);
          this.backend.setTrackInstrument(instrument.id, rackInstrumentSound(instrument));
        }

        const buses = project.project.fxBuses;
        if (buses) {
          this.backend.setFxBuses(fxBusesPayload(buses, this.#transport?.bpm ?? 120));
        }

        for (const id of this.#knownTracks) {
          if (!live.has(id)) this.backend.removeTrack(id);
        }
        this.#knownTracks = live;
      });

      // The master fader is the worklet's output gain, normalized so the -2 dB
      // default in the model lands at unity.
      $effect(() => {
        this.backend.setMasterVolume(project.project.masterTrack.volume / 0.7937);
      });

      // Re-schedule on content edits while the transport is rolling, so a note
      // added mid-playback is heard on the next pass rather than after a stop.
      $effect(() => {
        const fingerprint = project.project.tracks
          .map((t) => `${t.id}:${t.clips.length}:${this.#clipFingerprint(t)}`)
          .join('|');

        if (this.#transport?.isPlaying && fingerprint !== this.#lastFingerprint) {
          this.rebuildSchedule();
        }
        this.#lastFingerprint = fingerprint;
      });
    });

    this.#meterTimer = window.setInterval(() => {
      const next: Record<string, { peak: number; rms: number }> = {};
      for (const track of project.project.tracks) {
        next[track.id] = this.backend.meterLevel(track.id);
      }
      for (const instrument of project.project.vRack.instruments) {
        next[instrument.id] = this.backend.meterLevel(instrument.id);
      }
      this.meters = next;
      const master = this.backend.masterMeterLevel();
      this.masterMeter = { peak: master.peak, rms: master.rms, truePeak: master.truePeak ?? 0 };
      this.spectrum = this.backend.latestSpectrum();
    }, 50);
  }

  #knownTracks = new Set<string>();
  #lastFingerprint = '';

  #clipFingerprint(track: Track): string {
    return track.clips
      .map((clip) => {
        const events = clip.content.kind === 'midi' ? clip.content.midi.events.length : 0;
        return `${clip.id}@${clip.timeRange.start.samples}+${clip.timeRange.duration.samples}#${events}`;
      })
      .join(',');
  }

  dispose(): void {
    this.#unsubscribe?.();
    this.#disposeRoot?.();
    if (this.#meterTimer !== null) clearInterval(this.#meterTimer);
    this.backend.stop();
  }

  /** Where a track's MIDI ends up: its own instrument or a V-Rack instrument. */
  #destinationFor(track: Track): string {
    if (track.midiOutput?.kind === 'rackInstrument') return track.midiOutput.id;
    return track.id;
  }

  #channelFor(track: Track): number {
    if (track.midiOutput?.kind === 'rackInstrument') {
      return Math.max(0, Math.min(15, track.midiOutput.channel - 1));
    }
    return 0;
  }

  /** Flattens every clip on every audible track into engine schedule entries. */
  rebuildSchedule(): void {
    const project = this.#project?.project;
    const store = this.#project;
    if (!project || !store) return;

    this.backend.clearScheduledMIDIEvents();
    this.backend.clearAudioClips();

    const bpm = project.tempo.bpm;
    const sampleRate = this.backend.sampleRate;
    const events: ScheduledMIDIEvent[] = [];

    for (const track of project.tracks) {
      if (!store.isAudible(track)) continue;

      const destination = this.#destinationFor(track);
      const channel = this.#channelFor(track);

      for (const clip of track.clips) {
        if (clip.isMuted) continue;

        const clipStartBeat = toBeats(clip.timeRange.start, bpm);
        const clipLengthBeats = toBeats(clip.timeRange.duration, bpm);

        if (clip.content.kind === 'midi') {
          for (const event of clip.content.midi.events) {
            if (!isNoteEvent(event)) continue;
            if (event.beatPosition >= clipLengthBeats) continue;

            const note = event.type.note;
            const startBeat = clipStartBeat + event.beatPosition;
            const endBeat = Math.min(
              startBeat + note.duration,
              clipStartBeat + clipLengthBeats + SCHEDULE_TAIL_BEATS
            );

            const startSample = fromBeats(startBeat, bpm, sampleRate).samples;
            const endSample = fromBeats(endBeat, bpm, sampleRate).samples;
            const velocity = Math.round(note.velocity * clip.gain);

            events.push(
              noteOnEvent(destination, startSample, note.pitch, Math.min(127, velocity), channel)
            );
            events.push(noteOffEvent(destination, endSample, note.pitch, channel));
          }
        } else if (clip.content.kind === 'audio') {
          const audio = clip.content.audio;
          const fileID = audio.fileReference.fileID;
          if (!this.backend.hasAudioBuffer(fileID)) continue;

          const buffer = this.backend.audioBuffer(fileID);
          const engineRate = sampleRate;
          const startSample = toSampleRate(clip.timeRange.start, engineRate);
          const durationSamples = toSampleRate(clip.timeRange.duration, engineRate);
          const fileRate = audio.fileReference.sampleRate || engineRate;
          const offsetSample = Math.round(
            (audio.sourceStartSample / Math.max(1, fileRate)) * engineRate
          );
          const sourceLength =
            buffer?.length ??
            Math.round((audio.sourceLengthSamples / Math.max(1, fileRate)) * engineRate);

          this.backend.scheduleAudioClip(fileID, {
            clipID: clip.id,
            trackID: track.id,
            startSample,
            offsetSample,
            lengthSamples: Math.min(durationSamples, Math.max(0, sourceLength - offsetSample)),
            volume: clip.gain,
            fadeInSamples: clip.fadeInDuration,
            fadeOutSamples: clip.fadeOutDuration
          });
        }
      }
    }

    events.sort((a, b) => a.samplePosition - b.samplePosition);
    this.backend.scheduleMIDIEvents(events);
  }

  /** Immediate note for auditioning: clicking a piano roll key or a MIDI input. */
  noteOn(trackID: string, pitch: number, velocity = 100): void {
    const track = this.#project?.project.tracks.find((t) => t.id === trackID);
    const destination = track ? this.#destinationFor(track) : trackID;
    const channel = track ? this.#channelFor(track) : 0;
    this.backend.sendImmediateMIDI(destination, 0x90 | channel, pitch, velocity);
  }

  noteOff(trackID: string, pitch: number): void {
    const track = this.#project?.project.tracks.find((t) => t.id === trackID);
    const destination = track ? this.#destinationFor(track) : trackID;
    const channel = track ? this.#channelFor(track) : 0;
    this.backend.sendImmediateMIDI(destination, 0x80 | channel, pitch, 0);
  }

  /** Plays a pitch briefly, for click-to-audition in the piano roll. */
  auditionNote(trackID: string, pitch: number, durationMs = 350): void {
    this.noteOn(trackID, pitch);
    window.setTimeout(() => this.noteOff(trackID, pitch), durationMs);
  }
}
