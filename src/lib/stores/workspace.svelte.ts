/**
 * Studio modules and the left-rail flow. Separate from the project document so
 * switching Arrange → Master does not dirty the song.
 */

export type StudioModule =
  | 'arrange'
  | 'maestro'
  | 'mixer'
  | 'pianoRoll'
  | 'vrack'
  | 'mastering'
  | 'export'
  | 'settings';

export class WorkspaceStore {
  module = $state<StudioModule>('arrange');
  sidebarExpanded = $state(true);
  sidebarHidden = $state(false);

  readonly showsArrange = $derived(
    this.module === 'arrange' ||
      this.module === 'mixer' ||
      this.module === 'pianoRoll' ||
      this.module === 'vrack' ||
      this.module === 'maestro'
  );

  open(module: StudioModule): void {
    this.module = module;
  }

  toggleMasterPlugin(): void {
    this.module = this.module === 'mastering' ? 'arrange' : 'mastering';
  }

  toggleSidebar(): void {
    if (this.sidebarHidden) {
      this.sidebarHidden = false;
      this.sidebarExpanded = true;
      return;
    }
    this.sidebarExpanded = !this.sidebarExpanded;
  }

  hideSidebar(): void {
    this.sidebarHidden = true;
  }

  showSidebar(): void {
    this.sidebarHidden = false;
    this.sidebarExpanded = true;
  }
}

export const workspace = new WorkspaceStore();
