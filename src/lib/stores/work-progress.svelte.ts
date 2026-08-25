/**
 * Full-stage wait overlay for long Maestro jobs (stem extract, mix).
 */

export type WorkStep = {
  label: string;
  state: 'pending' | 'active' | 'done';
};

export class WorkProgressStore {
  active = $state(false);
  title = $state('');
  detail = $state('');
  steps = $state<WorkStep[]>([]);
  error = $state<string | null>(null);

  start(title: string, stepLabels: string[], detail = ''): void {
    this.active = true;
    this.title = title;
    this.detail = detail;
    this.error = null;
    this.steps = stepLabels.map((label, index) => ({
      label,
      state: index === 0 ? 'active' : 'pending'
    }));
  }

  setDetail(detail: string): void {
    this.detail = detail;
  }

  advance(index: number, detail?: string): void {
    this.steps = this.steps.map((step, i) => ({
      ...step,
      state: i < index ? 'done' : i === index ? 'active' : 'pending'
    }));
    if (detail) this.detail = detail;
  }

  fail(message: string): void {
    this.error = message;
    this.detail = message;
  }

  stop(): void {
    this.active = false;
    this.title = '';
    this.detail = '';
    this.steps = [];
    this.error = null;
  }
}

export const workProgress = new WorkProgressStore();
