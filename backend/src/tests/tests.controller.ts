import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GenerateTestDto } from './dto/generate-test.dto';
import { TestsService } from './tests.service';

@ApiTags('Tests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tests')
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Post('generate-from-blueprint')
  generateFromBlueprint(@CurrentUser('userId') userId: string, @Body() dto: GenerateTestDto) {
    return this.testsService.generateFromBlueprint(userId, dto.blueprintId, dto.prioritizeWeakChapters ?? false);
  }
}

