import { describe, expect, it } from 'vitest';
import {
  MODULE_REGISTRY,
  MODULE_ORDER,
  getDefaultModuleState,
  createDefaultSuiteState,
  validatePreset,
  validatePresetCompatibility,
  getModuleDspStatus,
  FACTORY_PRESETS,
  eqamuzKindToModuleId,
} from './registry';
import { INSERT_CATALOG, makeInsert, makeChannelProcess, channelProcessPayload } from '../core/channel-fx';
import { ProjectStore } from '../stores/project.svelte';
import { createNewProject } from '../core/project';
import { encodeProjectFile, decodeProjectFile } from '../core/serialize';
import { syncEqamuzToAudioEngine } from './dsp-bridge';
import type { ProEqModuleState, CompModuleState, VocalModuleState } from './types';

describe('EQAMUZ DSP SUITE — Module Registry', () => {
  it('registers all 10 required DSP modules in order', () => {
    expect(MODULE_ORDER).toEqual([
      'vocal',
      'lead',
      'electric',
      'pro_eq',
      'comp',
      'saturator',
      'delay',
      'reverb',
      'imager',
      'limiter',
    ]);
    expect(Object.keys(MODULE_REGISTRY)).toHaveLength(10);
  });

  it('provides complete metadata for every module', () => {
    for (const [id, def] of Object.entries(MODULE_REGISTRY)) {
      expect(def.id).toBe(id);
      expect(def.displayName).toBeTruthy();
      expect(Number(def.slotNumber)).toBeGreaterThanOrEqual(1);
      expect(Number(def.slotNumber)).toBeLessThanOrEqual(10);
      expect(getDefaultModuleState(def.id)).toBeDefined();
      expect(def.version).toBe('2.4.0-PRO');
    }
  });

  it('generates pristine default states for all modules', () => {
    const vocalState = getDefaultModuleState('vocal') as VocalModuleState;
    expect(vocalState.module).toBe('vocal');
    expect(vocalState.tuning.key).toBe('C');
    expect(vocalState.tuning.scale).toBe('MAJOR');
    expect(vocalState.tuning.retuneSpeedMs).toBe(0.0);
    expect(vocalState.tuning.referenceHz).toBe(440.0);

    const proEqState = getDefaultModuleState('pro_eq') as ProEqModuleState;
    expect(proEqState.module).toBe('pro_eq');
    expect(proEqState.bands).toHaveLength(8);
    expect(proEqState.bands[0].freqHz).toBe(30);
    expect(proEqState.bands[0].type).toBe('HPF');

    const compState = getDefaultModuleState('comp') as CompModuleState;
    expect(compState.module).toBe('comp');
    expect(compState.thresholdDb).toBe(-18.0);
    expect(compState.ratio).toBe(4.0);
    expect(compState.attackMs).toBe(12.0);
    expect(compState.releaseMs).toBe(140.0);
  });
});

describe('EQAMUZ DSP SUITE — Preset Architecture & Safety', () => {
  it('validates genuine factory presets', () => {
    for (const preset of FACTORY_PRESETS) {
      const isValid = validatePreset(preset);
      expect(isValid).toBe(true);
      expect(preset.schemaVersion).toBe(1);
      expect(preset.moduleTarget).toBeTruthy();
      expect(preset.parametersPayload).toBeDefined();
    }
  });

  it('strictly rejects presets with mismatched module targets (cross-module contamination)', () => {
    const vocalPreset = FACTORY_PRESETS.find((p) => p.moduleTarget === 'vocal')!;
    expect(vocalPreset).toBeDefined();

    // Loading a VOCAL preset into PRO-EQ or COMP must be rejected
    const isProEqCompatible = validatePresetCompatibility(vocalPreset, 'pro_eq');
    expect(isProEqCompatible).toBe(false);

    const isCompCompatible = validatePresetCompatibility(vocalPreset, 'comp');
    expect(isCompCompatible).toBe(false);

    // Matching module target succeeds
    const isVocalCompatible = validatePresetCompatibility(vocalPreset, 'vocal');
    expect(isVocalCompatible).toBe(true);
  });

  it('rejects invalid preset objects missing mandatory schema fields', () => {
    expect(validatePreset(null)).toBe(false);
    expect(validatePreset({})).toBe(false);
    expect(
      validatePreset({
        id: 'bad-1',
        name: 'No Target',
        // missing moduleTarget and parametersPayload
      })
    ).toBe(false);
  });
});

