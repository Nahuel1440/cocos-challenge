import { Module } from '@nestjs/common';
import { SearchInstrumentsUseCase } from '@/instruments/application/use-cases/search-instruments.use-case';
import { INSTRUMENT_REPOSITORY } from '@/instruments/domain/ports/instrument.repository';
import { InstrumentsController } from '@/instruments/infrastructure/http/instruments.controller';
import { PrismaInstrumentRepository } from '@/instruments/infrastructure/persistence/prisma-instrument.repository';

@Module({
  controllers: [InstrumentsController],
  providers: [
    SearchInstrumentsUseCase,
    { provide: INSTRUMENT_REPOSITORY, useClass: PrismaInstrumentRepository },
  ],
})
export class InstrumentsModule {}
