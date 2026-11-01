export interface UserRepository {
  exists(id: number): Promise<boolean>;
}
