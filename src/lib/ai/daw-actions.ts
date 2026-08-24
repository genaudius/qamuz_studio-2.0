/**
 * DAW tools Maestro (and Claude) can run. Port of the 1.0 ActionExecutor,
 * covering the nodes needed to connect planner → timeline.
 */

import { importAudioBytes } from '$lib/audio/import';
import { engine, projectStore, transport } from '$lib/stores';
import { workspace, type StudioModule } from '$lib/stores/workspace.svelte';
import { generateMIDI } from './claude';
import { generateWithMaestro, interpretIdea, type MaestroPlan } from './maestro';

export interface DawActionResult {
  ok: boolean;
  message: string;
}

function findTrack(name: string) {
  const needle = name.trim().toLowerCase();
  return projectStore.project.tracks.find((t) => t.name.toLowerCase() === needle) ?? null;
}

export async function executeDawAction(
  name: string,
  args: Record<string, unknown> = {}
): Promise<DawActionResult> {
  try {
    switch (name) {
      case 'play':
        await engine.backend.resume();
        transport.play();
        return { ok: true, message: 'Reproduciendo.' };
      case 'stop':
        transport.stop();
        return { ok: true, message: 'Stop.' };
      case 'pause':
        transport.pause();
        return { ok: true, message: 'Pausa.' };
      case 'set_tempo': {
        const bpm = Number(args.bpm);
        if (!Number.isFinite(bpm)) return { ok: false, message: 'BPM inválido.' };
        transport.setTempo(bpm);
        projectStore.setTempo(transport.bpm);
        return { ok: true, message: `Tempo ${transport.bpm.toFixed(1)} BPM.` };
      }
      case 'add_track': {
        const type = args.type === 'audio' ? 'audio' : 'midi';
        const track = projectStore.addTrack(type);
        if (typeof args.name === 'string' && args.name.trim()) {
          projectStore.renameTrack(track.id, args.name.trim());
        }
        return { ok: true, message: `Pista ${track.name} creada.` };
      }
      case 'mute_track': {
        const track = findTrack(String(args.track_name ?? ''));
        if (!track) return { ok: false, message: 'Pista no encontrada.' };
        projectStore.toggleTrackMute(track.id);
        return { ok: true, message: `${track.name} mute.` };
      }
      case 'solo_track': {
        const track = findTrack(String(args.track_name ?? ''));
        if (!track) return { ok: false, message: 'Pista no encontrada.' };
        projectStore.toggleTrackSolo(track.id);
        return { ok: true, message: `${track.name} solo.` };
      }
      case 'show_mixer':
        workspace.open('mixer');
        return { ok: true, message: 'Mixer abierto.' };
      case 'show_piano_roll':
        workspace.open('pianoRoll');
        return { ok: true, message: 'Piano roll abierto.' };
      case 'show_mastering':
        workspace.open('mastering');
        return { ok: true, message: 'Master abierto.' };
      case 'open_module':
        workspace.open(String(args.module ?? 'arrange') as StudioModule);
        return { ok: true, message: `Módulo ${workspace.module}.` };
      case 'generate_midi': {
        const track = findTrack(String(args.track_name ?? '')) ?? projectStore.addTrack('midi');
        const startBar = Number(args.start_bar ?? 1);
        const lengthBars = Number(args.length_bars ?? 4);
        const beatsPerBar = transport.timeSignature.numerator;
        const startBeat = (startBar - 1) * beatsPerBar;
        const lengthBeats = lengthBars * beatsPerBar;
        const result = await generateMIDI({
          prompt: String(args.prompt ?? 'melody'),
          beatCount: lengthBeats,
          tempo: transport.bpm,
          timeSignature: transport.timeSignature,
          otherTracks: []
        });
        projectStore.insertGeneratedMIDI(
          track.id,
          startBeat,
          startBeat + lengthBeats,
          result.notes.map((note) => ({
            beat: note.start,
            pitch: note.pitch,
            duration: note.duration,
            velocity: note.velocity
          })),
          result.suggestedName,
          true
        );
        engine.rebuildSchedule();
        return { ok: true, message: `MIDI en ${track.name}.` };
      }
      case 'render_song': {
        const idea = String(args.prompt ?? args.songDescription ?? '');
        if (!idea.trim()) return { ok: false, message: 'Necesito una idea para renderizar.' };
        const bytes = await generateWithMaestro({
          songDescription: idea,
          duration: Number(args.duration ?? 30)
        });
        let track = projectStore.project.tracks.find((t) => t.type === 'audio');
        if (!track) track = projectStore.addTrack('audio');
        const placed = await importAudioBytes(bytes, track.id, 0, args.title ? String(args.title) : 'Maestro mix');
        engine.rebuildSchedule();
        return {
          ok: Boolean(placed.clipID),
          message: placed.clipID ? `Audio en ${track.name}.` : placed.error ?? 'No se pudo colocar el audio.'
        };
      }
      default:
        return { ok: false, message: `Acción desconocida: ${name}` };
    }
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function planAndMaybeRender(
  idea: string,
  render: boolean
): Promise<{ plan: MaestroPlan; message: string }> {
  const preview = await interpretIdea({ songDescription: idea });
  if (preview.plan.bpm && typeof preview.plan.bpm === 'number') {
    transport.setTempo(preview.plan.bpm);
    projectStore.setTempo(transport.bpm);
  }
  if (!render) {
    return { plan: preview.plan, message: 'Plan listo. Di “crear” para renderizar con GenAudius.' };
  }
  const result = await executeDawAction('render_song', { prompt: idea, title: preview.plan.title });
  return { plan: preview.plan, message: result.message };
}

/** Lightweight intent router so Maestro can drive the DAW without Claude. */
export function inferDawAction(text: string): { name: string; args: Record<string, unknown> } | null {
  const t = text.trim().toLowerCase();
  if (/^(play|reproduc|play back)\b/.test(t)) return { name: 'play', args: {} };
  if (/^(stop|detener|para)\b/.test(t)) return { name: 'stop', args: {} };
  if (/^(pause|pausa)\b/.test(t)) return { name: 'pause', args: {} };
  if (/\b(mixer|mezcla)\b/.test(t) && t.length < 40) return { name: 'show_mixer', args: {} };
  if (/\b(piano|roll)\b/.test(t) && t.length < 40) return { name: 'show_piano_roll', args: {} };
  if (/\b(master|masteriz)/.test(t) && t.length < 48) return { name: 'show_mastering', args: {} };
  if (/\bañade? (una )?pista( de audio)?\b/.test(t) || /\badd (an? )?audio track\b/.test(t)) {
    return { name: 'add_track', args: { type: /audio/.test(t) ? 'audio' : 'midi' } };
  }
  const tempo = t.match(/\b(\d{2,3})\s*bpm\b/);
  if (tempo) return { name: 'set_tempo', args: { bpm: Number(tempo[1]) } };
  return null;
}
