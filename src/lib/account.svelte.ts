/**
 * QAMUZ AI account shown in the DAW profile menu. Same actions as the old
 * SaaS sidebar: settings, upgrade, sign out. The parent iframe sends the user
 * after Studio posts ready.
 */

import { readPlanTier, type PlanTier } from './entitlement';
import { isStandaloneStudio } from './saas';

export type StudioAccount = {
  name: string;
  email: string;
  plan: PlanTier;
};

export class AccountStore {
  name = $state('');
  email = $state('');
  plan = $state<PlanTier>(readPlanTier());

  get displayName(): string {
    return this.name.trim() || this.email.split('@')[0] || 'Cuenta';
  }

  get planLabel(): string {
    switch (this.plan) {
      case 'pro':
        return 'Pro';
      case 'advanced':
        return 'Advanced';
      case 'starter':
        return 'Starter';
      case 'premium':
        return 'Premium';
      default:
        return 'Free';
    }
  }

  apply(info: Partial<StudioAccount>): void {
    if (typeof info.name === 'string') this.name = info.name;
    if (typeof info.email === 'string') this.email = info.email;
    if (info.plan) this.plan = info.plan;
  }
}

export const account = new AccountStore();

export function listenForAccount(): () => void {
  const params = new URLSearchParams(window.location.search);
  account.apply({
    name: params.get('name') ?? '',
    email: params.get('email') ?? '',
    plan: readPlanTier()
  });

  const onMessage = (event: MessageEvent) => {
    if (event.data?.type !== 'qamuz-studio:user' || !event.data.user) return;
    const user = event.data.user as { name?: string; email?: string; plan?: string };
    const plan = String(user.plan ?? 'free').toLowerCase();
    account.apply({
      name: user.name ?? '',
      email: user.email ?? '',
      plan: (['free', 'starter', 'pro', 'advanced', 'premium'].includes(plan)
        ? plan
        : 'free') as PlanTier
    });
  };
  window.addEventListener('message', onMessage);

  if (isStandaloneStudio() || import.meta.env.DEV) {
    void fetch('/api/auth/me', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        const user = body?.user as { name?: string; email?: string; plan?: string } | undefined;
        if (!user) return;
        const plan = String(user.plan ?? 'free').toLowerCase();
        account.apply({
          name: user.name ?? '',
          email: user.email ?? '',
          plan: (['free', 'starter', 'pro', 'advanced', 'premium'].includes(plan)
            ? plan
            : 'free') as PlanTier
        });
      })
      .catch(() => {
        // Offline / no session yet.
      });
  }

  return () => window.removeEventListener('message', onMessage);
}
