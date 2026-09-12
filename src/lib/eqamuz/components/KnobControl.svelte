<script lang="ts">
  /**
   * EQAMUZ Precision Studio Audio Rotary Knob
   */
  interface Props {
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    sublabel?: string;
    badge?: string;
    color?: 'primary' | 'secondary' | 'accent' | 'warning';
    size?: number;
    onChange?: (val: number) => void;
  }

  let {
    label,
    value,
    min = 0,
    max = 100,
    step = 1,
    unit = '',
    sublabel = '',
    badge = '',
    color = 'primary',
    size = 64,
    onChange
  }: Props = $props();

  let isDragging = $state(false);
  let startY = 0;
  let startValue = 0;

  const normalized = $derived(
    Math.max(0, Math.min(1, (value - min) / (max - min || 1)))
  );

  // SVG circular arc (circumference = 2 * PI * 26 ≈ 163.36)
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = $derived(circumference * (1 - normalized));
  const pointerRotation = $derived(-135 + normalized * 270);

  const strokeColor = $derived(
    color === 'secondary'
      ? '#4edea3'
      : color === 'warning'
        ? '#ef4444'
        : '#00f2fe'
  );

  function handlePointerDown(e: PointerEvent) {
    isDragging = true;
    startY = e.clientY;
    startValue = value;
    (e.currentTarget as HTMLElement)?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging) return;
    const dy = startY - e.clientY;
    const range = max - min;
    const delta = (dy / 150) * range;
    let next = startValue + delta;
    next = Math.max(min, Math.min(max, next));
    if (step > 0) {
      next = Math.round(next / step) * step;
    }
    onChange?.(next);
  }

  function handlePointerUp(e: PointerEvent) {
    if (isDragging) {
      isDragging = false;
      try {
        (e.currentTarget as HTMLElement)?.releasePointerCapture(e.pointerId);
      } catch {}
    }
  }
</script>

<div class="eqamuz-knob-bay">
  <div class="header-row">
    <span class="knob-label">{label}</span>
    {#if badge}
      <span class="knob-badge" class:sec={color === 'secondary'}>{badge}</span>
    {/if}
  </div>

  <!-- Rotary Dial -->
  <div
    class="dial-wrapper"
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuenow={value}
    aria-valuemin={min}
    aria-valuemax={max}
    style:width="{size}px"
    style:height="{size}px"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
    title="{label}: {value.toFixed(1)}{unit}"
  >
    <svg class="dial-svg" viewBox="0 0 64 64">
      <!-- Background ring -->
      <circle
        cx="32"
        cy="32"
        r={radius}
        fill="none"
        stroke="#282a31"
        stroke-width="4"
      />
      <!-- Active Value Arc -->
      <circle
        class="value-arc"
        cx="32"
        cy="32"
        r={radius}
        fill="none"
        stroke={strokeColor}
        stroke-width="4"
        stroke-dasharray={circumference}
        stroke-dashoffset={strokeDashoffset}
        style:filter="drop-shadow(0 0 5px {strokeColor}80)"
      />
    </svg>

    <!-- Center Rotary Cap -->
    <div class="center-cap">
      <div
        class="cap-notch"
        style:transform="rotate({pointerRotation}deg) translateY(-8px)"
        style:background={strokeColor}
      ></div>
    </div>
  </div>

  <!-- Readout -->
  <div class="value-readout">
    <span class="value-num" style:color={strokeColor}>
      {value > 0 && unit === 'dB' ? '+' : ''}{value.toFixed(step < 1 ? 1 : 0)}
      <span class="unit">{unit}</span>
    </span>
    {#if sublabel}
      <span class="sublabel">{sublabel}</span>
    {/if}
  </div>
</div>

<style>
  .eqamuz-knob-bay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    background: #191b22;
    padding: 10px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    user-select: none;
    min-width: 95px;
  }

  .header-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    gap: 4px;
  }

  .knob-label {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #00f2fe;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .knob-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    padding: 1px 4px;
    border-radius: 2px;
    background: rgba(0, 242, 254, 0.15);
    color: #00f2fe;
    font-weight: 600;
    white-space: nowrap;
  }

  .knob-badge.sec {
    background: rgba(78, 222, 163, 0.15);
    color: #4edea3;
  }

  .dial-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ns-resize;
    touch-action: none;
  }

  .dial-svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .center-cap {
    position: absolute;
    inset: 7px;
    border-radius: 50%;
    background: #11131a;
    box-shadow: inset 0 1px 3px rgba(255, 255, 255, 0.1), 0 4px 8px rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cap-notch {
    width: 2.5px;
    height: 7px;
    border-radius: 2px;
    position: absolute;
    box-shadow: 0 0 4px currentColor;
    transition: transform 0.05s ease-out;
  }

  .value-readout {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 6px;
    width: 100%;
  }

  .value-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .unit {
    font-size: 9px;
    color: #849495;
    font-weight: 400;
    margin-left: 1px;
  }

  .sublabel {
    font-family: 'Geist', sans-serif;
    font-size: 8.5px;
    color: #849495;
    margin-top: 3px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
</style>
