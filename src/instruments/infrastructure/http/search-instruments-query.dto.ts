import { IsString, MaxLength, NotContains } from 'class-validator';

const MAX_QUERY_LENGTH = 100;

export class SearchInstrumentsQueryDto {
  @IsString()
  @MaxLength(MAX_QUERY_LENGTH)
  @NotContains('\0', { message: 'query must not contain a NUL character' })
  public query!: string;
}
