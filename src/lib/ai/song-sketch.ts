/**
 * Conversational song building: parse a part request, remember key/tempo/form,
 * and ask before writing when BPM or bachata style is missing.
 */

import type { ChatMessage } from './types';

export type PartRole = 'bass' | 'bongo' | 'segunda' | 'requinto' | 'guiro' | 'piano' | 'voice';
export type BachataStyle = 'bolero' | 'romantico' | 'bailable';
export type TonalMode = 'major' | 'minor';

export type ArrangeIntent = {
  role: PartRole | null;
  durationMinutes: number | null;
  bpm: number | null;
  key: string | null;
  mode: TonalMode | null;
  relative: string | null;
  genre: string | null;
  style: BachataStyle | null;
  copyFrom: 'bass' | null;
  section: string | null;
  form: boolean;
  trackName: string | null;
};

export type WorkMode = 'midi' | 'genaudius' | null;

export type SongSketch = {
  genre: string;
  style: BachataStyle | null;
  bpm: number | null;
  key: string;
  mode: TonalMode;
  relative: string | null;
  durationMinutes: number | null;
  durationBeats: number | null;
};

const NOTE_PC: Record<string, number> = {
  do: 0,
  c: 0,
  re: 2,
  d: 2,
  mi: 4,
  e: 4,
  fa: 5,
  f: 5,
  sol: 7,
  g: 7,
  la: 9,
  a: 9,
  si: 11,
  ti: 11,
  b: 11
};

const PC_NAME = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const ROLE_LABEL: Record<PartRole, string> = {
  bass: 'Bajo',
  bongo: 'Bongó',
  segunda: 'Segunda',
  requinto: 'Requinto',
  guiro: 'Güira',
  piano: 'Piano',
  voice: 'Voz'
};

const emptyIntent = (): ArrangeIntent => ({
  role: null,
  durationMinutes: null,
  bpm: null,
  key: null,
  mode: null,
  relative: null,
  genre: null,
  style: null,
  copyFrom: null,
  section: null,
  form: false,
  trackName: null
});

let sketch: SongSketch = {
  genre: '',
  style: null,
  bpm: null,
  key: 'C',
  mode: 'major',
  relative: 'A',
  durationMinutes: null,
  durationBeats: null
};

let lastLyrics = '';
let workMode: WorkMode = null;

export function getSketch(): SongSketch {
  return { ...sketch };
}

export function patchSketch(partial: Partial<SongSketch>): SongSketch {
  sketch = { ...sketch, ...partial };
  return getSketch();
}

export function resetSketch(): void {
  sketch = {
    genre: '',
    style: null,
    bpm: null,
    key: 'C',
    mode: 'major',
    relative: 'A',
    durationMinutes: null,
    durationBeats: null
  };
  lastLyrics = '';
  workMode = null;
}

export function rememberLyrics(text: string): void {
  lastLyrics = text.trim();
}

export function getLastLyrics(): string {
  return lastLyrics;
}

export function getWorkMode(): WorkMode {
  return workMode;
}

export function setWorkMode(mode: WorkMode): WorkMode {
  workMode = mode;
  return workMode;
}

export function workModeLabel(): string {
  if (workMode === 'midi') return 'Arreglo MIDI';
  if (workMode === 'genaudius') return 'GenAudius';
  return 'Sin modo';
}

export function wantsMidiArrange(text: string): boolean {
  const t = foldText(text);
  if (t.includes('__midi_then_write') || t.includes('__mode_midi')) return true;
  return (
    /\bmodo midi\b/.test(t) ||
    /\b(arreglo|arrreglo) en midi\b/.test(t) ||
    /\b(vamos a |quiero )?(hacer |armar )?(un )?arreglo en midi\b/.test(t) ||
    /\btrabaja(r)? en midi\b/.test(t) ||
    /\bescribe(r)? en midi\b/.test(t)
  );
}

export function wantsGenAudiusCompose(text: string): boolean {
  const t = foldText(text);
  if (t.includes('__mode_genaudius')) return true;
  return (
    /\bmodo genaudius\b/.test(t) ||
    /\b(esto )?lo compone genaudius\b/.test(t) ||
    /\b(que )?lo haga (el )?modelo\b/.test(t) ||
    /\bcrear? con genaudius\b/.test(t) ||
    /\bla cancion la (hace|compone) genaudius\b/.test(t) ||
    /\bcompone genaudius\b/.test(t)
  );
}

