/**
 * Snapshot undo stack with named actions, mirroring DAWCore/Undo/UndoManager.swift
 * so the menu can show "Undo Rename Track" rather than a bare "Undo".
 *
 * Snapshots are whole-project copies. A project is a few hundred KB of plain
 * data, so this stays cheap and cannot desync the way inverse-command undo does.
 * Callers pass already-detached snapshots (`$state.snapshot`), so nothing here
 * clones again.
 */

export interface UndoEntry<T> {
  name: string;
  snapshot: T;
}

export class UndoStack<T> {
  #undo = $state<UndoEntry<T>[]>([]);
  #redo = $state<UndoEntry<T>[]>([]);

  readonly limit: number;

  constructor(limit = 100) {
    this.limit = limit;
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  get undoActionName(): string {
    return this.#undo.at(-1)?.name ?? '';
  }

  get redoActionName(): string {
    return this.#redo.at(-1)?.name ?? '';
  }

  /** Record the state as it was *before* the change described by `name`. */
  push(name: string, snapshot: T): void {
    this.#undo.push({ name, snapshot });
    if (this.#undo.length > this.limit) this.#undo.shift();
    this.#redo = [];
  }

  /** Returns the state to restore; `current` is stashed for redo. */
  undo(current: T): UndoEntry<T> | undefined {
    const entry = this.#undo.pop();
    if (!entry) return undefined;

    this.#redo.push({ name: entry.name, snapshot: current });
    return entry;
  }

  redo(current: T): UndoEntry<T> | undefined {
    const entry = this.#redo.pop();
    if (!entry) return undefined;

    this.#undo.push({ name: entry.name, snapshot: current });
    return entry;
  }

  clear(): void {
    this.#undo = [];
    this.#redo = [];
  }
}
