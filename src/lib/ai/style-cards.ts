/**
 * Instrument style cards: how each role should behave in a genre.
 * Captions feed GenAudius training; Maestro cites them when writing MIDI.
 */

import type { ChatMessage } from './types';
import type { BachataStyle, PartRole } from './song-sketch';
import { foldText, roleLabel } from './song-sketch';

export type StyleCard = {
  id: string;
  instrument: PartRole;
  genre: 'latin';
  style: 'bachata';
  label: string;
  dawSound: 'bass' | 'drums' | 'lead';
  bpmRange: [number, number];
  feels: BachataStyle[];
  groove: string;
  feelNotes: Record<BachataStyle, string>;
  tags: string[];
  caption: string;
  midiSource: 'local-pattern';
};

export const STYLE_CARDS: StyleCard[] = [
  {
    id: 'latin.bachata.bass',
    instrument: 'bass',
    genre: 'latin',
    style: 'bachata',
    label: 'Bajo · bachata',
    dawSound: 'bass',
    bpmRange: [118, 132],
    feels: ['bolero', 'romantico', 'bailable'],
    groove:
      'Raíz en el 1, quinta en el 3, anticipo al final del compás (paloma). Armonía I–V–vi–IV.',
    feelNotes: {
      bolero: 'Pocas notas, raíces largas, casi sin quinta.',
      romantico: 'Paloma clara: raíz, quinta, anticipo suave.',
      bailable: 'Más movimiento: offbeat ligero y anticipo más corto.'
    },
    tags: ['bachata', 'latin', 'dominican', 'bajo', 'paloma', 'bass'],
    caption: 'qamuz, latin, bachata, bajo, paloma',
    midiSource: 'local-pattern'
  },
  {
    id: 'latin.bachata.bongo',
    instrument: 'bongo',
    genre: 'latin',
    style: 'bachata',
    label: 'Bongó · bachata',
    dawSound: 'drums',
    bpmRange: [118, 132],
    feels: ['bolero', 'romantico', 'bailable'],
    groove: 'Martillo: grave en 1, agudo en 3, slap en el 4+. Deja aire al requinto.',
    feelNotes: {
      bolero: 'Solo 1 y 3, sin slap extra.',
      romantico: 'Martillo completo, un slap al final del compás.',
      bailable: 'Slap también en el 2+ y relleno en el 4e.'
    },
    tags: ['bachata', 'latin', 'dominican', 'bongo', 'martillo', 'percussion'],
    caption: 'qamuz, latin, bachata, bongo, martillo',
    midiSource: 'local-pattern'
  },
  {
    id: 'latin.bachata.requinto',
    instrument: 'requinto',
    genre: 'latin',
    style: 'bachata',
    label: 'Requinto · bachata',
    dawSound: 'lead',
    bpmRange: [118, 132],
    feels: ['bolero', 'romantico', 'bailable'],
    groove: 'Frases agudas que contestan a la voz. En mambo llena; en canto deja hueco.',
    feelNotes: {
      bolero: 'Cuatro notas por compás, mucho aire.',
      romantico: 'Motivo de corcheas que sube y vuelve a la tónica.',
      bailable: 'Más densas, octava de paso, para el mambo.'
    },
    tags: ['bachata', 'latin', 'dominican', 'requinto', 'lead guitar', 'fills'],
    caption: 'qamuz, latin, bachata, requinto, lead guitar',
    midiSource: 'local-pattern'
  }
];

export function findStyleCard(
  instrument: PartRole | null | undefined,
  style = 'bachata'
): StyleCard | null {
  if (!instrument) return null;
  const folded = foldText(style);
  return (
    STYLE_CARDS.find((card) => card.instrument === instrument && foldText(card.style) === folded) ??
    STYLE_CARDS.find((card) => card.instrument === instrument) ??
    null
  );
}

export function wantsStyleCard(text: string): boolean {
  const t = foldText(text);
  return (
    /\b(adoctrina|adoctrinar|ficha de (estilo|este)|ensena(r)? este|entrena(r)? (este|el|la))\b/.test(t) ||
    /\bficha (del |de (la |el ))?(bajo|bongo|requinto)\b/.test(t)
  );
}

export function styleCardCaption(card: StyleCard, feel?: BachataStyle | null, bpm?: number | null): string {
  const bits = [card.caption];
  if (feel) bits.push(feel === 'romantico' ? 'romantica' : feel);
  if (bpm) bits.push(`${Math.round(bpm)} BPM`);
  return bits.join(', ');
}

export function describeStyleCard(
  card: StyleCard,
  feel?: BachataStyle | null
): string {
  const feelLine = feel ? card.feelNotes[feel] : Object.entries(card.feelNotes)
    .map(([name, note]) => `• ${name}: ${note}`)
    .join('\n');
  return `${card.label}

Sonido del DAW: ${card.dawSound} (synth interno, no VST).
Notas de hoy: patrón MIDI local. GenAudius aún no toca esta pista.
BPM: ${card.bpmRange[0]}–${card.bpmRange[1]}
Groove: ${card.groove}
${feel ? `Estilo ${feel}: ${feelLine}` : `Estilos:\n${feelLine}`}
Tags: ${card.tags.join(', ')}

Caption de entrenamiento:
${styleCardCaption(card, feel)}

Cuando tengas 4–8 compases reales de este instrumento, los guardamos como ejemplo. Mientras tanto puedo escribir el patrón MIDI de práctica.`;
}

export function styleCardActions(card: StyleCard): NonNullable<ChatMessage['actions']> {
  const name = roleLabel(card.instrument).toLowerCase();
  return [
    {
      id: 'mode_midi',
      label: 'Escribirlo en MIDI',
      prompt: `vamos a hacer un arreglo en midi. quiero ${name === 'bongó' ? 'los bongos' : `un ${name}`} en bachata`
    },
    {
      id: `card_feel_bolero`,
      label: 'Bolero',
      prompt: `adoctrina el ${name} a bachata bolero`
    },
    {
      id: `card_feel_bailable`,
      label: 'Bailable',
      prompt: `adoctrina el ${name} a bachata bailable`
    }
  ];
}
