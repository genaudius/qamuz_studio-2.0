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

/** Admin flag passed by the SaaS parent via `?admin=1` on the iframe URL. */
export function readIsAdmin(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('admin') === '1';
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

/**
 * Master Pro is Premium-only inside the SaaS. Local/desktop remains open.
 *
 * - Admins always have access, regardless of plan.
 * - Pass the live account tier (from the reactive account store, fed by the
 *   parent via the `qamuz-studio:user` postMessage) so access unlocks even when
 *   the `?plan=` query param is missing or the iframe navigated internally.
 * - Falls back to the query param when no tier / admin flag is provided.
 */
export function hasMasterProAccess(tier?: PlanTier, isAdmin?: boolean): boolean {
  if (!isStudioEmbedded()) return true;
  if (isAdmin ?? readIsAdmin()) return true;
  return isPremiumPlan(tier ?? readPlanTier());
}
