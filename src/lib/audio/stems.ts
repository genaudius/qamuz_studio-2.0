/**
 * Filename → instrument naming and channel layout, ported from the Studio 1.0
 * HTML import path and GenAudius dual-session intake rules.
 */

import type { InstrumentName } from './backend';
import type { Track, TrackColor } from '$lib/core/track';

export const AUDIO_EXTENSIONS = ['wav', 'wave', 'aiff', 'aif', 'mp3', 'm4a', 'flac', 'ogg', 'aac', 'caf'];
export const MIDI_EXTENSIONS = ['mid', 'midi', 'smf'];
export const INSTRUMENT_EXTENSIONS = ['sf2', 'sfz', 'nki', 'vst3', 'component', 'aupreset', 'vstpreset'];

export type StemKind = 'audio' | 'midi' | 'instrument';
export type ChannelLayout = 'mono' | 'stereo' | 'multi';

export interface NamedStem {
  name: string;
  role: string;
  kind: StemKind;
  instrument?: InstrumentName;
}

/** Rules from Qamuz Studio 1.0 HTML (`inferInstrument`) + dual-session roles. */
const NAME_RULES: [RegExp, string, string, InstrumentName?][] = [
  [/\b(voz[_ ]?leader|lead vox|lead vocal|acapella|a cappella)\b/, 'Voz', 'lead_vocal'],
  [/\b(voz[_ ]?duo|dueto|duet|duo)\b/, 'Voz duo', 'duet_vocal'],
  [/\b(coro|choir|backing|bgv|harmony)\b/, 'Coro', 'backing_vocal'],
  [/\b(voz|vocal|vox|voice|canto)\b/, 'Voz', 'lead_vocal'],
  [/\b(requinto|lead guitar|guitar lead|solo guitar)\b/, 'Requinto', 'lead_guitar', 'lead'],
  [/\b(segunda|rhythm guitar|guitar rhythm|guitarra|guitar)\b/, 'Guitarra', 'rhythm_guitar', 'pluck'],
  [/\b(bajo|bass)\b/, 'Bajo', 'bass', 'bass'],
  [/\b(guira|güira|guiro|güiro)\b/, 'Güira', 'percussion', 'drums'],
  [/\b(bongo|conga|tambora|timbal|percussion|percusion|percusión|perc)\b/, 'Percusión', 'percussion', 'drums'],
  [/\b(kick|bombo)\b/, 'Kick', 'drums', 'drums'],
  [/\b(snare|caja)\b/, 'Caja', 'drums', 'drums'],
  [/\b(hat|hihat|hi-hat|charles)\b/, 'Hi-hat', 'drums', 'drums'],
  [/\b(drum|drums|bateria|batería|kit)\b/, 'Batería', 'drums', 'drums'],
  [/\b(piano|keys|keyboard|teclado)\b/, 'Piano / Teclado', 'keys', 'piano'],
  [/\b(rhodes|rodhes|epiano|e-piano|wurlitzer)\b/, 'Rhodes', 'keys', 'epiano'],
  [/\b(violin|viola|cello|chelo|strings|cuerdas)\b/, 'Cuerdas', 'strings', 'pad'],
  [/\b(woodwind|woodwinds|vientos|flute|oboe|clarinet)\b/, 'Vientos', 'woodwinds', 'lead'],
  [/\b(sax|saxophone|trompeta|trumpet|brass|metales|trombone)\b/, 'Metales', 'brass', 'lead'],
  [/\b(synth|pad|sintetizador)\b/, 'Sintetizador', 'keys', 'lead'],
  [/\b(pluck)\b/, 'Pluck', 'keys', 'pluck'],
  [/\b(fx|effects|otros|other)\b/, 'FX', 'unknown'],
  [/\b(instrumental|no[_ ]?vocals)\b/, 'Instrumental', 'unknown']
];

export function fileExtension(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

export function classifyStemFile(path: string): StemKind | null {
  const ext = fileExtension(path);
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (MIDI_EXTENSIONS.includes(ext)) return 'midi';
  if (INSTRUMENT_EXTENSIONS.includes(ext)) return 'instrument';
  return null;
}

export function cleanStemName(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function inferInstrument(filename: string): NamedStem {
  const raw = cleanStemName(filename);
  const name = fold(raw);
  const kind = classifyStemFile(filename) ?? 'audio';
  const match = NAME_RULES.find(([pattern]) => pattern.test(name));
  if (match) {
    return { name: match[1], role: match[2], kind, instrument: match[3] };
  }
  return { name: raw || 'Audio', role: 'unknown', kind };
}

export function uniqueTrackName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((item) => item.trim().toLowerCase()));
  if (!used.has(base.trim().toLowerCase())) return base;
  let index = 2;
  while (used.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

export function channelLayout(channelCount: number): ChannelLayout {
  if (channelCount <= 1) return 'mono';
  if (channelCount === 2) return 'stereo';
  return 'multi';
}

export function layoutLabel(layout: ChannelLayout, channelCount?: number): string {
  if (layout === 'mono') return 'Audio mono';
  if (layout === 'stereo') return 'Audio estéreo';
  return `Audio ${channelCount ?? 0} canales`;
}

export function trackChannelCount(track: Track): number {
  for (const clip of track.clips) {
    if (clip.content.kind === 'audio') return clip.content.audio.fileReference.channelCount;
  }
  return 0;
}

export function trackLayoutLabel(track: Track): string {
  if (track.type === 'midi') return 'MIDI';
  if (track.type === 'instrument') return 'Instrumento virtual';
  if (track.type === 'bus') return /^aux\b/i.test(track.name) ? 'Auxiliar' : 'Bus';
  if (track.type === 'master') return 'Master';
  const count = trackChannelCount(track);
  if (!count) return 'Estéreo';
  return layoutLabel(channelLayout(count), count);
}

export function instrumentForStem(stem: NamedStem): InstrumentName {
  return stem.instrument ?? 'piano';
}

/** Short Spanish label for mixer / track header (Studio 1.0 style). */
export function roleLabel(role: string): string {
  switch (role) {
    case 'lead_vocal':
      return 'Voz';
    case 'duet_vocal':
      return 'Voz duo';
    case 'backing_vocal':
      return 'Coro';
    case 'bass':
      return 'Bajo';
    case 'drums':
      return 'Batería';
    case 'percussion':
      return 'Percusión';
    case 'lead_guitar':
      return 'Requinto';
    case 'rhythm_guitar':
      return 'Guitarra';
    case 'keys':
      return 'Teclado';
    case 'strings':
      return 'Cuerdas';
    case 'brass':
      return 'Metales';
    case 'woodwinds':
      return 'Vientos';
    default:
      return 'Audio';
  }
}

/** Stable color per instrument role so stems are easy to spot on the arrange. */
export function roleTrackColor(role: string): TrackColor {
  switch (role) {
    case 'lead_vocal':
    case 'duet_vocal':
      return 'purple';
    case 'backing_vocal':
      return 'pink';
    case 'bass':
      return 'orange';
    case 'drums':
      return 'green';
    case 'percussion':
      return 'yellow';
    case 'lead_guitar':
      return 'cyan';
    case 'rhythm_guitar':
      return 'blue';
    case 'keys':
      return 'cyan';
    case 'strings':
      return 'blue';
    case 'brass':
    case 'woodwinds':
      return 'red';
    default:
      return 'gray';
  }
}
