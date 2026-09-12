/**
 * EQAMUZ DSP SUITE v2.4.0-PRO
 * Modular Plugin Registry & Default State Definitions
 */

import type {
  CompModuleState,
  DelayModuleState,
  DSPConnectionStatus,
  ElectricModuleState,
  EQAMUZModuleId,
  EQAMUZPreset,
  EQAMUZSuiteState,
  ImagerModuleState,
  LeadModuleState,
  LimiterModuleState,
  ModuleStateMap,
  ProEqBand,
  ProEqModuleState,
  ReverbModuleState,
  SaturatorModuleState,
  VocalModuleState
} from './types';

export interface EQAMUZModuleMetadata {
  id: EQAMUZModuleId;
  slotNumber: string;
  slotLabel: string;
  displayName: string;
  subtitle: string;
  category: 'Vocal' | 'Guitar' | 'Dynamics' | 'Spectral' | 'Time & Space' | 'Mastering';
  version: string;
  dspStatus: DSPConnectionStatus;
  telemetryCapability: string[];
}

export const MODULE_ORDER: EQAMUZModuleId[] = [
  'vocal',
  'lead',
  'electric',
  'pro_eq',
  'comp',
  'saturator',
  'delay',
  'reverb',
  'imager',
  'limiter'
];

export const MODULE_REGISTRY: Record<EQAMUZModuleId, EQAMUZModuleMetadata> = {
  vocal: {
    id: 'vocal',
    slotNumber: '01',
    slotLabel: '01. VOCAL',
    displayName: '01 // EQAMUZ VOCAL',
    subtitle: 'Tuning & Pitch Suite',
    category: 'Vocal',
    version: '2.4.0-PRO',
    dspStatus: 'PARTIAL DSP',
    telemetryCapability: ['pitch-detect', 'cents-deviation', 'gain-reduction']
  },
  lead: {
    id: 'lead',
    slotNumber: '02',
    slotLabel: '02. LEAD',
    displayName: '02 // EQAMUZ LEAD',
    subtitle: 'Solo Guitar Suite',
    category: 'Guitar',
    version: '2.4.0-PRO',
    dspStatus: 'UI/STATE READY — DSP NOT YET CONNECTED',
    telemetryCapability: ['boost-level', 'saturation-harmonics']
  },
  electric: {
    id: 'electric',
    slotNumber: '03',
    slotLabel: '03. ELECTRIC',
    displayName: '03 // EQAMUZ ELECTRIC',
    subtitle: 'Distortion & Amp Rig',
    category: 'Guitar',
    version: '2.4.0-PRO',
    dspStatus: 'UI/STATE READY — DSP NOT YET CONNECTED',
    telemetryCapability: ['noise-gate-activity', 'cabinet-resonance']
  },
  pro_eq: {
    id: 'pro_eq',
    slotNumber: '04',
    slotLabel: '04. PRO-EQ',
    displayName: '04 // EQAMUZ PRO-EQ',
    subtitle: '8-Band Dynamic EQ',
    category: 'Spectral',
    version: '2.4.0-PRO',
    dspStatus: 'REAL DSP CONNECTED',
    telemetryCapability: ['realtime-fft', 'band-curves', 'gain-reduction']
  },
  comp: {
    id: 'comp',
    slotNumber: '05',
    slotLabel: '05. COMP',
    displayName: '05 // EQAMUZ COMP',
    subtitle: 'Opto/VCA Studio Comp',
    category: 'Dynamics',
    version: '2.4.0-PRO',
    dspStatus: 'REAL DSP CONNECTED',
    telemetryCapability: ['gain-reduction', 'input-peak', 'output-peak']
  },
  saturator: {
    id: 'saturator',
    slotNumber: '06',
    slotLabel: '06. SATURATOR',
    displayName: '06 // EQAMUZ SATURATOR',
    subtitle: 'Harmonic Drive & Tape',
    category: 'Dynamics',
    version: '2.4.0-PRO',
    dspStatus: 'REAL DSP CONNECTED',
    telemetryCapability: ['thd-estimate', 'saturation-curve']
  },
  delay: {
    id: 'delay',
    slotNumber: '07',
    slotLabel: '07. DELAY',
    displayName: '07 // EQAMUZ DELAY',
    subtitle: 'Stereo Echo Matrix',
    category: 'Time & Space',
    version: '2.4.0-PRO',
    dspStatus: 'REAL DSP CONNECTED',
    telemetryCapability: ['delay-tap-sync', 'feedback-loop']
  },
  reverb: {
    id: 'reverb',
    slotNumber: '08',
    slotLabel: '08. REVERB',
    displayName: '08 // EQAMUZ REVERB',
    subtitle: 'Spatial Decay Chamber',
    category: 'Time & Space',
    version: '2.4.0-PRO',
    dspStatus: 'REAL DSP CONNECTED',
    telemetryCapability: ['rt60-decay', 'damping-response']
  },
  imager: {
    id: 'imager',
    slotNumber: '09',
    slotLabel: '09. IMAGER',
    displayName: '09 // EQAMUZ IMAGER',
    subtitle: 'Stereo Field & Vectorscope',
    category: 'Spectral',
    version: '2.4.0-PRO',
    dspStatus: 'UI/STATE READY — DSP NOT YET CONNECTED',
    telemetryCapability: ['correlation-meter', 'stereo-width']
  },
  limiter: {
    id: 'limiter',
    slotNumber: '10',
    slotLabel: '10. LIMITER',
    displayName: '10 // EQAMUZ LIMITER',
    subtitle: 'True Peak Brickwall',
    category: 'Mastering',
    version: '2.4.0-PRO',
    dspStatus: 'UI/STATE READY — DSP NOT YET CONNECTED',
    telemetryCapability: ['true-peak', 'lufs-momentary', 'gain-reduction']
  }
};

