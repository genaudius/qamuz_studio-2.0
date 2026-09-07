/**
 * Shared Studio navigation actions — desktop rail + mobile bottom nav / Más drawer.
 */

import { goHome } from '$lib/saas';
import { saveProject, openSessionFinder } from '$lib/persistence/documents.svelte';
import { sessionGate } from '$lib/persistence/sessions.svelte';
import { chooseSessionFiles } from '$lib/audio/import-session';
import { projectStore, workspace, type StudioModule } from '$lib/stores';
import { studioHelp } from '$lib/stores/help.svelte';

export type StudioNavId =
  | StudioModule
  | 'home'
  | 'new'
  | 'open'
  | 'save'
  | 'inspector'
  | 'audio'
  | 'import'
  | 'help'
  | 'chat'
  | 'menu';

export interface StudioNavItem {
  id: StudioNavId;
  label: string;
  icon:
    | 'home'
    | 'file-plus'
    | 'folder'
    | 'save'
    | 'layout'
    | 'sparkles'
    | 'mixer'
    | 'pianoroll'
    | 'keyboard'
    | 'disc'
    | 'download'
    | 'gear'
    | 'inspector'
    | 'waveform'
    | 'help'
    | 'close'
    | 'sliders';
  module?: StudioModule;
}

export const studioNavSections: { title: string; items: StudioNavItem[] }[] = [
  {
    title: 'Sesión',
    items: [
      { id: 'home', label: 'Home', icon: 'home' },
      { id: 'new', label: 'Nuevo', icon: 'file-plus' },
      { id: 'open', label: 'Abrir', icon: 'folder' },
      { id: 'save', label: 'Guardar', icon: 'save' }
    ]
  },
  {
    title: 'Crear',
    items: [
      { id: 'arrange', label: 'Arrange', icon: 'layout', module: 'arrange' },
      { id: 'import', label: 'Importar stems', icon: 'waveform' },
      { id: 'chat', label: 'Chat', icon: 'sparkles', module: 'maestro' },
      { id: 'inspector', label: 'Inspector', icon: 'inspector' },
      { id: 'audio', label: 'Audio / MIDI', icon: 'waveform' }
    ]
  },
  {
    title: 'Mezcla',
    items: [
      { id: 'mixer', label: 'Mixer', icon: 'mixer', module: 'mixer' },
      { id: 'analysis', label: 'Analysis', icon: 'waveform', module: 'analysis' },
      { id: 'pianoRoll', label: 'Piano', icon: 'pianoroll', module: 'pianoRoll' },
      { id: 'vrack', label: 'V-Rack', icon: 'keyboard', module: 'vrack' }
    ]
  },
  {
    title: 'Entrega',
    items: [
      { id: 'mastering', label: 'MASTER PRO', icon: 'disc', module: 'mastering' },
      { id: 'export', label: 'Export', icon: 'download', module: 'export' }
    ]
  }
];

/** Primary mobile tabs (SaaS-style). Everything else lives under Más. */
export const mobilePrimaryNav: StudioNavItem[] = [
  { id: 'arrange', label: 'Arrange', icon: 'layout', module: 'arrange' },
  { id: 'mixer', label: 'Mix', icon: 'mixer', module: 'mixer' },
  { id: 'chat', label: 'Chat', icon: 'sparkles', module: 'maestro' },
  { id: 'mastering', label: 'Master', icon: 'disc', module: 'mastering' },
  { id: 'menu', label: 'Más', icon: 'sliders' }
];

function closeOverlays() {
  projectStore.showInspector = false;
  projectStore.showAI = false;
  projectStore.showVRack = false;
  workspace.closeChannelStrip();
}

export function isStudioNavActive(item: StudioNavItem): boolean {
  if (item.id === 'inspector') return projectStore.showInspector && workspace.showsArrange;
  if (item.id === 'audio') return workspace.module === 'settings';
  if (item.id === 'import') return false;
  if (item.id === 'chat' || item.id === 'maestro') {
    return projectStore.showAI || workspace.module === 'maestro';
  }
  if (item.id === 'menu') return workspace.mobileMenuOpen;
  return Boolean(item.module && workspace.module === item.module);
}

export async function runStudioNav(item: StudioNavItem): Promise<void> {
  workspace.closeMobileMenu();

  if (item.id === 'home') {
    void goHome();
    return;
  }
  if (item.id === 'new') {
    sessionGate.open('idea');
    return;
  }
  if (item.id === 'open') {
    await openSessionFinder();
    return;
  }
  if (item.id === 'save') {
    await saveProject();
    return;
  }
  if (item.id === 'menu') {
    workspace.toggleMobileMenu();
    return;
  }
  if (item.id === 'inspector') {
    workspace.open('arrange');
    projectStore.showAI = false;
    projectStore.showInspector = !projectStore.showInspector;
    return;
  }
  if (item.id === 'import') {
    closeOverlays();
    workspace.open('arrange');
    await chooseSessionFiles();
    return;
  }
  if (item.id === 'audio') {
    closeOverlays();
    workspace.open('settings');
    return;
  }
  if (item.id === 'help') {
    studioHelp.toggle();
    return;
  }
  if (item.id === 'chat' || item.id === 'maestro') {
    workspace.open('maestro');
    projectStore.showInspector = false;
    projectStore.showVRack = false;
    projectStore.showAI = true;
    return;
  }
  if (item.id === 'arrange') {
    closeOverlays();
    workspace.open('arrange');
    projectStore.bottomPanel = 'none';
    return;
  }
  if (item.id === 'mixer') {
    projectStore.showAI = false;
    projectStore.showInspector = false;
    workspace.open('mixer');
    return;
  }
  if (item.module) {
    if (item.module === 'pianoRoll' || item.module === 'vrack') {
      projectStore.showAI = false;
    }
    if (item.module === 'analysis' || item.module === 'mastering' || item.module === 'export') {
      closeOverlays();
    }
    workspace.open(item.module);
  }
}
