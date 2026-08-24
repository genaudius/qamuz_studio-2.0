<script lang="ts">
  /**
   * Rotary control for QAMUZ MASTER PRO. Drag vertically to change the value.
   */

  interface Props {
    value?: number;
    min?: number;
    max?: number;
    label: string;
    size?: number;
    accent?: string;
  }

  let {
    value = $bindable(0.5),
    min = 0,
    max = 1,
    label,
    size = 52,
    accent = 'var(--accent)'
  }: Props = $props();

  let dragging = $state(false);
  const turn = $derived(((value - min) / (max - min)) * 270 - 135);

  function clamp(next: number): number {
    return Math.min(max, Math.max(min, next));
  }

  function onPointerDown(event: PointerEvent) {
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;
    const span = max - min;
    value = clamp(value - event.movementY * span * 0.006);
  }

  function onPointerUp() {
    dragging = false;
  }
</script>

<div class="knob" style:width="{size + 8}px">
  <span
    class="dial"
    style:width="{size}px"
    style:height="{size}px"
    style:--accent={accent}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    role="slider"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-label={label}
    tabindex="0"
  >
    <span class="ring"></span>
    <span class="tick" style:transform="rotate({turn}deg)"></span>
  </span>
  <span class="caption">{label}</span>
</div>

<style>
  .knob {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    user-select: none;
  }

  .dial {
    position: relative;
    border-radius: 50%;
    cursor: ns-resize;
    background:
      radial-gradient(circle at 35% 30%, var(--bg-highest), var(--bg-control) 62%, var(--bg-inset));
    box-shadow:
      inset 0 1px 0 rgba(229, 226, 225, 0.12),
      0 8px 16px rgba(0, 0, 0, 0.45);
  }

  .ring {
    position: absolute;
    inset: 5px;
    border-radius: 50%;
    border: 1px solid var(--accent-dim);
  }

  .tick {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: center;
    padding-top: 7px;
  }

  .tick::before {
    content: '';
    width: 2px;
    height: 12px;
    border-radius: 2px;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
  }

  .caption {
    font-size: 10px;
    letter-spacing: 0.04em;
    color: var(--text-tertiary);
    text-align: center;
  }
</style>
