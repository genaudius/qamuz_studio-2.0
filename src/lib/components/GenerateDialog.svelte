<script lang="ts">
  /**
   * Generative Fill dialog. MIDI tracks talk to Claude; audio tracks talk to
   * ElevenLabs. If the selected range already has notes, the dialog is an edit.
   */

  import Icon from './Icon.svelte';
  import { notesInSelection, runAudioFill, runMIDIFill } from '$lib/ai/fill';
  import { AI_AUDIO_MODELS, type AIAudioModel } from '$lib/ai/types';
  import { isClaudeConfigured, isElevenLabsConfigured } from '$lib/ai/config';
  import { projectStore } from '$lib/stores';

  const range = $derived(projectStore.rangeSelection);
  const track = $derived(
    range ? (projectStore.project.tracks.find((t) => t.id === range.trackID) ?? null) : null
  );
  const isMIDI = $derived(track?.type === 'midi' || track?.type === 'instrument');
  const beatCount = $derived(range ? Math.max(1, Math.round(range.endBeat - range.startBeat)) : 0);
  const existing = $derived(isMIDI ? notesInSelection() : []);

  let prompt = $state('');
  let model = $state<AIAudioModel>('elevenlabs_sfx');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let input = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (projectStore.showGenerateDialog) {
      prompt = '';
      error = null;
      queueMicrotask(() => input?.focus());
    }
  });

  function close() {
    if (busy) return;
    projectStore.showGenerateDialog = false;
    if (!projectStore.isAIGenerating) projectStore.aiFillMode = false;
  }

  async function generate() {
    const text = prompt.trim();
    if (!text || !track) return;

    busy = true;
    error = null;
    projectStore.showGenerateDialog = false;

    try {
      if (isMIDI) await runMIDIFill(text);
      else await runAudioFill(text, model);
    } catch (err) {
      error = (err as Error).message;
      projectStore.showGenerateDialog = true;
    } finally {
      busy = false;
    }
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') close();
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void generate();
    }
  }
</script>

{#if projectStore.showGenerateDialog && range && track}
  <div class="scrim" role="presentation" onclick={close}>
    <div
      class="dialog"
      class:midi={isMIDI}
      class:edit={existing.length > 0}
      role="dialog"
      aria-labelledby="fill-title"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={onKey}
    >
      <header>
        <Icon name={existing.length > 0 ? 'wand' : isMIDI ? 'keyboard' : 'waveform'} size={16} />
        <h2 id="fill-title">
          {existing.length > 0 ? 'Edit MIDI' : isMIDI ? 'Generate MIDI' : 'Generative Fill'}
        </h2>
        <span class="badge">{beatCount} beat{beatCount === 1 ? '' : 's'}</span>
      </header>

      <p class="meta">
        on {track.name}{#if existing.length > 0}<span> · {existing.length} notes selected</span>{/if}
      </p>

      {#if !isMIDI}
        <div class="models">
          {#each AI_AUDIO_MODELS as option (option.id)}
            <button
              class="model"
              class:active={model === option.id}
              onclick={() => (model = option.id)}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          {/each}
        </div>
      {/if}

      <label class="field">
        <span class="field-label">
          {existing.length > 0
            ? 'How do you want to change it?'
            : isMIDI
              ? 'What do you want to create?'
              : 'Describe the sound'}
        </span>
        <input
          bind:this={input}
          bind:value={prompt}
          placeholder={existing.length > 0
            ? 'e.g. make it more energetic, transpose up an octave…'
            : isMIDI
              ? 'e.g. strings, bass line, piano chords, drums…'
              : 'e.g. punchy drums, vinyl crackle, whoosh…'}
        />
      </label>

      {#if !isMIDI && !isElevenLabsConfigured()}
        <p class="warn">ElevenLabs is not configured. Open the AI panel to add a Supabase URL.</p>
      {:else if isMIDI && !isClaudeConfigured()}
        <p class="warn">Claude is not configured. Open the AI panel to add a Supabase URL.</p>
      {/if}

      {#if error}
        <p class="warn">{error}</p>
      {/if}

      <footer>
        <button class="ghost" onclick={close}>Cancel</button>
        <button class="go" disabled={!prompt.trim() || busy} onclick={() => void generate()}>
          <Icon name="wand" size={12} />
          {existing.length > 0 ? 'Apply' : 'Generate'}
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
    width: 420px;
    padding: 20px 24px 16px;
    border-radius: 14px;
    background: var(--bg-elevated);
    border: 1px solid rgba(201, 160, 255, 0.35);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
  }

  .dialog.midi {
    border-color: rgba(130, 207, 255, 0.35);
  }

  .dialog.edit {
    border-color: rgba(255, 180, 170, 0.45);
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ai);
  }

  .dialog.midi header {
    color: var(--ai-alt);
  }

  .dialog.edit header {
    color: var(--tempo);
  }

  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    flex: 1;
  }

  .badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(201, 160, 255, 0.18);
    color: var(--ai);
    font-size: 11px;
  }

  .meta {
    margin: 6px 0 12px;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .models {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  .model {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--bg-control);
    text-align: left;
  }

  .model strong {
    font-size: 12px;
    font-weight: 600;
  }

  .model span {
    font-size: 10px;
    color: var(--text-tertiary);
  }

  .model.active {
    background: rgba(201, 160, 255, 0.16);
    box-shadow: inset 0 0 0 1px var(--ai);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .warn {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--warn);
  }

  footer {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  .ghost,
  .go {
    flex: 1;
    padding: 8px 0;
    border-radius: 8px;
    font-size: 13px;
  }

  .ghost {
    background: var(--bg-control);
  }

  .go {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: linear-gradient(90deg, var(--ai), var(--accent-strong));
    color: var(--on-primary);
  }

  .go:disabled {
    opacity: 0.4;
  }

  .dialog.edit .go {
    background: linear-gradient(90deg, var(--tempo), var(--solo));
    color: var(--on-play);
  }
</style>
