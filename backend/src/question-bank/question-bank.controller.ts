import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { QuestionBankService } from './question-bank.service';
import { BulkDeleteQuestionsDto } from './dto/bulk-delete-questions.dto';
import { RenameChapterDto } from './dto/rename-chapter.dto';

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

  @Delete('questions/:id')
  deleteQuestion(@Param('id') id: string) {
    return this.questionBankService.deleteQuestion(id);
  }

  @Post('questions/bulk-delete')
  bulkDeleteQuestions(@Body() dto: BulkDeleteQuestionsDto) {
    return this.questionBankService.bulkDeleteQuestions(dto.questionIds);
  }

  @Patch('chapters/:id')
  renameChapter(@Param('id') id: string, @Body() dto: RenameChapterDto) {
    return this.questionBankService.renameChapter(id, dto.name);
  }

  @Delete('chapters/:id')
  deleteChapter(@Param('id') id: string) {
    return this.questionBankService.deleteChapter(id);
  }
}