export function modeSwitchActions(): NonNullable<ChatMessage['actions']> {
  return [
    { id: 'mode_midi', label: 'Arreglo MIDI', prompt: 'vamos a hacer un arreglo en midi' },
    { id: 'mode_genaudius', label: 'Lo compone GenAudius', prompt: 'esto lo compone GenAudius' }
  ];
}

export function voiceFollowUpActions(): NonNullable<ChatMessage['actions']> {
  return [
    { id: 'compose_chat', label: 'Pulir en composición', prompt: '__lyrics_compose' },
    { id: 'sing_song', label: 'Cantar con GenAudius', prompt: '__lyrics_sing' },
    { id: 'record_voice', label: 'Grabar encima', prompt: '__lyrics_record' }
  ];
}

export function voiceMountedMessage(lyrics: string): string {
  return `${lyrics.trim()}

Dejé la pista “Voz” y la región del mismo largo que el arrange. La letra está en este mensaje.

Siguiente paso: pulirla en el chat de composición de QAMUZ AI, cantarla con GenAudius (Crear), o grabar encima de la pista.`;
}

export function foldText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function roleLabel(role: PartRole): string {
  return ROLE_LABEL[role];
}

export function pitchClassOf(name: string): number {
  return NOTE_PC[foldText(name)] ?? 0;
}

export function noteNameOfPc(pc: number): string {
  return PC_NAME[((pc % 12) + 12) % 12];
}

export function wantsContinueEditing(text: string): boolean {
  const t = foldText(text);
  return (
    /\b(seguir|seguimos|continuemos|vamos a seguir) (editando|con la edicion|con el arrange)\b/.test(t) ||
    /\b(vamos a editar|seguir editando|continuemos editando)\b/.test(t)
  );
}

export function wantsForm(text: string): boolean {
  const t = foldText(text);
  return (
    /\b(intro|canto|verso|coro|mambo|puente|outro)\b/.test(t) &&
    /\b(crea(mos)?|arma(mos)?|pon(le|gamos)?|seccion|sección|forma)\b/.test(t)
  );
}

export function wantsLyrics(text: string): boolean {
  const t = foldText(text);
  if (/\b(volumen|sube la voz|baja la voz|mute)\b/.test(t)) return false;
  if (/\b(borra|elimina|quita|delete)\b/.test(t)) return false;
  return (
    /\b(letra|lirica|lyrics|estrofa)\b/.test(t) ||
    /\b(vamos a (hacer|crear|grabar) (una )?voz|monta(r)? la voz|canta(r)? (esto|la letra|esta letra))\b/.test(t) ||
    /\b(quiero|agrega|anade|añade|pon|ponle|ponga|crea|genera|arma|escribe|hazme|dame|necesito) (una |la )?(pista (de )?)?voz\b/.test(t) ||
    /\bvoz cantad|\bcantar (la cancion|la letra|encima)\b/.test(t)
  );
}

