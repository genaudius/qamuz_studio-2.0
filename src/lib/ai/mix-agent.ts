/**
 * Maestro mix agent — gain/pan + live channel EQ/comp/sends (Limbus-style intelligent mix).
 * Recipes calibrated to role-based studio practice (vocal air, bass HPF, drum punch, etc.).
 */

import { inferInstrument, trackChannelCount, trackLayoutLabel, type NamedStem } from '$lib/audio/stems';
import {
  defaultEqBands,
  makeChannelProcess,
  makeInsert,
  type ChannelProcess,
  type EqBand,
  type InsertKind,
  type InsertSlot
} from '$lib/core/channel-fx';
import { FACTORY_PRESETS } from '$lib/eqamuz/registry';
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
  channelProcess?: ChannelProcess;
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
  /** Apply EQ/comp/sends (intelligent mix). */
  process: boolean;
}

export type MixConfirmChoice = 'detect_tempo' | 'mix_current' | 'cancel';

export interface MixConfirmState {
  prompt: string;
  bpm: number;
  message: string;
}

/** Pending confirmation for Limbus-style “detect tempo / mix at BPM / cancel”. */
let pendingMixConfirm: MixConfirmState | null = null;

export function getPendingMixConfirm(): MixConfirmState | null {
  return pendingMixConfirm;
}

export function clearPendingMixConfirm(): void {
  pendingMixConfirm = null;
}

/** Lower, narrower defaults so the mix has air instead of sitting in the listener's face. */
const ROLE_MIX: Record<string, { volume: number; pan: number; note: string }> = {
  lead_vocal: { volume: 0.58, pan: 0, note: 'Voz al centro, EQ aire + comp suave.' },
  duet_vocal: { volume: 0.5, pan: -0.12, note: 'Dúo con HPF y comp ligera.' },
  backing_vocal: { volume: 0.36, pan: 0.16, note: 'Coros atrás, shelf agudo suave.' },
  bass: { volume: 0.52, pan: 0, note: 'Bajo centrado; EQ suave @850 Hz + comp -18/3.' },
  drums: { volume: 0.56, pan: 0, note: 'Kit protegido en transitorios; EQ/comp ligeros.' },
  percussion: { volume: 0.4, pan: 0.14, note: 'Percusión lateral, poco reverb.' },
  lead_guitar: { volume: 0.44, pan: 0.18, note: 'Lead abierto, presence 3–4 kHz.' },
  rhythm_guitar: { volume: 0.4, pan: -0.16, note: 'Ritmo con corte de mud y delay corto.' },
  keys: { volume: 0.42, pan: -0.08, note: 'Teclas suaves, reverb de sala.' },
  strings: { volume: 0.36, pan: 0.2, note: 'Cuerdas de apoyo con hall.' },
  brass: { volume: 0.38, pan: -0.14, note: 'Metales controlados en 2–3 kHz.' },
  unknown: { volume: 0.44, pan: 0, note: 'Nivel con aire + EQ/comp base.' }
};

function band(type: EqBand['type'], freq: number, gainDb: number, q = 1): EqBand {
  return { type, freq, gainDb, q, enabled: true };
}

export function makeInsertWithPreset(kind: InsertKind, presetName?: string): InsertSlot | null {
  const slot = makeInsert(kind);
  if (!slot) return null;
  if (presetName && slot.params?.eqamuzState) {
    const preset = FACTORY_PRESETS.find((p) => p.presetName === presetName);
    if (preset) {
      slot.params.activePresetName = preset.presetName;
      const suite = slot.params.eqamuzState;
      const targetMap = suite.currentABState === 'A' ? suite.stateA : suite.stateB;
      if (targetMap && preset.moduleTarget in targetMap) {
        targetMap[preset.moduleTarget] = JSON.parse(JSON.stringify(preset.parametersPayload));
      }
    }
  }
  return slot;
}

