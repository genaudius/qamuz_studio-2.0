<script lang="ts">
  /**
   * Hardware-insert plate that opens QAMUZ MASTER PRO without using the sidebar.
   */

  import { workspace } from '$lib/stores';

  const open = $derived(workspace.module === 'mastering');
</script>

<button
  class="plate"
  class:live={open}
  title="QAMUZ MASTER PRO"
  onclick={() => workspace.toggleMasterPlugin()}
>
  <span class="screws" aria-hidden="true"></span>
  <span class="led" class:on={open}></span>
  <span class="copy">
    <small>INSERT</small>
    <strong>QAMUZ</strong>
    <em>MASTER PRO</em>
  </span>
</button>

<style>
  .plate {
    position: absolute;
    left: 14px;
    bottom: 16px;
    z-index: 8;
    width: 148px;
    height: 64px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px 0 14px;
    border-radius: var(--radius-lg);
    background: var(--bg-highest);
    border: 1px solid var(--stroke);
    box-shadow:
      0 10px 24px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(229, 226, 225, 0.12);
    color: var(--text-primary);
  }

  .plate:hover {
    border-color: var(--accent);
  }

  .plate.live {
    box-shadow:
      0 0 22px rgba(0, 174, 239, 0.28),
      inset 0 1px 0 rgba(229, 226, 225, 0.12);
  }

  .screws::before,
  .screws::after {
    content: '';
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--bg-elevated);
    box-shadow: inset 0 0 0 1px var(--bg-inset);
  }

  .screws::before {
    top: 6px;
    left: 6px;
  }

  .screws::after {
    bottom: 6px;
    right: 6px;
  }

  .led {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--bg-elevated);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
    flex: none;
  }

  .led.on {
    background: var(--play);
    box-shadow: 0 0 10px var(--play);
  }

  .copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.05;
  }

  small {
    font-size: 8px;
    letter-spacing: 0.18em;
    color: var(--text-tertiary);
  }

  strong {
    font-size: 13px;
    letter-spacing: 0.08em;
  }

  em {
    font-size: 10px;
    font-style: normal;
    letter-spacing: 0.12em;
    color: var(--accent);
  }
</style>
