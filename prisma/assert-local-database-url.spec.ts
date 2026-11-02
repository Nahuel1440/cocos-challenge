import { describe, expect, it } from 'vitest';
import { assertLocalDatabaseUrl } from './assert-local-database-url';

describe('assertLocalDatabaseUrl', () => {
  it('should refuse a non-local DATABASE_URL unless ALLOW_REMOTE_DB is set', () => {
    const remote = 'postgresql://u:p@example.invalid/db';

    expect(() => assertLocalDatabaseUrl(remote, undefined)).toThrow(
      /ALLOW_REMOTE_DB/,
    );
    expect(() => assertLocalDatabaseUrl(remote, 'no')).toThrow(
      /ALLOW_REMOTE_DB/,
    );
    expect(() =>
      assertLocalDatabaseUrl(
        'postgresql://u:p@localhost/db?host=example.invalid',
        undefined,
      ),
    ).toThrow(/ALLOW_REMOTE_DB/);
    expect(() => assertLocalDatabaseUrl('not a url', undefined)).toThrow(
      /ALLOW_REMOTE_DB/,
    );
    expect(() => assertLocalDatabaseUrl(remote, 'yes')).not.toThrow();
    for (const local of [
      'postgresql://u:p@localhost:5434/db',
      'postgresql://u:p@127.0.0.1/db',
      'postgresql://u:p@[::1]:5432/db',
      '',
      undefined,
    ]) {
      expect(() => assertLocalDatabaseUrl(local, undefined)).not.toThrow();
    }
  });
});
