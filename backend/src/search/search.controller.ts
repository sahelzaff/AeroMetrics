import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TrackSelectDto } from './dto/track-select.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @CurrentUser('userId') userId: string,
    @Query('q') query = '',
    @Query('limit') limit = '20',
  ) {
    return this.searchService.search(userId, query, Number(limit));
  }

  @Post('track-select')
  trackSelect(@CurrentUser('userId') userId: string, @Body() dto: TrackSelectDto) {
    return this.searchService.trackSelection(userId, dto);
  }
}
