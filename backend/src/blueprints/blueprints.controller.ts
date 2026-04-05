import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BlueprintsService } from './blueprints.service';
import { CreateBlueprintDto } from './dto/create-blueprint.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Blueprints')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('blueprints')
export class BlueprintsController {
  constructor(private readonly blueprintsService: BlueprintsService) {}

  @Get()
  list() {
    return this.blueprintsService.list();
  }

  @Post('auto-plan')
  autoPlan(@CurrentUser('userId') userId: string, @Body() dto: CreateBlueprintDto) {
    return this.blueprintsService.previewAutoRules(userId, dto);
  }

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateBlueprintDto) {
    return this.blueprintsService.create(userId, dto);
  }
}
