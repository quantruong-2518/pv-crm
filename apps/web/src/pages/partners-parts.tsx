import { useState } from 'react'
import { Button, Eye, EyeOff, Icon, Input, Modal, SectionTitle } from '@pv/ui'
import { isApiError, userMessage, type ApiError } from '@/app/api'
import { toastDone } from '@/app/toast'
import { PARTNER_NAME_MAX, type Partner, type PartnerPatch } from '@pv/contracts'
import { useCreatePartner, usePatchPartner } from '@/data/partners'
import { useReferrerMotions } from '@/data/sales-motions'
import { OriginSelect } from '@/components/lead-origin-pickers'

/** The two modals of the partner book (`pages/partners.tsx`).
 *
 *  One edit modal per partner, like the origin catalog: rename, re-file and
 *  hide act on the same row. Every write answers with the list re-read —
 *  nothing is painted ahead of the server. */

const failed = (error: ApiError | null) => (isApiError(error) ? userMessage(error) : undefined)

/** `REF-nnnn` is minted by the server — the modal asks only name and kind. */
export function AddPartnerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [originId, setOriginId] = useState('')
  const create = useCreatePartner()

  const canSave = name.trim() !== '' && originId !== '' && !create.isPending
  const submit = () =>
    create.mutate(
      { name: name.trim(), originId },
      {
        onSuccess: (partner) => {
          toastDone(`Đã thêm ${partner.code} · ${partner.name}`)
          onClose()
        },
      },
    )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Thêm đối tác"
      subtitle="Người hoặc đơn vị gửi lead cho mình — đại lý, khách cũ, người quen. Mã REF do hệ thống cấp."
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {failed(create.error) && (
            <span role="alert" className="text-destructive-foreground mr-auto text-[11.5px]">
              {failed(create.error)}
            </span>
          )}
          <Button size="lg" variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button size="lg" disabled={!canSave} onClick={submit}>
            Thêm đối tác
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Tên</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={PARTNER_NAME_MAX}
            autoFocus
          />
        </label>
        <KindField value={originId} onChange={setOriginId} />
      </div>
    </Modal>
  )
}

/** Kinds are origins filed under the motions whose live `asks` is `REFERRER`. */
function KindField({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const motions = useReferrerMotions()
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-[11px]">
        Loại (nguồn của lead được giới thiệu)
      </span>
      <OriginSelect
        label="Loại"
        hideLabel
        value={value}
        onChange={onChange}
        motions={motions ?? []}
        emptyLabel="— chọn loại —"
      />
      <span className="text-muted-foreground text-[11px] leading-[1.5]">
        Chỉ nguồn thuộc phương án hỏi mã giới thiệu. Thiếu loại thì thêm ở trang Nguồn lead.
      </span>
    </div>
  )
}

/** Rename · re-file · hide/show. `Modal` keeps the last body through its exit,
 *  so `null` simply closes it. */
export function EditPartnerModal({
  partner,
  onClose,
}: {
  partner: Partner | null
  onClose: () => void
}) {
  return (
    <Modal
      open={partner !== null}
      onClose={onClose}
      title={partner?.name ?? ''}
      subtitle={partner?.code}
      footer={
        <div className="flex justify-end">
          <Button size="lg" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
      }
    >
      {partner && <EditPartnerBody key={partner.code} partner={partner} />}
    </Modal>
  )
}

function EditPartnerBody({ partner }: { partner: Partner }) {
  const [name, setName] = useState(partner.name)
  const [originId, setOriginId] = useState(partner.originId)
  const patch = usePatchPartner()

  const renamed = name.trim() !== '' && name.trim() !== partner.name
  const refiled = originId !== '' && originId !== partner.originId
  const send = (body: PartnerPatch, done: string) =>
    patch.mutate({ code: partner.code, body }, { onSuccess: () => toastDone(done) })
  const refusal = failed(patch.error)

  return (
    <fieldset disabled={patch.isPending} className="flex flex-col gap-6">
      {refusal && (
        <p role="alert" className="text-destructive-foreground text-[11.5px] leading-[1.5]">
          {refusal}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle size="sm">Đổi tên</SectionTitle>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={PARTNER_NAME_MAX}
            aria-label="Tên đối tác"
            className="min-w-0 flex-1"
          />
          <Button
            size="lg"
            disabled={!renamed}
            onClick={() => send({ name: name.trim() }, 'Đã đổi tên đối tác')}
          >
            Lưu tên
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle
          size="sm"
          hint="Chỉ áp cho lead MỚI được giới thiệu từ nay — nguồn của lead đã vào sổ được chốt lúc nhận, không đổi theo."
        >
          Đổi loại
        </SectionTitle>
        <KindField value={originId} onChange={setOriginId} />
        <div>
          <Button
            size="lg"
            disabled={!refiled}
            onClick={() => send({ originId }, 'Đã đổi loại đối tác')}
          >
            Lưu loại
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle
          size="sm"
          hint="Ẩn thì đối tác thôi hiện ở ô chọn. Lead đã mang mã này giữ nguyên."
        >
          {partner.active ? 'Ẩn đối tác' : 'Hiện lại đối tác'}
        </SectionTitle>
        <div>
          <Button
            size="lg"
            variant="secondary"
            onClick={() =>
              send(
                { active: !partner.active },
                partner.active ? 'Đã ẩn đối tác' : 'Đã hiện lại đối tác',
              )
            }
          >
            <Icon icon={partner.active ? EyeOff : Eye} size={16} />
            {partner.active ? 'Ẩn đối tác' : 'Hiện lại'}
          </Button>
        </div>
      </section>
    </fieldset>
  )
}
