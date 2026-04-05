import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('chapters')
  chapters(@CurrentUser('userId') userId: string) {
    return this.analyticsService.chapterAnalytics(userId);
  }

  @Get('wrong-questions')
  wrongQuestions(@CurrentUser('userId') userId: string) {
    return this.analyticsService.wrongQuestions(userId);
  }
}