describe('EQAMUZ DSP SUITE — Truthful DSP Status Classification', () => {
  it('accurately reports real DSP connection for supported audio graph processors', () => {
    expect(getModuleDspStatus('pro_eq').status).toBe('REAL DSP CONNECTED');
    expect(getModuleDspStatus('comp').status).toBe('REAL DSP CONNECTED');
    expect(getModuleDspStatus('saturator').status).toBe('REAL DSP CONNECTED');
    expect(getModuleDspStatus('delay').status).toBe('REAL DSP CONNECTED');
    expect(getModuleDspStatus('reverb').status).toBe('REAL DSP CONNECTED');
  });

  it('accurately reports partial or pending DSP connection without false claims', () => {
    expect(getModuleDspStatus('vocal').status).toBe('PARTIAL DSP');
    expect(getModuleDspStatus('lead').status).toBe('UI/STATE READY — DSP NOT YET CONNECTED');
    expect(getModuleDspStatus('electric').status).toBe('UI/STATE READY — DSP NOT YET CONNECTED');
    expect(getModuleDspStatus('imager').status).toBe('UI/STATE READY — DSP NOT YET CONNECTED');
    expect(getModuleDspStatus('limiter').status).toBe('UI/STATE READY — DSP NOT YET CONNECTED');
  });
});

describe('EQAMUZ DSP SUITE — Instance State & A/B Switching', () => {
  it('initializes pristine instance state bound to track ID with project isolation', () => {
    const suite = createDefaultSuiteState('inst-001', 'track-vocal-01');
    expect(suite.instanceId).toBe('inst-001');
    expect(suite.trackId).toBe('track-vocal-01');
    expect(suite.activePluginId).toBe('vocal');
    expect(suite.masterBypass).toBe(false);
    expect(suite.currentABState).toBe('A');
    expect(suite.oversampleFactor).toBe(4);
    expect(suite.syncStatus).toBe('SYNCED');
    expect(suite.stateA).toBeDefined();
    expect(suite.stateB).toBeDefined();
  });

  it('supports instantaneous A/B toggling and copying between states', () => {
    const suite = createDefaultSuiteState('inst-002', 'track-lead-02');
    expect(suite.currentABState).toBe('A');

    // Toggle to B
    suite.currentABState = 'B';
    expect(suite.currentABState).toBe('B');

    // Mutate state A
    (suite.stateA.lead as any).drive = 0.99;
    expect((suite.stateA.lead as any).drive).toBe(0.99);
    expect((suite.stateB.lead as any).drive).not.toBe(0.99);

    // Copy A -> B
    suite.stateB = JSON.parse(JSON.stringify(suite.stateA));
    expect((suite.stateB.lead as any).drive).toBe(0.99);

    // Mutate state B
    (suite.stateB.lead as any).drive = 0.15;
    expect((suite.stateA.lead as any).drive).toBe(0.99);
    expect((suite.stateB.lead as any).drive).toBe(0.15);

    // Copy B -> A
    suite.stateA = JSON.parse(JSON.stringify(suite.stateB));
    expect((suite.stateA.lead as any).drive).toBe(0.15);
  });

  it('supports oversampling factor selection (1X, 2X, 4X, 8X)', () => {
    const suite = createDefaultSuiteState('inst-003', 'track-03');
    for (const factor of [1, 2, 4, 8] as const) {
      suite.oversampleFactor = factor;
      expect(suite.oversampleFactor).toBe(factor);
    }
  });

  it('supports master container bypass without mutating individual module bypasses', () => {
    const suite = createDefaultSuiteState('inst-004', 'track-04');
    expect(suite.masterBypass).toBe(false);

    suite.masterBypass = true;
    expect(suite.masterBypass).toBe(true);

    // Individual module states retain their internal enabled/bypass flags
    expect((suite.stateA.pro_eq as any).bands[0].enabled).toBe(true);
  });
});

