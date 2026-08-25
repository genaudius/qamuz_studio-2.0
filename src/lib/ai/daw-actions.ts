/**
 * DAW tools Maestro (and Claude) can run. Port of the 1.0 ActionExecutor,
 * covering the nodes needed to connect planner → timeline — including the
 * mix agent, which lives here rather than as a second chat-only assistant.
 */

import { importAudioBytes } from '$lib/audio/import';
import { inferInstrument, instrumentForStem, uniqueTrackName } from '$lib/audio/stems';
import { makeClip } from '$lib/core/clip';
import { isNoteEvent } from '$lib/core/midi';
import type { MarkerType } from '$lib/core/project';
import { rangeFromBeats, toBeats } from '$lib/core/time';
import { persistDawSession } from '$lib/persistence/daw-db';
import { patchCurrentSession } from '$lib/persistence/sessions.svelte';
import { engine, projectStore, transport } from '$lib/stores';
import { workspace, type StudioModule } from '$lib/stores/workspace.svelte';
import type { InstrumentName } from '$lib/audio/backend';
import type { Track } from '$lib/core/track';
import { generateMIDI } from './claude';
import { isElevenLabsConfigured } from './config';
import { runAudioFill, runMIDIFill } from './fill';
import { lastRenderAudioUrl, generateWithMaestro, interpretIdea, type MaestroPlan } from './maestro';
import { describeSession, mixSession } from './mix-agent';
import { describeGroove, localPartForSound, transposeNotes } from './local-midi';
import { trackIsEmpty } from './session-inventory';
import {
  bachataForm,
  beatsForIntent,
  draftLyrics,
  getLastLyrics,
  getWorkMode,
  patchSketch,
  rememberIntent,
  rememberLyrics,
  roleLabel,
  setWorkMode,
  type ArrangeIntent,
  type BachataStyle,
  type PartRole,
  voiceMountedMessage
} from './song-sketch';
import { findStyleCard } from './style-cards';
import type { GeneratedMIDINote } from './types';

export interface DawActionResult {
  ok: boolean;
  message: string;
}

