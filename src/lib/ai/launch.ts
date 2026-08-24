/**
 * Launch context when the SaaS opens this DAW in an iframe or window.
 */

export interface StudioLaunch {
  embedded: boolean;
  session: string;
  idea: string;
  autoPlan: boolean;
  plan: string;
}

export function readStudioLaunch(): StudioLaunch {
  if (typeof window === 'undefined') {
    return { embedded: false, session: '', idea: '', autoPlan: false, plan: 'free' };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    embedded: params.get('embedded') === '1',
    session: params.get('session') ?? '',
    idea: params.get('idea') ?? '',
    autoPlan: params.get('autoPlan') === '1',
    plan: (params.get('plan') ?? 'free').toLowerCase()
  };
}
