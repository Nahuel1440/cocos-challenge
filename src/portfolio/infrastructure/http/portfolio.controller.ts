import { Controller, Get, Req } from '@nestjs/common';
import { GetPortfolioUseCase } from '@/portfolio/application/use-cases/get-portfolio.use-case';
import {
  PortfolioPresenter,
  type PortfolioBody,
} from '@/portfolio/infrastructure/http/portfolio.presenter';

interface UserRequest {
  userId: number;
}

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly getPortfolio: GetPortfolioUseCase) {}

  @Get()
  public async get(@Req() request: UserRequest): Promise<PortfolioBody> {
    const view = await this.getPortfolio.run({ userId: request.userId });

    return PortfolioPresenter.present(view);
  }
}