export function getAllModules(): EQAMUZModuleMetadata[] {
  return Object.values(MODULE_REGISTRY);
}

export function getModuleDefinition(id: EQAMUZModuleId): EQAMUZModuleMetadata {
  const mod = MODULE_REGISTRY[id];
  if (!mod) throw new Error(`Unknown EQAMUZ module: ${id}`);
  return mod;
}

// --- Default States for Every Module ---

export function createDefaultVocalState(): VocalModuleState {
  return {
    module: 'vocal',
    version: '2.4.0-PRO',
    enabled: true,
    tuning: {
      key: 'C',
      scale: 'MAJOR',
      referenceHz: 440.0,
      mode: 'HARD TUNE',
      retuneSpeedMs: 0.0,
      humanizePercent: 0,
      transitionMs: 1.0,
      correctionRate: 100
    },
    toneAndDynamics: {
      formantSemitones: 1.2,
      deEsserThresholdDb: -14.5,
      deEsserFreqHz: 6800,
      airEqGainDb: 3.5,
      airEqFreqHz: 16000,
      optoCompThresholdDb: -18.0,
      optoCompMakeupDb: 4.2
    },
    auxModules: {
      vocalOptoLeveler: true,
      harmonizerDoubler: true,
      spatialAmbiance: true
    }
  };
}

export function createDefaultLeadState(): LeadModuleState {
  return {
    module: 'lead',
    version: '2.4.0-PRO',
    enabled: true,
    drive: 0.35,
    tone: 0.55,
    presence: 0.5,
    boostDb: 0.0,
    soloMode: 'WARM',
    delayMix: 0.15,
    delayTimeMs: 280,
    bypass: false
  };
}

export function createDefaultElectricState(): ElectricModuleState {
  return {
    module: 'electric',
    version: '2.4.0-PRO',
    enabled: true,
    ampModel: 'BRIT 800',
    gain: 0.4,
    bass: 0.5,
    mid: 0.5,
    treble: 0.5,
    cabSim: true,
    noiseGateThresholdDb: -60,
    bypass: false
  };
}

