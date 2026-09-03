import { Controller, Get } from '@nestjs/common'
import { Need } from '@api/platform/access/need.decorator'
import { LeaderboardService } from './leaderboard.service'

/** `/sales/leaderboard` — one row per salesperson, the whole desk at once.
 *
 *  Its own root rather than a path under any of the three books, because a row
 *  here joins all three: hanging it off one would make the other two reach
 *  across a module boundary for it.
 *
 *  It asks for the performance permission, not the three books' own. Whoever is
 *  allowed to read how the desk is doing may read this; demanding all three
 *  book permissions instead would shut out marketing, who holds none of them
 *  and is on the board.
 *
 *  NOT `scoped`, and here that is not a trade but the definition: a leaderboard
 *  cut to the rows you own is a leaderboard with one row on it. */
@Controller('sales/leaderboard')
export class LeaderboardController {
  constructor(private readonly desk: LeaderboardService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'hiệu-suất.xem' })
  rows() {
    return this.desk.rows()
  }
}
