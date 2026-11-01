export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  exists(id: number): Promise<boolean>;
}