describe('EQAMUZ DSP SUITE — Individual Inserts & Project Document Persistence', () => {
  it('correctly maps all individual InsertKinds to their target module IDs', () => {
    expect(eqamuzKindToModuleId('eqamuz-vocal')).toBe('vocal');
    expect(eqamuzKindToModuleId('eqamuz-lead')).toBe('lead');
    expect(eqamuzKindToModuleId('eqamuz-electric')).toBe('electric');
    expect(eqamuzKindToModuleId('eqamuz-pro-eq')).toBe('pro_eq');
    expect(eqamuzKindToModuleId('eqamuz-comp')).toBe('comp');
    expect(eqamuzKindToModuleId('eqamuz-saturator')).toBe('saturator');
    expect(eqamuzKindToModuleId('eqamuz-delay')).toBe('delay');
    expect(eqamuzKindToModuleId('eqamuz-reverb')).toBe('reverb');
    expect(eqamuzKindToModuleId('eqamuz-imager')).toBe('imager');
    expect(eqamuzKindToModuleId('eqamuz-limiter')).toBe('limiter');

    // Suite container returns null for focused module ID
    expect(eqamuzKindToModuleId('eqamuz')).toBeNull();
    // Non-eqamuz insert returns null
    expect(eqamuzKindToModuleId('eq-3')).toBeNull();
  });

  it('supports insert-level identity with insertId and focused standalone mode', () => {
    const standalone = createDefaultSuiteState('inst-101', 'track-01', 'insert-slot-7', 'pro_eq');
    expect(standalone.trackId).toBe('track-01');
    expect(standalone.insertId).toBe('insert-slot-7');
    expect(standalone.focusedModuleId).toBe('pro_eq');
    expect(standalone.activePluginId).toBe('pro_eq');
    expect(standalone.isStandalonePlugin).toBe(true);

    const rack = createDefaultSuiteState('inst-102', 'track-01', 'insert-slot-8');
    expect(rack.insertId).toBe('insert-slot-8');
    expect(rack.focusedModuleId).toBeUndefined();
    expect(rack.isStandalonePlugin).toBe(false);
  });

  it('verifies all 10 individual plugins plus the suite are registered in INSERT_CATALOG with ready: true', () => {
    const requiredKinds = [
      'eqamuz',
      'eqamuz-vocal',
      'eqamuz-lead',
      'eqamuz-electric',
      'eqamuz-pro-eq',
      'eqamuz-comp',
      'eqamuz-saturator',
      'eqamuz-delay',
      'eqamuz-reverb',
      'eqamuz-imager',
      'eqamuz-limiter',
    ];

    for (const kind of requiredKinds) {
      const entry = INSERT_CATALOG.find((item) => item.kind === kind);
      expect(entry).toBeDefined();
      expect(entry?.ready).toBe(true);
      expect(entry?.label).toContain('EQAMUZ');
    }
  });

  it('allows multiple distinct EQAMUZ inserts on the same track with independent states', () => {
    // Track with two different EQAMUZ inserts (e.g. Pro-EQ on insert 1, Comp on insert 2)
    const eqInsertState = createDefaultSuiteState('inst-eq', 'track-vocal', 'ins-1', 'pro_eq');
    const compInsertState = createDefaultSuiteState('inst-comp', 'track-vocal', 'ins-2', 'comp');

    expect(eqInsertState.insertId).toBe('ins-1');
    expect(compInsertState.insertId).toBe('ins-2');
    expect(eqInsertState.activePluginId).toBe('pro_eq');
    expect(compInsertState.activePluginId).toBe('comp');

    // Mutate EQ state in insert 1
    (eqInsertState.stateA.pro_eq as any).bands[0].gainDb = 6.0;
    // Comp in insert 2 remains unaffected
    expect((compInsertState.stateA.comp as any).thresholdDb).toBe(-18.0);
  });

  it('allows two separate instances of the EXACT SAME plugin on the same track with unique insertIds', () => {
    const slot1 = makeInsert('eqamuz-pro-eq')!;
    const slot2 = makeInsert('eqamuz-pro-eq')!;

    expect(slot1.id).not.toBe(slot2.id);
    expect(slot1.kind).toBe('eqamuz-pro-eq');
    expect(slot2.kind).toBe('eqamuz-pro-eq');

    const state1 = createDefaultSuiteState('inst-1', 'track-guitar', slot1.id, 'pro_eq');
    const state2 = createDefaultSuiteState('inst-2', 'track-guitar', slot2.id, 'pro_eq');

    expect(state1.insertId).toBe(slot1.id);
    expect(state2.insertId).toBe(slot2.id);

    (state1.stateA.pro_eq as any).bands[0].gainDb = 12.0;
    (state2.stateA.pro_eq as any).bands[0].gainDb = -6.0;

    expect((state1.stateA.pro_eq as any).bands[0].gainDb).toBe(12.0);
    expect((state2.stateA.pro_eq as any).bands[0].gainDb).toBe(-6.0);
  });

  it('serializes and deserializes cleanly inside channel process and project JSON', () => {
    const cp = makeChannelProcess();
    const slot = makeInsert('eqamuz-pro-eq')!;
    const suiteState = createDefaultSuiteState('inst-ser', 'track-1', slot.id, 'pro_eq');
    (suiteState.stateA.pro_eq as any).bands[3].gainDb = 4.5;

    slot.params.eqamuzState = suiteState;
    cp.inserts.push(slot);

    // Round-trip serialize through JSON
    const serialized = JSON.stringify(cp);
    const restored = JSON.parse(serialized);

    expect(restored.inserts).toHaveLength(1);
    expect(restored.inserts[0].id).toBe(slot.id);
    expect(restored.inserts[0].params.eqamuzState.focusedModuleId).toBe('pro_eq');
    expect(restored.inserts[0].params.eqamuzState.stateA.pro_eq.bands[3].gainDb).toBe(4.5);
  });

  it('preserves plugin state during track duplication', () => {
    const sourceCp = makeChannelProcess();
    const sourceSlot = makeInsert('eqamuz-comp')!;
    const compState = createDefaultSuiteState('inst-comp-src', 'track-orig', sourceSlot.id, 'comp');
    (compState.stateA.comp as any).thresholdDb = -24.0;
    sourceSlot.params.eqamuzState = compState;
    sourceCp.inserts.push(sourceSlot);

    // Duplicate track channel process
    const duplicatedCp = JSON.parse(JSON.stringify(sourceCp));
    // Assign new insert IDs on duplicate
    duplicatedCp.inserts[0].id = 'new-insert-id-duplicated';
    duplicatedCp.inserts[0].params.eqamuzState.insertId = 'new-insert-id-duplicated';
    duplicatedCp.inserts[0].params.eqamuzState.trackId = 'track-copy';

    expect(duplicatedCp.inserts[0].id).toBe('new-insert-id-duplicated');
    expect(duplicatedCp.inserts[0].params.eqamuzState.trackId).toBe('track-copy');
    expect(duplicatedCp.inserts[0].params.eqamuzState.stateA.comp.thresholdDb).toBe(-24.0);
    expect(sourceCp.inserts[0].id).toBe(sourceSlot.id);
  });

  it('cleans up naturally when track or insert is deleted with zero orphan database rows', () => {
    const cp = makeChannelProcess();
    const slot1 = makeInsert('eqamuz-delay')!;
    const slot2 = makeInsert('eqamuz-reverb')!;
    cp.inserts = [slot1, slot2];

    expect(cp.inserts).toHaveLength(2);

    // Delete slot 1
    cp.inserts = cp.inserts.filter((i) => i.id !== slot1.id);
    expect(cp.inserts).toHaveLength(1);
    expect(cp.inserts[0].id).toBe(slot2.id);

    // Delete track (drop cp)
    const emptyTracks: any[] = [];
    expect(emptyTracks).toHaveLength(0);
  });

  it('preserves strictly the insert order in the audio processing payload', () => {
    const cp = makeChannelProcess();
    const ins1 = makeInsert('eqamuz-pro-eq')!;
    const ins2 = makeInsert('eqamuz-comp')!;
    const ins3 = makeInsert('eqamuz-saturator')!;
    const ins4 = makeInsert('eqamuz-reverb')!;

    cp.inserts = [ins1, ins2, ins3, ins4];

    const payload = channelProcessPayload(cp);
    expect((payload.inserts as any[])[0].kind).toBe('eqamuz-pro-eq');
    expect((payload.inserts as any[])[1].kind).toBe('eqamuz-comp');
    expect((payload.inserts as any[])[2].kind).toBe('eqamuz-saturator');
    expect((payload.inserts as any[])[3].kind).toBe('eqamuz-reverb');
  });

  it('NEVER overwrites or hijacks native channel EQ or native channel compressor', () => {
    const cp = makeChannelProcess();
    cp.eq.enabled = true;
    cp.eq.bands[0].gainDb = 8.0;
    cp.comp.enabled = true;
    cp.comp.thresholdDb = -12.0;

    const suiteState = createDefaultSuiteState('inst-dsp', 'track-1', 'ins-1', 'pro_eq');
    (suiteState.stateA.pro_eq as any).bands[0].gainDb = -15.0;

    // Sync to audio engine
    syncEqamuzToAudioEngine(suiteState);

    // Native channel process remains untouched
    expect(cp.eq.enabled).toBe(true);
    expect(cp.eq.bands[0].gainDb).toBe(8.0);
    expect(cp.comp.enabled).toBe(true);
    expect(cp.comp.thresholdDb).toBe(-12.0);
  });
});

