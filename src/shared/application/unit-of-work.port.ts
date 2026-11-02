export const UNIT_OF_WORK = Symbol('UnitOfWork');

export type IsolationLevel =
  'read-committed' | 'repeatable-read' | 'serializable';

export interface UnitOfWorkOptions {
  // Defaults to READ COMMITTED.
  isolation?: IsolationLevel;
  readOnly?: boolean;
}

export interface UnitOfWork {
  run<T>(work: () => Promise<T>, options?: UnitOfWorkOptions): Promise<T>;
}
