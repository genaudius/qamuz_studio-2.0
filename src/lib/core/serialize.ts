/**
 * Bridges the in-memory model and the on-disk `project.json` written by the
 * macOS 1.0 build, so a project saved by either version opens in the other.
 *
 * Three Swift `Codable` conventions drive everything here:
 *
 * 1. Single-property ID wrappers (`TrackID`, `ClipID`) encode as
 *    `{"rawValue": "<uuid>"}` rather than a bare string. In memory we keep flat
 *    strings, so the wrapping happens only at this boundary.
 * 2. Enums with associated values encode as a single-key object. An unlabeled
 *    payload lands under `_0` (`{"audio": {"_0": {...}}}`), labeled payloads use
 *    their labels (`{"rackInstrument": {"id": "...", "channel": 1}}`), and cases
 *    without a payload encode as an empty object (`{"empty": {}}`).
 * 3. Optional properties are omitted entirely when nil, `Data` is base64, and
 *    `Date` is ISO 8601 because the encoder sets `.iso8601`.
 */

import type { AutomationLane, AutomationParameter, AutomationPoint } from './automation';
import {
  defaultEqBands,
  makeChannelProcess,
  makeFxBuses,
  type ChannelProcess,
  type EqBand,
  type FxBuses,
  type InsertKind,
  type InsertSlot
} from './channel-fx';
import type {
  AudioClipData,
  AudioFileReference,
  Clip,
  ClipContent,
  MIDIClipData,
  WarpMarker
} from './clip';
import type { MIDIEvent, MIDIEventType, NoteData } from './midi';
import type {
  DAWState,
  Marker,
  OpenPluginWindow,
  Project,
  ProjectMetadata,
  Rect,
  TempoChange,
  TimeSignatureChange
} from './project';
import { CURRENT_FORMAT_VERSION } from './project';
import { clampPpq, DEFAULT_PPQ, type TimePosition, type TimeRange } from './time';
import type {
  InputSource,
  MIDIOutputDestination,
  PluginIdentifier,
  PluginPreset,
  PluginSlot,
  Track
} from './track';
import type { RackInstrument, VRack } from './vrack';
import { normalizeUUID, uuidForFile } from './uuid';

type Json = Record<string, unknown>;

export interface ProjectFileEnvelope {
  version: number;
  project: Project;
}

class ProjectFormatError extends Error {
  constructor(message: string) {
    super(`Invalid project file: ${message}`);
    this.name = 'ProjectFormatError';
  }
}

// --- primitives -------------------------------------------------------------

function idBox(id: string): Json {
  return { rawValue: uuidForFile(id) };
}

function idUnbox(value: unknown, field: string): string {
  if (typeof value === 'string') return normalizeUUID(value);
  if (value && typeof value === 'object' && typeof (value as Json).rawValue === 'string') {
    return normalizeUUID((value as { rawValue: string }).rawValue);
  }
  throw new ProjectFormatError(`expected an identifier at ${field}`);
}

function optionalIdUnbox(value: unknown, field: string): string | undefined {
  return value === undefined || value === null ? undefined : idUnbox(value, field);
}

/** Drops keys whose value is undefined, matching Swift's `encodeIfPresent`. */
function compact(obj: Json): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function num(value: unknown, field: string, fallback?: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new ProjectFormatError(`expected a number at ${field}`);
}

