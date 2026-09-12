/**
 * Session-aware Maestro: knows the selected track, answers questions, and
 * asks before destructive edits. GenAudius is not required for this.
 */

import { inferInstrument } from '$lib/audio/stems';
import { currentStudioSession } from '$lib/persistence/sessions.svelte';
import { projectStore, transport } from '$lib/stores';
import type { Track } from '$lib/core/track';
import type { ChatMessage } from './types';
import { describeInventory, sessionInventory } from './session-inventory';
import {
  applySketchDefaults,
  arrangeClarify,
  draftLyrics,
  getWorkMode,
  isPartRequest,
  mergeIntent,
  missingArrangeFields,
  modeSwitchActions,
  parseArrangeIntent,
  parseArrangeReply,
  rememberIntent,
  rememberLyrics,
  roleLabel,
  setWorkMode,
  type ArrangeIntent,
  voiceFollowUpActions,
  wantsContinueEditing,
  wantsForm,
  wantsGenAudiusCompose,
  wantsGrooveChange,
  wantsLyrics,
  wantsMidiArrange,
  workModeLabel
} from './song-sketch';
import {
  describeStyleCard,
  findStyleCard,
  styleCardActions,
  wantsStyleCard
} from './style-cards';
import { helpReply, wantsHelp } from './studio-help';

export type PendingConfirm =
  | { kind: 'delete_track'; trackId: string; trackName: string }
  | { kind: 'arrange'; intent: ArrangeIntent }
  | { kind: 'lyrics'; idea: string; lyrics: string }
  | { kind: 'mix_confirm'; prompt: string; bpm: number };

export type MaestroTurn =
  | {
      kind: 'command';
      name: string;
      args: Record<string, unknown>;
      actions?: NonNullable<ChatMessage['actions']>;
      chips?: string[];
    }
  | {
      kind: 'confirm';
      pending: PendingConfirm;
      message: string;
      actions: NonNullable<ChatMessage['actions']>;
      chips?: string[];
    }
  | { kind: 'answer'; message: string; chips?: string[]; actions?: NonNullable<ChatMessage['actions']> };

const STOP = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'al', 'este', 'esta', 'esto', 'ese', 'esa']);

export function isAffirmative(text: string): boolean {
  const t = fold(text);
  return /^(si|yes|ok|okay|dale|hazlo|confirmo|confirma(r)?|seguro|borral[oa]|elimina(lo|la)?|adelante)(\b|[!,.]|$)/.test(
    t
  );
}

export function isNegative(text: string): boolean {
  const t = fold(text);
  return /^(no|nop|cancel|cancela(r)?|dejalo|mejor no|espera|nah)(\b|[!,.]|$)/.test(t);
}

export function wantsDeleteTrack(text: string): boolean {
  const t = fold(text);
  if (/\b(volumen|volume|sube|baja el volumen|mute|unmute)\b/.test(t)) return false;
  if (/\b(borral[oa]|elimin[ae]l[oa]|quital[oa]|borrame|elimina esto|quita esto)\b/.test(t)) return true;
  return (
    /\b(borra(r|me|lo)?|borrame|elimina(r)?|quita(r)?|delete|remove)\b/.test(t) &&
    /\b(track|pista|canal|este|esta|esto|ese|esa|bajo|bass|voz|piano|bateria|drums|guitarra|requinto|coro)\b/.test(t)
  );
}

export function namedTrackHint(text: string): string {
  const t = fold(text);
  const match = t.match(
    /\b(?:track|pista|canal)?\s*(?:del?|de la|de)?\s*(bajo|bass|voz|vocal|piano|bateria|batería|drums|guitarra|requinto|coro|pad|pluck|metales|cuerdas)\b/
  );
  if (match?.[1]) return match[1];
  const leftover = t
    .replace(
      /\b(borra(r|me|lo)?|borrame|elimina(r)?|quita(r)?|delete|remove|track|pista|canal|este|esta|esto|seleccionad[oa]|por favor|me|el|la)\b/g,
      ' '
    )
    .trim();
  return leftover.split(/\s+/).filter((word) => word && !STOP.has(word)).join(' ');
}

