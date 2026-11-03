import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { POSTGRES_INT_MAX } from '@/shared/infrastructure/http/postgres-int-max';

const CANONICAL_ID = /^[1-9]\d*$/;

@Injectable()
export class OrderIdPipe implements PipeTransform<string, string> {
  public transform(value: string): string {
    const id = Number(value);

    if (!CANONICAL_ID.test(value) || id > POSTGRES_INT_MAX) {
      throw new BadRequestException(
        `id must be an integer from 1 to ${POSTGRES_INT_MAX}`,
      );
    }

    return value;
  }
}