export function parseArrangeIntent(text: string): ArrangeIntent {
  const t = foldText(text);
  const intent = emptyIntent();

  if (/\b(segunda|guitarra ritm|rhythm guitar)\b/.test(t)) intent.role = 'segunda';
  else if (/\b(requinto|guitarra lead|lead guitar)\b/.test(t)) intent.role = 'requinto';
  else if (/\b(bongo|bongos|bongoes)\b/.test(t)) intent.role = 'bongo';
  else if (/\b(guira|guiro)\b/.test(t)) intent.role = 'guiro';
  else if (/\b(bajo|bass)\b/.test(t)) intent.role = 'bass';
  else if (/\bpiano\b/.test(t)) intent.role = 'piano';
  else if (/\b(voz|vocal)\b/.test(t) && !/\bvolumen\b/.test(t)) intent.role = 'voice';

  if (intent.role) intent.trackName = ROLE_LABEL[intent.role];

  const minutes = t.match(/\b(\d+(?:[.,]\d+)?)\s*(minutos|minuto|min)\b/);
  if (minutes) intent.durationMinutes = Number(minutes[1].replace(',', '.'));

  const bpm = t.match(/\b(\d{2,3})\s*bpm\b/) || t.match(/\b__arrange bpm:(\d{2,3})\b/);
  if (bpm) intent.bpm = Number(bpm[1]);
  else {
    const bare = t.match(/^(?:a |en )?(\d{2,3})$/);
    if (bare) intent.bpm = Number(bare[1]);
  }

  const key = t.match(/\ben (do|re|mi|fa|sol|la|si|c|d|e|f|g|a|b)\s*(mayor|menor|major|minor)?\b/);
  if (key) {
    intent.key = noteNameOfPc(pitchClassOf(key[1]));
    if (key[2] && /menor|minor/.test(key[2])) intent.mode = 'minor';
    else if (key[2]) intent.mode = 'major';
  }

  const relative = t.match(/\b(escala|modo) de (do|re|mi|fa|sol|la|si|c|d|e|f|g|a|b)\s*(menor|mayor)?\b/);
  if (relative) {
    intent.relative = noteNameOfPc(pitchClassOf(relative[2]));
    if (!intent.mode && relative[3] && /menor/.test(relative[3])) {
      // "do mayor con escala de la menor" keeps major tonic, stores relative.
    }
  }

  if (/\bbachata\b/.test(t)) intent.genre = 'bachata';
  else if (/\bmerengue\b/.test(t)) intent.genre = 'merengue';
  else if (/\bsalsa\b/.test(t)) intent.genre = 'salsa';
  else if (/\bbaler|bolero\b/.test(t) && !intent.genre) intent.genre = 'bachata';

  if (/\bbolero\b/.test(t)) intent.style = 'bolero';
  else if (/\bbailable\b/.test(t)) intent.style = 'bailable';
  else if (/\bromantic/.test(t)) intent.style = 'romantico';
  const styleToken = t.match(/\b__arrange style:(bolero|romantico|bailable)\b/);
  if (styleToken) intent.style = styleToken[1] as BachataStyle;

  if (/\b(mismas? notas?|la misma nota|igual que el bajo|como el bajo)\b/.test(t)) {
    intent.copyFrom = 'bass';
  }

  const section = t.match(/\b(intro|canto|verso|coro|mambo|puente|outro)\b/);
  if (section) intent.section = section[1];
  intent.form = wantsForm(text);

  return intent;
}

export function mergeIntent(base: ArrangeIntent, extra: ArrangeIntent): ArrangeIntent {
  return {
    role: extra.role ?? base.role,
    durationMinutes: extra.durationMinutes ?? base.durationMinutes,
    bpm: extra.bpm ?? base.bpm,
    key: extra.key ?? base.key,
    mode: extra.mode ?? base.mode,
    relative: extra.relative ?? base.relative,
    genre: extra.genre ?? base.genre,
    style: extra.style ?? base.style,
    copyFrom: extra.copyFrom ?? base.copyFrom,
    section: extra.section ?? base.section,
    form: extra.form || base.form,
    trackName: extra.trackName ?? base.trackName
  };
}

export function applySketchDefaults(intent: ArrangeIntent): ArrangeIntent {
  return mergeIntent(
    {
      ...emptyIntent(),
      durationMinutes: sketch.durationMinutes,
      bpm: sketch.bpm,
      key: sketch.key,
      mode: sketch.mode,
      relative: sketch.relative,
      genre: sketch.genre || null,
      style: sketch.style
    },
    intent
  );
}

export function missingArrangeFields(intent: ArrangeIntent): Array<'bpm' | 'style' | 'duration'> {
  if (intent.form && !intent.role) return [];
  const missing: Array<'bpm' | 'style' | 'duration'> = [];
  if (!intent.bpm) missing.push('bpm');
  const genre = foldText(intent.genre || sketch.genre || '');
  if (genre === 'bachata' && !intent.style) missing.push('style');
  if (intent.role && !intent.durationMinutes && !sketch.durationMinutes && !intent.section) {
    missing.push('duration');
  }
  return missing;
}

