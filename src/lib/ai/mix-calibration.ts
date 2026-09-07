/**
 * Intelligent-mix role recipes calibrated from a real Limbus Studio AutoMix
 * on a bachata-style multitrack (17 stems: BASS DANNY G, bombo, DUO, GUIRA, …).
 *
 * Observed Limbus Assistant flow (v3.0.69):
 * 1. Confirm tempo (Detectar / Mezclar con BPM / Cancelar)
 * 2. Refuse if no audio: “No encuentro pistas…”
 * 3. AutoMix: gain staging + selective PROCESS; offline clip scan (e.g. 0:17, 0:58, 3:17)
 * 4. Second pass — transient criterion: protect kick/bombo from global level drops
 *    (“el pico no equivale a volumen percibido”)
 *
 * Measured PROCESS after AutoMix (2026-03 session):
 * - BASS: EQ ON — B1 60 Hz / 0 dB, B2 850 Hz / +0.8 dB, B3 1 kHz / 0,
 *   B4 4 kHz / 0, B5 12 kHz / 0; COMP thr -18, ratio 3, atk 10 ms, rel 100 ms, makeup 0
 * - bombo (protected): EQ OFF; COMP thr 0 (no GR), ratio 4, atk 5 ms, rel 50 ms
 * - DUO: EQ OFF; COMP thr 0, ratio 4, atk 5 ms, rel 50 ms (levels mainly)
 *
 * Qamuz still writes role EQ/comp on intelligent mix (user asked for EQ+comp),
 * but magnitudes track these Limbus defaults / protections.
 */
export const LIMBUS_CALIBRATION_NOTES = {
  session: {
    tracks: 17,
    bpmConfirm: true,
    clipScanOffline: true,
    transientProtectKick: true
  },
  lead_vocal: {
    eq: 'HPF ~80, cut 250 mud, +2–3k presence, +air shelf (Limbus left DUO flat; we still apply light vocal air)',
    comp: 'thr -16, ratio 3.5, atk 5ms, rel 60ms — softer than crushing',
    sends: 'rev 0.18, dly 0.12'
  },
  bass: {
    eq: 'Limbus: mostly flat + subtle +0.8 @ 850 Hz; B1@60. Keep gentle body, avoid big shelves',
    comp: 'thr -18, ratio 3, atk 10ms, rel 100ms, makeup 0 (exact Limbus BASS read)',
    sends: 'dry'
  },
  drums: {
    eq: 'Light punch only; Limbus EQ OFF on protected bombo',
    comp: 'Prefer high threshold / low GR; atk 5ms rel 50ms (Limbus protected settings)',
    sends: 'light room',
    volume: 'Do not globally pull kick down — transient protect'
  },
  percussion: {
    eq: 'HPF mud, air for güira/metal',
    comp: 'gentle; fast attack',
    sends: 'light room'
  },
  guitars: {
    eq: 'HPF 90, presence 3.5k',
    comp: 'gentle 3:1, atk ~10ms rel ~100ms base',
    sends: 'lead gets more delay'
  },
  keys_strings: {
    eq: 'HPF 100, air shelf',
    comp: '2.5:1',
    sends: 'more hall'
  },
  defaults: {
    comp: 'thr -18, ratio 3, atk 10ms, rel 100ms, makeup 0'
  }
} as const;