export function createDefaultProEqBands(): ProEqBand[] {
  return [
    { bandIndex: 0, type: 'HPF', freqHz: 30, gainDb: 0.0, q: 0.7, enabled: true },
    { bandIndex: 1, type: 'LOW_SHELF', freqHz: 100, gainDb: 0.0, q: 0.7, enabled: true },
    { bandIndex: 2, type: 'BELL', freqHz: 250, gainDb: 0.0, q: 1.4, enabled: true },
    { bandIndex: 3, type: 'BELL', freqHz: 800, gainDb: 0.0, q: 1.0, enabled: true },
    { bandIndex: 4, type: 'BELL', freqHz: 2500, gainDb: 0.0, q: 1.2, enabled: true },
    { bandIndex: 5, type: 'BELL_DYNAMIC', freqHz: 4500, gainDb: 0.0, q: 2.0, enabled: true, dynamicThresholdDb: -18 },
    { bandIndex: 6, type: 'HIGH_SHELF', freqHz: 9000, gainDb: 0.0, q: 0.7, enabled: true },
    { bandIndex: 7, type: 'LPF', freqHz: 19000, gainDb: 0.0, q: 0.7, enabled: true }
  ];
}

export function createDefaultProEqState(): ProEqModuleState {
  return {
    module: 'pro_eq',
    version: '2.4.0-PRO',
    enabled: true,
    processingMode: 'STEREO',
    spectralUnmask: false,
    bands: createDefaultProEqBands()
  };
}

export function createDefaultCompState(): CompModuleState {
  return {
    module: 'comp',
    version: '2.4.0-PRO',
    enabled: true,
    circuitMode: 'OPTO',
    thresholdDb: -18.0,
    ratio: 4.0,
    attackMs: 12.0,
    releaseMs: 140.0,
    kneeDb: 4.0,
    makeupDb: 0.0,
    mix: 1.0,
    bypass: false
  };
}

export function createDefaultSaturatorState(): SaturatorModuleState {
  return {
    module: 'saturator',
    version: '2.4.0-PRO',
    enabled: true,
    characterMode: 'TAPE II',
    drive: 0.2,
    tone: 0.5,
    warmth: 0.5,
    mix: 0.7,
    outputGainDb: 0.0,
    bypass: false
  };
}

export function createDefaultDelayState(): DelayModuleState {
  return {
    module: 'delay',
    version: '2.4.0-PRO',
    enabled: true,
    timeMs: 320,
    sync: true,
    division: '1/8D',
    feedback: 0.3,
    mix: 0.2,
    filterHz: 5000,
    mode: 'STEREO',
    bypass: false
  };
}

export function createDefaultReverbState(): ReverbModuleState {
  return {
    module: 'reverb',
    version: '2.4.0-PRO',
    enabled: true,
    algorithm: 'CONCERT',
    preDelayMs: 15,
    decaySec: 1.8,
    size: 0.5,
    damping: 0.4,
    lowCutHz: 100,
    highCutHz: 10000,
    width: 1.0,
    mix: 0.18,
    bypass: false
  };
}

export function createDefaultImagerState(): ImagerModuleState {
  return {
    module: 'imager',
    version: '2.4.0-PRO',
    enabled: true,
    widthPercent: 115,
    balance: 0.0,
    monoBass: true,
    crossoverHz: 120,
    bypass: false
  };
}

export function createDefaultLimiterState(): LimiterModuleState {
  return {
    module: 'limiter',
    version: '2.4.0-PRO',
    enabled: true,
    inputGainDb: 0.0,
    ceilingDb: -0.2,
    releaseMs: 40,
    truePeak: true,
    lookaheadMs: 1.5,
    mode: 'TRANSPARENT',
    bypass: false
  };
}

export function createDefaultModuleStateMap(): ModuleStateMap {
  return {
    vocal: createDefaultVocalState(),
    lead: createDefaultLeadState(),
    electric: createDefaultElectricState(),
    pro_eq: createDefaultProEqState(),
    comp: createDefaultCompState(),
    saturator: createDefaultSaturatorState(),
    delay: createDefaultDelayState(),
    reverb: createDefaultReverbState(),
    imager: createDefaultImagerState(),
    limiter: createDefaultLimiterState()
  };
}

