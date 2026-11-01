import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { SearchController } from './search.controller'
import { SearchRepository } from './search.repository'
import { SearchService } from './search.service'

/** The header search box: one read door plus the caller's recent list.
 *
 *  `EnginesModule` because the service asks E2 per kind. Exported for the
 *  assistant's `search_records`, which must read through the same fences. */
@Module({
  imports: [EnginesModule],
  controllers: [SearchController],
  providers: [SearchService, SearchRepository],
  exports: [SearchService],
})
export class SearchModule {}
