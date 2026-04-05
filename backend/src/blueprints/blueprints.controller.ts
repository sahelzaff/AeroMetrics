import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BlueprintsService } from './blueprints.service';
import { CreateBlueprintDto } from './dto/create-blueprint.dto';

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

  @Post()
  create(@Body() dto: CreateBlueprintDto) {
    return this.blueprintsService.create(dto);
  }
}

