/**
 * Launch context when the SaaS opens this DAW in an iframe or window.
 */

export interface StudioLaunch {
  embedded: boolean;
  session: string;
  idea: string;
  autoPlan: boolean;
  plan: string;
  extractStems: boolean;
  musicId: string;
  genre: string;
  instrumental: boolean;
  bpm: number | null;
  imageUrl: string;
  forceNew: boolean;
}

export function readStudioLaunch(): StudioLaunch {
  if (typeof window === 'undefined') {
    return {
      embedded: false,
      session: '',
      idea: '',
      autoPlan: false,
      plan: 'free',
      extractStems: false,
      musicId: '',
      genre: '',
      instrumental: false,
      bpm: null,
      imageUrl: '',
      forceNew: false
    };
  }
  const params = new URLSearchParams(window.location.search);
  const bpmRaw = Number(params.get('bpm'));
  return {
    embedded: params.get('embedded') === '1',
    session: params.get('session') ?? '',
    idea: params.get('idea') ?? '',
    autoPlan: params.get('autoPlan') === '1',
    plan: (params.get('plan') ?? 'free').toLowerCase(),
    extractStems: params.get('extractStems') === '1',
    musicId: params.get('musicId') ?? '',
    genre: params.get('genre') ?? '',
    instrumental: params.get('instrumental') === '1',
    bpm: Number.isFinite(bpmRaw) && bpmRaw >= 60 && bpmRaw <= 200 ? Math.round(bpmRaw) : null,
    imageUrl: params.get('imageUrl') ?? '',
    forceNew: params.get('forceNew') === '1'
  };
}
