import { IsString } from 'class-validator';

export class SearchInstrumentsQueryDto {
  @IsString()
  public query!: string;
}