function str(value: unknown, field: string, fallback?: string): string {
  if (typeof value === 'string') return value;
  if (fallback !== undefined) return fallback;
  throw new ProjectFormatError(`expected a string at ${field}`);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function obj(value: unknown, field: string): Json {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Json;
  throw new ProjectFormatError(`expected an object at ${field}`);
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Reads a Swift enum payload: returns the case name and its payload object. */
function enumCase(value: unknown, field: string): { name: string; payload: Json } {
  const container = obj(value, field);
  const keys = Object.keys(container);
  if (keys.length !== 1) {
    throw new ProjectFormatError(`expected a single enum case at ${field}`);
  }
  const name = keys[0];
  const raw = container[name];
  const payload = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Json) : {};
  return { name, payload };
}

// --- time -------------------------------------------------------------------

function encodeTimePosition(p: TimePosition): Json {
  return { samples: Math.round(p.samples), sampleRate: p.sampleRate };
}

function decodeTimePosition(value: unknown, field: string, sampleRate: number): TimePosition {
  const o = obj(value, field);
  return {
    samples: num(o.samples, `${field}.samples`, 0),
    sampleRate: num(o.sampleRate, `${field}.sampleRate`, sampleRate)
  };
}

function encodeTimeRange(r: TimeRange): Json {
  return { start: encodeTimePosition(r.start), duration: encodeTimePosition(r.duration) };
}

function decodeTimeRange(value: unknown, field: string, sampleRate: number): TimeRange {
  const o = obj(value, field);
  return {
    start: decodeTimePosition(o.start, `${field}.start`, sampleRate),
    duration: decodeTimePosition(o.duration, `${field}.duration`, sampleRate)
  };
}

// --- MIDI -------------------------------------------------------------------

function encodeNoteData(n: NoteData): Json {
  return compact({
    pitch: n.pitch,
    velocity: n.velocity,
    duration: n.duration,
    releaseVelocity: n.releaseVelocity
  });
}

function decodeNoteData(value: unknown, field: string): NoteData {
  const o = obj(value, field);
  const release = o.releaseVelocity;
  return {
    pitch: num(o.pitch, `${field}.pitch`, 60),
    velocity: num(o.velocity, `${field}.velocity`, 100),
    duration: num(o.duration, `${field}.duration`, 0.25),
    ...(typeof release === 'number' ? { releaseVelocity: release } : {})
  };
}

function encodeMIDIEventType(t: MIDIEventType): Json {
  switch (t.kind) {
    case 'note':
      return { note: { _0: encodeNoteData(t.note) } };
    case 'controlChange':
      return { controlChange: { controller: t.controller, value: t.value } };
    case 'programChange':
      return { programChange: { program: t.program } };
    case 'pitchBend':
      return { pitchBend: { value: t.value } };
    case 'aftertouch':
      return { aftertouch: { pressure: t.pressure } };
    case 'polyAftertouch':
      return { polyAftertouch: { note: t.note, pressure: t.pressure } };
    case 'sysex':
      return { sysex: { data: t.data } };
  }
}

function decodeMIDIEventType(value: unknown, field: string): MIDIEventType {
  const { name, payload } = enumCase(value, field);
  switch (name) {
    case 'note':
      return { kind: 'note', note: decodeNoteData(payload._0, `${field}.note`) };
    case 'controlChange':
      return {
        kind: 'controlChange',
        controller: num(payload.controller, `${field}.controller`, 1),
        value: num(payload.value, `${field}.value`, 0)
      };
    case 'programChange':
      return { kind: 'programChange', program: num(payload.program, `${field}.program`, 0) };
    case 'pitchBend':
      return { kind: 'pitchBend', value: num(payload.value, `${field}.value`, 0) };
    case 'aftertouch':
      return { kind: 'aftertouch', pressure: num(payload.pressure, `${field}.pressure`, 0) };
    case 'polyAftertouch':
      return {
        kind: 'polyAftertouch',
        note: num(payload.note, `${field}.note`, 60),
        pressure: num(payload.pressure, `${field}.pressure`, 0)
      };
    case 'sysex':
      return { kind: 'sysex', data: str(payload.data, `${field}.data`, '') };
    default:
      throw new ProjectFormatError(`unknown MIDI event type "${name}" at ${field}`);
  }
}

function encodeMIDIEvent(e: MIDIEvent): Json {
  return {
    id: uuidForFile(e.id),
    beatPosition: e.beatPosition,
    type: encodeMIDIEventType(e.type),
    channel: e.channel
  };
}

function decodeMIDIEvent(value: unknown, field: string): MIDIEvent {
  const o = obj(value, field);
  return {
    id: idUnbox(o.id, `${field}.id`),
    beatPosition: num(o.beatPosition, `${field}.beatPosition`, 0),
    type: decodeMIDIEventType(o.type, `${field}.type`),
    channel: num(o.channel, `${field}.channel`, 0)
  };
}

// --- clips ------------------------------------------------------------------

function encodeAudioFileReference(r: AudioFileReference): Json {
  return {
    fileID: uuidForFile(r.fileID),
    originalPath: r.originalPath,
    relativePath: r.relativePath,
    sampleRate: r.sampleRate,
    channelCount: r.channelCount,
    lengthInSamples: Math.round(r.lengthInSamples),
    bitDepth: r.bitDepth
  };
}

function decodeAudioFileReference(value: unknown, field: string): AudioFileReference {
  const o = obj(value, field);
  return {
    fileID: idUnbox(o.fileID, `${field}.fileID`),
    originalPath: str(o.originalPath, `${field}.originalPath`, ''),
    relativePath: str(o.relativePath, `${field}.relativePath`, ''),
    sampleRate: num(o.sampleRate, `${field}.sampleRate`, 44100),
    channelCount: num(o.channelCount, `${field}.channelCount`, 2),
    lengthInSamples: num(o.lengthInSamples, `${field}.lengthInSamples`, 0),
    bitDepth: num(o.bitDepth, `${field}.bitDepth`, 16)
  };
}

function encodeWarpMarker(m: WarpMarker): Json {
  return {
    id: uuidForFile(m.id),
    sourceSample: Math.round(m.sourceSample),
    targetPosition: m.targetPosition
  };
}

function decodeWarpMarker(value: unknown, field: string): WarpMarker {
  const o = obj(value, field);
  return {
    id: idUnbox(o.id, `${field}.id`),
    sourceSample: num(o.sourceSample, `${field}.sourceSample`, 0),
    targetPosition: num(o.targetPosition, `${field}.targetPosition`, 0)
  };
}

function encodeAudioClipData(d: AudioClipData): Json {
  return {
    fileReference: encodeAudioFileReference(d.fileReference),
    sourceStartSample: Math.round(d.sourceStartSample),
    sourceLengthSamples: Math.round(d.sourceLengthSamples),
    pitchShift: d.pitchShift,
    timeStretch: d.timeStretch,
    warpMarkers: d.warpMarkers.map(encodeWarpMarker),
    preservePitch: d.preservePitch
  };
}

function decodeAudioClipData(value: unknown, field: string): AudioClipData {
  const o = obj(value, field);
  return {
    fileReference: decodeAudioFileReference(o.fileReference, `${field}.fileReference`),
    sourceStartSample: num(o.sourceStartSample, `${field}.sourceStartSample`, 0),
    sourceLengthSamples: num(o.sourceLengthSamples, `${field}.sourceLengthSamples`, 0),
    pitchShift: num(o.pitchShift, `${field}.pitchShift`, 0),
    timeStretch: num(o.timeStretch, `${field}.timeStretch`, 1),
    warpMarkers: arr(o.warpMarkers).map((m, i) =>
      decodeWarpMarker(m, `${field}.warpMarkers[${i}]`)
    ),
    preservePitch: bool(o.preservePitch, true)
  };
}

function encodeMIDIClipData(d: MIDIClipData): Json {
  return compact({
    events: d.events.map(encodeMIDIEvent),
    originalTempo: d.originalTempo
  });
}

function decodeMIDIClipData(value: unknown, field: string): MIDIClipData {
  const o = obj(value, field);
  const tempo = o.originalTempo;
  return {
    events: arr(o.events).map((e, i) => decodeMIDIEvent(e, `${field}.events[${i}]`)),
    ...(typeof tempo === 'number' ? { originalTempo: tempo } : {})
  };
}

function encodeClipContent(c: ClipContent): Json {
  switch (c.kind) {
    case 'audio':
      return { audio: { _0: encodeAudioClipData(c.audio) } };
    case 'midi':
      return { midi: { _0: encodeMIDIClipData(c.midi) } };
    case 'empty':
      return { empty: {} };
  }
}

function decodeClipContent(value: unknown, field: string): ClipContent {
  const { name, payload } = enumCase(value, field);
  switch (name) {
    case 'audio':
      return { kind: 'audio', audio: decodeAudioClipData(payload._0, `${field}.audio`) };
    case 'midi':
      return { kind: 'midi', midi: decodeMIDIClipData(payload._0, `${field}.midi`) };
    case 'empty':
      return { kind: 'empty' };
    default:
      throw new ProjectFormatError(`unknown clip content "${name}" at ${field}`);
  }
}

function encodeClip(c: Clip): Json {
  return compact({
    id: idBox(c.id),
    name: c.name,
    color: c.color,
    timeRange: encodeTimeRange(c.timeRange),
    content: encodeClipContent(c.content),
    gain: c.gain,
    fadeInDuration: Math.round(c.fadeInDuration),
    fadeOutDuration: Math.round(c.fadeOutDuration),
    fadeInCurve: c.fadeInCurve,
    fadeOutCurve: c.fadeOutCurve,
    isLooped: c.isLooped,
    loopLength: c.loopLength ? encodeTimePosition(c.loopLength) : undefined,
    isMuted: c.isMuted,
    isSelected: c.isSelected
  });
}

function decodeClip(value: unknown, field: string, sampleRate: number): Clip {
  const o = obj(value, field);
  return {
    id: idUnbox(o.id, `${field}.id`),
    name: str(o.name, `${field}.name`, 'Clip'),
    ...(typeof o.color === 'string' ? { color: o.color as Clip['color'] } : {}),
    timeRange: decodeTimeRange(o.timeRange, `${field}.timeRange`, sampleRate),
    content: decodeClipContent(o.content, `${field}.content`),
    gain: num(o.gain, `${field}.gain`, 1),
    fadeInDuration: num(o.fadeInDuration, `${field}.fadeInDuration`, 0),
    fadeOutDuration: num(o.fadeOutDuration, `${field}.fadeOutDuration`, 0),
    fadeInCurve: (o.fadeInCurve as Clip['fadeInCurve']) ?? 'linear',
    fadeOutCurve: (o.fadeOutCurve as Clip['fadeOutCurve']) ?? 'linear',
    isLooped: bool(o.isLooped, false),
    ...(o.loopLength
      ? { loopLength: decodeTimePosition(o.loopLength, `${field}.loopLength`, sampleRate) }
      : {}),
    isMuted: bool(o.isMuted, false),
    isSelected: bool(o.isSelected, false)
  };
}

// --- automation -------------------------------------------------------------

function encodeAutomationParameter(p: AutomationParameter): Json {
  switch (p.kind) {
    case 'volume':
      return { volume: {} };
    case 'pan':
      return { pan: {} };
    case 'mute':
      return { mute: {} };
    case 'send':
      return { send: { index: p.index } };
    case 'plugin':
      return { plugin: { slotIndex: p.slotIndex, parameterID: p.parameterID } };
  }
}

function decodeAutomationParameter(value: unknown, field: string): AutomationParameter {
  const { name, payload } = enumCase(value, field);
  switch (name) {
    case 'volume':
      return { kind: 'volume' };
    case 'pan':
      return { kind: 'pan' };
    case 'mute':
      return { kind: 'mute' };
    case 'send':
      return { kind: 'send', index: num(payload.index, `${field}.index`, 0) };
    case 'plugin':
      return {
        kind: 'plugin',
        slotIndex: num(payload.slotIndex, `${field}.slotIndex`, 0),
        parameterID: str(payload.parameterID, `${field}.parameterID`, '')
      };
    default:
      throw new ProjectFormatError(`unknown automation parameter "${name}" at ${field}`);
  }
}

function encodeAutomationPoint(p: AutomationPoint): Json {
  return {
    id: uuidForFile(p.id),
    beatPosition: p.beatPosition,
    value: p.value,
    curveType: p.curveType
  };
}

function decodeAutomationPoint(value: unknown, field: string): AutomationPoint {
  const o = obj(value, field);
  return {
    id: idUnbox(o.id, `${field}.id`),
    beatPosition: num(o.beatPosition, `${field}.beatPosition`, 0),
    value: num(o.value, `${field}.value`, 0),
    curveType: (o.curveType as AutomationPoint['curveType']) ?? 'linear'
  };
}

function encodeAutomationLane(l: AutomationLane): Json {
  return {
    id: uuidForFile(l.id),
    parameter: encodeAutomationParameter(l.parameter),
    points: l.points.map(encodeAutomationPoint),
    isEnabled: l.isEnabled,
    isVisible: l.isVisible,
    height: l.height
  };
}

function decodeAutomationLane(value: unknown, field: string): AutomationLane {
  const o = obj(value, field);
  return {
    id: idUnbox(o.id, `${field}.id`),
    parameter: decodeAutomationParameter(o.parameter, `${field}.parameter`),
    points: arr(o.points).map((p, i) => decodeAutomationPoint(p, `${field}.points[${i}]`)),
    isEnabled: bool(o.isEnabled, true),
    isVisible: bool(o.isVisible, false),
    height: num(o.height, `${field}.height`, 60)
  };
}

// --- plugins ----------------------------------------------------------------

function encodePluginIdentifier(p: PluginIdentifier): Json {
  return {
    type: p.type,
    manufacturer: p.manufacturer,
    name: p.name,
    uniqueID: p.uniqueID
  };
}

function decodePluginIdentifier(value: unknown, field: string): PluginIdentifier {
  const o = obj(value, field);
  return {
    type: (o.type as PluginIdentifier['type']) ?? 'vst3Effect',
    manufacturer: str(o.manufacturer, `${field}.manufacturer`, ''),
    name: str(o.name, `${field}.name`, ''),
    uniqueID: str(o.uniqueID, `${field}.uniqueID`, '')
  };
}

function encodePluginPreset(p: PluginPreset): Json {
  return { name: p.name, data: p.data };
}

function encodePluginSlot(s: PluginSlot): Json {
  return compact({
    id: uuidForFile(s.id),
    pluginID: s.pluginID ? encodePluginIdentifier(s.pluginID) : undefined,
    isEnabled: s.isEnabled,
    preset: s.preset ? encodePluginPreset(s.preset) : undefined,
    parameterValues: s.parameterValues,
    stateData: s.stateData
  });
}

function decodePluginSlot(value: unknown, field: string): PluginSlot {
  const o = obj(value, field);
  const preset = o.preset && typeof o.preset === 'object' ? (o.preset as Json) : undefined;

  return {
    id: idUnbox(o.id, `${field}.id`),
    ...(o.pluginID
      ? { pluginID: decodePluginIdentifier(o.pluginID, `${field}.pluginID`) }
      : {}),
    isEnabled: bool(o.isEnabled, true),
    ...(preset
      ? {
          preset: {
            name: str(preset.name, `${field}.preset.name`, ''),
            data: str(preset.data, `${field}.preset.data`, '')
          }
        }
      : {}),
    parameterValues: (o.parameterValues as Record<string, number>) ?? {},
    ...(typeof o.stateData === 'string' ? { stateData: o.stateData } : {})
  };
}

// --- routing ----------------------------------------------------------------

function encodeInputSource(s: InputSource): Json {
  switch (s.kind) {
    case 'audioDevice':
      return { audioDevice: { channelIndex: s.channelIndex } };
    case 'midiDevice':
      return { midiDevice: { deviceID: s.deviceID } };
    case 'virtualMIDI':
      return { virtualMIDI: {} };
    case 'sidechain':
      return { sidechain: { trackID: idBox(s.trackID) } };
    case 'vRackSum':
      return { vRackSum: {} };
    case 'none':
      return { none: {} };
  }
}

function decodeInputSource(value: unknown, field: string): InputSource {
  const { name, payload } = enumCase(value, field);
  switch (name) {
    case 'audioDevice':
      return {
        kind: 'audioDevice',
        channelIndex: num(payload.channelIndex, `${field}.channelIndex`, 0)
      };
    case 'midiDevice':
      return { kind: 'midiDevice', deviceID: str(payload.deviceID, `${field}.deviceID`, '') };
    case 'virtualMIDI':
      return { kind: 'virtualMIDI' };
    case 'sidechain':
      return { kind: 'sidechain', trackID: idUnbox(payload.trackID, `${field}.trackID`) };
    case 'vRackSum':
      return { kind: 'vRackSum' };
    case 'none':
      return { kind: 'none' };
    default:
      throw new ProjectFormatError(`unknown input source "${name}" at ${field}`);
  }
}

function encodeMIDIOutput(d: MIDIOutputDestination): Json {
  switch (d.kind) {
    case 'trackInstrument':
      return { trackInstrument: {} };
    case 'rackInstrument':
      return { rackInstrument: { id: uuidForFile(d.id), channel: d.channel } };
  }
}

function decodeMIDIOutput(value: unknown, field: string): MIDIOutputDestination {
  const { name, payload } = enumCase(value, field);
  switch (name) {
    case 'trackInstrument':
      return { kind: 'trackInstrument' };
    case 'rackInstrument':
      return {
        kind: 'rackInstrument',
        id: idUnbox(payload.id, `${field}.id`),
        channel: num(payload.channel, `${field}.channel`, 1)
      };
    default:
      throw new ProjectFormatError(`unknown MIDI output "${name}" at ${field}`);
  }
}

// --- channel FX -------------------------------------------------------------

function encodeChannelProcess(cp: ChannelProcess): Json {
  return {
    preGainDb: cp.preGainDb,
    phaseInvert: cp.phaseInvert,
    eq: {
      enabled: cp.eq.enabled,
      bands: cp.eq.bands.map((b) => ({
        type: b.type,
        freq: b.freq,
        gainDb: b.gainDb,
        q: b.q,
        enabled: b.enabled
      }))
    },
    comp: { ...cp.comp },
    inserts: cp.inserts.map((i) => ({
      id: i.id,
      kind: i.kind,
      enabled: i.enabled,
      params: i.params
    })),
    sends: { ...cp.sends }
  };
}

function decodeEqBand(value: unknown, field: string): EqBand {
  const o = obj(value, field);
  return {
    type: (o.type as EqBand['type']) ?? 'peaking',
    freq: num(o.freq, `${field}.freq`, 1000),
    gainDb: num(o.gainDb, `${field}.gainDb`, 0),
    q: num(o.q, `${field}.q`, 1),
    enabled: bool(o.enabled, true)
  };
}

function decodeInsert(value: unknown, field: string): InsertSlot {
  const o = obj(value, field);
  const params: Record<string, number> = {};
  const raw = o.params && typeof o.params === 'object' ? (o.params as Json) : {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number') params[k] = v;
  }
  return {
    id: typeof o.id === 'string' ? o.id : uuidForFile(crypto.randomUUID?.() ?? `${Date.now()}`),
    kind: (o.kind as InsertKind) ?? 'drive',
    enabled: bool(o.enabled, true),
    params
  };
}

function decodeChannelProcess(value: unknown, field: string): ChannelProcess {
  if (!value || typeof value !== 'object') return makeChannelProcess();
  const o = obj(value, field);
  const eqObj = o.eq ? obj(o.eq, `${field}.eq`) : {};
  const compObj = o.comp ? obj(o.comp, `${field}.comp`) : {};
  const sendsObj = o.sends ? obj(o.sends, `${field}.sends`) : {};
  const bands = arr(eqObj.bands).map((b, i) => decodeEqBand(b, `${field}.eq.bands[${i}]`));
  return {
    preGainDb: num(o.preGainDb, `${field}.preGainDb`, 0),
    phaseInvert: bool(o.phaseInvert, false),
    eq: {
      enabled: bool(eqObj.enabled, false),
      bands: bands.length ? bands : defaultEqBands()
    },
    comp: {
      enabled: bool(compObj.enabled, false),
      thresholdDb: num(compObj.thresholdDb, `${field}.comp.thresholdDb`, -18),
      ratio: num(compObj.ratio, `${field}.comp.ratio`, 4),
      attackMs: num(compObj.attackMs, `${field}.comp.attackMs`, 5),
      releaseMs: num(compObj.releaseMs, `${field}.comp.releaseMs`, 50),
      makeupDb: num(compObj.makeupDb, `${field}.comp.makeupDb`, 0)
    },
    inserts: arr(o.inserts).map((i, idx) => decodeInsert(i, `${field}.inserts[${idx}]`)),
    sends: {
      reverb: num(sendsObj.reverb, `${field}.sends.reverb`, 0),
      delay: num(sendsObj.delay, `${field}.sends.delay`, 0)
    }
  };
}

function encodeFxBuses(buses: FxBuses): Json {
  return {
    reverb: { ...buses.reverb },
    delay: { ...buses.delay }
  };
}

function decodeFxBuses(value: unknown, field: string): FxBuses {
  const fallback = makeFxBuses();
  if (!value || typeof value !== 'object') return fallback;
  const o = obj(value, field);
  const rev = o.reverb ? obj(o.reverb, `${field}.reverb`) : {};
  const dly = o.delay ? obj(o.delay, `${field}.delay`) : {};
  return {
    reverb: {
      enabled: bool(rev.enabled, true),
      algorithm: (rev.algorithm as FxBuses['reverb']['algorithm']) ?? 'hall',
      size: num(rev.size, `${field}.reverb.size`, 0.55),
      decay: num(rev.decay, `${field}.reverb.decay`, 0.5),
      precut: num(rev.precut, `${field}.reverb.precut`, 0.35),
      busVolDb: num(rev.busVolDb, `${field}.reverb.busVolDb`, -6)
    },
    delay: {
      enabled: bool(dly.enabled, true),
      syncBeats: num(dly.syncBeats, `${field}.delay.syncBeats`, 0.25),
      feedback: num(dly.feedback, `${field}.delay.feedback`, 0.35),
      busVolDb: num(dly.busVolDb, `${field}.delay.busVolDb`, -8)
    }
  };
}

// --- tracks -----------------------------------------------------------------

function encodeTrack(t: Track): Json {
  return compact({
    id: idBox(t.id),
    name: t.name,
    type: t.type,
    color: t.color,
    volume: t.volume,
    pan: t.pan,
    isMuted: t.isMuted,
    isSolo: t.isSolo,
    isArmed: t.isArmed,
    inputSource: t.inputSource ? encodeInputSource(t.inputSource) : undefined,
    outputBus: t.outputBus ? idBox(t.outputBus) : undefined,
    clips: t.clips.map(encodeClip),
    instrumentSlot: t.instrumentSlot ? encodePluginSlot(t.instrumentSlot) : undefined,
    midiOutput: t.midiOutput ? encodeMIDIOutput(t.midiOutput) : undefined,
    pluginSlots: t.pluginSlots.map(encodePluginSlot),
    channelProcess: encodeChannelProcess(t.channelProcess ?? makeChannelProcess()),
    automationLanes: t.automationLanes.map(encodeAutomationLane),
    isAutomationVisible: t.isAutomationVisible,
    height: t.height,
    isExpanded: t.isExpanded
  });
}

function decodeTrack(value: unknown, field: string, sampleRate: number): Track {
  const o = obj(value, field);
  return {
    id: idUnbox(o.id, `${field}.id`),
    name: str(o.name, `${field}.name`, 'Track'),
    type: (o.type as Track['type']) ?? 'audio',
    color: (o.color as Track['color']) ?? 'blue',
    volume: num(o.volume, `${field}.volume`, 0.7937),
    pan: num(o.pan, `${field}.pan`, 0),
    isMuted: bool(o.isMuted, false),
    isSolo: bool(o.isSolo, false),
    isArmed: bool(o.isArmed, false),
    ...(o.inputSource
      ? { inputSource: decodeInputSource(o.inputSource, `${field}.inputSource`) }
      : {}),
    ...(o.outputBus ? { outputBus: idUnbox(o.outputBus, `${field}.outputBus`) } : {}),
    clips: arr(o.clips).map((c, i) => decodeClip(c, `${field}.clips[${i}]`, sampleRate)),
    ...(o.instrumentSlot
      ? { instrumentSlot: decodePluginSlot(o.instrumentSlot, `${field}.instrumentSlot`) }
      : {}),
    ...(o.midiOutput
      ? { midiOutput: decodeMIDIOutput(o.midiOutput, `${field}.midiOutput`) }
      : {}),
    pluginSlots: arr(o.pluginSlots).map((s, i) =>
      decodePluginSlot(s, `${field}.pluginSlots[${i}]`)
    ),
    channelProcess: decodeChannelProcess(o.channelProcess, `${field}.channelProcess`),
    automationLanes: arr(o.automationLanes).map((l, i) =>
      decodeAutomationLane(l, `${field}.automationLanes[${i}]`)
    ),
    isAutomationVisible: bool(o.isAutomationVisible, false),
    height: num(o.height, `${field}.height`, 80),
    isExpanded: bool(o.isExpanded, true)
  };
}

// --- V-Rack -----------------------------------------------------------------

function encodeRackInstrument(i: RackInstrument): Json {
  return {
    id: uuidForFile(i.id),
    name: i.name,
    pluginSlot: encodePluginSlot(i.pluginSlot),
    volume: i.volume,
    isMuted: i.isMuted
  };
}

function decodeRackInstrument(value: unknown, field: string): RackInstrument {
  const o = obj(value, field);
  return {
    id: idUnbox(o.id, `${field}.id`),
    name: str(o.name, `${field}.name`, 'Instrument'),
    pluginSlot: decodePluginSlot(o.pluginSlot, `${field}.pluginSlot`),
    volume: num(o.volume, `${field}.volume`, 0.7937),
    isMuted: bool(o.isMuted, false)
  };
}

function encodeVRack(r: VRack): Json {
  return { instruments: r.instruments.map(encodeRackInstrument) };
}

function decodeVRack(value: unknown, field: string): VRack {
  if (!value) return { instruments: [] };
  const o = obj(value, field);
  return {
    instruments: arr(o.instruments).map((i, idx) =>
      decodeRackInstrument(i, `${field}.instruments[${idx}]`)
    )
  };
}

// --- project chrome ---------------------------------------------------------

function encodeTempoChange(c: TempoChange): Json {
  return {
    id: uuidForFile(c.id),
    beatPosition: c.beatPosition,
    tempo: { bpm: c.tempo.bpm },
    curveType: c.curveType
  };
}

function decodeTempoChange(value: unknown, field: string): TempoChange {
  const o = obj(value, field);
  return {
    id: idUnbox(o.id, `${field}.id`),
    beatPosition: num(o.beatPosition, `${field}.beatPosition`, 0),
    tempo: { bpm: num(obj(o.tempo, `${field}.tempo`).bpm, `${field}.tempo.bpm`, 120) },
    curveType: (o.curveType as TempoChange['curveType']) ?? 'step'
  };
}

function encodeTimeSignatureChange(c: TimeSignatureChange): Json {
  return {
    id: uuidForFile(c.id),
    beatPosition: c.beatPosition,
    timeSignature: { numerator: c.timeSignature.numerator, denominator: c.timeSignature.denominator }
  };
}

function decodeTimeSignatureChange(value: unknown, field: string): TimeSignatureChange {
  const o = obj(value, field);
  const sig = obj(o.timeSignature, `${field}.timeSignature`);
  return {
    id: idUnbox(o.id, `${field}.id`),
    beatPosition: num(o.beatPosition, `${field}.beatPosition`, 0),
    timeSignature: {
      numerator: num(sig.numerator, `${field}.timeSignature.numerator`, 4),
      denominator: num(sig.denominator, `${field}.timeSignature.denominator`, 4)
    }
  };
}

function encodeMarker(m: Marker): Json {
  return {
    id: uuidForFile(m.id),
    name: m.name,
    beatPosition: m.beatPosition,
    color: m.color,
    type: m.type
  };
}

function decodeMarker(value: unknown, field: string): Marker {
  const o = obj(value, field);
  return {
    id: idUnbox(o.id, `${field}.id`),
    name: str(o.name, `${field}.name`, 'Marker'),
    beatPosition: num(o.beatPosition, `${field}.beatPosition`, 0),
    color: (o.color as Marker['color']) ?? 'blue',
    type: (o.type as Marker['type']) ?? 'generic'
  };
}

function encodeMetadata(m: ProjectMetadata): Json {
  return {
    artist: m.artist,
    album: m.album,
    genre: m.genre,
    comments: m.comments,
    copyright: m.copyright
  };
}

function decodeMetadata(value: unknown, field: string): ProjectMetadata {
  const o = value ? obj(value, field) : {};
  return {
    artist: str(o.artist, `${field}.artist`, ''),
    album: str(o.album, `${field}.album`, ''),
    genre: str(o.genre, `${field}.genre`, ''),
    comments: str(o.comments, `${field}.comments`, ''),
    copyright: str(o.copyright, `${field}.copyright`, '')
  };
}

/** CGRect encodes as nested origin/size objects. */
function encodeRect(r: Rect): Json {
  return {
    origin: { x: r.origin.x, y: r.origin.y },
    size: { width: r.size.width, height: r.size.height }
  };
}

function decodeRect(value: unknown, field: string): Rect {
  const o = obj(value, field);
  const origin = obj(o.origin, `${field}.origin`);
  const size = obj(o.size, `${field}.size`);
  return {
    origin: { x: num(origin.x, `${field}.origin.x`, 0), y: num(origin.y, `${field}.origin.y`, 0) },
    size: {
      width: num(size.width, `${field}.size.width`, 0),
      height: num(size.height, `${field}.size.height`, 0)
    }
  };
}

function encodeOpenPluginWindow(w: OpenPluginWindow): Json {
  return compact({
    id: uuidForFile(w.id),
    windowFrame: w.windowFrame ? encodeRect(w.windowFrame) : undefined,
    isRackInstrument: w.isRackInstrument,
    rackInstrumentID: w.rackInstrumentID ? uuidForFile(w.rackInstrumentID) : undefined,
    trackID: w.trackID ? uuidForFile(w.trackID) : undefined
  });
}

function decodeOpenPluginWindow(value: unknown, field: string): OpenPluginWindow {
  const o = obj(value, field);
  return {
    id: idUnbox(o.id, `${field}.id`),
    ...(o.windowFrame ? { windowFrame: decodeRect(o.windowFrame, `${field}.windowFrame`) } : {}),
    isRackInstrument: bool(o.isRackInstrument, false),
    ...(typeof o.rackInstrumentID === 'string'
      ? { rackInstrumentID: normalizeUUID(o.rackInstrumentID) }
      : {}),
    ...(typeof o.trackID === 'string' ? { trackID: normalizeUUID(o.trackID) } : {})
  };
}

function encodeDAWState(s: DAWState): Json {
  return compact({
    showVRack: s.showVRack,
    showMixer: s.showMixer,
    showInspector: s.showInspector,
    zoomLevel: s.zoomLevel,
    horizontalScrollOffset: s.horizontalScrollOffset,
    verticalScrollOffset: s.verticalScrollOffset,
    selectedTrackID: s.selectedTrackID ? idBox(s.selectedTrackID) : undefined,
    playheadPosition: s.playheadPosition,
    openPluginWindows: s.openPluginWindows.map(encodeOpenPluginWindow)
  });
}

function decodeDAWState(value: unknown, field: string): DAWState {
  const o = value ? obj(value, field) : {};
  const selected = optionalIdUnbox(o.selectedTrackID, `${field}.selectedTrackID`);
  return {
    showVRack: bool(o.showVRack, false),
    showMixer: bool(o.showMixer, false),
    showInspector: bool(o.showInspector, false),
    zoomLevel: num(o.zoomLevel, `${field}.zoomLevel`, 1),
    horizontalScrollOffset: num(o.horizontalScrollOffset, `${field}.horizontalScrollOffset`, 0),
    verticalScrollOffset: num(o.verticalScrollOffset, `${field}.verticalScrollOffset`, 0),
    ...(selected ? { selectedTrackID: selected } : {}),
    playheadPosition: num(o.playheadPosition, `${field}.playheadPosition`, 0),
    openPluginWindows: arr(o.openPluginWindows).map((w, i) =>
      decodeOpenPluginWindow(w, `${field}.openPluginWindows[${i}]`)
    )
  };
}

// --- project ----------------------------------------------------------------

export function encodeProject(p: Project): Json {
  return compact({
    id: uuidForFile(p.id),
    name: p.name,
    createdAt: p.createdAt,
    modifiedAt: p.modifiedAt,
    tempo: { bpm: p.tempo.bpm },
    timeSignature: {
      numerator: p.timeSignature.numerator,
      denominator: p.timeSignature.denominator
    },
    ppq: p.ppq,
    timelineOriginSeconds: p.timelineOriginSeconds,
    tempoChanges: p.tempoChanges.map(encodeTempoChange),
    timeSignatureChanges: p.timeSignatureChanges.map(encodeTimeSignatureChange),
    sampleRate: p.sampleRate,
    tracks: p.tracks.map(encodeTrack),
    masterTrack: encodeTrack(p.masterTrack),
    vRack: encodeVRack(p.vRack),
    fxBuses: encodeFxBuses(p.fxBuses ?? makeFxBuses()),
    markers: p.markers.map(encodeMarker),
    loopRegion: p.loopRegion ? encodeTimeRange(p.loopRegion) : undefined,
    isLoopEnabled: p.isLoopEnabled,
    audioFiles: p.audioFiles.map(encodeAudioFileReference),
    metadata: encodeMetadata(p.metadata),
    dawState: encodeDAWState(p.dawState),
    formatVersion: p.formatVersion
  });
}

export function decodeProject(value: unknown): Project {
  const o = obj(value, 'project');
  const sampleRate = num(o.sampleRate, 'project.sampleRate', 44100);
  const now = new Date().toISOString();

  return {
    id: idUnbox(o.id, 'project.id'),
    name: str(o.name, 'project.name', 'Untitled Project'),
    createdAt: str(o.createdAt, 'project.createdAt', now),
    modifiedAt: str(o.modifiedAt, 'project.modifiedAt', now),
    tempo: { bpm: num(obj(o.tempo, 'project.tempo').bpm, 'project.tempo.bpm', 120) },
    timeSignature: (() => {
      const sig = o.timeSignature ? obj(o.timeSignature, 'project.timeSignature') : {};
      return {
        numerator: num(sig.numerator, 'project.timeSignature.numerator', 4),
        denominator: num(sig.denominator, 'project.timeSignature.denominator', 4)
      };
    })(),
    ppq: clampPpq(num(o.ppq, 'project.ppq', DEFAULT_PPQ)),
    timelineOriginSeconds: Math.max(0, num(o.timelineOriginSeconds, 'project.timelineOriginSeconds', 0)),
    tempoChanges: arr(o.tempoChanges).map((c, i) =>
      decodeTempoChange(c, `project.tempoChanges[${i}]`)
    ),
    timeSignatureChanges: arr(o.timeSignatureChanges).map((c, i) =>
      decodeTimeSignatureChange(c, `project.timeSignatureChanges[${i}]`)
    ),
    sampleRate,
    tracks: arr(o.tracks).map((t, i) => decodeTrack(t, `project.tracks[${i}]`, sampleRate)),
    masterTrack: o.masterTrack
      ? decodeTrack(o.masterTrack, 'project.masterTrack', sampleRate)
      : decodeTrack(
          { id: idBox('00000000-0000-0000-0000-000000000000'), name: 'Master', type: 'master' },
          'project.masterTrack',
          sampleRate
        ),
    vRack: decodeVRack(o.vRack, 'project.vRack'),
    fxBuses: decodeFxBuses(o.fxBuses, 'project.fxBuses'),
    markers: arr(o.markers).map((m, i) => decodeMarker(m, `project.markers[${i}]`)),
    ...(o.loopRegion
      ? { loopRegion: decodeTimeRange(o.loopRegion, 'project.loopRegion', sampleRate) }
      : {}),
    isLoopEnabled: bool(o.isLoopEnabled, false),
    audioFiles: arr(o.audioFiles).map((f, i) =>
      decodeAudioFileReference(f, `project.audioFiles[${i}]`)
    ),
    metadata: decodeMetadata(o.metadata, 'project.metadata'),
    dawState: decodeDAWState(o.dawState, 'project.dawState'),
    formatVersion: num(o.formatVersion, 'project.formatVersion', CURRENT_FORMAT_VERSION)
  };
}

/** Stable key order and 2-space indent, matching Swift's `.sortedKeys`. */
function stableStringify(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  const padInner = '  '.repeat(indent + 1);

  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => `${padInner}${stableStringify(v, indent + 1)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }

  const entries = Object.entries(value as Json)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  if (entries.length === 0) return '{}';

  const body = entries.map(
    ([k, v]) => `${padInner}${JSON.stringify(k)} : ${stableStringify(v, indent + 1)}`
  );
  return `{\n${body.join(',\n')}\n${pad}}`;
}

/**
 * Serializes the full `project.json` envelope, including the audio manifest the
 * 1.0 build uses to relocate files inside the package.
 */
export function encodeProjectFile(project: Project): string {
  const envelope = {
    version: CURRENT_FORMAT_VERSION,
    project: encodeProject(project),
    audioFileManifest: project.audioFiles.map((f) =>
      compact({
        fileID: uuidForFile(f.fileID),
        relativePath: f.relativePath,
        originalPath: f.originalPath,
        checksum: undefined
      })
    ),
    pluginStates: []
  };

  return stableStringify(envelope);
}

/** Accepts the envelope written by either version, or a bare project object. */
export function decodeProjectFile(json: string): ProjectFileEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new ProjectFormatError(`not valid JSON (${(error as Error).message})`);
  }

  const root = obj(parsed, 'root');

  if (root.project) {
    return {
      version: num(root.version, 'version', CURRENT_FORMAT_VERSION),
      project: decodeProject(root.project)
    };
  }

  return { version: CURRENT_FORMAT_VERSION, project: decodeProject(root) };
}

export { ProjectFormatError };
