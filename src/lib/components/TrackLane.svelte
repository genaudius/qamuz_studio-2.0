<script lang="ts">
  /**
   * One track's lane. Holds its clips, and handles the two gestures the lane
   * background owns: dragging a beat range (what Generative Fill acts on) and
   * double clicking to create an empty MIDI region.
   */

  import ClipView from './ClipView.svelte';
  import { importAudioFile } from '$lib/audio/import';
  import { quantize } from '$lib/core/time';
  import type { Track } from '$lib/core/track';
  import { projectStore, workspace } from '$lib/stores';

  interface Props {
    track: Track;
    trackOrder: string[];
    width: number;
    onImportMessage?: (message: string) => void;
  }

  let { track, trackOrder, width, onImportMessage }: Props = $props();

  let dropActive = $state(false);

  const pixelsPerBeat = $derived(projectStore.pixelsPerBeat);
  const isSelected = $derived(projectStore.selectedTrackID === track.id);
  const range = $derived(
    projectStore.rangeSelection?.trackID === track.id ? projectStore.rangeSelection : null
  );

  let anchorBeat = 0;
  let dragging = false;

  function beatAt(event: PointerEvent | MouseEvent): number {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const raw = Math.max(0, (event.clientX - rect.left) / pixelsPerBeat);
    const grid = projectStore.snapDivision;
    return event.altKey || grid === 0 ? raw : quantize(raw, grid);
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    projectStore.selectTrack(track.id);
    projectStore.clearClipSelection();

    anchorBeat = beatAt(event);
    dragging = true;
    projectStore.setRangeSelection(null);
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;

    const beat = beatAt(event);
    if (Math.abs(beat - anchorBeat) < 0.001) return;

    projectStore.setRangeSelection({
      trackID: track.id,
      startBeat: Math.min(anchorBeat, beat),
      endBeat: Math.max(anchorBeat, beat)
    });
  }

  function onPointerUp(event: PointerEvent) {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    dragging = false;

    const range = projectStore.rangeSelection;
    if (
      projectStore.aiFillMode &&
      range &&
      range.trackID === track.id &&
      range.endBeat - range.startBeat >= 0.25
    ) {
      projectStore.showGenerateDialog = true;
    }
  }

  /** HTML file drop, the path used when running in a browser tab. */
  async function onDrop(event: DragEvent) {
    event.preventDefault();
    dropActive = false;

    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    let beat = Math.max(0, (event.clientX - rect.left) / pixelsPerBeat);
    const grid = projectStore.snapDivision;
    if (grid > 0) beat = quantize(beat, grid, 'floor');

    for (const file of files) {
      const result = await importAudioFile(file, track.id, beat);
      if (result.error) onImportMessage?.(result.error);
      if (!result.clipID) continue;

      const found = projectStore.findClip(result.clipID);
      if (found) {
        beat +=
          (found.clip.timeRange.duration.samples / projectStore.project.sampleRate / 60) *
          projectStore.project.tempo.bpm;
      }
    }
  }

  function onDoubleClick(event: MouseEvent) {
    if (track.type !== 'midi' && track.type !== 'instrument') return;
    const beat = quantize(beatAt(event), 1, 'floor');
    projectStore.addEmptyMIDIClip(track.id, beat, 4);
    workspace.open('pianoRoll');
  }
</script>

<div
  class="lane"
  class:selected={isSelected}
  class:drop-active={dropActive}
  style:height="{track.height}px"
  style:width="{width}px"
  data-track-id={track.id}
  role="button"
  tabindex="-1"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  ondblclick={onDoubleClick}
  ondragover={(e) => {
    e.preventDefault();
    dropActive = true;
  }}
  ondragleave={() => (dropActive = false)}
  ondrop={onDrop}
>
  {#if range}
    <div
      class="range"
      class:generating={projectStore.isAIGenerating}
      style:left="{range.startBeat * pixelsPerBeat}px"
      style:width="{Math.max(2, (range.endBeat - range.startBeat) * pixelsPerBeat)}px"
    ></div>
  {/if}

  {#each track.clips as clip (clip.id)}
    <ClipView {clip} {track} laneHeight={track.height} {trackOrder} />
  {/each}
</div>

<style>
  .lane {
    position: relative;
    border-bottom: 1px solid var(--stroke);
    flex: none;
  }

  .lane.selected {
    background: var(--accent-faint);
  }

  .lane.drop-active {
    background: var(--accent-dim);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .range {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(201, 160, 255, 0.18);
    border-left: 1px solid var(--ai);
    border-right: 1px solid var(--ai);
    pointer-events: none;
  }

  .range.generating {
    background: rgba(201, 160, 255, 0.32);
    box-shadow:
      inset 0 0 0 2px var(--ai),
      0 0 18px rgba(201, 160, 255, 0.55);
    animation: fill-pulse 1.1s ease-in-out infinite;
  }

  @keyframes fill-pulse {
    0%,
    100% {
      opacity: 0.7;
    }
    50% {
      opacity: 1;
    }
  }
</style>
