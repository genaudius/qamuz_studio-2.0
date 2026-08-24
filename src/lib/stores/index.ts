/**
 * Application singletons. A DAW has exactly one open document, one transport and
 * one audio engine, so these are module-level instances rather than context.
 */

import { EngineController } from '$lib/audio/engine.svelte';
import { MIDIInputController } from '$lib/midi/web-midi.svelte';
import { ProjectStore } from './project.svelte';
import { TransportStore } from './transport.svelte';

export const projectStore = new ProjectStore();
export const transport = new TransportStore();
export const engine = new EngineController();
export const midiInput = new MIDIInputController();

let initialized = false;

/** Starts audio and wires the stores together. Safe to call more than once. */
export async function initApp(): Promise<void> {
  if (initialized) return;
  initialized = true;

  transport.bpm = projectStore.project.tempo.bpm;
  transport.timeSignature = { ...projectStore.project.timeSignature };

  await engine.init(projectStore, transport);

  // A recording pass is one undo step, and it ends with notes still held down,
  // which the MIDI controller has to close before the interaction is sealed.
  let recording = false;

  transport.on((event) => {
    if (event === 'record') {
      recording = true;
      projectStore.beginInteraction('Record MIDI');
      return;
    }

    if (event === 'stopRecording' || event === 'stop' || event === 'pause') {
      midiInput.finishRecording();
      midiInput.allNotesOff();

      if (recording) {
        recording = false;
        projectStore.endInteraction();
      }
    }
  });

  // MIDI needs no permission prompt in a Tauri window, so connect on startup and
  // stay quiet when the platform has no Web MIDI at all.
  void midiInput.enable();
}

export { ProjectStore, TransportStore };
export type { BottomPanel, RangeSelection } from './project.svelte';