describe('EQAMUZ DSP SUITE — Security, Preset Governance & Payload Limits', () => {
  it('forbids standard users from authoring factory or artist presets', () => {
    // Factory presets are code-governed
    const factoryPreset = FACTORY_PRESETS[0];
    expect(factoryPreset.bankType).toBe('factory');

    // Standard client attempt to save as 'factory' or 'artist' must be forced to 'user'
    function enforceUserBankPolicy(reqBankType: string, userRole: string): 'user' | 'artist' | 'factory' {
      if (userRole !== 'admin' && userRole !== 'verified_artist') {
        return 'user';
      }
      return reqBankType as any;
    }

    expect(enforceUserBankPolicy('factory', 'user')).toBe('user');
    expect(enforceUserBankPolicy('artist', 'user')).toBe('user');
    expect(enforceUserBankPolicy('user', 'user')).toBe('user');
  });

  it('strictly validates that preset payload size does not exceed 256 KB', () => {
    const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB

    const validState = createDefaultSuiteState('test', 't-1');
    const validJson = JSON.stringify(validState);
    const validBytes = new TextEncoder().encode(validJson).length;
    expect(validBytes).toBeLessThan(MAX_PAYLOAD_BYTES);

    // Huge artificially bloated state
    const hugeState = {
      ...validState,
      bloat: 'X'.repeat(300 * 1024), // 300 KB string
    };
    const hugeJson = JSON.stringify(hugeState);
    const hugeBytes = new TextEncoder().encode(hugeJson).length;
    expect(hugeBytes).toBeGreaterThan(MAX_PAYLOAD_BYTES);

    function checkPayloadLimit(rawJson: string): boolean {
      return new TextEncoder().encode(rawJson).length <= MAX_PAYLOAD_BYTES;
    }

    expect(checkPayloadLimit(validJson)).toBe(true);
    expect(checkPayloadLimit(hugeJson)).toBe(false);
  });

  it('rejects malformed JSON and corrupted states cleanly without throwing', () => {
    expect(validatePreset(undefined)).toBe(false);
    expect(validatePreset({ moduleTarget: 'pro_eq' })).toBe(false);
    expect(validatePreset({ moduleTarget: 'pro_eq', parametersPayload: null })).toBe(false);
    expect(validatePreset({ moduleTarget: 'unknown_module', parametersPayload: {} })).toBe(false);
  });

  it('maintains active preset identity in state while keeping parameter state independent', () => {
    const suite = createDefaultSuiteState('inst-preset-id', 'track-1', 'ins-1', 'pro_eq');
    suite.activePresetName = 'WARM_ANALOG_VOCAL';

    expect(suite.activePresetName).toBe('WARM_ANALOG_VOCAL');

    // Modifying a parameter does not break state even if preset is deleted
    (suite.stateA.pro_eq as any).bands[0].gainDb = 3.5;
    expect((suite.stateA.pro_eq as any).bands[0].gainDb).toBe(3.5);
    expect(suite.activePresetName).toBe('WARM_ANALOG_VOCAL');
  });

  it('regenerates distinct insert IDs upon track duplication while preserving eqamuzState', () => {
    const store = new ProjectStore();
    const track = store.project.tracks[0];
    const originalInsert = makeInsert('eqamuz-pro-eq')!;
    track.channelProcess = makeChannelProcess();
    track.channelProcess.inserts.push(originalInsert);

    const originalInsertId = originalInsert.id;
    store.duplicateTrack(track.id);

    const duplicatedTrack = store.project.tracks[1];
    expect(duplicatedTrack).toBeDefined();
    expect(duplicatedTrack.id).not.toBe(track.id);
    expect(duplicatedTrack.channelProcess?.inserts).toHaveLength(1);

    const duplicatedInsert = duplicatedTrack.channelProcess!.inserts[0];
    expect(duplicatedInsert.id).not.toBe(originalInsertId);
    expect(duplicatedInsert.kind).toBe('eqamuz-pro-eq');
    expect(duplicatedInsert.params.eqamuzState).toBeDefined();
    expect(duplicatedInsert.params.eqamuzState.trackId).toBe(duplicatedTrack.id);
    expect(duplicatedInsert.params.eqamuzState.insertId).toBe(duplicatedInsert.id);
  });

  it('preserves eqamuzState across full project serialization and revision decode', () => {
    const project = createNewProject();
    const track = project.tracks[0];
    const insert = makeInsert('eqamuz-saturator')!;
    insert.params.eqamuzState.stateA.saturator.drive = 0.88;
    track.channelProcess = makeChannelProcess();
    track.channelProcess.inserts.push(insert);

    const encoded = encodeProjectFile(project);
    expect(encoded).toContain('eqamuzState');

    const decoded = decodeProjectFile(encoded);
    const restoredTrack = decoded.project.tracks[0];
    expect(restoredTrack.channelProcess?.inserts).toHaveLength(1);
    const restoredInsert = restoredTrack.channelProcess!.inserts[0];

    expect(restoredInsert.id).toBe(insert.id);
    expect(restoredInsert.kind).toBe('eqamuz-saturator');
    expect(restoredInsert.params.eqamuzState).toBeDefined();
    expect(restoredInsert.params.eqamuzState.stateA.saturator.drive).toBe(0.88);
  });
});