export function eqamuzKindToModuleId(kind: string): EQAMUZModuleId | null {
  switch (kind) {
    case 'eqamuz-vocal': return 'vocal';
    case 'eqamuz-lead': return 'lead';
    case 'eqamuz-electric': return 'electric';
    case 'eqamuz-pro-eq': return 'pro_eq';
    case 'eqamuz-comp': return 'comp';
    case 'eqamuz-saturator': return 'saturator';
    case 'eqamuz-delay': return 'delay';
    case 'eqamuz-reverb': return 'reverb';
    case 'eqamuz-imager': return 'imager';
    case 'eqamuz-limiter': return 'limiter';
    default: return null;
  }
}

export function createDefaultSuiteState(
  instanceId: string,
  trackId: string,
  insertId?: string,
  focusedModuleId?: EQAMUZModuleId
): EQAMUZSuiteState {
  const activePluginId = focusedModuleId || 'vocal';
  return {
    instanceId,
    trackId,
    insertId,
    version: '2.4.0-PRO',
    activePluginId,
    focusedModuleId,
    isStandalonePlugin: Boolean(focusedModuleId),
    activePresetName: undefined,
    masterBypass: false,
    currentABState: 'A',
    oversampleFactor: 4,
    stateA: createDefaultModuleStateMap(),
    stateB: createDefaultModuleStateMap(),
    syncStatus: 'SYNCED',
    lastModified: new Date().toISOString()
  };
}

// --- Validation Functions ---

export function getDefaultModuleState(id: EQAMUZModuleId) {
  const map = createDefaultModuleStateMap();
  return map[id];
}

export function validatePresetCompatibility(preset: EQAMUZPreset, target: EQAMUZModuleId): boolean {
  if (!preset || !preset.moduleTarget) return false;
  return preset.moduleTarget === target;
}

export function getModuleDspStatus(id: EQAMUZModuleId): { status: DSPConnectionStatus; notes: string } {
  const def = MODULE_REGISTRY[id];
  if (!def) {
    return { status: 'UI/STATE READY — DSP NOT YET CONNECTED', notes: 'Unknown module' };
  }
  let notes = '';
  switch (id) {
    case 'pro_eq':
      notes = 'WebAudio BiquadFilterNode 8-band dynamic parametric EQ graph';
      break;
    case 'comp':
      notes = 'WebAudio DynamicsCompressorNode with studio opto/VCA ballistics';
      break;
    case 'saturator':
      notes = 'WebAudio WaveShaperNode tape/tube harmonic transfer function';
      break;
    case 'delay':
      notes = 'WebAudio DelayNode with stereo matrix and filtered feedback loop';
      break;
    case 'reverb':
      notes = 'WebAudio ConvolverNode & feedback delay decay network';
      break;
    case 'vocal':
      notes = 'WebAudio tone/gain leveler connected; Pitch detection HUD in real-time UI/state mode';
      break;
    default:
      notes = 'UI and state fully initialized; audio processor pending backend expansion';
  }
  return { status: def.dspStatus, notes };
}

export function validateModuleState(id: EQAMUZModuleId, state: unknown): boolean {
  if (!state || typeof state !== 'object') return false;
  const s = state as Record<string, unknown>;
  return s.module === id && s.version === '2.4.0-PRO';
}

export function validatePreset(preset: unknown): preset is EQAMUZPreset {
  if (!preset || typeof preset !== 'object') return false;
  const p = preset as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id) return false;
  if (typeof p.moduleTarget !== 'string' || !(p.moduleTarget in MODULE_REGISTRY)) return false;
  if (typeof p.presetName !== 'string' || !p.presetName) return false;
  if (!['factory', 'artist', 'user'].includes(String(p.bankType))) return false;
  if (!p.parametersPayload || typeof p.parametersPayload !== 'object') return false;
  return true;
}

// --- Factory Built-in Presets ---