function findTrack(name: string) {
  const needle = name.trim().toLowerCase();
  if (!needle) return projectStore.selectedTrack ?? null;
  return (
    projectStore.project.tracks.find((t) => t.name.toLowerCase() === needle) ??
    projectStore.project.tracks.find((t) => t.name.toLowerCase().includes(needle)) ??
    null
  );
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function sectionRangeBeats(): { startBeat: number; endBeat: number } {
  const selected = projectStore.ensureRangeForMaestro();
  if (selected && selected.endBeat > selected.startBeat + 0.2) {
    return { startBeat: selected.startBeat, endBeat: selected.endBeat };
  }
  const bpm = projectStore.project.tempo.bpm;
  let start = Number.POSITIVE_INFINITY;
  let end = 0;
  for (const track of projectStore.project.tracks) {
    for (const clip of track.clips) {
      const clipStart = toBeats(clip.timeRange.start, bpm);
      const clipEnd = clipStart + toBeats(clip.timeRange.duration, bpm);
      start = Math.min(start, clipStart);
      end = Math.max(end, clipEnd);
    }
  }
  if (Number.isFinite(start) && end > start) return { startBeat: Math.max(0, start), endBeat: end };
  const bars = 8;
  return { startBeat: 0, endBeat: bars * (transport.timeSignature.numerator || 4) };
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
        return { ok: true, message: 'Reproduciendo la sesión.' };
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
        const raw = String(args.type ?? 'midi');
        const kind =
          raw === 'audio' || raw === 'instrument' || raw === 'aux' || raw === 'bus' || raw === 'midi'
            ? raw
            : 'midi';
        const named = typeof args.name === 'string' ? args.name : undefined;
        const track =
          named && kind !== 'aux' && kind !== 'bus'
            ? projectStore.addTrack(kind, named)
            : projectStore.addTrackByKind(kind);
        return { ok: true, message: `Pista ${track.name} creada.` };
      }
      case 'add_instrument': {
        const label = String(args.name ?? args.instrument ?? 'Instrumento').trim() || 'Instrumento';
        const stem = inferInstrument(label);
        const sound = (args.sound as InstrumentName | undefined) ?? instrumentForStem(stem);
        const existing = projectStore.project.tracks.find(
          (track) =>
            (track.type === 'midi' || track.type === 'instrument') &&
            track.name.toLowerCase() === stem.name.toLowerCase()
        );
        const track =
          existing ??
          projectStore.addTrack(
            'midi',
            uniqueTrackName(
              stem.name,
              projectStore.project.tracks.map((item) => item.name)
            )
          );
        projectStore.setTrackInstrument(track.id, sound);
        const span = sectionRangeBeats();
        const beatsPerBar = transport.timeSignature.numerator || 4;
        const notes = localPartForSound(sound, span.endBeat - span.startBeat, beatsPerBar);
        if (notes.length) {
          projectStore.insertGeneratedMIDI(
            track.id,
            span.startBeat,
            span.endBeat,
            notes.map((item) => ({
              beat: item.start,
              pitch: item.pitch,
              duration: item.duration,
              velocity: item.velocity
            })),
            stem.name,
            false
          );
          engine.rebuildSchedule();
        }
        workspace.open('arrange');
        projectStore.showAI = true;
        void persistDawSession();
        return {
          ok: true,
          message: `Agregué “${track.name}” (${sound}) a la sección · ${transport.bpm.toFixed(0)} BPM, beats ${span.startBeat.toFixed(0)}–${span.endBeat.toFixed(0)}. Lo escribí en el arrange, sin GenAudius. Dime si lo quieres más grave, más ocupado o más corto.`
        };
      }
      case 'write_part':
        return writePart(args);
      case 'lay_form':
        return layForm(args);
      case 'mount_voice':
        return mountVoiceTrack(args);
      case 'arm_voice':
        return armVoiceTrack();
      case 'delete_track': {
        const track =
          findTrack(String(args.track_name ?? '')) ??
          (typeof args.track_id === 'string'
            ? (projectStore.project.tracks.find((item) => item.id === args.track_id) ?? null)
            : null) ??
          projectStore.selectedTrack;
        if (!track) {
          return {
            ok: false,
            message:
              'No sé cuál pista borrar. Selecciónala en el arrange o nómbrala, por ejemplo: “borra el bajo”.'
          };
        }
        const name = track.name;
        projectStore.deleteTrack(track.id);
        engine.rebuildSchedule();
        void persistDawSession();
        return {
          ok: true,
          message: `Listo. Borré el track “${name}”. Si te arrepientes, dime “deshaz”.`
        };
      }
      case 'duplicate_track': {
        const track = findTrack(String(args.track_name ?? '')) ?? projectStore.selectedTrack;
        if (!track) return { ok: false, message: 'Selecciona la pista que quieres duplicar.' };
        projectStore.duplicateTrack(track.id);
        engine.rebuildSchedule();
        return { ok: true, message: `Dupliqué “${track.name}”.` };
      }
      case 'undo':
        projectStore.undo();
        engine.rebuildSchedule();
        return { ok: true, message: 'Deshice el último cambio.' };
      case 'mute_track': {
        const track = findTrack(String(args.track_name ?? '')) ?? projectStore.selectedTrack;
        if (!track) return { ok: false, message: 'Pista no encontrada.' };
        projectStore.toggleTrackMute(track.id);
        return { ok: true, message: `${track.name} ${track.isMuted ? 'en mute' : 'ya suena otra vez'}.` };
      }
      case 'solo_track': {
        const track = findTrack(String(args.track_name ?? '')) ?? projectStore.selectedTrack;
        if (!track) return { ok: false, message: 'Pista no encontrada.' };
        projectStore.toggleTrackSolo(track.id);
        return { ok: true, message: `${track.name} solo.` };
      }
      case 'set_track_volume': {
        const track = findTrack(String(args.track_name ?? ''));
        if (!track) return { ok: false, message: 'Pista no encontrada.' };
        const db = Number(args.db);
        const volume = Number.isFinite(Number(args.volume))
          ? Number(args.volume)
          : Number.isFinite(db)
            ? dbToGain(db)
            : track.volume;
        projectStore.setTrackVolume(track.id, volume);
        return { ok: true, message: `${track.name}: volumen ${volume.toFixed(2)}.` };
      }
      case 'set_track_pan': {
        const track = findTrack(String(args.track_name ?? ''));
        if (!track) return { ok: false, message: 'Pista no encontrada.' };
        const pan = Number(args.pan);
        if (!Number.isFinite(pan)) return { ok: false, message: 'Pan inválido (-1 a 1).' };
        projectStore.setTrackPan(track.id, pan);
        return { ok: true, message: `${track.name}: pan ${pan.toFixed(2)}.` };
      }
      case 'mix_session': {
        const prompt = String(args.prompt ?? '');
        const report = mixSession({
          prompt,
          openMixer: /\bmixer\b/.test(prompt.toLowerCase())
        });
        void persistDawSession();
        return { ok: true, message: report.summary };
      }
      case 'describe_session':
        return { ok: true, message: describeSession() };
      case 'edit_selection': {
        const range = projectStore.ensureRangeForMaestro();
        const prompt = String(args.prompt ?? '').trim();
        if (!range) {
          projectStore.aiFillMode = true;
          return {
            ok: false,
            message:
              'Selecciona una pista: haz clic en el clip o activa Generative Fill y arrastra una región. Luego dime qué agregar o cambiar.'
          };
        }
        const track = projectStore.project.tracks.find((item) => item.id === range.trackID);
        if (!track) return { ok: false, message: 'No encuentro la pista seleccionada.' };
        if (!prompt) return { ok: false, message: 'Dime qué debe decir o tocar esa región.' };
        if (track.type === 'midi' || track.type === 'instrument') {
          await runMIDIFill(prompt);
          return { ok: true, message: `Reescribí la región MIDI de “${track.name}”.` };
        }
        if (!isElevenLabsConfigured()) {
          projectStore.aiFillMode = true;
          projectStore.showGenerateDialog = true;
          return {
            ok: false,
            message: `Región lista en “${track.name}”. Conecta ElevenLabs o usa Generative Fill para regenerar esa frase. No reescribo letras palabra por palabra sin el motor de fill.`
          };
        }
        await runAudioFill(prompt, 'elevenlabs_music');
        return {
          ok: true,
          message: `Regeneré el tramo seleccionado de “${track.name}”. Escúchalo y dime si hay que ajustar otra frase.`
        };
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

function planChips(plan: MaestroPlan): string[] {
  return [
    plan.genre,
    plan.style,
    typeof plan.mood === 'string' ? plan.mood : null,
    plan.bpm ? `${plan.bpm} BPM` : null,
    plan.key
  ].filter((item): item is string => Boolean(item));
}

export async function planAndMaybeRender(
  idea: string,
  render: boolean
): Promise<{ plan: MaestroPlan; message: string; chips: string[] }> {
  const preview = await interpretIdea({ songDescription: idea });
  if (preview.plan.bpm && typeof preview.plan.bpm === 'number') {
    transport.setTempo(preview.plan.bpm);
    projectStore.setTempo(transport.bpm);
  }
  patchCurrentSession({ idea, stage: 'planned' });
  void persistDawSession();
  setWorkMode('genaudius');
  if (!render) {
    return {
      plan: preview.plan,
      message: 'Plan musical construido y listo para revisión. Di “crear” para renderizar con GenAudius.',
      chips: planChips(preview.plan)
    };
  }
  const result = await executeDawAction('render_song', { prompt: idea, title: preview.plan.title });
  patchCurrentSession({
    idea,
    stage: 'rendered',
    audioUrl: lastRenderAudioUrl ?? undefined,
    title: preview.plan.title
  });
  void persistDawSession();
  return { plan: preview.plan, message: result.message, chips: planChips(preview.plan) };
}

function soundForRole(role: PartRole): InstrumentName {
  if (role === 'bass') return 'bass';
  if (role === 'bongo' || role === 'guiro') return 'drums';
  if (role === 'segunda') return 'pluck';
  if (role === 'requinto') return 'lead';
  return 'piano';
}

function asIntent(args: Record<string, unknown>): ArrangeIntent {
  return {
    role: (typeof args.role === 'string' ? args.role : null) as PartRole | null,
    durationMinutes: typeof args.durationMinutes === 'number' ? args.durationMinutes : Number(args.durationMinutes) || null,
    bpm: typeof args.bpm === 'number' ? args.bpm : Number(args.bpm) || null,
    key: typeof args.key === 'string' ? args.key : null,
    mode: args.mode === 'minor' || args.mode === 'major' ? args.mode : null,
    relative: typeof args.relative === 'string' ? args.relative : null,
    genre: typeof args.genre === 'string' ? args.genre : null,
    style: args.style === 'bolero' || args.style === 'romantico' || args.style === 'bailable' ? args.style : null,
    copyFrom: args.copyFrom === 'bass' ? 'bass' : null,
    section: typeof args.section === 'string' ? args.section : null,
    form: Boolean(args.form),
    trackName: typeof args.trackName === 'string' ? args.trackName : null
  };
}

function pickTrackForRole(role: PartRole, name: string): Track {
  const existing =
    findTrack(name) ??
    projectStore.project.tracks.find((track) => track.name.toLowerCase().includes(name.toLowerCase()));
  if (existing && (role === 'voice' ? existing.type === 'audio' : existing.type === 'midi' || existing.type === 'instrument')) {
    return existing;
  }
  const selected = projectStore.selectedTrack;
  if (
    selected &&
    trackIsEmpty(selected) &&
    (role === 'voice' ? selected.type === 'audio' : selected.type === 'midi' || selected.type === 'instrument')
  ) {
    if (selected.name !== name) projectStore.renameTrack(selected.id, name);
    return selected;
  }
  const empty = projectStore.project.tracks.find((track) =>
    role === 'voice'
      ? track.type === 'audio' && trackIsEmpty(track)
      : (track.type === 'midi' || track.type === 'instrument') && trackIsEmpty(track)
  );
  if (empty) {
    projectStore.renameTrack(empty.id, uniqueTrackName(name, projectStore.project.tracks.map((item) => item.name).filter((item) => item !== empty.name)));
    return empty;
  }
  return projectStore.addTrack(role === 'voice' ? 'audio' : 'midi', name);
}

function midiNotesFromTrack(track: Track): GeneratedMIDINote[] {
  const bpm = projectStore.project.tempo.bpm;
  const notes: GeneratedMIDINote[] = [];
  for (const clip of track.clips) {
    if (clip.content.kind !== 'midi') continue;
    const clipStart = toBeats(clip.timeRange.start, bpm);
    for (const event of clip.content.midi.events) {
      if (!isNoteEvent(event)) continue;
      notes.push({
        pitch: event.type.note.pitch,
        start: clipStart + event.beatPosition,
        duration: event.type.note.duration,
        velocity: event.type.note.velocity
      });
    }
  }
  return notes;
}

function applyFormMarkers(totalBeats: number): string[] {
  const beatsPerBar = transport.timeSignature.numerator || 4;
  const markers = bachataForm(totalBeats, beatsPerBar);
  if (!projectStore.project.markers.length) {
    for (const marker of markers) {
      projectStore.addMarker(marker.startBeat, marker.name, marker.type as MarkerType);
    }
  }
  return markers.map((marker) => marker.name);
}

function writePart(args: Record<string, unknown>): DawActionResult {
  const intent = asIntent(args);
  const role = intent.role;
  if (!role || role === 'voice') {
    return mountVoiceTrack(args);
  }
  rememberIntent(intent);
  if (intent.bpm) {
    transport.setTempo(intent.bpm);
    projectStore.setTempo(transport.bpm);
  }
  rememberIntent({ ...intent, bpm: transport.bpm });
  const beatsPerBar = transport.timeSignature.numerator || 4;
  const length = Math.min(8 * transport.bpm, beatsForIntent(intent, transport.bpm, beatsPerBar));
  const name = intent.trackName || roleLabel(role);
  const track = pickTrackForRole(role, name);
  const sound = soundForRole(role);
  projectStore.setTrackInstrument(track.id, sound);

  let notes: GeneratedMIDINote[] = [];
  if (intent.copyFrom === 'bass') {
    const bass = findTrack('bajo') ?? findTrack('bass');
    if (bass) notes = transposeNotes(midiNotesFromTrack(bass), 12, 0.45);
  }
  if (!notes.length) {
    notes = localPartForSound(sound, length, beatsPerBar, {
      key: intent.key || 'C',
      mode: intent.mode || 'major',
      feel: (intent.style as BachataStyle | undefined) || 'default',
      groove: intent.genre || 'bachata',
      role
    });
  }

  if (notes.length) {
    projectStore.insertGeneratedMIDI(
      track.id,
      0,
      length,
      notes.map((item) => ({
        beat: item.start,
        pitch: item.pitch,
        duration: item.duration,
        velocity: item.velocity
      })),
      name,
      true
    );
  }

  const form = applyFormMarkers(length);
  patchSketch({ durationBeats: length, durationMinutes: length / Math.max(1, transport.bpm), bpm: transport.bpm });
  engine.rebuildSchedule();
  workspace.open('arrange');
  projectStore.showAI = true;
  projectStore.selectTrack(track.id);
  void persistDawSession();
  patchCurrentSession({ tempo: transport.bpm, stage: 'arranged' });

  const copied = intent.copyFrom === 'bass' ? ' con las mismas notas del bajo (una octava arriba)' : '';
  const groove = describeGroove({
    feel: (intent.style as BachataStyle | undefined) || 'default',
    groove: intent.genre || 'bachata'
  });
  const card = findStyleCard(role, intent.genre || 'bachata');
  const cardBit = card ? ` Ficha ${card.label}.` : '';
  if (!getWorkMode()) setWorkMode('midi');
  return {
    ok: true,
    message: `Escribí “${track.name}”${copied} con groove distinto: ${groove}. ${intent.key || 'C'} ${intent.mode === 'minor' ? 'menor' : 'mayor'}, ${transport.bpm.toFixed(0)} BPM.${cardBit} Si sigue igual, dime otro estilo (bolero, romántica, bailable) o género (merengue, salsa) y lo reescribo.`
  };
}

function layForm(args: Record<string, unknown>): DawActionResult {
  const intent = asIntent(args);
  rememberIntent(intent);
  const beatsPerBar = transport.timeSignature.numerator || 4;
  const length = beatsForIntent(intent, transport.bpm, beatsPerBar);
  const names = applyFormMarkers(length);
  workspace.open('arrange');
  return {
    ok: true,
    message: `Marqué la forma: ${names.join(', ')}. Las pistas siguen vacías hasta que me pidas un instrumento.`
  };
}

function mountVoiceTrack(args: Record<string, unknown>): DawActionResult {
  const intent = asIntent(args);
  rememberIntent(intent);
  const fromArgs = typeof args.lyrics === 'string' ? args.lyrics.trim() : '';
  const lyrics = fromArgs || getLastLyrics() || draftLyrics(typeof args.idea === 'string' ? args.idea : intent.trackName || 'voz', intent);
  rememberLyrics(lyrics);
  const track = pickTrackForRole('voice', 'Voz');
  const beatsPerBar = transport.timeSignature.numerator || 4;
  const length = beatsForIntent(intent, transport.bpm, beatsPerBar);
  const bpm = projectStore.project.tempo.bpm;
  if (!track.clips.length) {
    const clip = makeClip('Voz', rangeFromBeats(0, length, bpm, projectStore.project.sampleRate), {
      kind: 'empty'
    });
    projectStore.addClip(track.id, clip, 'Add Vocal Region');
  }
  projectStore.selectTrack(track.id);
  workspace.open('arrange');
  void persistDawSession();
  return {
    ok: true,
    message: voiceMountedMessage(lyrics)
  };
}

function armVoiceTrack(): DawActionResult {
  const track = pickTrackForRole('voice', 'Voz');
  if (!track.isArmed) projectStore.toggleTrackArm(track.id);
  projectStore.selectTrack(track.id);
  workspace.open('arrange');
  return {
    ok: true,
    message:
      'Armé la pista “Voz”. Cuando el mic esté listo, pulsa el botón rojo de grabar en el transporte. La región ya está encima del arreglo.'
  };
}

function panFromText(text: string): number | null {
  if (/\b(izquierda|left)\b/.test(text)) return -0.45;
  if (/\b(derecha|right)\b/.test(text)) return 0.45;
  if (/\b(centro|center)\b/.test(text)) return 0;
  const numeric = text.match(/\bpan(?:eo)?\s*(-?[\d.]+)\b/);
  if (numeric) return Number(numeric[1]);
  return null;
}

function wantsSessionMix(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (wantsSongPlan(t)) return false;
  return (
    /m[eé]zcl/.test(t) ||
    /\b(prepara(?:r)?|haz|hacer|aplica(?:r)?) (una |la )?mezcla\b/.test(t) ||
    /\banaliza(?:r)?.{0,80}(sesión|sesion|pistas|stems|tracks)\b/.test(t) ||
    /\bmix(ing)?(\b| the | la )?(session|song|tracks|pistas)?\b/.test(t) ||
    /\b(niveles|faders|balancea(?:r)? la (sesión|sesion))\b/.test(t)
  );
}

export function wantsSongPlan(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /\b(crear|crea|genera(?:r)?|render|escribe|compone(?:r)?)\b/.test(t) &&
    /\b(canci[oó]n|song|tema|letra)\b/.test(t)
  );
}

/** Lightweight intent router so Maestro can drive the DAW without Claude. */
export function inferDawAction(text: string): { name: string; args: Record<string, unknown> } | null {
  const t = text.trim().toLowerCase();
  if (/^(play|reproduc|play back)\b/.test(t)) return { name: 'play', args: {} };
  if (/^(stop|detener|para)\b/.test(t) && t.length < 24) return { name: 'stop', args: {} };
  if (/^(pause|pausa)\b/.test(t) && t.length < 24) return { name: 'pause', args: {} };

  if (wantsSessionMix(t)) {
    return { name: 'mix_session', args: { prompt: text.trim() } };
  }

  if (/\b(abre(r)? )?(el )?mixer\b/.test(t) && t.length < 48) return { name: 'show_mixer', args: {} };
  if (/\b(piano[\s-]?roll|abre(r)? el piano)\b/.test(t) && t.length < 48) return { name: 'show_piano_roll', args: {} };
  if (/\b(master|masteriz)/.test(t) && t.length < 48) return { name: 'show_mastering', args: {} };

  const add = t.match(
    /\b(?:añade\w*|anade\w*|agrega\w*|agr[eé]gale|pon\w*|p[oó]ngale|genera\w*|crea\w*)\b.{0,48}\b(piano|bajo|bass|guitarra|requinto|segunda|bongo|bongos|cuerdas|violines|metales|synth|bater[ií]a|drums|tambora|g[uü]ira)\b/
  );
  if (add && !wantsSongPlan(t)) {
    return { name: 'add_instrument', args: { name: add[1], prompt: text.trim() } };
  }

  if (/\bañade? (una )?pista midi\b/.test(t) || /\badd (an? )?midi track\b/.test(t)) {
    return { name: 'add_track', args: { type: 'midi' } };
  }
  if (/\b(instrumento virtual|pista (de )?instrumento)\b/.test(t)) {
    return { name: 'add_track', args: { type: 'instrument' } };
  }
  if (/\b(pista aux|auxiliar)\b/.test(t)) {
    return { name: 'add_track', args: { type: 'aux' } };
  }
  if (/\bpista bus\b/.test(t) || /\badd (an? )?bus track\b/.test(t)) {
    return { name: 'add_track', args: { type: 'bus' } };
  }
  if (/\bañade? (una )?pista( de audio| est[eé]reo)?\b/.test(t) || /\badd (an? )?(audio|stereo) track\b/.test(t)) {
    return { name: 'add_track', args: { type: /audio|est[eé]reo|stereo/.test(t) ? 'audio' : 'midi' } };
  }

  const volume = t.match(/\b(?:volumen|volume|sube|baja)\b.{0,40}?\b([a-záéíóúñ0-9 ]{2,24})\b/);
  if (/\b(volumen|volume|sube|baja|más fuerte|mas fuerte|más bajo|mas bajo)\b/.test(t)) {
    const trackName = volume?.[1]?.replace(/\b(el|la|los|las|un|una|de|del)\b/g, '').trim();
    let amount = t.includes('sube') || t.includes('más fuerte') || t.includes('mas fuerte') ? 0.12 : -0.12;
    const db = t.match(/(-?\d+(?:\.\d+)?)\s*db\b/);
    const track = findTrack(trackName || String(projectStore.selectedTrackID ? projectStore.project.tracks.find((x) => x.id === projectStore.selectedTrackID)?.name : ''));
    if (track) {
      const next = db ? dbToGain(Number(db[1])) : Math.max(0.05, Math.min(1.6, track.volume + amount));
      return { name: 'set_track_volume', args: { track_name: track.name, volume: next } };
    }
  }

  const pan = panFromText(t);
  const panTrack = t.match(/\b(?:panea|pan)\b.{0,32}?\b([a-záéíóúñ ]{2,20})\b/);
  if (pan !== null && /\b(panea|pan|izquierda|derecha|centro)\b/.test(t)) {
    const track = findTrack(panTrack?.[1] ?? '') ?? projectStore.selectedTrack;
    if (track) return { name: 'set_track_pan', args: { track_name: track.name, pan } };
  }

  const tempo = t.match(/\b(\d{2,3})\s*bpm\b/);
  if (tempo) return { name: 'set_tempo', args: { bpm: Number(tempo[1]) } };

  if (
    !/\b(volumen|volume|pan|tempo|bpm)\b/.test(t) &&
    (/\b(cambia(r)?|reemplaza(r)?|regrava(r)?|edita(r)?|otra frase|cambia las palabras)\b/.test(t) ||
      (/(aquí|aca|acá|\besto\b|esta pista|esta región|esta region|esta selección|esta seleccion)/.test(t) &&
        /\b(cambia|agrega|añade|pon|reemplaza|edita)\b/.test(t)))
  ) {
    return { name: 'edit_selection', args: { prompt: text.trim() } };
  }

  return null;
}
