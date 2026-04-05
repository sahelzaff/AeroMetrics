import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { QueryParser } from './query-parser.service';
import { RankingService } from './ranking.service';
import { IndexService } from './index.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, QueryParser, RankingService, IndexService],
})
export class SearchModule {}