export function isPartRequest(text: string): boolean {
  const t = foldText(text);
  if (/\b(borra|elimina|mute|volumen|mezcl)\b/.test(t)) return false;
  const intent = parseArrangeIntent(text);
  if (intent.form) return true;
  if (!intent.role) return false;
  return (
    /\b(quiero|agrega|anade|añade|pon|ponle|ponga|crea|genera|arma|escribe|hazme|dame)\b/.test(t) ||
    /\ben todo el track\b/.test(t) ||
    /\britmo de\b/.test(t)
  );
}

export function wantsGrooveChange(text: string): boolean {
  const t = foldText(text);
  if (/\b(borra|elimina|mute|volumen)\b/.test(t)) return false;
  const hasStyle =
    /\b(bolero|bailable|romantic|merengue|salsa|bachata)\b/.test(t) ||
    t.includes('style:bolero') ||
    t.includes('style:bailable') ||
    t.includes('style:romantico');
  if (!hasStyle) return false;
  return (
    /\b(hazlo|haz el|haz la|ponlo|ponle|cambialo|cambiala|cambia a|ahora (en|de|con)|estilo|que sea|reescribe|repite el groove)\b/.test(
      t
    ) || /\bmas (bailable|lento|romantico)\b/.test(t)
  );
}

export function rememberIntent(intent: ArrangeIntent): void {
  patchSketch({
    genre: intent.genre ?? sketch.genre,
    style: intent.style ?? sketch.style,
    bpm: intent.bpm ?? sketch.bpm,
    key: intent.key ?? sketch.key,
    mode: intent.mode ?? sketch.mode,
    relative: intent.relative ?? sketch.relative,
    durationMinutes: intent.durationMinutes ?? sketch.durationMinutes
  });
}

export function beatsForIntent(intent: ArrangeIntent, bpm: number, beatsPerBar = 4): number {
  const minutes = intent.durationMinutes ?? sketch.durationMinutes;
  if (minutes && minutes > 0) {
    return Math.max(beatsPerBar, Math.round(minutes * bpm));
  }
  if (sketch.durationBeats) return sketch.durationBeats;
  return 8 * beatsPerBar;
}

export function arrangeClarify(intent: ArrangeIntent, missing: Array<'bpm' | 'style' | 'duration'>): {
  message: string;
  actions: NonNullable<ChatMessage['actions']>;
  chips: string[];
} {
  const part = intent.role ? roleLabel(intent.role) : 'la canción';
  const key = intent.key || sketch.key;
  const mode = (intent.mode || sketch.mode) === 'minor' ? 'menor' : 'mayor';
  const minutes = intent.durationMinutes ?? sketch.durationMinutes;
  const genre = intent.genre || sketch.genre || 'bachata';
  const bits = [
    `Puedo escribir ${part}`,
    minutes ? `durante ${minutes} minuto${minutes === 1 ? '' : 's'}` : null,
    `en ${key} ${mode}`,
    intent.relative ? `con color de ${intent.relative} menor` : null,
    `al ritmo de ${genre}`
  ].filter(Boolean);

  const questions: string[] = [];
  const actions: NonNullable<ChatMessage['actions']> = [];
  if (missing.includes('duration')) {
    questions.push('¿De cuánto tiempo?');
    actions.push(
      { id: 'arr_dur_2', label: '2 minutos', prompt: '__arrange minutes:2' },
      { id: 'arr_dur_3', label: '3 minutos', prompt: '__arrange minutes:3' },
      { id: 'arr_dur_4', label: '4 minutos', prompt: '__arrange minutes:4' }
    );
  }
  if (missing.includes('bpm')) {
    questions.push('¿En qué tempo lo quieres?');
    actions.push(
      { id: 'arr_bpm_120', label: '120 BPM', prompt: '__arrange bpm:120' },
      { id: 'arr_bpm_128', label: '128 BPM', prompt: '__arrange bpm:128' },
      { id: 'arr_bpm_130', label: '130 BPM', prompt: '__arrange bpm:130' }
    );
  }
  if (missing.includes('style')) {
    questions.push('¿Qué estilo de bachata: bolero romántico, romántica o bailable?');
    actions.push(
      { id: 'arr_style_bolero', label: 'Bolero romántico', prompt: '__arrange style:bolero' },
      { id: 'arr_style_romantico', label: 'Romántica', prompt: '__arrange style:romantico' },
      { id: 'arr_style_bailable', label: 'Bailable', prompt: '__arrange style:bailable' }
    );
  }

  return {
    message: `${bits.join(', ')}. ${questions.join(' ')} Cuando me lo digas, lo escribo en el arrange.`,
    actions,
    chips: [part, genre]
  };
}

