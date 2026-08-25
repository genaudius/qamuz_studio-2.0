/**
 * Maestro mix agent — gain/pan on the real DAW mixer.
 * Default is open and airy: never dump a loud, wide, autoplaying mix.
 */

import { inferInstrument, trackChannelCount, trackLayoutLabel, type NamedStem } from '$lib/audio/stems';
import { currentStudioSession, patchCurrentSession } from '$lib/persistence/sessions.svelte';
import { persistDawSession } from '$lib/persistence/daw-db';
import { projectStore, transport, workspace } from '$lib/stores';

export interface MixMove {
  trackId: string;
  name: string;
  role: string;
  layout: string;
  volume: number;
  pan: number;
  note: string;
}

export interface MixReport {
  moves: MixMove[];
  summary: string;
  styleLabel: string;
}

export interface SessionTrackSnapshot {
  name: string;
  type: string;
  layout: string;
  channels: number;
  volume: number;
  pan: number;
  muted: boolean;
  clips: number;
  role: string;
}

export interface MixStyle {
  headroom: number;
  spread: number;
  vocal: number;
  bass: number;
  drums: number;
  label: string;
}

/** Lower, narrower defaults so the mix has air instead of sitting in the listener's face. */
const ROLE_MIX: Record<string, { volume: number; pan: number; note: string }> = {
  lead_vocal: { volume: 0.58, pan: 0, note: 'Voz al centro, un poco adelante pero con aire.' },
  duet_vocal: { volume: 0.5, pan: -0.12, note: 'Dúo suave a la izquierda.' },
  backing_vocal: { volume: 0.36, pan: 0.16, note: 'Coros atrás, sin empujar.' },
  bass: { volume: 0.52, pan: 0, note: 'Bajo al centro, cuerpo sin tapar.' },
  drums: { volume: 0.48, pan: 0, note: 'Kit al centro con headroom.' },
  percussion: { volume: 0.38, pan: 0.14, note: 'Percusión ligera a la derecha.' },
  lead_guitar: { volume: 0.44, pan: 0.18, note: 'Requinto abierto, no pegado.' },
  rhythm_guitar: { volume: 0.4, pan: -0.16, note: 'Ritmo a la izquierda, hueco al centro.' },
  keys: { volume: 0.42, pan: -0.08, note: 'Teclas suaves.' },
  strings: { volume: 0.36, pan: 0.2, note: 'Cuerdas de apoyo.' },
  brass: { volume: 0.38, pan: -0.14, note: 'Metales sin chocar con el lead.' },
  unknown: { volume: 0.44, pan: 0, note: 'Nivel con aire; ajústalo si hace falta.' }
};

export function mixStyleFromPrompt(prompt = ''): MixStyle {
  const t = prompt.trim().toLowerCase();
  const style: MixStyle = {
    headroom: 0.56,
    spread: 0.48,
    vocal: 1,
    bass: 1,
    drums: 1,
    label: 'abierta y con aire'
  };

  if (/suave|aire|fluid|abierta|espacio|menos fuerte|no tan|sumerg|auditiv|tranquila/.test(t)) {
    style.headroom = 0.48;
    style.spread = 0.38;
    style.label = 'suave, con aire';
  }
  if (/potente|pegad|cerca|intima|íntima|loud|adelante/.test(t)) {
    style.headroom = 0.64;
    style.spread = 0.5;
    style.label = 'un poco más cerca';
  }
  if (/(voz|vocal)/.test(t) && /m[aá]s|sube/.test(t)) {
    style.vocal = 1.14;
    style.label += ', voz un poco más adelante';
  }
  if (/(voz|vocal)/.test(t) && /menos|baja/.test(t)) {
    style.vocal = 0.88;
    style.label += ', voz más atrás';
  }
  if (/(bajo|bass)/.test(t) && /m[aá]s|sube/.test(t)) {
    style.bass = 1.12;
    style.label += ', más cuerpo en el bajo';
  }
  if (/(bater[ií]a|drums|kit)/.test(t) && /m[aá]s|sube/.test(t)) {
    style.drums = 1.1;
    style.label += ', kit un poco más presente';
  }
  return style;
}

function roleGain(role: string, style: MixStyle): number {
  if (role.includes('vocal')) return style.vocal;
  if (role === 'bass') return style.bass;
  if (role === 'drums' || role === 'percussion') return style.drums;
  return 1;
}

function recipeFor(
  stem: NamedStem,
  stereo: boolean,
  index: number,
  total: number,
  style: MixStyle
): { volume: number; pan: number; note: string } {
  const base = ROLE_MIX[stem.role] ?? ROLE_MIX.unknown;
  let pan = base.pan * style.spread;
  if (stereo && Math.abs(pan) < 0.04 && stem.role !== 'lead_vocal' && stem.role !== 'bass' && stem.role !== 'drums') {
    const spread = total <= 1 ? 0 : (index / Math.max(1, total - 1)) * 0.36 - 0.18;
    pan = spread * style.spread;
  }
  const volume = Math.min(0.78, Math.max(0.18, base.volume * roleGain(stem.role, style) * style.headroom));
  return { volume, pan: Math.max(-0.42, Math.min(0.42, pan)), note: base.note };
}

