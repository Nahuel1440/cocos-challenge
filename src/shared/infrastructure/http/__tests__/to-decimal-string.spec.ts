import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { toDecimalString } from '@/shared/infrastructure/http/to-decimal-string';

describe('toDecimalString', () => {
  it('should round half up to two decimals on output', () => {
    const HALF_CENT = new Decimal('0.125');

    expect(toDecimalString(HALF_CENT)).toBe('0.13');
  });

  it('should print 0.00 when the return rounds to zero from below', () => {
    const TINY_LOSS = new Decimal('-0.004');

    expect(toDecimalString(TINY_LOSS)).toBe('0.00');
  });
});
