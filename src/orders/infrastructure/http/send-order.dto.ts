import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

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

export class SendOrderDto {
  @IsInt()
  public instrumentId!: number;

  @IsIn(['BUY', 'SELL'])
  public side!: 'BUY' | 'SELL';

  @IsIn(['MARKET', 'LIMIT'])
  @Validate(SizeXorAmount)
  @Validate(LimitHasPrice)
  public type!: 'MARKET' | 'LIMIT';

  @IsOptional()
  @IsInt()
  public size?: number;

  @IsOptional()
  @IsString()
  public amount?: string;

  @IsOptional()
  @IsString()
  public price?: string;
}
