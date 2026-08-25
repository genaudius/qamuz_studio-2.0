/**
 * Maestro credit wallet shown in the DAW chat.
 * Embedded Studio spends QAMUZ AI credits; desktop uses a local balance
 * so the same warnings work while producing offline.
 */

import { saasApi } from '$lib/saas-api';
import { isEmbedded } from '$lib/saas';

export type MaestroSpendAction = 'mix' | 'stems' | 'plan' | 'render' | 'edit';

export type SpendResult = {
  ok: boolean;
  cost: number;
  remaining: number;
  unlimited: boolean;
  low: boolean;
  message: string;
};

export const MAESTRO_COSTS: Record<MaestroSpendAction, number> = {
  mix: 1,
  stems: 2,
  plan: 1,
  render: 5,
  edit: 2
};

export const LOW_CREDIT_THRESHOLD = 10;
const LOCAL_KEY = 'qamuz.maestro.wallet.v1';
const LOCAL_START = 40;

function readLocal(): number {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw == null) return LOCAL_START;
    const n = Number(JSON.parse(raw));
    return Number.isFinite(n) ? n : LOCAL_START;
  } catch {
    return LOCAL_START;
  }
}

function writeLocal(n: number): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(n));
}

export class MaestroWallet {
  balance = $state(0);
  unlimited = $state(false);
  ready = $state(false);
  source = $state<'saas' | 'local'>('local');

  get low(): boolean {
    return !this.unlimited && this.balance > 0 && this.balance <= LOW_CREDIT_THRESHOLD;
  }

  get empty(): boolean {
    return !this.unlimited && this.balance <= 0;
  }

  costOf(action: MaestroSpendAction): number {
    return MAESTRO_COSTS[action];
  }

  async refresh(): Promise<void> {
    if (isEmbedded()) {
      const remote = await saasApi({ path: '/api/studio/maestro-usage', method: 'GET' });
      if (remote.status === 200 && remote.json && typeof remote.json === 'object') {
        const data = remote.json as {
          creditsBalance?: number;
          unlimited?: boolean;
        };
        this.unlimited = Boolean(data.unlimited);
        this.balance = Number(data.creditsBalance ?? 0);
        this.source = 'saas';
        this.ready = true;
        return;
      }
    }
    this.unlimited = false;
    this.balance = readLocal();
    this.source = 'local';
    this.ready = true;
  }

  canAfford(action: MaestroSpendAction): boolean {
    if (this.unlimited) return true;
    return this.balance >= this.costOf(action);
  }

  async spend(action: MaestroSpendAction): Promise<SpendResult> {
    if (!this.ready) await this.refresh();
    const cost = this.costOf(action);
    if (this.unlimited) {
      return {
        ok: true,
        cost: 0,
        remaining: this.balance,
        unlimited: true,
        low: false,
        message: 'Plan ilimitado: esta acción no descuenta créditos.'
      };
    }

    if (this.source === 'saas') {
      const remote = await saasApi({
        path: '/api/studio/maestro-usage',
        method: 'POST',
        json: { action }
      });
      const data = (remote.json ?? {}) as {
        ok?: boolean;
        cost?: number;
        creditsBalance?: number;
        unlimited?: boolean;
        low?: boolean;
        message?: string;
        error?: string;
      };
      if (remote.status === 200 && data.ok) {
        this.unlimited = Boolean(data.unlimited);
        this.balance = Number(data.creditsBalance ?? this.balance);
        const remaining = this.balance;
        return {
          ok: true,
          cost: Number(data.cost ?? cost),
          remaining,
          unlimited: this.unlimited,
          low: !this.unlimited && remaining <= LOW_CREDIT_THRESHOLD,
          message: data.message || `Consumí ${data.cost ?? cost} crédito${cost === 1 ? '' : 's'}. Saldo: ${remaining}.`
        };
      }
      const remaining = Number(data.creditsBalance ?? this.balance);
      this.balance = remaining;
      return {
        ok: false,
        cost,
        remaining,
        unlimited: false,
        low: remaining <= LOW_CREDIT_THRESHOLD,
        message:
          data.message ||
          `No hay saldo suficiente. ${labelFor(action)} cuesta ${cost} crédito${cost === 1 ? '' : 's'} y tienes ${remaining}.`
      };
    }

    if (this.balance < cost) {
      return {
        ok: false,
        cost,
        remaining: this.balance,
        unlimited: false,
        low: true,
        message: `No hay saldo suficiente. ${labelFor(action)} cuesta ${cost} crédito${cost === 1 ? '' : 's'} y tienes ${this.balance}. Recarga en QAMUZ AI → Facturación.`
      };
    }
    this.balance -= cost;
    writeLocal(this.balance);
    return {
      ok: true,
      cost,
      remaining: this.balance,
      unlimited: false,
      low: this.balance <= LOW_CREDIT_THRESHOLD,
      message: `Consumí ${cost} crédito${cost === 1 ? '' : 's'}. Saldo: ${this.balance}.`
    };
  }
}

function labelFor(action: MaestroSpendAction): string {
  switch (action) {
    case 'mix':
      return 'Mezclar';
    case 'stems':
      return 'Extraer stems';
    case 'plan':
      return 'Interpretar la idea';
    case 'render':
      return 'Crear la canción';
    case 'edit':
      return 'Editar la región';
  }
}

export const maestroWallet = new MaestroWallet();

export function lowBalanceNotice(remaining: number): string {
  if (remaining <= 0) {
    return 'Ya no tienes créditos. Recarga el saldo para que Maestro pueda mezclar, extraer stems o crear.';
  }
  return `El saldo está bajo: te quedan ${remaining} crédito${remaining === 1 ? '' : 's'}. Recarga pronto para no cortar el trabajo.`;
}