export function resolveFocusedTrack(hint = ''): Track | null {
  const needle = fold(hint);
  if (needle) {
    const named =
      projectStore.project.tracks.find((track) => fold(track.name) === needle) ??
      projectStore.project.tracks.find((track) => fold(track.name).includes(needle)) ??
      projectStore.project.tracks.find((track) => inferInstrument(track.name).role.includes(needle));
    if (named) return named;
  }
  return projectStore.selectedTrack;
}

export function trackLabel(track: Track | null | undefined): string {
  if (!track) return 'ninguna pista';
  const role = inferInstrument(track.name).name;
  return role && fold(role) !== fold(track.name) ? `${track.name} (${role})` : track.name;
}

const FEMININE = /\b(voz|vocal|guitarra|bateria|pista|tambora|guira|caja|cuerdas)\b/;

export function deleteWarning(track: Track): string {
  const spoken = (inferInstrument(track.name).name || track.name).toLowerCase();
  const article = FEMININE.test(fold(spoken)) || /a$/.test(fold(spoken).replace(/s$/, '')) ? 'de la' : 'del';
  return `Tengo seleccionado el track “${track.name}”. ¿Estás seguro de que quieres borrar el track ${article} ${spoken}? Se van sus clips de esta sesión. Puedes deshacer después si te arrepientes.`;
}

export function continueEditingTurn(): MaestroTurn {
  const inventory = sessionInventory();
  const selected = projectStore.selectedTrack;
  const mode = getWorkMode();
  const modeLine =
    mode === 'midi'
      ? 'Estamos en arreglo MIDI: escribo notas en el DAW, el synth interno las toca. GenAudius no entra.'
      : mode === 'genaudius'
        ? 'Estamos en GenAudius: la canción la pide Crear. El MIDI de práctica no se escribe hasta que pases a arreglo MIDI.'
        : 'Dime si vamos a hacer un arreglo en MIDI o si la canción la compone GenAudius.';
  if (inventory.allEmpty) {
    return {
      kind: 'answer',
      message: `${describeInventory(inventory)} ${modeLine} Si ya tienes los stems originales, pulsa Importar stems arriba del arrange o arrástralos aquí. Si no, ¿qué instrumento creamos? Por ejemplo: “quiero un bajo de 3 minutos en bachata, do mayor”.`,
      actions: [
        ...modeSwitchActions(),
        { id: 'start_bass', label: 'Crear bajo', prompt: 'Quiero un bajo en todo el track con ritmo de bachata' },
        { id: 'start_form', label: 'Marcar Intro', prompt: 'Creamos intro, canto, coros y mambo' }
      ],
      chips: ['Vacío', workModeLabel()]
    };
  }
  const focus = selected
    ? inventory.selected?.empty
      ? `“${selected.name}” está seleccionada y vacía.`
      : `“${selected.name}” está seleccionada y ya tiene material.`
    : 'No hay pista seleccionada.';
  return {
    kind: 'answer',
    message: `Seguimos en el arrange. ${modeLine} ${describeInventory(inventory)} ${focus} Dime el instrumento, la sección o el cambio.`,
    actions: modeSwitchActions(),
    chips: [workModeLabel(), ...inventory.filled.map((track) => track.name).slice(0, 3)]
  };
}

export function advanceArrangePending(pending: Extract<PendingConfirm, { kind: 'arrange' }>, text: string): MaestroTurn {
  const extra = parseArrangeReply(text);
  const parsed = parseArrangeIntent(text);
  const merged = applySketchDefaults(mergeIntent(pending.intent, mergeIntent(parsed, extra as ArrangeIntent)));
  const missing = missingArrangeFields(merged);
  if (missing.length) {
    const ask = arrangeClarify(merged, missing);
    return { kind: 'confirm', pending: { kind: 'arrange', intent: merged }, ...ask };
  }
  return arrangeCommand(merged);
}

