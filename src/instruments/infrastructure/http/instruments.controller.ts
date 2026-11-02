import { Controller, Get, Query } from '@nestjs/common';
import { SearchInstrumentsUseCase } from '@/instruments/application/use-cases/search-instruments.use-case';
import { SearchInstrumentsQueryDto } from '@/instruments/infrastructure/http/search-instruments-query.dto';

@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly searchInstruments: SearchInstrumentsUseCase) {}

  @Get()
  public async search(@Query() dto: SearchInstrumentsQueryDto) {
    const instruments = await this.searchInstruments.run({ query: dto.query });

    return { instruments };
  }
}
