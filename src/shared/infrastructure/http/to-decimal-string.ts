import Decimal from 'decimal.js';
import { MONEY_SCALE } from '@/shared/domain/money-scale';

export function toDecimalString(value: Decimal): string {
  return value
    .toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP)
    .toFixed(MONEY_SCALE);
}