function grooveChangeTurn(text: string): MaestroTurn {
  const extra = parseArrangeReply(text);
  const parsed = parseArrangeIntent(text);
  let intent = applySketchDefaults(mergeIntent(parsed, extra as ArrangeIntent));
  if (!intent.role) {
    const selected = projectStore.selectedTrack;
    const hint = selected ? fold(selected.name) : '';
    if (hint.includes('bajo') || hint.includes('bass')) intent = { ...intent, role: 'bass', trackName: 'Bajo' };
    else if (hint.includes('bongo')) intent = { ...intent, role: 'bongo', trackName: 'Bongó' };
    else if (hint.includes('requinto')) intent = { ...intent, role: 'requinto', trackName: 'Requinto' };
    else if (hint.includes('segunda')) intent = { ...intent, role: 'segunda', trackName: 'Segunda' };
    else if (hint.includes('guira') || hint.includes('guiro')) intent = { ...intent, role: 'guiro', trackName: 'Güira' };
  }
  if (!intent.role) {
    return {
      kind: 'answer',
      message:
        'Dime qué instrumento reescribo: bajo, bongó, segunda o requinto. Ejemplo: “haz el bajo bailable” o selecciona la pista y di “hazlo bolero”.',
      chips: ['Estilo']
    };
  }
  setWorkMode('midi');
  rememberIntent(intent);
  const missing = missingArrangeFields(intent).filter((item) => item !== 'duration');
  if (missing.length) {
    const ask = arrangeClarify(intent, missing);
    return { kind: 'confirm', pending: { kind: 'arrange', intent }, ...ask };
  }
  return arrangeCommand(intent);
}

function midiArrangeTurn(text: string): MaestroTurn {
  setWorkMode('midi');
  const intent = applySketchDefaults(parseArrangeIntent(text));
  rememberIntent(intent);
  if (intent.role && intent.role !== 'voice') {
    const missing = missingArrangeFields(intent);
    if (missing.length) {
      const ask = arrangeClarify(intent, missing);
      return { kind: 'confirm', pending: { kind: 'arrange', intent }, ...ask, chips: ['Arreglo MIDI', ...(ask.chips || [])] };
    }
    return arrangeCommand(intent);
  }
  return {
    kind: 'answer',
    message:
      'Arreglo MIDI: escribo las notas en el DAW y las toca el synth interno (bajo, bongó, requinto…). GenAudius no entra en este modo. Dime el instrumento. Si quieres adoctrinarlo, “ficha del bajo”.',
    actions: [
      { id: 'start_bass', label: 'Bajo', prompt: 'Quiero un bajo en todo el track con ritmo de bachata' },
      { id: 'start_bongo', label: 'Bongó', prompt: 'Agrega los bongos a ese ritmo' },
      { id: 'start_requinto', label: 'Requinto', prompt: 'Agrega el requinto en bachata' },
      { id: 'card_bass', label: 'Ficha Bajo', prompt: 'adoctrina el bajo a bachata' }
    ],
    chips: ['Arreglo MIDI']
  };
}

function genaudiusComposeTurn(): MaestroTurn {
  setWorkMode('genaudius');
  return {
    kind: 'answer',
    message:
      'Modo GenAudius: la canción la pide Crear (el modelo que estás entrenando). No escribo MIDI de práctica hasta que digas “vamos a hacer un arreglo en MIDI”. Dime la idea, o pulsa Crear.',
    actions: [
      { id: 'mode_midi', label: 'Mejor arreglo MIDI', prompt: 'vamos a hacer un arreglo en midi' },
      { id: 'sing_song', label: 'Cantar / Crear', prompt: '__lyrics_sing' }
    ],
    chips: ['GenAudius']
  };
}

