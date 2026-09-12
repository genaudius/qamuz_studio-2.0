/**
 * EQAMUZ DSP SUITE v2.4.0-PRO
 * Core Types and Interfaces for Modular Processors, Instance State, and Presets.
 */

export type EQAMUZModuleId =
  | 'vocal'
  | 'lead'
  | 'electric'
  | 'pro_eq'
  | 'comp'
  | 'saturator'
  | 'delay'
  | 'reverb'
  | 'imager'
  | 'limiter';

export type DSPConnectionStatus =
  | 'REAL DSP CONNECTED'
  | 'PARTIAL DSP'
  | 'UI/STATE READY — DSP NOT YET CONNECTED';

export type PresetBankType = 'factory' | 'artist' | 'user';

export type OversampleFactor = 1 | 2 | 4 | 8;

export type SyncStatus = 'SYNCED' | 'SAVING' | 'LOCAL ONLY' | 'OFFLINE' | 'ERROR';

// --- Individual Module State Models ---

export interface VocalModuleState {
  module: 'vocal';
  version: '2.4.0-PRO';
  enabled: boolean;
  tuning: {
    key: string;
    scale: 'CHROMATIC' | 'MAJOR' | 'MINOR' | 'PENTATONIC';
    referenceHz: number;
    mode: 'HARD TUNE' | 'NATURAL' | 'ROBOTIC' | 'GENDER FX';
    retuneSpeedMs: number; // 0.0 - 50.0 ms
    humanizePercent: number; // 0 - 100%
    transitionMs: number;
    correctionRate: number; // 0 - 100%
  };
  toneAndDynamics: {
    formantSemitones: number; // -12.0 to +12.0 ST
    deEsserThresholdDb: number; // -40.0 to 0.0 dB
    deEsserFreqHz: number; // 4000 to 10000 Hz
    airEqGainDb: number; // -6.0 to +12.0 dB
    airEqFreqHz: number; // 12000 to 20000 Hz
    optoCompThresholdDb: number; // -36.0 to 0.0 dB
    optoCompMakeupDb: number; // 0.0 to +18.0 dB
  };
  auxModules: {
    vocalOptoLeveler: boolean;
    harmonizerDoubler: boolean;
    spatialAmbiance: boolean;
  };
}

export interface LeadModuleState {
  module: 'lead';
  version: '2.4.0-PRO';
  enabled: boolean;
  drive: number; // 0.0 - 1.0
  tone: number; // 0.0 - 1.0
  presence: number; // 0.0 - 1.0
  boostDb: number; // 0.0 - 12.0 dB
  soloMode: 'WARM' | 'HOT' | 'CRUNCH' | 'MODERN';
  delayMix: number; // 0.0 - 1.0
  delayTimeMs: number; // 50 - 800 ms
  bypass: boolean;
}

export interface ElectricModuleState {
  module: 'electric';
  version: '2.4.0-PRO';
  enabled: boolean;
  ampModel: 'BRIT 800' | 'CALI DUAL' | 'CLEAN TUBE' | 'FUZZ 68';
  gain: number; // 0.0 - 1.0
  bass: number; // 0.0 - 1.0
  mid: number; // 0.0 - 1.0
  treble: number; // 0.0 - 1.0
  cabSim: boolean;
  noiseGateThresholdDb: number; // -80 to -20 dB
  bypass: boolean;
}

export type ProEqBandType =
  | 'HPF'
  | 'LOW_SHELF'
  | 'BELL'
  | 'BELL_DYNAMIC'
  | 'HIGH_SHELF'
  | 'LPF'
  | 'AIR_BAND';

export interface ProEqBand {
  bandIndex: number;
  type: ProEqBandType;
  freqHz: number;
  gainDb: number;
  q: number;
  enabled: boolean;
  dynamicThresholdDb?: number;
}

export interface ProEqModuleState {
  module: 'pro_eq';
  version: '2.4.0-PRO';
  enabled: boolean;
  processingMode: 'STEREO' | 'MID_SIDE' | 'LINEAR_PHASE';
  spectralUnmask: boolean;
  bands: ProEqBand[];
}

export interface CompModuleState {
  module: 'comp';
  version: '2.4.0-PRO';
  enabled: boolean;
  circuitMode: 'OPTO' | 'VCA' | 'FET' | 'VALVE';
  thresholdDb: number; // -60 to 0 dB
  ratio: number; // 1 to 20
  attackMs: number; // 0.1 to 100 ms
  releaseMs: number; // 10 to 1200 ms
  kneeDb: number; // 0 to 12 dB
  makeupDb: number; // 0 to 24 dB
  mix: number; // 0.0 to 1.0 (parallel compression)
  bypass: boolean;
}

