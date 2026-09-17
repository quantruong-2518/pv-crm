import { useMemo, useState } from 'react'
import { Check } from '@pv/ui'
import { Badge, Button, GlassCard, Icon, Input, SectionTitle, Textarea } from '@pv/ui'
import type { Lead } from '@pv/engines/fixtures/das-vina'
import { nextStepOf, useLeadDesk, type NextStep } from '@/app/desk'

/** Module 2 · The one thing that has to happen next on this lead.
 *
 *  Deliberately not a todo list: ONE sentence, one deadline, replaced the next
 *  time it is saved. Assigning work to somebody else is a different act with a
 *  different door (`PATCH /sales/leads/:code/owner`).
 *
 *  STILL A DEBT: this lives in `localStorage`, so opening the same lead on
 *  another machine shows nothing. The new layout stands it beside real server
 *  data and gives it a real deadline box, which makes it look more like a
 *  record than it is — so the debt is worth more, not less, than it was. It
 *  moves the day a table holds it (`app/desk.ts` says the same). */

/** Three openings that cover most of what follows a first conversation.
 *
 *  A chip FILLS the box and saves nothing: the sentence still has to be made
 *  true for this customer before it is worth storing. They stand down once the
 *  box holds anything — overwriting somebody's typing on one mis-tap is how a
 *  screen loses work. */
const SUGGESTIONS = ['Gọi lại', 'Gửi hồ sơ năng lực', 'Hẹn khảo sát']

export function NextActionCard({ lead, locked }: { lead: Lead | null; locked?: boolean }) {
  const code = lead?.code ?? ''
  const stored = useLeadDesk((s) => s.nextSteps[code])
  const setNextStep = useLeadDesk((s) => s.setNextStep)
  const saved = useMemo(() => nextStepOf(stored), [stored])

  const [draft, setDraft] = useState<NextStep>(saved)
  /* Reseeded during render when the LEAD changes, not by an effect — the same
     reason the profile form does it: an effect runs after the paint, so the
     previous lead's sentence would flash in the box first. */
  const [seededFor, setSeededFor] = useState(code)
  if (seededFor !== code) {
    setSeededFor(code)
    setDraft(saved)
  }

  if (locked) {
    return (
      <GlassCard variant="b" className="flex flex-col gap-3 p-4 sm:p-5" aria-label="Việc tiếp theo">
        <SectionTitle size="detail">Việc tiếp theo</SectionTitle>
        <p className="text-muted-foreground text-[12.5px] leading-[1.6]">Có sau khi tạo lead.</p>
      </GlassCard>
    )
  }

  const text = draft.text.trim()
  const changed = text !== saved.text || draft.due !== saved.due
  const save = () => {
    setNextStep(code, { text, due: draft.due })
    setDraft({ text, due: draft.due })
  }

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Việc tiếp theo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle size="detail" hint="Một bước cụ thể phải làm tiếp.">
          Việc tiếp theo
        </SectionTitle>
        {saved.text === '' && <Badge tone="warning">Chưa có việc</Badge>}
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12"
            disabled={text !== ''}
            onClick={() => setDraft((cur) => ({ ...cur, text: suggestion }))}
          >
            {suggestion}
          </Button>
        ))}
      </div>

      <Textarea
        value={draft.text}
        rows={2}
        autoGrow
        placeholder="Ví dụ: Gọi lại để chốt lịch khảo sát vào chiều thứ Năm."
        aria-label="Bước nên thực hiện tiếp theo"
        onChange={(e) => setDraft((cur) => ({ ...cur, text: e.target.value }))}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && changed) save()
        }}
      />

      <label className="flex flex-col gap-2">
        <span className="text-glass-foreground text-[13px] font-semibold leading-[1.4]">Hạn</span>
        {/* Empty is allowed and stays allowed: half the steps on a lead are
            "before the week is out", and forcing a time only invents one. */}
        <Input
          type="datetime-local"
          value={draft.due}
          aria-label="Hạn của việc tiếp theo"
          className="h-11 text-[13px]"
          onChange={(e) => setDraft((cur) => ({ ...cur, due: e.target.value }))}
        />
      </label>

      <div className="flex justify-end">
        <Button size="md" className="pointer-coarse:h-12" disabled={!changed} onClick={save}>
          <Icon icon={Check} size={16} />
          Lưu việc
        </Button>
      </div>
    </GlassCard>
  )
}
