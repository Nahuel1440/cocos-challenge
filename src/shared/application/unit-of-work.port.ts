export const UNIT_OF_WORK = Symbol('UnitOfWork');

export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}