/** Role recipes calibrated from Limbus AutoMix PROCESS reads and EQAMUZ DSP suite. */
export function processForRole(role: string, style: MixStyle): ChannelProcess {
  const cp = makeChannelProcess();
  if (!style.process) return cp;

  const bands = defaultEqBands();
  let sends = { reverb: 0.08, delay: 0.04 };
  // Limbus default COMP template after AutoMix on BASS / general
  let comp = {
    enabled: true,
    thresholdDb: -18,
    ratio: 3,
    attackMs: 10,
    releaseMs: 100,
    makeupDb: 0
  };

  const inserts: InsertSlot[] = [];

  if (role.includes('vocal')) {
    bands[0] = band('lowshelf', 80, -2.5, 0.7);
    bands[1] = band('peaking', 250, -1.2, 1.1);
    bands[2] = band('peaking', 2800, 1.2, 1.2);
    bands[3] = band('peaking', 5500, 1.8, 1);
    bands[4] = band('highshelf', 12000, 1.2, 0.7);
    comp = { enabled: true, thresholdDb: -16, ratio: 3.5, attackMs: 5, releaseMs: 60, makeupDb: 1 };
    sends = { reverb: 0.18, delay: 0.12 };

    const proEq = makeInsertWithPreset('eqamuz-pro-eq', 'VOCAL_AIR_&_WARMTH');
    const compMod = makeInsertWithPreset('eqamuz-comp', 'OPTO_VOCAL_LEVELER');
    if (proEq) inserts.push(proEq);
    if (compMod) inserts.push(compMod);
    if (role === 'lead_vocal') {
      const sat = makeInsertWithPreset('eqamuz-saturator', 'SUBTLE_TAPE_WARMTH');
      if (sat) inserts.push(sat);
    }
  } else if (role === 'bass') {
    bands[0] = band('lowshelf', 60, 0, 0.9);
    bands[1] = band('peaking', 850, 0.8, 1);
    bands[2] = band('peaking', 1000, 0, 1);
    bands[3] = band('peaking', 4000, 0, 1);
    bands[4] = band('highshelf', 12000, 0, 0.7);
    comp = { enabled: true, thresholdDb: -18, ratio: 3, attackMs: 10, releaseMs: 100, makeupDb: 0 };
    sends = { reverb: 0.02, delay: 0 };

    const proEq = makeInsertWithPreset('eqamuz-pro-eq', 'BASS_TIGHT_CLEANUP');
    const compMod = makeInsertWithPreset('eqamuz-comp', 'SAFE_TRANSPARENT_GLUE');
    if (proEq) inserts.push(proEq);
    if (compMod) inserts.push(compMod);
  } else if (role === 'drums') {
    bands[0] = band('lowshelf', 50, 0.8, 0.7);
    bands[1] = band('peaking', 100, 1.5, 1);
    bands[2] = band('peaking', 400, -1, 1.2);
    bands[3] = band('peaking', 5000, 0.8, 1);
    bands[4] = band('highshelf', 10000, 0.5, 0.7);
    comp = { enabled: true, thresholdDb: -8, ratio: 4, attackMs: 5, releaseMs: 50, makeupDb: 0 };
    sends = { reverb: 0.08, delay: 0.03 };

    const compMod = makeInsertWithPreset('eqamuz-comp', 'VCA_DRUM_PUNCH');
    const proEq = makeInsertWithPreset('eqamuz-pro-eq', 'SAFE_FLAT_RESET');
    if (compMod) inserts.push(compMod);
    if (proEq) inserts.push(proEq);
  } else if (role === 'percussion') {
    bands[0] = band('lowshelf', 120, -2, 0.7);
    bands[1] = band('peaking', 400, -1, 1);
    bands[2] = band('peaking', 2500, 1, 1);
    bands[3] = band('peaking', 6000, 1.5, 1);
    bands[4] = band('highshelf', 10000, 1, 0.7);
    comp = { enabled: true, thresholdDb: -12, ratio: 3, attackMs: 5, releaseMs: 50, makeupDb: 0 };
    sends = { reverb: 0.12, delay: 0.04 };

    const proEq = makeInsertWithPreset('eqamuz-pro-eq', 'SAFE_FLAT_RESET');
    const compMod = makeInsertWithPreset('eqamuz-comp', 'SAFE_TRANSPARENT_GLUE');
    if (proEq) inserts.push(proEq);
    if (compMod) inserts.push(compMod);
  } else if (role.includes('guitar')) {
    bands[0] = band('lowshelf', 90, -2, 0.7);
    bands[1] = band('peaking', 300, -1.5, 1);
    bands[2] = band('peaking', 1200, 0.5, 1);
    bands[3] = band('peaking', 3500, 2, 1.1);
    bands[4] = band('highshelf', 9000, 0.5, 0.7);
    comp = { enabled: true, thresholdDb: -18, ratio: 3, attackMs: 10, releaseMs: 100, makeupDb: 0.5 };
    sends = { reverb: 0.12, delay: role === 'lead_guitar' ? 0.16 : 0.08 };

    const proEq = makeInsertWithPreset('eqamuz-pro-eq', 'SAFE_FLAT_RESET');
    const sat = makeInsertWithPreset('eqamuz-saturator', 'SUBTLE_TAPE_WARMTH');
    if (proEq) inserts.push(proEq);
    if (sat) inserts.push(sat);
  } else if (role === 'keys' || role === 'strings') {
    bands[0] = band('lowshelf', 100, -2, 0.7);
    bands[1] = band('peaking', 400, -1, 1);
    bands[2] = band('peaking', 2000, 0.5, 1);
    bands[3] = band('peaking', 6000, 1, 1);
    bands[4] = band('highshelf', 11000, 1.5, 0.7);
    comp = { enabled: true, thresholdDb: -20, ratio: 2.5, attackMs: 10, releaseMs: 100, makeupDb: 0 };
    sends = { reverb: 0.28, delay: 0.1 };

    const proEq = makeInsertWithPreset('eqamuz-pro-eq', 'SAFE_FLAT_RESET');
    const rev = makeInsertWithPreset('eqamuz-reverb', 'NATURAL_ROOM_AMBIENCE');
    if (proEq) inserts.push(proEq);
    if (rev) inserts.push(rev);
  } else {
    bands[0] = band('lowshelf', 70, -1, 0.7);
    bands[3] = band('peaking', 4000, 0.8, 1);
    bands[4] = band('highshelf', 10000, 0.5, 0.7);

    const proEq = makeInsertWithPreset('eqamuz-pro-eq', 'SAFE_FLAT_RESET');
    if (proEq) inserts.push(proEq);
  }

  // Style modulates send depth / vocal presence
  if (style.label.includes('suave')) {
    sends.reverb *= 1.15;
    comp.ratio = Math.max(1.5, comp.ratio * 0.85);
  }
  if (style.label.includes('cerca') || /potente/.test(style.label)) {
    sends.reverb *= 0.7;
    comp.thresholdDb += 2;
  }

  cp.eq = { enabled: true, bands };
  cp.comp = comp;
  cp.sends = sends;
  cp.inserts = inserts;
  cp.preGainDb = 0;
  return cp;
}

