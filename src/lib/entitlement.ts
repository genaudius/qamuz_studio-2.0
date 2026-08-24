/**
 * QAMUZ MASTER PRO access. In the SaaS iframe this is a Premium feature
 * (plan tiers `pro` and `advanced`). Desktop / local vite stays unlocked so
 * you can design the plugin without a Stripe session.
 */

export type PlanTier = 'free' | 'starter' | 'pro' | 'advanced' | 'premium';

export function readPlanTier(): PlanTier {
  if (typeof window === 'undefined') return 'free';
  const raw = (new URLSearchParams(window.location.search).get('plan') ?? 'free').toLowerCase();
  if (raw === 'pro' || raw === 'advanced' || raw === 'premium' || raw === 'starter' || raw === 'free') {
    return raw as PlanTier;
  }
  return 'free';
}

export function isPremiumPlan(tier: PlanTier = readPlanTier()): boolean {
  return tier === 'pro' || tier === 'advanced' || tier === 'premium';
}

export function isStudioEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('embedded') === '1') return true;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Master Pro is Premium-only inside the SaaS. Local/desktop remains open. */
export function hasMasterProAccess(): boolean {
  if (!isStudioEmbedded()) return true;
  return isPremiumPlan();
}
