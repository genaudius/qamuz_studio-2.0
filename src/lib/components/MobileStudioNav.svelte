<script lang="ts">
  /**
   * Mobile bottom nav — same pattern as Qamuz AI SaaS:
   * common tools on the bar, everything else under Más.
   */

  import Icon from './Icon.svelte';
  import { isStudioNavActive, mobilePrimaryNav, runStudioNav } from '$lib/studio-nav';
  import { workspace } from '$lib/stores';

  async function tap(id: (typeof mobilePrimaryNav)[number]['id']) {
    const item = mobilePrimaryNav.find((entry) => entry.id === id);
    if (!item) return;
    if (item.id === 'menu') {
      workspace.toggleMobileMenu();
      return;
    }
    await runStudioNav(item);
  }
</script>

<nav class="mobile-nav" aria-label="Studio móvil">
  <div class="grid">
    {#each mobilePrimaryNav as item}
      <button
        type="button"
        class="nav-item"
        class:active={isStudioNavActive(item)}
        aria-label={item.label}
        aria-current={isStudioNavActive(item) ? 'page' : undefined}
        onclick={() => void tap(item.id)}
      >
        <Icon name={item.icon} size={20} />
        <span>{item.label}</span>
      </button>
    {/each}
  </div>
</nav>

<style>
  .mobile-nav {
    display: none;
  }

  @media (max-width: 900px) {
    .mobile-nav {
      display: block;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 70;
      border-top: 1px solid var(--stroke);
      background: color-mix(in srgb, var(--bg-highest) 92%, transparent);
      backdrop-filter: blur(12px);
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      height: 58px;
      width: 100%;
      align-items: stretch;
    }

    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      min-width: 0;
      padding: 6px 4px;
      color: var(--text-tertiary);
      background: transparent;
      border: none;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.01em;
    }

    .nav-item :global(svg) {
      flex-shrink: 0;
    }

    .nav-item span {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .nav-item.active {
      color: var(--accent);
    }
  }
</style>
