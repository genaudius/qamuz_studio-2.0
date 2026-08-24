<script lang="ts">
  /** Six-segment meter from TrackHeaderView.swift: green up to 4, then yellow, then red. */

  interface Props {
    level: number;
    variant?: 'output' | 'input';
  }

  let { level, variant = 'output' }: Props = $props();

  const SEGMENTS = 6;
  const colors = $derived(
    variant === 'input'
      ? ['#82cfff', '#82cfff', '#82cfff', '#82cfff', '#ffb4aa', '#ffb4ab']
      : ['#53e16f', '#53e16f', '#53e16f', '#53e16f', '#72fe88', '#ffb4ab']
  );
</script>

<div class="meter" aria-hidden="true">
  {#each Array(SEGMENTS) as _, i (i)}
    <span
      class="seg"
      style:height="{6 + i * 2}px"
      style:background={colors[i]}
      style:opacity={level >= i / SEGMENTS ? 0.9 : 0.15}
    ></span>
  {/each}
</div>

<style>
  .meter {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 16px;
  }

  .seg {
    width: 3px;
    border-radius: 1px;
    transition: opacity 60ms linear;
  }
</style>