function styleCardTurn(text: string): MaestroTurn {
  const intent = applySketchDefaults(parseArrangeIntent(text));
  rememberIntent(intent);
  let role = intent.role;
  if (!role) {
    const selected = projectStore.selectedTrack;
    const hint = selected ? fold(selected.name) : '';
    if (hint.includes('bajo') || hint.includes('bass')) role = 'bass';
    else if (hint.includes('bongo')) role = 'bongo';
    else if (hint.includes('requinto')) role = 'requinto';
  }
  const card = findStyleCard(role, intent.genre || 'bachata');
  if (!card) {
    return {
      kind: 'answer',
      message:
        'Las primeras fichas son Bajo, Bongó y Requinto en bachata. Selecciona una de esas pistas o dime “adoctrina el bajo a bachata bailable”.',
      actions: [
        { id: 'card_bass', label: 'Ficha Bajo', prompt: 'adoctrina el bajo a bachata' },
        { id: 'card_bongo', label: 'Ficha Bongó', prompt: 'adoctrina el bongó a bachata' },
        { id: 'card_requinto', label: 'Ficha Requinto', prompt: 'adoctrina el requinto a bachata' }
      ],
      chips: ['Ficha']
    };
  }
  if (intent.style) rememberIntent({ ...intent, style: intent.style });
  return {
    kind: 'answer',
    message: describeStyleCard(card, intent.style),
    actions: styleCardActions(card),
    chips: [card.label, intent.style || card.style]
  };
}

function lyricsVoiceCommand(idea: string, intent: ArrangeIntent): MaestroTurn {
  const lyrics = draftLyrics(idea, intent);
  rememberLyrics(lyrics);
  rememberIntent(intent);
  return {
    kind: 'command',
    name: 'mount_voice',
    args: { ...intent, lyrics, idea },
    actions: voiceFollowUpActions(),
    chips: ['Letra', 'Voz', intent.style || intent.genre || 'bachata']
  };
}

function arrangeCommand(intent: ArrangeIntent): MaestroTurn {
  if (intent.form && !intent.role) {
    return { kind: 'command', name: 'lay_form', args: { ...intent } };
  }
  if (intent.role === 'voice') {
    return lyricsVoiceCommand(intent.trackName || 'voz', intent);
  }
  if (!getWorkMode()) setWorkMode('midi');
  return {
    kind: 'command',
    name: 'write_part',
    args: { ...intent }
  };
}

export function commitArrangeIntent(intent: ArrangeIntent): MaestroTurn {
  setWorkMode('midi');
  const merged = applySketchDefaults(intent);
  rememberIntent(merged);
  const missing = missingArrangeFields(merged);
  if (missing.length) {
    const ask = arrangeClarify(merged, missing);
    return { kind: 'confirm', pending: { kind: 'arrange', intent: merged }, ...ask };
  }
  return arrangeCommand(merged);
}

