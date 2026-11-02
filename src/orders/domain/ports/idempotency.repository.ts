export const IDEMPOTENCY_REPOSITORY = Symbol('IdempotencyRepository');

export interface StoredResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface IdempotencyRecord {
  requestHash: string;
  orderId: number;
  response: StoredResponse;
}

export interface SearchByKeyParams {
  userId: number;
  operation: string;
  key: string;
}

export interface SaveIdempotencyParams extends SearchByKeyParams {
  requestHash: string;
  orderId: number;
  response: StoredResponse;
}

export interface IdempotencyRepository {
  searchByKey(params: SearchByKeyParams): Promise<IdempotencyRecord | null>;
  save(params: SaveIdempotencyParams): Promise<void>;
}
