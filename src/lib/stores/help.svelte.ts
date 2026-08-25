/**
 * DAW help overlay: open from the sidebar, Maestro, status bar, or F1.
 */

import { projectStore, workspace } from '$lib/stores';

class StudioHelp {
  open = $state(false);
  topicId = $state('map');
  pendingAsk = $state<string | null>(null);

  show(topicId = 'map'): void {
    this.topicId = topicId;
    this.open = true;
  }

  hide(): void {
    this.open = false;
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open && !this.topicId) this.topicId = 'map';
  }

  askMaestro(prompt: string): void {
    this.hide();
    this.pendingAsk = prompt;
    workspace.open('maestro');
    projectStore.showAI = true;
  }
}

export const studioHelp = new StudioHelp();