export interface SaturatorModuleState {
  module: 'saturator';
  version: '2.4.0-PRO';
  enabled: boolean;
  characterMode: 'TAPE II' | 'TUBE' | 'TRANSISTOR' | 'DIGITAL CLIP';
  drive: number; // 0.0 - 1.0
  tone: number; // 0.0 - 1.0
  warmth: number; // 0.0 - 1.0
  mix: number; // 0.0 - 1.0
  outputGainDb: number; // -12 to +12 dB
  bypass: boolean;
}

export interface DelayModuleState {
  module: 'delay';
  version: '2.4.0-PRO';
  enabled: boolean;
  timeMs: number; // 10 to 2000 ms
  sync: boolean;
  division: '1/4' | '1/8' | '1/8D' | '1/16' | '1/2';
  feedback: number; // 0.0 - 0.95
  mix: number; // 0.0 - 1.0
  filterHz: number; // 500 to 15000 Hz
  mode: 'STEREO' | 'PING_PONG' | 'DUAL_MONO';
  bypass: boolean;
}

export interface ReverbModuleState {
  module: 'reverb';
  version: '2.4.0-PRO';
  enabled: boolean;
  algorithm: 'CONCERT' | 'PLATE' | 'CHAMBER' | 'ROOM' | 'SHIMMER';
  preDelayMs: number; // 0 to 200 ms
  decaySec: number; // 0.2 to 12.0 s
  size: number; // 0.0 - 1.0
  damping: number; // 0.0 - 1.0
  lowCutHz: number; // 20 to 1000 Hz
  highCutHz: number; // 1000 to 18000 Hz
  width: number; // 0.0 - 1.5
  mix: number; // 0.0 - 1.0
  bypass: boolean;
}

export interface ImagerModuleState {
  module: 'imager';
  version: '2.4.0-PRO';
  enabled: boolean;
  widthPercent: number; // 0 to 200%
  balance: number; // -1.0 to +1.0
  monoBass: boolean;
  crossoverHz: number; // 80 to 300 Hz
  bypass: boolean;
}

export interface LimiterModuleState {
  module: 'limiter';
  version: '2.4.0-PRO';
  enabled: boolean;
  inputGainDb: number; // 0 to 18 dB
  ceilingDb: number; // -6.0 to 0.0 dBTP
  releaseMs: number; // 5 to 500 ms
  truePeak: boolean;
  lookaheadMs: number; // 0.0 to 5.0 ms
  mode: 'TRANSPARENT' | 'AGGRESSIVE' | 'WARM';
  bypass: boolean;
}

export type AnyModuleState =
  | VocalModuleState
  | LeadModuleState
  | ElectricModuleState
  | ProEqModuleState
  | CompModuleState
  | SaturatorModuleState
  | DelayModuleState
  | ReverbModuleState
  | ImagerModuleState
  | LimiterModuleState;

export interface ModuleStateMap {
  vocal: VocalModuleState;
  lead: LeadModuleState;
  electric: ElectricModuleState;
  pro_eq: ProEqModuleState;
  comp: CompModuleState;
  saturator: SaturatorModuleState;
  delay: DelayModuleState;
  reverb: ReverbModuleState;
  imager: ImagerModuleState;
  limiter: LimiterModuleState;
}

// --- Suite Host Container Model ---

export interface EQAMUZSuiteState {
  instanceId: string;
  trackId: string;
  insertId?: string;
  version: '2.4.0-PRO';
  activePluginId: EQAMUZModuleId;
  focusedModuleId?: EQAMUZModuleId;
  isStandalonePlugin?: boolean;
  activePresetName?: string;
  masterBypass: boolean;
  currentABState: 'A' | 'B';
  oversampleFactor: OversampleFactor;
  stateA: ModuleStateMap;
  stateB: ModuleStateMap;
  syncStatus: SyncStatus;
  lastModified: string;
}

// --- Presets Model ---

export interface EQAMUZPreset<T = Record<string, any>> {
  id: string;
  moduleTarget: EQAMUZModuleId;
  presetName: string;
  bankType: PresetBankType;
  author: string;
  tags: string[];
  parametersPayload: T;
  isFavorite: boolean;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

// --- Telemetry Model ---

export interface EQAMUZTelemetry {
  inPeakLeftDb: number;
  inPeakRightDb: number;
  outPeakLeftDb: number;
  outPeakRightDb: number;
  sampleRate: number;
  bufferLatencyMs: number;
  cpuLoadPercent: number | null;
  gainReductionDb?: number;
}
