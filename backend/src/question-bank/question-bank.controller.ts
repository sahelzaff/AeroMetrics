import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { QuestionBankService } from './question-bank.service';

@ApiTags('Question Bank')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('question-bank')
export class QuestionBankController {
  constructor(private readonly questionBankService: QuestionBankService) {}

  @Get('structure')
  structure() {
    return this.questionBankService.getStructure();
  }

  @Get('questions')
  questions(@Query('chapterId') chapterId: string, @Query('limit') limit?: string) {
    return this.questionBankService.getQuestionsByChapter(chapterId, limit ? Number(limit) : 100);
  }
}
