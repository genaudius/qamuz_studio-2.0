/** Multi-timbral instrument rack. Port of DAWCore/Models/VRack.swift. */

import { makePluginSlot, type PluginSlot, DEFAULT_TRACK_VOLUME } from './track';
import { newUUID } from './uuid';

export interface RackInstrument {
  id: string;
  name: string;
  pluginSlot: PluginSlot;
  volume: number;
  isMuted: boolean;
}

export interface VRack {
  instruments: RackInstrument[];
}

export function makeVRack(): VRack {
  return { instruments: [] };
}

export function makeRackInstrument(name = 'New Instrument'): RackInstrument {
  return {
    id: newUUID(),
    name,
    pluginSlot: makePluginSlot(),
    volume: DEFAULT_TRACK_VOLUME,
    isMuted: false
  };
}

export function findInstrument(rack: VRack, id: string): RackInstrument | undefined {
  return rack.instruments.find((i) => i.id === id);
}
