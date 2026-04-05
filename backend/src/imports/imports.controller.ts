import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ImportsService } from './imports.service';

@ApiTags('Imports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('questions:dry-run')
  dryRun(@Body() payload: unknown) {
    return this.importsService.dryRun(payload);
  }

  @Post('questions:commit')
  commit(@Body() payload: unknown) {
    return this.importsService.commit(payload);
  }
}

