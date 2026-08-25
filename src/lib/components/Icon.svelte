<script lang="ts">
  /**
   * Inline SVG glyphs standing in for the SF Symbols the macOS build uses.
   * Kept as a local path map rather than an icon dependency, so the bundle stays
   * small and the shapes match the transport layout exactly.
   */

  type IconName =
    | 'skip-back'
    | 'rewind'
    | 'play'
    | 'pause'
    | 'record'
    | 'forward'
    | 'minus'
    | 'plus'
    | 'loop'
    | 'metronome'
    | 'keyboard'
    | 'undo'
    | 'redo'
    | 'sparkles'
    | 'mixer'
    | 'inspector'
    | 'pianoroll'
    | 'waveform'
    | 'mic'
    | 'trash'
    | 'chevron-down'
    | 'chevron-right'
    | 'chevron-left'
    | 'close'
    | 'save'
    | 'folder'
    | 'file-plus'
    | 'zoom-in'
    | 'zoom-out'
    | 'send'
    | 'wand'
    | 'grip'
    | 'home'
    | 'layout'
    | 'disc'
    | 'download'
    | 'gear'
    | 'sliders'
    | 'user'
    | 'logout'
    | 'upgrade'
    | 'help';

  interface Props {
    name: IconName;
    size?: number;
    strokeWidth?: number;
  }

  let { name, size = 14, strokeWidth = 1.7 }: Props = $props();

  const filled = new Set(['play', 'pause', 'skip-back', 'rewind', 'forward', 'wand']);

  const paths: Record<IconName, string> = {
    'skip-back': 'M18 5v14L8 12l10-7zM6 5h2v14H6z',
    rewind: 'M11 5v14L2 12l9-7zm11 0v14l-9-7 9-7z',
    play: 'M6 4l14 8-14 8z',
    pause: 'M7 4h4v16H7zm6 0h4v16h-4z',
    record: 'M12 4a8 8 0 100 16 8 8 0 000-16zm0 3.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9z',
    forward: 'M2 5l9 7-9 7V5zm11 0l9 7-9 7V5z',
    minus: 'M5 12h14',
    plus: 'M12 5v14M5 12h14',
    loop: 'M4 9a4 4 0 014-4h9m0 0l-3-3m3 3l-3 3M20 15a4 4 0 01-4 4H7m0 0l3 3m-3-3l3-3',
    metronome: 'M12 3l6 16H6L12 3zM4 19h16M12 9l6 7',
    keyboard: 'M4 6h16v12H4zM8 6v7M12 6v7M16 6v7',
    undo: 'M9 10H4V5m0 5l3.5-3.5A7.5 7.5 0 1119.5 12',
    redo: 'M15 10h5V5m0 5l-3.5-3.5A7.5 7.5 0 104.5 12',
    sparkles:
      'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z',
    mixer: 'M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0M14 5v4M8 10v4M16 15v4',
    inspector: 'M3 4h18v16H3zM15 4v16',
    pianoroll: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v5M15 10v5',
    waveform: 'M3 12h2l2-6 3 12 3-9 2 5 2-3h4',
    mic: 'M12 4a3 3 0 013 3v4a3 3 0 01-6 0V7a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4',
    trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
    'chevron-down': 'M6 9l6 6 6-6',
    'chevron-right': 'M9 6l6 6-6 6',
    'chevron-left': 'M15 6l-6 6 6 6',
    close: 'M6 6l12 12M18 6L6 18',
    save: 'M4 4h13l3 3v13H4zM8 4v6h8V4M8 15h8',
    folder: 'M3 6h6l2 2h10v11H3z',
    'file-plus': 'M6 3h8l4 4v14H6zM12 11v6M9 14h6',
    'zoom-in': 'M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l4 4M11 8v6M8 11h6',
    'zoom-out': 'M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l4 4M8 11h6',
    send: 'M4 12l16-8-6 8 6 8-16-8z',
    wand: 'M5 19L16 8l3 3L8 22H5v-3zM18 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z',
    grip: 'M8 8h.01M8 12h.01M8 16h.01M16 8h.01M16 12h.01M16 16h.01',
    home: 'M3 12l9-9 9 9M5 10v11h5v-6h4v6h5V10',
    layout: 'M3 4h18v16H3zM9 4v16M3 10h6',
    disc: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 10a2 2 0 110 4 2 2 0 010-4z',
    download: 'M12 4v12m0 0l-4-4m4 4l4-4M5 20h14',
    gear: 'M12 8a4 4 0 100 8 4 4 0 000-8zM4.5 12l1.2-2.1 2.3.4 1.2-2.2 2.1 1.2L12 5l1.7 2.3 2.1-1.2 1.2 2.2 2.3-.4L21.5 12l-1.2 2.1-2.3-.4-1.2 2.2-2.1-1.2L12 19l-1.7-2.3-2.1 1.2-1.2-2.2-2.3.4L4.5 12z',
    sliders: 'M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0M14 5v4M8 10v4M16 15v4',
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c1.8-3.2 4.7-5 8-5s6.2 1.8 8 5',
    logout: 'M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M16 16l4-4-4-4M20 12H10',
    upgrade: 'M12 4l6 8h-4v8h-4v-8H6l6-8z',
    help: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9.1 9a3 3 0 015.8 1c0 2-3 2.2-3 4M12 17.2h.01'
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled.has(name) ? 'currentColor' : 'none'}
  stroke={filled.has(name) ? 'none' : 'currentColor'}
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={paths[name]} />
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
