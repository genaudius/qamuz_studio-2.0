/**
 * Elegant in-app notices for Studio (replaces window.confirm / alert).
 */

export type StudioNoticeTone = 'info' | 'success' | 'warning' | 'danger';

export type StudioNoticeRequest = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  tone?: StudioNoticeTone;
  showCancel?: boolean;
};

class StudioNoticeStore {
  open = $state(false);
  request = $state<StudioNoticeRequest | null>(null);
  #resolve: ((ok: boolean) => void) | null = null;

  confirm(input: StudioNoticeRequest): Promise<boolean> {
    return new Promise((resolve) => {
      this.#resolve?.(false);
      this.#resolve = resolve;
      this.request = {
        tone: 'info',
        confirmLabel: 'Continuar',
        cancelLabel: 'Cancelar',
        showCancel: true,
        ...input
      };
      this.open = true;
    });
  }

  alert(input: Omit<StudioNoticeRequest, 'cancelLabel' | 'showCancel'>): Promise<void> {
    return this.confirm({
      ...input,
      confirmLabel: input.confirmLabel ?? 'Entendido',
      cancelLabel: null,
      showCancel: false
    }).then(() => undefined);
  }

  settle(ok: boolean): void {
    this.open = false;
    const resolve = this.#resolve;
    this.#resolve = null;
    this.request = null;
    resolve?.(ok);
  }
}

export const studioNotice = new StudioNoticeStore();
