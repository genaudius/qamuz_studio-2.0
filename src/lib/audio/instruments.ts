/**
 * The internal instruments live in the AudioWorklet, but they still have to be
 * described inside a `.dawproj` that the macOS 1.0 build can read. They are
 * therefore stored in the existing `PluginSlot` shape with a `qamuz.` unique id,
 * which keeps the file schema untouched and makes the choice self-describing.
 */

import { INSTRUMENTS, type InstrumentName } from './backend';
import type { PluginIdentifier, PluginSlot, Track } from '$lib/core/track';
import { makePluginSlot } from '$lib/core/track';
import type { RackInstrument } from '$lib/core/vrack';

const PREFIX = 'qamuz.';

export function instrumentIdentifier(name: InstrumentName): PluginIdentifier {
  const label = INSTRUMENTS.find((i) => i.id === name)?.label ?? name;
  return {
    type: 'vst3Instrument',
    manufacturer: 'Qamuz',
    name: label,
    uniqueID: `${PREFIX}${name}`
  };
}

export function instrumentSlot(name: InstrumentName): PluginSlot {
  return makePluginSlot(instrumentIdentifier(name));
}

function fromSlot(slot: PluginSlot | undefined): InstrumentName | null {
  const uniqueID = slot?.pluginID?.uniqueID;
  if (!uniqueID?.startsWith(PREFIX)) return null;

  const name = uniqueID.slice(PREFIX.length) as InstrumentName;
  return INSTRUMENTS.some((i) => i.id === name) ? name : null;
}

/** Falls back to a piano so an unknown or third-party plugin still makes sound. */
export function trackInstrument(track: Track): InstrumentName {
  return fromSlot(track.instrumentSlot) ?? 'piano';
}

export function rackInstrumentSound(instrument: RackInstrument): InstrumentName {
  return fromSlot(instrument.pluginSlot) ?? 'piano';
}

export function instrumentLabel(name: InstrumentName): string {
  return INSTRUMENTS.find((i) => i.id === name)?.label ?? name;
}
