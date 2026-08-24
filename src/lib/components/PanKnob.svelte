<script lang="ts">
  /** Pan control: vertical drag, double click to centre. -1 is left, 1 is right. */

  import { formatPan } from '$lib/core/time';

  interface Props {
    value: number;
    size?: number;
    showLabel?: boolean;
    onInput: (value: number) => void;
    onGestureStart?: () => void;
    onGestureEnd?: () => void;
  }

  let {
    value,
    size = 28,
    showLabel = true,
    onInput,
    onGestureStart,
    onGestureEnd
  }: Props = $props();

  /** Sweep of the indicator, in degrees either side of centre. */
  const SWEEP = 135;

  const angle = $derived(value * SWEEP);

  let startY = 0;
  let startValue = 0;
  let dragging = false;

  function onPointerDown(event: PointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    startY = event.clientY;
    startValue = value;
    dragging = true;
    onGestureStart?.();
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;
    // 140 px of travel covers the full sweep; Shift makes it fine.
    const scale = event.shiftKey ? 400 : 140;
    onInput(Math.max(-1, Math.min(1, startValue - (event.clientY - startY) / scale)));
  }

  function onPointerUp(event: PointerEvent) {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    dragging = false;
    onGestureEnd?.();
  }
</script>

<div class="wrap">
  <div
    class="knob"
    style:width="{size}px"
    style:height="{size}px"
    role="slider"
    aria-label="Pan"
    aria-valuenow={Math.round(value * 100)}
    tabindex="0"
    title="Drag to pan, double click to centre"
    ondblclick={() => onInput(0)}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onkeydown={(e) => {
      if (e.key === 'ArrowLeft') onInput(Math.max(-1, value - 0.05));
      else if (e.key === 'ArrowRight') onInput(Math.min(1, value + 0.05));
    }}
  >
    <span class="indicator" style:transform="rotate({angle}deg)"></span>
  </div>

  {#if showLabel}
    <span class="label">{formatPan(value)}</span>
  {/if}
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .knob {
    position: relative;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 35%, #3c3c42, #232327);
    border: 1px solid #16161a;
    cursor: ns-resize;
  }

  .indicator {
    position: absolute;
    left: 50%;
    top: 12%;
    width: 2px;
    height: 40%;
    margin-left: -1px;
    background: var(--accent);
    border-radius: 1px;
    transform-origin: 50% 125%;
  }

  .label {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--text-secondary);
  }
</style>