export function mixStyleFromPrompt(prompt = ''): MixStyle {
  const t = prompt.trim().toLowerCase();
  const style: MixStyle = {
    headroom: 0.56,
    spread: 0.48,
    vocal: 1,
    bass: 1,
    drums: 1,
    label: 'abierta y con aire',
    process: /eq|comp|proces|inteligente|mezcla|mix|master|efecto|banda/i.test(t) || t.length < 2
  };

  // Default chip "Mezclar" enables process
  if (!t || /mezclar|mezcla/.test(t)) style.process = true;

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
  if (/solo (nivel|volumen|fader)|sin (eq|comp|proceso)/.test(t)) {
    style.process = false;
    style.label += ', solo niveles';
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
): { volume: number; pan: number; note: string; channelProcess: ChannelProcess } {
  const base = ROLE_MIX[stem.role] ?? ROLE_MIX.unknown;
  let pan = base.pan * style.spread;
  if (
    stereo &&
    Math.abs(pan) < 0.04 &&
    stem.role !== 'lead_vocal' &&
    stem.role !== 'bass' &&
    stem.role !== 'drums'
  ) {
    const spread = total <= 1 ? 0 : (index / Math.max(1, total - 1)) * 0.36 - 0.18;
    pan = spread * style.spread;
  }
  const volume = Math.min(
    0.78,
    Math.max(0.18, base.volume * roleGain(stem.role, style) * style.headroom)
  );
  // Transient protect (Limbus): kick/drums keep a higher floor — peak ≠ loudness
  const floored =
    stem.role === 'drums' ? Math.max(volume, 0.5 * style.headroom + 0.12) : volume;
  return {
    volume: Math.min(0.78, floored),
    pan: Math.max(-0.42, Math.min(0.42, pan)),
    note: base.note,
    channelProcess: processForRole(stem.role, style)
  };
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
Si piden borrar un track, NO lo borres tú: el DAW pide confirmación con el nombre.
Mezclas inteligentes: niveles, paneo, EQ de 5 bandas, compresión y envíos REV/DLY en vivo.
MASTER PRO es para la entrega offline final.
Si pide cambiar una frase, necesita una región seleccionada en la pista.`;
}

/**
 * Start mix flow with tempo confirmation (Limbus Assistant pattern).
 * Returns a confirm payload when waiting; otherwise runs the mix.
 */
export function requestMixSession(options?: {
  headroom?: number;
  prompt?: string;
  openMixer?: boolean;
  skipConfirm?: boolean;
}): MixReport | { confirm: MixConfirmState } {
  const prompt = options?.prompt ?? '';
  const tracksWithAudio = projectStore.project.tracks.filter(
    (track) => track.clips.length > 0 || track.type === 'instrument' || track.type === 'audio'
  );
  const hasSignal = tracksWithAudio.some(
    (t) => t.clips.length > 0 || t.type === 'instrument'
  );

  if (!options?.skipConfirm) {
    pendingMixConfirm = {
      prompt,
      bpm: transport.bpm,
      message: `El proyecto está a ${transport.bpm} BPM. Puedes detectar el tempo antes de mezclar, mezclar con ${transport.bpm} BPM o cancelar.`
    };
    return { confirm: pendingMixConfirm };
  }

  if (!hasSignal) {
    return {
      moves: [],
      summary:
        'No encuentro pistas de audio para hacer una mezcla con criterio. Importa stems o genera material y vuelve a pedirlo.',
      styleLabel: '—'
    };
  }

  return mixSession({ ...options, skipConfirm: true });
}

export function confirmMixSession(choice: MixConfirmChoice): MixReport | { status: string } {
  const pending = pendingMixConfirm;
  clearPendingMixConfirm();
  if (!pending || choice === 'cancel') {
    return { status: 'cancelado' };
  }
  if (choice === 'detect_tempo') {
    // Detection runs async from UI; after BPM update they call mix_current.
    return {
      status: `Detectar tempo solo analiza BPM y luego pedirá confirmación aparte. Tempo actual: ${transport.bpm}.`
    };
  }
  return mixSession({ prompt: pending.prompt, openMixer: true, skipConfirm: true });
}

export function mixSession(options?: {
  headroom?: number;
  prompt?: string;
  openMixer?: boolean;
  skipConfirm?: boolean;
}): MixReport {
  if (!options?.skipConfirm) {
    const gate = requestMixSession(options);
    if ('confirm' in gate) {
      return {
        moves: [],
        summary: gate.confirm.message,
        styleLabel: 'pendiente'
      };
    }
    return gate;
  }

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
      note: recipe.note,
      channelProcess: recipe.channelProcess
    };
  });

  moves.forEach((move) => {
    move.channelProcess?.inserts.forEach((ins) => {
      if (ins.params?.eqamuzState) {
        ins.params.eqamuzState.trackId = move.trackId;
        ins.params.eqamuzState.insertId = ins.id;
      }
    });
  });

  projectStore.applyMixMoves(
    moves.map((move) => ({
      id: move.trackId,
      volume: move.volume,
      pan: move.pan,
      channelProcess: move.channelProcess
    }))
  );
  if (options?.openMixer) {
    workspace.open('mixer');
    projectStore.bottomPanel = 'mixer';
  }

  const names = moves.map((move) => move.name);
  const fxNote = style.process ? ' con EQ, compresión y envíos' : '';
  const drumProtect = moves.some((m) => m.role === 'drums')
    ? ' Protegí kicks/drums de bajadas globales (criterio transitorios).'
    : '';
  const summary = moves.length
    ? `Listo. Mezcla inteligente${fxNote} en “${currentStudioSession.record?.name || projectStore.project.name}” (${style.label}): ${names.join(', ')}.${drumProtect} No la puse a sonar sola — dale play cuando quieras.`
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
    .map(
      (track) =>
        `${track.name} · ${track.layout} · ${track.clips} clip${track.clips === 1 ? '' : 's'}`
    )
    .join('\n');
}
