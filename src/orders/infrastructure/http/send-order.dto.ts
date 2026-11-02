import Decimal from 'decimal.js';
import {
  IsIn,
  IsInt,
  Max,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { MAX_ORDER_SIZE } from '@/orders/domain/entities/order.entity';
import { POSTGRES_INT_MAX } from '@/shared/infrastructure/http/postgres-int-max';

const MONEY_FORMAT = /^\d+(\.\d{1,2})?$/;
const MIN_MONEY = new Decimal('0.01');
const MAX_MONEY = new Decimal('99999999.99');

const isMoney = (value: unknown): value is string =>
  typeof value === 'string' &&
  MONEY_FORMAT.test(value) &&
  new Decimal(value).gte(MIN_MONEY) &&
  new Decimal(value).lte(MAX_MONEY);

@ValidatorConstraint({ name: 'money' })
class Money implements ValidatorConstraintInterface {
  public validate(value: unknown): boolean {
    return isMoney(value);
  }

  public defaultMessage(): string {
    return '$property must be a decimal string with at most 2 decimals, from 0.01 to 99999999.99';
  }
}

@ValidatorConstraint({ name: 'sizeXorAmount' })
class SizeXorAmount implements ValidatorConstraintInterface {
  public validate(_value: unknown, args: ValidationArguments): boolean {
    const { size, amount } = args.object as SendOrderDto;

    return (size === undefined) !== (amount === undefined);
  }

  public defaultMessage(): string {
    return 'send exactly one of size and amount';
  }
}

@ValidatorConstraint({ name: 'limitHasPrice' })
class LimitHasPrice implements ValidatorConstraintInterface {
  public validate(_value: unknown, args: ValidationArguments): boolean {
    const { type, price } = args.object as SendOrderDto;

    return type !== 'LIMIT' || price !== undefined;
  }

  public defaultMessage(): string {
    return 'a LIMIT order needs a price';
  }
}

@ValidatorConstraint({ name: 'limitAmountBuysAShare' })
class LimitAmountBuysAShare implements ValidatorConstraintInterface {
  public validate(_value: unknown, args: ValidationArguments): boolean {
    const { type, amount, price } = args.object as SendOrderDto;
    if (type !== 'LIMIT' || !isMoney(amount) || !isMoney(price)) return true;

    return new Decimal(amount).divToInt(price).greaterThan(0);
  }

  public defaultMessage(): string {
    return 'the amount does not buy one share at the LIMIT price';
  }
}

@ValidatorConstraint({ name: 'marketHasNoPrice' })
class MarketHasNoPrice implements ValidatorConstraintInterface {
  public validate(_value: unknown, args: ValidationArguments): boolean {
    const { type, price } = args.object as SendOrderDto;

    return type !== 'MARKET' || price === undefined;
  }

  public defaultMessage(): string {
    return 'a MARKET order takes no price';
  }
}

export class SendOrderDto {
  @IsInt()
  @Min(1)
  @Max(POSTGRES_INT_MAX)
  public instrumentId!: number;

  @IsIn(['BUY', 'SELL'])
  public side!: 'BUY' | 'SELL';

  @IsIn(['MARKET', 'LIMIT'])
  @Validate(SizeXorAmount)
  @Validate(LimitHasPrice)
  @Validate(MarketHasNoPrice)
  @Validate(LimitAmountBuysAShare)
  public type!: 'MARKET' | 'LIMIT';

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_ORDER_SIZE)
  public size?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Validate(Money)
  public amount?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Validate(Money)
  public price?: string;
}
