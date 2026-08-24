<script lang="ts">
  /** Drag handle for resizable panels. Reports a new size in pixels. */

  interface Props {
    orientation: 'horizontal' | 'vertical';
    size: number;
    min?: number;
    max?: number;
    /** Which way the size grows relative to the drag direction. */
    invert?: boolean;
    onResize: (size: number) => void;
  }

  let { orientation, size, min = 120, max = 900, invert = false, onResize }: Props = $props();

  let origin = 0;
  let startSize = 0;
  let active = $state(false);

  function onPointerDown(event: PointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    origin = orientation === 'vertical' ? event.clientY : event.clientX;
    startSize = size;
    active = true;
  }

  function onPointerMove(event: PointerEvent) {
    if (!active) return;

    const current = orientation === 'vertical' ? event.clientY : event.clientX;
    const delta = (current - origin) * (invert ? -1 : 1);
    onResize(Math.max(min, Math.min(max, startSize + delta)));
  }

  function onPointerUp(event: PointerEvent) {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    active = false;
  }
</script>

<div
  class="resizer {orientation}"
  class:active
  role="separator"
  aria-orientation={orientation}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
></div>

<style>
  .resizer {
    flex: none;
    background: var(--stroke);
    transition: background 120ms ease;
  }

  .resizer.vertical {
    height: 4px;
    cursor: ns-resize;
  }

  .resizer.horizontal {
    width: 4px;
    cursor: ew-resize;
  }

  .resizer:hover,
  .resizer.active {
    background: var(--accent);
  }
</style>
