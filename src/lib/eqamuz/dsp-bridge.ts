/**
 * EQAMUZ DSP SUITE v2.4.0-PRO
 * Real-time DSP Audio Engine Bridge
 *
 * Bridges the EQAMUZ state model with the active WebAudio/AudioWorklet graph.
 * Honors strict safety rules:
 * - No DB or network I/O on the audio thread
 * - No fake live DSP claims: clearly reports connection tier
 * - Smooth parameter dispatch to the DAW engine backend
 */

import { engine, projectStore } from '$lib/stores';
import { channelProcessPayload, type ChannelProcess } from '$lib/core/channel-fx';
import type {
  DSPConnectionStatus,
  EQAMUZModuleId,
  EQAMUZSuiteState
} from './types';

export interface ModuleDSPReport {
  id: EQAMUZModuleId;
  status: DSPConnectionStatus;
  details: string;
}

export const MODULE_DSP_STATUS_REPORT: Record<EQAMUZModuleId, ModuleDSPReport> = {
  pro_eq: {
    id: 'pro_eq',
    status: 'REAL DSP CONNECTED',
    details: 'Live 8-band biquad parametric EQ filter bank connected to Web Audio worklet.'
  },
  comp: {
    id: 'comp',
    status: 'REAL DSP CONNECTED',
    details: 'Envelope-follower dynamics compressor with attack/release, ratio, threshold and makeup.'
  },
  saturator: {
    id: 'saturator',
    status: 'REAL DSP CONNECTED',
    details: 'Non-linear harmonic drive (tanh saturation & tube curves) running in AudioWorklet.'
  },
  delay: {
    id: 'delay',
    status: 'REAL DSP CONNECTED',
    details: 'Stereo delay lines with beat sync subdivision, feedback loop and dampening filter.'
  },
  reverb: {
    id: 'reverb',
    status: 'REAL DSP CONNECTED',
    details: 'Algorithmic spatial decay chamber with size, decay, damping and mix controls.'
  },
  vocal: {
    id: 'vocal',
    status: 'PARTIAL DSP',
    details: 'Tone, De-Esser and Opto compressor connected to real DSP; chromatic pitch-shifting engine UI/state ready.'
  },
  lead: {
    id: 'lead',
    status: 'PARTIAL DSP',
    details: 'Lead boost and saturation drive connected; guitar amp emulation UI/state ready.'
  },
  electric: {
    id: 'electric',
    status: 'PARTIAL DSP',
    details: 'Distortion drive and pre-gain connected; cabinet impulse convolution UI/state ready.'
  },
  imager: {
    id: 'imager',
    status: 'PARTIAL DSP',
    details: 'Stereo pan/balance and Mid/Side listening connected; multiband phase expansion UI/state ready.'
  },
  limiter: {
    id: 'limiter',
    status: 'PARTIAL DSP',
    details: 'Brickwall ceiling threshold connected via high-ratio compressor; true-peak oversampled lookahead UI/state ready.'
  }
};

/**
 * Dispatches active EQAMUZ parameters to the specific target insert slot on the track.
 * This guarantees the EQAMUZ state is stored cleanly within the project document
 * and does NOT hijack or overwrite the channel's native EQ and Compressor.
 */
export function syncEqamuzToAudioEngine(suite: EQAMUZSuiteState): void {
  const trackId = suite.trackId;
  if (!trackId) return;

  try {
    let currentCp: ChannelProcess | null = null;
    projectStore.updateChannelProcess(trackId, (cp: ChannelProcess) => {
      // Find the specific insert slot if insertId is known, or find matching eqamuz slot
      let slot = suite.insertId ? cp.inserts.find((i) => i.id === suite.insertId) : null;
      if (!slot) {
        slot = cp.inserts.find((i) => i.kind === 'eqamuz' || i.kind.startsWith('eqamuz-'));
      }
      if (slot) {
        slot.enabled = !suite.masterBypass;
        // Embed the full suite state in slot.params for native project revision persistence
        slot.params = {
          ...slot.params,
          bypass: suite.masterBypass ? 1 : 0,
          currentAB: suite.currentABState,
          activeModule: suite.activePluginId,
          oversampleFactor: suite.oversampleFactor,
          eqamuzState: JSON.parse(JSON.stringify(suite))
        };
      }
      currentCp = cp;
    });

    // Zero-latency immediate audio thread dispatch
    if (currentCp && engine.backend) {
      engine.backend.setTrackChannelProcess(trackId, channelProcessPayload(currentCp));
    }
  } catch (err) {
    console.warn('[EQAMUZ DSP Bridge] Failed to sync parameters:', err);
  }
}
