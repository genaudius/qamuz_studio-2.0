<script lang="ts">
  /**
   * Vertical channel fader with a meter beside it.
   *
   * The travel is not linear in gain: unity sits about 70 % up the throw, the
   * same taper the macOS mixer uses, so the useful range around 0 dB gets most
   * of the pixels.
   */

  import { formatDb } from '$lib/core/time';

  interface Props {
    /** Linear gain, 0 to 2. */
    value: number;
    peak?: number;
    height?: number;
    onInput: (value: number) => void;
    onGestureStart?: () => void;
    onGestureEnd?: () => void;
  }

  let {
    value,
    peak = 0,
    height = 150,
    onInput,
    onGestureStart,
    onGestureEnd
  }: Props = $props();

  const UNITY_POSITION = 0.7;
  const MAX_GAIN = 2;

  /** Gain to 0..1 throw position. */
  function toPosition(gain: number): number {
    if (gain <= 0) return 0;
    if (gain <= 1) return (gain ** 0.5) * UNITY_POSITION;
    return UNITY_POSITION + ((gain - 1) / (MAX_GAIN - 1)) * (1 - UNITY_POSITION);
  }

  function toGain(position: number): number {
    const p = Math.max(0, Math.min(1, position));
    if (p <= UNITY_POSITION) return (p / UNITY_POSITION) ** 2;
    return 1 + ((p - UNITY_POSITION) / (1 - UNITY_POSITION)) * (MAX_GAIN - 1);
  }

  const position = $derived(toPosition(value));

  let dragging = false;

  function positionFrom(event: PointerEvent, element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    return 1 - (event.clientY - rect.top) / rect.height;
  }

  function onPointerDown(event: PointerEvent) {
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    dragging = true;
    onGestureStart?.();
    onInput(toGain(positionFrom(event, element)));
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;
    onInput(toGain(positionFrom(event, event.currentTarget as HTMLElement)));
  }

  function onPointerUp(event: PointerEvent) {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    dragging = false;
    onGestureEnd?.();
  }

  function onKeyDown(event: KeyboardEvent) {
    const step = event.shiftKey ? 0.01 : 0.05;
    if (event.key === 'ArrowUp') onInput(Math.min(MAX_GAIN, value + step));
    else if (event.key === 'ArrowDown') onInput(Math.max(0, value - step));
    else return;
    event.preventDefault();
  }
</script>

<div class="fader-row" style:height="{height}px">
  <div
    class="track"
    role="slider"
    aria-label="Volume"
    aria-valuenow={Math.round(value * 100)}
    tabindex="0"
    ondblclick={() => onInput(0.7937)}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onkeydown={onKeyDown}
  >
    <span class="unity" style:bottom="{UNITY_POSITION * 100}%"></span>
    <span class="fill" style:height="{position * 100}%"></span>
    <span class="cap" style:bottom="{position * 100}%"></span>
  </div>

  <div class="meter">
    <span class="meter-fill" style:height="{Math.min(1, peak) * 100}%"></span>
  </div>
</div>

<span class="db">{formatDb(value)}</span>

<style>
  .fader-row {
    display: flex;
    align-items: stretch;
    gap: 4px;
    justify-content: center;
  }

  .track {
    position: relative;
    width: 6px;
    border-radius: 3px;
    background: var(--bg-inset);
    border: 1px solid var(--stroke);
    cursor: ns-resize;
  }

  .fill {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--accent);
    border-radius: 3px;
    opacity: 0.55;
  }

  .cap {
    position: absolute;
    left: -6px;
    width: 18px;
    height: 9px;
    margin-bottom: -4px;
    border-radius: 2px;
    background: linear-gradient(#5a5a62, #35353b);
    border: 1px solid #16161a;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }

  .unity {
    position: absolute;
    left: -3px;
    right: -3px;
    height: 1px;
    background: var(--stroke-strong);
  }

  .meter {
    position: relative;
    width: 5px;
    border-radius: 2px;
    background: var(--bg-inset);
    border: 1px solid var(--stroke);
    overflow: hidden;
  }

  .meter-fill {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(0deg, var(--time), var(--tempo) 78%, var(--record));
    transition: height 60ms linear;
  }

  .db {
    display: block;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
</style>
