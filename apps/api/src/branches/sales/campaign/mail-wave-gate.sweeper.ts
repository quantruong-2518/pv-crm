import { Injectable, Logger } from '@nestjs/common'
import { MailRunRepository, type DueGatedRun } from '@api/platform/mail/mail-run.repository'
import { MasRepository } from './mas.repository'

/** Written into `platform.audit.actor_id` for a release nobody pressed. */
const GATE_ACTOR = 'system'

/** G6 — THE RELEASE GATE OF A LATER WAVE, judged from the Sales side.
 *
 *  Wave ≥ 2 is filed with `awaits_release`, and the relay refuses its rows
 *  until `released_at` is set — fails closed. Each tick this asks the platform
 *  which held waves are due, withholds the recipients who replied or met
 *  since the chain's first letters left (`MasRepository.gateHolds`), and opens
 *  the gate, in one transaction with a system audit row.
 *
 *  A branch sweeper because the question reads `sales.meeting` and
 *  `sales.opportunity`, which `platform/` may not. Same tier and cadence as
 *  `CampaignSweeper` (ADR 0045); the worker runs it before the relay so a
 *  released wave goes out on the same tick. Each run is judged on its own: a
 *  failure rolls back that run only, leaves its gate shut for the next tick,
 *  and never keeps the waves after it waiting. */
@Injectable()
export class MailWaveGateSweeper {
  private readonly log = new Logger('sales.mail-gate')

  constructor(
    private readonly runs: MailRunRepository,
    private readonly repo: MasRepository,
  ) {}

  /** One pass. Returns the run ids whose gate this pass opened. */
  async sweep(now: Date = new Date()): Promise<string[]> {
    const opened: string[] = []
    for (const due of await this.runs.dueGatedRuns(now)) {
      try {
        if (await this.open(due)) opened.push(due.runId)
      } catch (err) {
        this.log.error(`Gate of run ${due.runId} not judged; retrying next tick`, err)
      }
    }

    if (opened.length > 0)
      this.log.log(`Opened ${opened.length} gated wave(s): ${opened.join(' · ')}`)
    return opened
  }

  private async open(due: DueGatedRun): Promise<boolean> {
    const result = await this.repo.run(async (tx) => {
      const holds = await this.repo.gateHolds(tx, due.runId)
      const released = await this.runs.release(tx, due.runId, holds)
      if (released.released) {
        await this.repo.writeRunNote(tx, {
          actorId: GATE_ACTOR,
          runId: due.runId,
          note: `mở cổng đợt sau · giữ lại ${released.withheld}/${due.pending.length} thư (đã trả lời hoặc đã gặp)`,
        })
      }
      return released
    })
    return result.released
  }
}