export function sessionSnapshot(): SessionTrackSnapshot[] {
  return projectStore.project.tracks.map((track) => {
    const stem = inferInstrument(track.name);
    return {
      name: track.name,
      type: track.type,
      layout: trackLayoutLabel(track),
      channels: trackChannelCount(track),
      volume: track.volume,
      pan: track.pan,
      muted: track.isMuted,
      clips: track.clips.length,
      role: stem.role
    };
  });
}

export function maestroSessionContext(): string {
  const session = currentStudioSession.record;
  const tracks = sessionSnapshot();
  const lines = tracks.length
    ? tracks
        .map(
          (track) =>
            `- ${track.name} [${track.layout}] rol=${track.role} vol=${track.volume.toFixed(2)} pan=${track.pan.toFixed(2)} clips=${track.clips}`
        )
        .join('\n')
    : '- (sesión vacía)';
  const selected = projectStore.selectedTrack;
  const range = projectStore.rangeSelection;
  const focus = selected
    ? `Pista seleccionada: “${selected.name}” (${selected.type}, ${selected.clips.length} clips, vol ${selected.volume.toFixed(2)}). Si piden “borra el track” o “bórralo”, esa es la pista.`
    : 'Pista seleccionada: ninguna. Pídeles que hagan clic en el lane o en un clip.';
  const region = range
    ? `Región: beats ${range.startBeat.toFixed(1)}–${range.endBeat.toFixed(1)}.`
    : 'Región: ninguna.';

  return `Sesión DAW: ${session?.name ?? projectStore.project.name}
Idea: ${session?.idea || '—'}
Tempo: ${transport.bpm} BPM
${focus}
${region}
Pistas:
${lines}

Eres Maestro dentro de QAMUZ Studio. Hablas en español, corto y claro. Ya conoces la pista y la región seleccionadas: úsalas cuando digan “esto”, “el track”, “esta pista” o “aquí”.
Si piden borrar un track, NO lo borres tú: el DAW pide confirmación con el nombre (“¿Estás seguro de que quieres borrar el track del bajo?”).
No impones play, mezcla, master ni export.
Mezclas con aire (ganancia y paneo reales). No satures ni abras el paneo al máximo.
EQ/comp/reverb de canal se hacen en QAMUZ MASTER PRO cuando te lo pidan.
Si pide cambiar una frase, necesita una región seleccionada en la pista.`;
}

export function mixSession(options?: {
  headroom?: number;
  prompt?: string;
  openMixer?: boolean;
}): MixReport {
  const style = mixStyleFromPrompt(options?.prompt ?? '');
  if (typeof options?.headroom === 'number') {
    style.headroom = Math.max(0.2, Math.min(1, options.headroom));
  }
  const tracks = projectStore.project.tracks.filter(
    (track) => track.clips.length > 0 || track.type === 'instrument' || track.type === 'audio'
  );
  const moves: MixMove[] = tracks.map((track, index) => {
    const stem = inferInstrument(track.name);
    const stereo = trackChannelCount(track) >= 2;
    const recipe = recipeFor(stem, stereo, index, tracks.length, style);
    return {
      trackId: track.id,
      name: track.name,
      role: stem.role,
      layout: trackLayoutLabel(track),
      volume: recipe.volume,
      pan: recipe.pan,
      note: recipe.note
    };
  });

  projectStore.applyMixMoves(moves.map((move) => ({ id: move.trackId, volume: move.volume, pan: move.pan })));
  if (options?.openMixer) workspace.open('mixer');

  const names = moves.map((move) => move.name);
  const summary = moves.length
    ? `Listo. Mezclé “${currentStudioSession.record?.name || projectStore.project.name}” ${style.label}: ${names.join(', ')}. No la puse a sonar sola — dale play cuando quieras, o dime qué subir, bajar o dejar como está.`
    : 'No hay pistas para mezclar todavía. Importa stems o extrae la canción y luego dime cómo la quieres.';

  patchCurrentSession({
    stage: moves.length ? 'mixed' : currentStudioSession.record?.stage,
    mixNotes: summary,
    tracks: sessionSnapshot()
  });
  void persistDawSession();

  return { moves, summary, styleLabel: style.label };
}

export function describeSession(): string {
  const tracks = sessionSnapshot();
  if (!tracks.length) return 'La sesión no tiene pistas todavía.';
  return tracks
    .map((track) => `${track.name} · ${track.layout} · ${track.clips} clip${track.clips === 1 ? '' : 's'}`)
    .join('\n');
}
