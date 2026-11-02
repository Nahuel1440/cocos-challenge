import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { isUUID } from 'class-validator';

@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<
  string | undefined,
  string | undefined
> {
  public transform(value: string | undefined): string | undefined {
    if (value !== undefined && !isUUID(value)) {
      throw new BadRequestException('Idempotency-Key must be a UUID');
    }

    return value;
  }
}