export function parseArrangeReply(text: string): Partial<ArrangeIntent> {
  const t = foldText(text);
  const extra = emptyIntent();
  const minutes = t.match(/\b(?:__arrange minutes:)?(\d+(?:[.,]\d+)?)(?:\s*(minutos|minuto|min))?\b/);
  if (t.includes('__arrange minutes:') && minutes) extra.durationMinutes = Number(minutes[1]);
  else if (/\b(2|3|4)\s*(minutos|minuto|min)\b/.test(t) && minutes) {
    extra.durationMinutes = Number(minutes[1]);
  }
  const bpm = t.match(/\b(?:__arrange bpm:)?(\d{2,3})(?:\s*bpm)?\b/);
  if (bpm && (t.includes('bpm') || t.includes('__arrange bpm:') || /^(?:a |en )?\d{2,3}$/.test(t))) {
    extra.bpm = Number(bpm[1]);
  }
  if (/\bbolero\b/.test(t) || t.includes('style:bolero')) extra.style = 'bolero';
  if (/\bbailable\b/.test(t) || t.includes('style:bailable')) extra.style = 'bailable';
  if (/\bromantic/.test(t) || t.includes('style:romantico')) extra.style = 'romantico';
  return extra;
}

export function bachataForm(totalBeats: number, beatsPerBar = 4): { name: string; startBeat: number; type: string }[] {
  const bars = Math.max(8, Math.round(totalBeats / beatsPerBar));
  const plan = [
    { name: 'Intro', bars: 8, type: 'intro' },
    { name: 'Canto', bars: 16, type: 'verse' },
    { name: 'Coro', bars: 8, type: 'chorus' },
    { name: 'Canto 2', bars: 16, type: 'verse' },
    { name: 'Coro', bars: 8, type: 'chorus' },
    { name: 'Mambo', bars: 16, type: 'drop' },
    { name: 'Coro final', bars: 8, type: 'chorus' },
    { name: 'Outro', bars: 8, type: 'outro' }
  ];
  const used = plan.reduce((sum, part) => sum + part.bars, 0);
  const scale = bars / used;
  let cursor = 0;
  return plan.map((part) => {
    const length = Math.max(beatsPerBar, Math.round(part.bars * scale) * beatsPerBar);
    const marker = { name: part.name, startBeat: cursor, type: part.type };
    cursor += length;
    return marker;
  });
}

export function draftLyrics(idea: string, intent: ArrangeIntent = emptyIntent()): string {
  const theme = idea.replace(/\b(vamos a (hacer|crear) (una )?voz|letra|lirica|escribe)\b/gi, '').trim() ||
    'una bachata de noche y de vuelta';
  const style = intent.style || sketch.style || 'romantico';
  const key = intent.key || sketch.key;
  const feel =
    style === 'bailable'
      ? 'para bailar pegados, con coro que se responde'
      : style === 'bolero'
        ? 'despacio, casi hablada, con mucho aire'
        : 'romántica, de pecho';
  return `Idea para la voz (${feel}, en ${key}):
${theme}

Intro (hablado / requinto)
— que entre el bajo y se quede el silencio un segundo.

Canto 1
En esta noche tu nombre me encuentra,
camino despacio y el barrio me nombra,
si el tiempo se enreda en tu voz,
yo vuelvo a tu puerta sin prisa.

Coro
Quédate un poco, que el ritmo no miente,
esta bachata te lleva y te siente,
Do mayor en el pecho, La menor en la pena,
y el corazón se queda donde tú suenas.

Canto 2
Si el mambo despierta las luces del patio,
yo marco tu paso con la misma nota,
la segunda me sigue, el requinto te nombra,
y el bajo te espera en cada paloma.

Mambo / coro
Repite el coro, deja que el bongó hable,
y cierra suave, como quien no se va.`;
}