export function interpretMaestroTurn(text: string): MaestroTurn | null {
  const t = fold(text);

  if (wantsContinueEditing(text)) {
    return continueEditingTurn();
  }

  if (wantsHelp(text)) {
    const help = helpReply(text);
    return { kind: 'answer', message: help.message, chips: help.chips, actions: help.actions };
  }

  if (wantsMidiArrange(text)) {
    return midiArrangeTurn(text);
  }

  if (wantsGenAudiusCompose(text)) {
    return genaudiusComposeTurn();
  }

  if (wantsStyleCard(text)) {
    return styleCardTurn(text);
  }

  if (wantsGrooveChange(text)) {
    return grooveChangeTurn(text);
  }

  if (wantsLyrics(text)) {
    const intent = applySketchDefaults(parseArrangeIntent(text));
    return lyricsVoiceCommand(text, intent);
  }

  if (isPartRequest(text) || wantsForm(text)) {
    const intent = applySketchDefaults(parseArrangeIntent(text));
    if (intent.role || intent.form) {
      if (getWorkMode() === 'genaudius' && intent.role && intent.role !== 'voice' && !intent.form) {
        const part = roleLabel(intent.role);
        return {
          kind: 'confirm',
          pending: { kind: 'arrange', intent },
          message: `Estamos en modo GenAudius: la canción la pide Crear. Escribir “${part}” nota a nota es arreglo MIDI. ¿Cambiamos a MIDI para escribirlo, o lo deja el modelo?`,
          actions: [
            { id: 'mode_midi_write', label: `Escribir ${part} en MIDI`, prompt: '__midi_then_write' },
            { id: 'mode_genaudius', label: 'Crear con GenAudius', prompt: 'esto lo compone GenAudius' }
          ],
          chips: ['GenAudius', part]
        };
      }
      const missing = missingArrangeFields(intent);
      if (missing.length) {
        const ask = arrangeClarify(intent, missing);
        return { kind: 'confirm', pending: { kind: 'arrange', intent }, ...ask };
      }
      if (!getWorkMode() && intent.role && intent.role !== 'voice') setWorkMode('midi');
      return arrangeCommand(intent);
    }
  }

  if (wantsDeleteTrack(text)) {
    const track = resolveFocusedTrack(namedTrackHint(text));
    if (!track) {
      return {
        kind: 'answer',
        message:
          'No sé cuál pista borrar. Selecciónala en el arrange (un clic en el lane o en su clip) o nómbrala, por ejemplo: “borra el bajo”.'
      };
    }
    return {
      kind: 'confirm',
      pending: { kind: 'delete_track', trackId: track.id, trackName: track.name },
      message: deleteWarning(track),
      actions: [
        { id: 'confirm_delete', label: `Sí, borrar ${track.name}`, prompt: '__confirm_delete' },
        { id: 'cancel_delete', label: 'No, déjalo', prompt: '__cancel' }
      ],
      chips: [track.name]
    };
  }

  if (/\b(duplica(r)?|copia(r)?) (este |esta |el |la )?(track|pista)\b/.test(t) || /\bduplicate track\b/.test(t)) {
    const track = resolveFocusedTrack(namedTrackHint(text));
    if (!track) {
      return { kind: 'answer', message: 'Selecciona la pista que quieres duplicar y dímelo otra vez.' };
    }
    return { kind: 'command', name: 'duplicate_track', args: { track_name: track.name } };
  }

  if (/\b(mutea|silencia|unmute|quita el mute)\b/.test(t) || /\b(mute|unmute) (este|esta|el|la)? ?(track|pista)?\b/.test(t)) {
    const track = resolveFocusedTrack(namedTrackHint(text));
    if (!track) return { kind: 'answer', message: 'Selecciona la pista que quieres mutear.' };
    return { kind: 'command', name: 'mute_track', args: { track_name: track.name } };
  }

  if (/\b(solear|solo(ea)? esta|solo este|solo la pista|solo el track)\b/.test(t)) {
    const track = resolveFocusedTrack(namedTrackHint(text));
    if (!track) return { kind: 'answer', message: 'Selecciona la pista que quieres dejar en solo.' };
    return { kind: 'command', name: 'solo_track', args: { track_name: track.name } };
  }

  if (/\b(deshaz|deshacer|undo|atras|atrás)\b/.test(t) && t.length < 28) {
    return { kind: 'command', name: 'undo', args: {} };
  }

  if (/\b(haz(me)? la mezcla|mezcla(r)?( la sesion| las pistas| la cancion| el proyecto)?|automix|auto mix)\b/.test(t) || t === 'mezclar' || t === 'mezcla') {
    return { kind: 'command', name: 'mix_session', args: { prompt: text, skip_confirm: true } };
  }

  if (/\b(agrega|pon(le)?|inserta(r)?|aplica(r)?)\b/.test(t) && /\b(eq|ecualizador|compresor|comp|saturador|reverb|delay|limiter|limitador)\b/.test(t)) {
    const track = resolveFocusedTrack(namedTrackHint(text));
    if (!track) {
      return { kind: 'answer', message: 'Selecciona la pista a la que quieres agregar el plugin o nómbrala (por ejemplo: “ponle un ecualizador a la voz”).' };
    }
    let pluginKind = 'eqamuz-pro-eq';
    let presetName: string | undefined;
    const isVocal = track.name.toLowerCase().includes('voz') || inferInstrument(track.name).role.includes('vocal');
    if (/\b(compresor|comp|dynamics)\b/.test(t)) {
      pluginKind = 'eqamuz-comp';
      presetName = isVocal ? 'OPTO_VOCAL_LEVELER' : 'SAFE_TRANSPARENT_GLUE';
    } else if (/\b(saturador|drive|tape|saturacion|saturación)\b/.test(t)) {
      pluginKind = 'eqamuz-saturator';
      presetName = 'SUBTLE_TAPE_WARMTH';
    } else if (/\b(reverb|espacio|sala)\b/.test(t)) {
      pluginKind = 'eqamuz-reverb';
      presetName = 'NATURAL_ROOM_AMBIENCE';
    } else if (/\b(delay|eco)\b/.test(t)) {
      pluginKind = 'eqamuz-delay';
      presetName = 'STEREO_DOTTED_8TH';
    } else if (/\b(limiter|limitador)\b/.test(t)) {
      pluginKind = 'eqamuz-limiter';
      presetName = 'SAFE_TRANSPARENT_CEILING';
    } else {
      pluginKind = 'eqamuz-pro-eq';
      presetName = isVocal ? 'VOCAL_AIR_&_WARMTH' : 'SAFE_FLAT_RESET';
    }
    return {
      kind: 'command',
      name: 'add_insert',
      args: { track_name: track.name, plugin_kind: pluginKind, preset_name: presetName }
    };
  }

  const question = answerSessionQuestion(text);
  if (question) return question;

  return null;
}

