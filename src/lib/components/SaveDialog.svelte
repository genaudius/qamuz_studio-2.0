<script lang="ts">
  /**
   * Choose where the session lives: QAMUZ database (IndexedDB) or a Pro Tools-style
   * folder / .qamuzsess package on disk.
   */

  import Icon from './Icon.svelte';
  import { saveDialog, saveToComputer, saveToSystem } from '$lib/persistence/documents.svelte';
  import { settings } from '$lib/persistence/settings.svelte';
  import { projectStore } from '$lib/stores';

  let target = $state<'system' | 'computer'>('system');
  let busy = $state(false);

  $effect(() => {
    if (saveDialog.open) {
      target = settings.lastSaveTarget === 'computer' ? 'computer' : 'system';
      busy = false;
    }
  });

  function close() {
    if (busy) return;
    saveDialog.open = false;
  }

  async function confirm() {
    busy = true;
    try {
      if (target === 'system') await saveToSystem();
      else await saveToComputer();
      saveDialog.open = false;
    } finally {
      busy = false;
    }
  }
</script>

{#if saveDialog.open}
  <div class="scrim" role="presentation" onclick={close}>
    <div
      class="dialog"
      role="dialog"
      aria-labelledby="save-title"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && close()}
    >
      <header>
        <Icon name="save" size={16} />
        <h2 id="save-title">Guardar sesión</h2>
      </header>

      <p class="meta">{projectStore.project.name}</p>

      <label class="choice" class:on={target === 'system'}>
        <input type="radio" name="save-target" value="system" bind:group={target} />
        <span>
          <strong>En QAMUZ (recomendado)</strong>
          <em>Base de datos local. Queda en Abrir, con audio, mixer y MIDI. Sirve para entrenar con esta canción.</em>
        </span>
      </label>

      <label class="choice" class:on={target === 'computer'}>
        <input type="radio" name="save-target" value="computer" bind:group={target} />
        <span>
          <strong>En esta computadora</strong>
          <em
            >Carpeta tipo Pro Tools: archivo maestro .{'qamuzsess'}, Audio Files, MIDI Files. QAMUZ lo abre
            entero. Pro Tools / Logic importan los WAV y MIDI. También se guarda en QAMUZ.</em
          >
        </span>
      </label>

      <footer>
        <button class="ghost" onclick={close} disabled={busy}>Cancelar</button>
        <button class="go" disabled={busy} onclick={() => void confirm()}>
          <Icon name="save" size={12} />
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 40;
  }

  .dialog {
    width: min(460px, calc(100vw - 32px));
    padding: 16px;
    border-radius: 12px;
    background: var(--bg-highest);
    border: 1px solid var(--stroke);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h2 {
    margin: 0;
    font-size: 15px;
  }

  .meta {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .choice {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--stroke);
    cursor: pointer;
  }

  .choice.on {
    border-color: var(--accent);
    background: var(--accent-dim);
  }

  .choice strong {
    display: block;
    font-size: 13px;
  }

  .choice em {
    display: block;
    margin-top: 4px;
    font-style: normal;
    font-size: 11px;
    color: var(--text-secondary);
    line-height: 1.35;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;
  }

  .ghost,
  .go {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
  }

  .ghost {
    background: var(--bg-control);
  }

  .go {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--accent-dim);
    color: var(--accent);
    border: 1px solid var(--accent);
  }
</style>
