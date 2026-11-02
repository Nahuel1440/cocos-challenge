import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';

const MAX_INT = 2147483647;
const DIGITS = /^\d+$/;

@Injectable()
export class OrderIdPipe implements PipeTransform<string, number> {
  public transform(value: string): number {
    const id = Number(value);

    if (!DIGITS.test(value) || id < 1 || id > MAX_INT) {
      throw new BadRequestException(
        `id must be an integer from 1 to ${MAX_INT}`,
      );
    }

    return id;
  }
}
