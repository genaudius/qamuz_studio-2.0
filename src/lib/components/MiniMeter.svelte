<script lang="ts">
  /** Peak meter. Log scale so playback actually lights segments, unlike a linear 0..1 bar. */

  import { meterThrow } from '$lib/core/time';

  interface Props {
    level: number;
    variant?: 'output' | 'input';
  }

  let { level, variant = 'output' }: Props = $props();

  const SEGMENTS = 8;
  const throwAmount = $derived(meterThrow(level));
  const colors = $derived(
    variant === 'input'
      ? ['#82cfff', '#82cfff', '#82cfff', '#82cfff', '#82cfff', '#ffd666', '#ffb4aa', '#ffb4ab']
      : ['#53e16f', '#53e16f', '#53e16f', '#53e16f', '#72fe88', '#ffd666', '#ffb4aa', '#ffb4ab']
  );

  function lit(index: number): boolean {
    return throwAmount >= (index + 1) / SEGMENTS;
  }
</script>

<div class="meter" aria-hidden="true">
  {#each Array(SEGMENTS) as _, i (i)}
    <span
      class="seg"
      class:on={lit(i)}
      style:height="{8 + i * 2}px"
      style:background={colors[i]}
    ></span>
  {/each}
</div>

<style>
  .meter {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 24px;
  }

  .seg {
    width: 3px;
    border-radius: 1px;
    opacity: 0.12;
  }

  .seg.on {
    opacity: 0.95;
  }
</style>
