import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  MAIL_DOOR_LABEL,
  MAIL_DOOR_LEGACY,
  MailTemplateCreateResponse,
  MailTemplateListResponse,
  MailTemplatePatchResponse,
  type MailDoor,
  type MailTemplateCreate,
  type MailTemplateMilestone,
  type MailTemplateListQuery,
  type MailTemplatePatch,
} from '@pv/contracts'
import { invalid, notFound } from '@api/platform/http/problem'
import { MasRepository } from './mas.repository'

/** The template library — `GET/POST/PATCH /sales/mail/templates`.
 *
 *  Split out of `MasService` when templates grew doors and per-door defaults
 *  (G4): nothing here sends a letter, and `mail_run` snapshots subject and body
 *  at send time, so a template is only ever a starting point.
 *
 *  The two cross-row rules of `mail_template_default` — a default's door is one
 *  of the template's `doors`, and the template is active — are checked here in
 *  the same transaction that writes, on a locked template row. */
@Injectable()
export class MailTemplateService {
  constructor(private readonly repo: MasRepository) {}

  async templates(query: MailTemplateListQuery): Promise<MailTemplateListResponse> {
    return MailTemplateListResponse.parse({ rows: await this.repo.templates(query.door) })
  }

  /** A NEW TEMPLATE. `code` is derived from `name` (22/09) rather than typed —
   *  nobody reads it but `mail_run.template_code`. Two templates sharing a name
   *  get `-2`, `-3`…; a true same-millisecond race falls through to the generic
   *  `23505` mapping in `db-error.ts`. Calendly is retired (design §6), so a
   *  posted `bookingUrl` is not stored. */
  async createTemplate(who: Actor, input: MailTemplateCreate): Promise<MailTemplateCreateResponse> {
    const code = await this.uniqueTemplateCode(input.name)
    const doors = input.doors ?? [...MAIL_DOOR_LEGACY]
    assertMilestoneFits(doors, input.milestone ?? null)

    await this.repo.run(async (tx) => {
      await this.repo.createTemplate(tx, {
        code,
        name: input.name,
        subject: input.subject,
        body: input.body,
        ctaLabel: input.cta?.label ?? null,
        ctaUrl: input.cta?.url ?? null,
        milestone: input.milestone ?? null,
        doors,
      })
      await this.repo.setDefaults(tx, code, input.defaultFor ?? [], who.id)
      await this.repo.writeTemplateNote(tx, {
        actorId: who.id,
        code,
        note: `tạo mẫu thư${defaultsNote(input.defaultFor ?? [])}`,
      })
    })

    return MailTemplateCreateResponse.parse(await this.repo.templateByCode(code))
  }

  /** EDIT, RETIRE, MOVE DEFAULTS — or any mix, in one transaction.
   *
   *  `defaultFor` REPLACES the set of doors this template is default for;
   *  absent keeps the stored set. Either way the resulting set must fit inside
   *  the resulting `doors`, and a template that is still some door's default
   *  cannot be retired — the door would open on a template it hides. */
  async patchTemplate(
    who: Actor,
    code: string,
    input: MailTemplatePatch,
  ): Promise<MailTemplatePatchResponse> {
    await this.repo.run(async (tx) => {
      const stored = await this.repo.lockTemplate(tx, code)
      if (!stored) throw notFound('mẫu thư', code)

      const held = await this.repo.defaultsOf(tx, code)
      const doors = input.doors ?? stored.doors
      const defaults = input.defaultFor ?? held
      assertDefaultsFit(doors, defaults, input.active ?? stored.active)
      assertMilestoneFits(doors, input.milestone === undefined ? stored.milestone : input.milestone)

      await this.repo.patchTemplate(tx, code, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.doors !== undefined ? { doors: input.doors } : {}),
        ...(input.cta !== undefined
          ? { ctaLabel: input.cta?.label ?? null, ctaUrl: input.cta?.url ?? null }
          : {}),
        ...(input.bookingUrl === null ? { bookingUrl: null } : {}),
        ...(input.milestone !== undefined ? { milestone: input.milestone } : {}),
      })
      await this.repo.dropDefaults(
        tx,
        code,
        held.filter((door) => !defaults.includes(door)),
      )
      await this.repo.setDefaults(
        tx,
        code,
        defaults.filter((door) => !held.includes(door)),
        who.id,
      )
      await this.repo.writeTemplateNote(tx, {
        actorId: who.id,
        code,
        note: `sửa mẫu thư${defaultsNote(input.defaultFor ?? [])}`,
      })
    })

    return MailTemplatePatchResponse.parse(await this.repo.templateByCode(code))
  }

  /** Slugify `name`, then append `-2`, `-3`… only if that slug is taken — the
   *  common case (one template, one name) never sees a suffix. */
  private async uniqueTemplateCode(name: string): Promise<string> {
    const base = slugify(name) || 'mau-thu'
    let code = base
    for (let n = 2; await this.repo.templateByCode(code); n += 1) {
      code = `${base}-${n}`
    }
    return code
  }
}

/** Design §5, enforced where both rows are in hand. The contract already
 *  refuses `defaultFor ⊄ doors` when both arrive together; this covers the
 *  half that was stored, and retirement. */
function assertDefaultsFit(
  doors: readonly MailDoor[],
  defaults: readonly MailDoor[],
  active: boolean,
) {
  const outside = defaults.filter((door) => !doors.includes(door))
  if (outside.length > 0) {
    throw invalid(
      {
        doors: [`Mẫu đang là mặc định của ${labels(outside)} — bỏ mặc định trước khi bỏ nơi dùng.`],
      },
      'Mẫu mặc định chỉ đặt được cho nơi mẫu được dùng.',
    )
  }
  if (!active && defaults.length > 0) {
    throw invalid(
      { active: [`Mẫu đang là mặc định của ${labels(defaults)} — chọn mẫu mặc định khác trước.`] },
      'Không ngừng dùng được một mẫu đang là mặc định.',
    )
  }
}

/** A milestone is recorded only by a letter sent from the opportunity door
 *  (ADR 0069 §7), so a template hidden from that door could never record it. */
function assertMilestoneFits(doors: readonly MailDoor[], milestone: MailTemplateMilestone | null) {
  if (milestone !== null && !doors.includes('opportunity')) {
    throw invalid(
      { milestone: [`Mẫu ghi mốc phải dùng được ở ${MAIL_DOOR_LABEL.opportunity}.`] },
      'Mẫu ghi mốc chỉ dùng được cho thư gửi từ cơ hội.',
    )
  }
}

const labels = (doors: readonly MailDoor[]): string =>
  doors.map((door) => MAIL_DOOR_LABEL[door]).join(', ')

const defaultsNote = (doors: readonly MailDoor[]): string =>
  doors.length > 0 ? ` · mặc định cho ${labels(doors)}` : ''

/** A template's `name` into the slug that becomes its permanent `code`. `NFD`
 *  splits each diacritic off its base letter so the combining range can be
 *  dropped; the crossed-D letter survives that pass untouched (it is a letter
 *  of its own, not an accented `d`) and needs a replacement of its own. */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}
