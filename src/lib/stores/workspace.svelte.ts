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
  | 'settings'
  | 'analysis';

export class WorkspaceStore {
  module = $state<StudioModule>('arrange');
  sidebarExpanded = $state(true);
  sidebarHidden = $state(false);
  /** Track id for Channel Strip / PROCESS side panel. */
  channelStripTrackId = $state<string | null>(null);

  readonly showsArrange = $derived(
    this.module === 'arrange' ||
      this.module === 'mixer' ||
      this.module === 'pianoRoll' ||
      this.module === 'vrack' ||
      this.module === 'maestro'
  );

  /** Mobile “Más” drawer (full Studio menu). */
  mobileMenuOpen = $state(false);

  open(module: StudioModule): void {
    this.module = module;
    if (module === 'analysis' || module === 'mastering' || module === 'export') {
      this.channelStripTrackId = null;
    }
  }

  openChannelStrip(trackId: string): void {
    this.channelStripTrackId = trackId;
  }

  closeChannelStrip(): void {
    this.channelStripTrackId = null;
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

  openMobileMenu(): void {
    this.mobileMenuOpen = true;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }
}

export const workspace = new WorkspaceStore();