export const FACTORY_PRESETS: EQAMUZPreset[] = [
  {
    id: 'fact-vocal-01',
    moduleTarget: 'vocal',
    presetName: 'MODERN_POP_LEAD_TUNE',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Pop', 'Lead', 'Fast Pitch', 'Air EQ'],
    parametersPayload: createDefaultVocalState(),
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-vocal-02',
    moduleTarget: 'vocal',
    presetName: 'TRAP_HARD_PITCH_100',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Trap', 'Hard Tune', 'Robotic'],
    parametersPayload: {
      ...createDefaultVocalState(),
      tuning: {
        ...createDefaultVocalState().tuning,
        retuneSpeedMs: 0.0,
        mode: 'HARD TUNE',
        correctionRate: 100
      }
    },
    isFavorite: false,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-vocal-03',
    moduleTarget: 'vocal',
    presetName: 'SMOOTH_R&B_NATURAL_WARMTH',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['R&B', 'Natural', 'Humanize'],
    parametersPayload: {
      ...createDefaultVocalState(),
      tuning: {
        ...createDefaultVocalState().tuning,
        mode: 'NATURAL',
        retuneSpeedMs: 18.0,
        humanizePercent: 65,
        correctionRate: 75
      }
    },
    isFavorite: false,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'art-vocal-01',
    moduleTarget: 'vocal',
    presetName: 'GENDER_VOCODER_OCTAVE',
    bankType: 'artist',
    author: 'Maestro Pro',
    tags: ['Formant', 'Gender FX', 'Harmonizer'],
    parametersPayload: {
      ...createDefaultVocalState(),
      tuning: { ...createDefaultVocalState().tuning, mode: 'GENDER FX' },
      toneAndDynamics: { ...createDefaultVocalState().toneAndDynamics, formantSemitones: -3.5 }
    },
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-pro-eq-01',
    moduleTarget: 'pro_eq',
    presetName: 'SAFE_FLAT_RESET',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Safe', 'Flat', 'Neutral'],
    parametersPayload: createDefaultProEqState(),
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-pro-eq-02',
    moduleTarget: 'pro_eq',
    presetName: 'VOCAL_AIR_&_WARMTH',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Vocal', 'Air', 'Warmth'],
    parametersPayload: {
      ...createDefaultProEqState(),
      bands: [
        { bandIndex: 0, type: 'HPF', freqHz: 80, gainDb: 0, q: 0.7, enabled: true },
        { bandIndex: 1, type: 'LOW_SHELF', freqHz: 120, gainDb: 1.0, q: 0.7, enabled: true },
        { bandIndex: 2, type: 'BELL', freqHz: 350, gainDb: -1.0, q: 1.4, enabled: true },
        { bandIndex: 3, type: 'BELL', freqHz: 1200, gainDb: 0.0, q: 1.0, enabled: true },
        { bandIndex: 4, type: 'BELL', freqHz: 3200, gainDb: 1.5, q: 1.2, enabled: true },
        { bandIndex: 5, type: 'BELL_DYNAMIC', freqHz: 5500, gainDb: -1.0, q: 2.0, enabled: true, dynamicThresholdDb: -16 },
        { bandIndex: 6, type: 'HIGH_SHELF', freqHz: 10000, gainDb: 2.0, q: 0.7, enabled: true },
        { bandIndex: 7, type: 'LPF', freqHz: 19000, gainDb: 0, q: 0.7, enabled: true }
      ]
    },
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-pro-eq-03',
    moduleTarget: 'pro_eq',
    presetName: 'BASS_TIGHT_CLEANUP',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Bass', 'Low End', 'Punch'],
    parametersPayload: {
      ...createDefaultProEqState(),
      bands: [
        { bandIndex: 0, type: 'HPF', freqHz: 32, gainDb: 0, q: 0.7, enabled: true },
        { bandIndex: 1, type: 'LOW_SHELF', freqHz: 65, gainDb: 2.0, q: 0.8, enabled: true },
        { bandIndex: 2, type: 'BELL', freqHz: 220, gainDb: -2.0, q: 1.6, enabled: true },
        { bandIndex: 3, type: 'BELL', freqHz: 800, gainDb: 1.0, q: 1.2, enabled: true },
        { bandIndex: 4, type: 'BELL', freqHz: 2200, gainDb: 0.5, q: 1.0, enabled: true },
        { bandIndex: 5, type: 'BELL_DYNAMIC', freqHz: 4000, gainDb: 0.0, q: 1.0, enabled: false },
        { bandIndex: 6, type: 'HIGH_SHELF', freqHz: 8000, gainDb: -3.0, q: 0.7, enabled: true },
        { bandIndex: 7, type: 'LPF', freqHz: 16000, gainDb: 0, q: 0.7, enabled: true }
      ]
    },
    isFavorite: false,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-comp-01',
    moduleTarget: 'comp',
    presetName: 'SAFE_TRANSPARENT_GLUE',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Safe', 'Glue', 'Transparent'],
    parametersPayload: createDefaultCompState(),
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-comp-02',
    moduleTarget: 'comp',
    presetName: 'OPTO_VOCAL_LEVELER',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Vocal', 'Opto', 'Warm'],
    parametersPayload: {
      ...createDefaultCompState(),
      circuitMode: 'OPTO',
      thresholdDb: -16.0,
      ratio: 3.2,
      attackMs: 20.0,
      releaseMs: 160.0,
      makeupDb: 1.0
    },
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-comp-03',
    moduleTarget: 'comp',
    presetName: 'VCA_DRUM_PUNCH',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Drums', 'VCA', 'Punch'],
    parametersPayload: {
      ...createDefaultCompState(),
      circuitMode: 'VCA',
      thresholdDb: -12.0,
      ratio: 4.0,
      attackMs: 30.0,
      releaseMs: 80.0,
      makeupDb: 0.5
    },
    isFavorite: false,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-sat-01',
    moduleTarget: 'saturator',
    presetName: 'SUBTLE_TAPE_WARMTH',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Tape', 'Warmth', 'Safe'],
    parametersPayload: createDefaultSaturatorState(),
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-sat-02',
    moduleTarget: 'saturator',
    presetName: 'TUBE_CONSOLE_DRIVE',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Tube', 'Console', 'Harmonics'],
    parametersPayload: {
      ...createDefaultSaturatorState(),
      characterMode: 'TUBE 12AX7',
      drive: 0.38,
      warmth: 0.7,
      mix: 0.8
    },
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-delay-01',
    moduleTarget: 'delay',
    presetName: 'STEREO_DOTTED_8TH',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Stereo', 'Dotted 8th', 'Space'],
    parametersPayload: createDefaultDelayState(),
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-delay-02',
    moduleTarget: 'delay',
    presetName: 'VINTAGE_SLAPBACK',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Slapback', 'Vintage', 'Vocals'],
    parametersPayload: {
      ...createDefaultDelayState(),
      sync: false,
      timeMs: 110,
      feedback: 0.12,
      mix: 0.22,
      filterHz: 3500
    },
    isFavorite: false,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-rev-01',
    moduleTarget: 'reverb',
    presetName: 'NATURAL_ROOM_AMBIENCE',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Room', 'Natural', 'Short'],
    parametersPayload: createDefaultReverbState(),
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-rev-02',
    moduleTarget: 'reverb',
    presetName: 'LUSH_VOCAL_PLATE',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Plate', 'Vocal', 'Silk'],
    parametersPayload: {
      ...createDefaultReverbState(),
      algorithm: 'PLATE',
      preDelayMs: 25,
      decaySec: 2.5,
      lowCutHz: 150,
      highCutHz: 8000,
      mix: 0.22
    },
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-img-01',
    moduleTarget: 'imager',
    presetName: 'NATURAL_STEREO_SPREAD',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Stereo', 'Natural', 'Mono Bass'],
    parametersPayload: createDefaultImagerState(),
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-lim-01',
    moduleTarget: 'limiter',
    presetName: 'SAFE_TRANSPARENT_CEILING',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Safe', 'Transparent', 'TruePeak'],
    parametersPayload: createDefaultLimiterState(),
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-lead-01',
    moduleTarget: 'lead',
    presetName: 'CLEAN_SOLO_WARMTH',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Lead', 'Clean', 'Presence'],
    parametersPayload: createDefaultLeadState(),
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'fact-elec-01',
    moduleTarget: 'electric',
    presetName: 'CLEAN_CHIME_TUBE',
    bankType: 'factory',
    author: 'EQAMUZ DSP',
    tags: ['Electric', 'Clean', 'CabSim'],
    parametersPayload: createDefaultElectricState(),
    isFavorite: true,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
];