function answerSessionQuestion(text: string): MaestroTurn | null {
  const t = fold(text);
  const asking =
    /^(que|qué|cual|cuál|cuant|cuánt|como|cómo|donde|dónde|quien|quién)\b/.test(t) ||
    /\?$/.test(text.trim()) ||
    /\b(dime|explícame|explicame|sabes)\b/.test(t);

  if (!asking && !/\b(seleccionad|esta pista|este track|tempo|bpm|pistas|sesion|sesión)\b/.test(t)) {
    return null;
  }

  const selected = projectStore.selectedTrack;
  const session = currentStudioSession.record;
  const tracks = projectStore.project.tracks;

  if (
    /\b(que|qué) (pista|track) (esta|está|tengo)? ?seleccion/.test(t) ||
    /\b(esta pista|este track|cual es esta|cuál es esta|que es esto|qué es esto|que tengo seleccionado|qué tengo seleccionado)\b/.test(t)
  ) {
    if (!selected) {
      return { kind: 'answer', message: 'No hay pista seleccionada. Haz clic en el lane o en un clip y te digo cuál es.' };
    }
    return {
      kind: 'answer',
      message: `La pista seleccionada es “${trackLabel(selected)}”: ${selected.type}, ${selected.clips.length} clip${selected.clips.length === 1 ? '' : 's'}, volumen ${selected.volume.toFixed(2)}${selected.isMuted ? ', en mute' : ''}. Si me dices “bórrala”, te pediré confirmación antes.`,
      chips: [selected.name]
    };
  }

  if (/\b(cuant|cuánt).*(pista|track)|que pistas|qué pistas|que hay|qué hay|describe|sesion|sesión|vacío|vacio\b/.test(t)) {
    const inventory = sessionInventory();
    const names = tracks.map((track) => track.name).join(', ') || 'ninguna';
    return {
      kind: 'answer',
      message: `Estamos en “${session?.name || projectStore.project.name}” a ${transport.bpm.toFixed(0)} BPM. Hay ${tracks.length} pista${tracks.length === 1 ? '' : 's'}: ${names}. ${describeInventory(inventory)} Seleccionada: ${selected ? trackLabel(selected) : 'ninguna'}.`
    };
  }

  if (/\b(tempo|bpm|compas|compás)\b/.test(t)) {
    const sig = transport.timeSignature;
    return {
      kind: 'answer',
      message: `El tempo es ${transport.bpm.toFixed(1)} BPM en ${sig.numerator}/${sig.denominator}. Dime otro BPM si lo quieres cambiar.`
    };
  }

  if (/\b(que puedes|qué puedes|ayuda|help|que haces|qué haces)\b/.test(t)) {
    const help = helpReply(text);
    return { kind: 'answer', message: help.message, chips: help.chips, actions: help.actions };
  }

  if (asking) {
    return {
      kind: 'answer',
      message: selected
        ? `Tengo “${trackLabel(selected)}” seleccionada, tempo ${transport.bpm.toFixed(0)} BPM. ¿Quieres que la edite, la mutee, le baje el volumen o la borre? Si es borrar, te confirmo antes.`
        : 'No hay pista seleccionada. Elige una en el arrange y dime qué hacer con ella: mezclar, agregar un bajo, mutear o borrar.'
    };
  }

  return null;
}

function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
