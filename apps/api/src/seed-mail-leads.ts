import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { LeadCreate } from '@pv/contracts'
import { LeadModule } from '@api/branches/sales/lead/lead.module'
import { LeadWriteRepository } from '@api/branches/sales/lead/lead-write.repository'
import { LeadWriteService } from '@api/branches/sales/lead/lead-write.service'
import { ConfigModule } from '@api/platform/config/config.module'
import { DbModule, DB_HANDLE } from '@api/platform/db/db.module'
import type { DbHandle } from '@api/platform/db/create-db'
import { RolePermissionRepository } from '@api/platform/roles/role-permission.repository'
import { ActorRepository } from '@api/platform/session/actor.repository'

/** One lead per real test mailbox, so a MAS batch has somewhere to land.
 *
 *  Goes through `LeadWriteService.create` — the `POST /sales/leads` door — so
 *  account, run, contact, mirror row and `created` touch are what a person
 *  typing the lead would leave. Only ADDS: a mailbox that already holds a live
 *  lead is skipped, never touched. Nothing is mailed; sending stays a person's
 *  act in the MAS panel.
 *
 *  `RolesModule` is left out on purpose: its seeder rewrites the grant matrix
 *  of whatever database this points at on boot.
 *
 *      pnpm db:seed:mail-leads                 # dry run
 *      pnpm db:seed:mail-leads -- --apply      # write */

const APPLY = process.argv.includes('--apply')

/** Creates the rows; not their holder — the leads are born unowned (`new`). */
const CREATOR = 'u-quantb'

const RECIPIENTS = [
  { email: 'vivian@pebblevina.com', company: 'Pebble Vina', contactName: 'Vivian' },
  {
    email: 'viviannguyen220904@gmail.com',
    company: 'Thử MAS · Vivian Nguyen',
    contactName: 'Vivian Nguyen',
  },
  { email: 'ntvan220904@gmail.com', company: 'Thử MAS · ntvan', contactName: 'Vân' },
  { email: 'vanuyenngoan@gmail.com', company: 'Thử MAS · vanuyenngoan', contactName: 'Vân' },
  {
    email: 'truongbaquan2501@gmail.com',
    company: 'Thử MAS · truongbaquan',
    contactName: 'Trương Bá Quân',
  },
  {
    email: 'quantruong2518.dev@gmail.com',
    company: 'Thử MAS · quantruong',
    contactName: 'Quân Trương',
  },
  { email: 'quantb@senera.vn', company: 'Senera', contactName: 'Quân' },
]

@Module({
  imports: [ConfigModule, DbModule, LeadModule],
  providers: [ActorRepository, RolePermissionRepository],
})
class SeedMailLeadsModule {}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SeedMailLeadsModule, {
    logger: ['error', 'warn'],
  })
  try {
    const caller = await app.get(ActorRepository).byId(CREATOR)
    if (!caller) throw new Error(`Actor ${CREATOR} not found — run db:seed:accounts first.`)

    const repo = app.get(LeadWriteRepository)
    const live = await repo.liveByEmail(
      repo.readonlyHandle,
      RECIPIENTS.map((r) => r.email),
    )
    console.log(`Đích: ${app.get<DbHandle>(DB_HANDLE).kind} · ${APPLY ? 'GHI THẬT' : 'xem trước'}`)

    const leads = app.get(LeadWriteService)
    for (const r of RECIPIENTS) {
      const taken = live.get(r.email)
      if (taken) {
        console.log(`  = ${r.email.padEnd(30)} đã có ${taken}, bỏ qua`)
        continue
      }
      if (!APPLY) {
        console.log(`  + ${r.email.padEnd(30)} ${r.company}`)
        continue
      }
      const row = await leads.create(
        caller.actor,
        LeadCreate.parse({ ...r, motion: 'OUTBOUND', origin: { name: 'Email lạnh' } }),
      )
      console.log(`  + ${r.email.padEnd(30)} ${row.code}`)
    }
    if (!APPLY) console.log('Chưa ghi gì. Thêm --apply để ghi.')
  } finally {
    await app.close()
  }
}

void main().catch((e: unknown) => {
  console.error(e)
  process.exitCode = 1
})
