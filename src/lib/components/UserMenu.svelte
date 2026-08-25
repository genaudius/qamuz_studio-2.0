<script lang="ts">
  /**
   * Account menu — the QAMUZ AI profile, not the DAW navigator.
   * Mirrors the old SaaS sidebar: name, plan, account settings, upgrade, sign out.
   */

  import Icon from './Icon.svelte';
  import { account } from '$lib/account.svelte';
  import { isEmbedded, goHome, goToSaasPath, signOutOfSaas } from '$lib/saas';
  import { workspace } from '$lib/stores';

  let open = $state(false);
  let chipEl = $state<HTMLButtonElement | null>(null);
  let menuTop = $state(0);
  let menuRight = $state(0);

  function placeMenu() {
    if (!chipEl) return;
    const box = chipEl.getBoundingClientRect();
    menuTop = box.bottom + 6;
    menuRight = Math.max(8, window.innerWidth - box.right);
  }

  function toggle() {
    if (!open) placeMenu();
    open = !open;
  }

  function close() {
    open = false;
  }

  function onWindowKey(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  function onWindowChange() {
    if (open) placeMenu();
  }

  async function openPath(path: string) {
    close();
    await goToSaasPath(path);
  }
</script>

<svelte:window onkeydown={onWindowKey} onresize={onWindowChange} onscroll={onWindowChange} />

<div class="user">
  <button
    bind:this={chipEl}
    class="chip"
    class:on={open}
    title="Cuenta QAMUZ"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={toggle}
  >
    <span class="avatar"><Icon name="user" size={12} /></span>
    <span class="who">
      <strong>{account.displayName}</strong>
      <em>{account.planLabel}</em>
    </span>
    <Icon name="chevron-down" size={9} />
  </button>

  {#if open}
    <button class="backdrop" aria-label="Cerrar menú" onclick={close}></button>
    <div class="menu" role="menu" style:top="{menuTop}px" style:right="{menuRight}px">
      <div class="card">
        <span class="avatar lg"><Icon name="user" size={16} /></span>
        <div>
          <strong>{account.displayName}</strong>
          {#if account.email}
            <em>{account.email}</em>
          {/if}
          <span class="plan">{account.planLabel}</span>
        </div>
      </div>

      <button
        role="menuitem"
        onclick={() => void openPath('settings/profile')}
      >
        <Icon name="user" size={12} /> Ajustes de cuenta
      </button>
      <button role="menuitem" onclick={() => void openPath('pricing')}>
        <Icon name="upgrade" size={12} /> Mejorar plan
      </button>
      <button
        role="menuitem"
        class:on={workspace.module === 'settings'}
        onclick={() => {
          close();
          workspace.open('settings');
        }}
      >
        <Icon name="gear" size={12} /> Ajustes del estudio
      </button>

      <span class="rule"></span>
      {#if isEmbedded()}
        <button
          role="menuitem"
          class="danger"
          onclick={() => {
            close();
            void signOutOfSaas();
          }}
        >
          <Icon name="logout" size={12} /> Cerrar sesión
        </button>
      {:else}
        <button
          role="menuitem"
          onclick={() => {
            close();
            void goHome();
          }}
        >
          <Icon name="home" size={12} /> Ir a QAMUZ AI
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .user {
    position: relative;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 4px;
    border-radius: 999px;
    background: var(--bg-control);
    border: 1px solid var(--stroke);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
    max-width: 220px;
  }

  .chip:hover,
  .chip.on {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(0, 174, 239, 0.16);
    color: var(--accent);
    flex: none;
  }

  .avatar.lg {
    width: 32px;
    height: 32px;
  }

  .who {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    line-height: 1.15;
  }

  .who strong,
  .card strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 140px;
    color: var(--text-primary);
    font-size: 11px;
  }

  .who em,
  .card em {
    font-style: normal;
    font-size: 9px;
    color: var(--text-tertiary);
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
  }

  .menu {
    position: fixed;
    z-index: 81;
    min-width: 240px;
    max-height: min(70vh, 480px);
    overflow: auto;
    padding: 8px;
    border-radius: var(--radius-lg);
    background: var(--bg-control);
    border: 1px solid var(--stroke);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    margin-bottom: 4px;
    border-radius: var(--radius);
    background: var(--bg-inset);
  }

  .card em {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }

  .plan {
    display: inline-block;
    margin-top: 4px;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(201, 160, 255, 0.16);
    color: var(--ai);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 8px;
    border-radius: var(--radius);
    color: var(--text-secondary);
    font-size: 12px;
    text-align: left;
  }

  .menu button:hover,
  .menu button.on {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .menu button.danger:hover {
    background: rgba(255, 90, 90, 0.12);
    color: var(--warn);
  }

  .rule {
    display: block;
    height: 1px;
    margin: 6px 4px;
    background: var(--stroke);
  }
</style>
