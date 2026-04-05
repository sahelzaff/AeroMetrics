import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AnswerAttemptDto } from './dto/answer-attempt.dto';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { AttemptsService } from './attempts.service';

@ApiTags('Attempts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Post('start')
  start(@CurrentUser('userId') userId: string, @Body() dto: StartAttemptDto) {
    return this.attemptsService.start(userId, dto.attemptId);
  }

  @Patch(':id/answer')
  answer(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: AnswerAttemptDto,
  ) {
    return this.attemptsService.answer(userId, id, dto.attemptQuestionId, dto.selectedOptionId);
  }

  @Post(':id/submit')
  submit(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.attemptsService.submit(userId, id);
  }

  @Get('history')
  history(
    @CurrentUser('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.attemptsService.history(userId, Number(page), Number(limit));
  }

  @Get(':id/review')
  review(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.attemptsService.review(userId, id);
  }

  @Get(':id')
  detail(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.attemptsService.detail(userId, id);
  }
}
