/** Tracks and plugin slots. Port of DAWCore/Models/Track.swift. */

import { makeAutomationLane, type AutomationLane } from './automation';
import type { Clip } from './clip';
import { newUUID } from './uuid';

export type TrackType = 'audio' | 'midi' | 'instrument' | 'bus' | 'master';

export type TrackColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'gray';

export const TRACK_COLORS: TrackColor[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'purple',
  'pink',
  'gray'
];

/** Stitch midnight palette — cyan / coral / green / purple. */
export const TRACK_COLOR_HEX: Record<TrackColor, string> = {
  red: '#ffb4ab',
  orange: '#ffb4aa',
  yellow: '#72fe88',
  green: '#53e16f',
  cyan: '#82cfff',
  blue: '#00aeef',
  purple: '#c9a0ff',
  pink: '#ffb4aa',
  gray: '#87929b'
};

export type PluginType =
  | 'audioUnitEffect'
  | 'audioUnitInstrument'
  | 'audioUnitMIDI'
  | 'vst3Effect'
  | 'vst3Instrument';

export interface PluginIdentifier {
  type: PluginType;
  manufacturer: string;
  name: string;
  uniqueID: string;
}

export interface PluginPreset {
  name: string;
  /** Base64 in the file, opaque here. */
  data: string;
}

export interface PluginSlot {
  id: string;
  pluginID?: PluginIdentifier;
  isEnabled: boolean;
  preset?: PluginPreset;
  parameterValues: Record<string, number>;
  stateData?: string;
}

export type InputSource =
  | { kind: 'audioDevice'; channelIndex: number }
  | { kind: 'midiDevice'; deviceID: string }
  | { kind: 'virtualMIDI' }
  | { kind: 'sidechain'; trackID: string }
  | { kind: 'vRackSum' }
  | { kind: 'none' };

export type MIDIOutputDestination =
  | { kind: 'trackInstrument' }
  | { kind: 'rackInstrument'; id: string; channel: number };

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  color: TrackColor;

  volume: number;
  pan: number;
  isMuted: boolean;
  isSolo: boolean;
  isArmed: boolean;

  inputSource?: InputSource;
  outputBus?: string;

  clips: Clip[];

  instrumentSlot?: PluginSlot;
  midiOutput?: MIDIOutputDestination;
  pluginSlots: PluginSlot[];

  automationLanes: AutomationLane[];
  isAutomationVisible: boolean;

  height: number;
  isExpanded: boolean;
}

/** -2 dB, the default the 1.0 build ships with. */
export const DEFAULT_TRACK_VOLUME = 0.7937;

export function makePluginSlot(pluginID?: PluginIdentifier): PluginSlot {
  return {
    id: newUUID(),
    ...(pluginID ? { pluginID } : {}),
    isEnabled: true,
    parameterValues: {}
  };
}

export function makeTrack(name: string, type: TrackType, color: TrackColor): Track {
  return {
    id: newUUID(),
    name,
    type,
    color,
    volume: DEFAULT_TRACK_VOLUME,
    pan: 0,
    isMuted: false,
    isSolo: false,
    isArmed: false,
    clips: [],
    pluginSlots: [],
    automationLanes: [makeAutomationLane({ kind: 'volume' }), makeAutomationLane({ kind: 'pan' })],
    isAutomationVisible: false,
    height: 80,
    isExpanded: true
  };
}

export function isMIDICapable(track: Track): boolean {
  return track.type === 'midi' || track.type === 'instrument';
}

export function trackColorHex(track: Track): string {
  return TRACK_COLOR_HEX[track.color];
}

export function inputSourceName(source: InputSource | undefined): string {
  if (!source) return 'None';
  switch (source.kind) {
    case 'audioDevice':
      return `Input ${source.channelIndex + 1}`;
    case 'midiDevice':
      return source.deviceID;
    case 'virtualMIDI':
      return 'Virtual MIDI';
    case 'sidechain':
      return `Track ${source.trackID.slice(0, 4)}`;
    case 'vRackSum':
      return 'V-Rack Sum';
    case 'none':
      return 'None';
  }
}
