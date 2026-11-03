import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { POSTGRES_INT_MAX } from '@/shared/infrastructure/http/postgres-int-max';

const DIGITS = /^\d+$/;

@Injectable()
export class OrderIdPipe implements PipeTransform<string, number> {
  public transform(value: string): number {
    const id = Number(value);

    if (!DIGITS.test(value) || id < 1 || id > POSTGRES_INT_MAX) {
      throw new BadRequestException(
        `id must be an integer from 1 to ${POSTGRES_INT_MAX}`,
      );
    }

    return id;
  }
}
