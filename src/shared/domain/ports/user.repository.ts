export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  searchExistsById(id: number): Promise<boolean>;
}
