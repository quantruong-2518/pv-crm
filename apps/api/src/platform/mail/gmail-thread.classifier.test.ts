import { describe, expect, it } from 'vitest'
import { addressOf, classifyThreadMessage, type ThreadHeaders } from './gmail-thread.classifier'

const SENDER = 'an.nguyen@pebblevina.com'
const DOMAIN = 'pebblevina.com'

const cases: Array<[string, ThreadHeaders, ReturnType<typeof classifyThreadMessage>]> = [
  ['own: From is the sender mailbox', { from: SENDER }, { kind: 'own' }],
  [
    'own: our correlation header, whatever From says',
    { from: 'someone@else.vn', 'x-pv-delivery': 'b3c1' },
    { kind: 'own' },
  ],
  [
    'own: reply-all written from the sender mailbox, display name and case differ',
    { from: '"An Nguyễn" <An.Nguyen@PebbleVina.com>', subject: 'Re: Báo giá' },
    { kind: 'own' },
  ],
  [
    'own: a colleague replying to all',
    { from: 'Bình Trần <Binh.Tran@PebbleVina.com>', subject: 'Re: Báo giá' },
    { kind: 'own' },
  ],
  ['own: the shared sales inbox answering', { from: 'sales@pebblevina.com' }, { kind: 'own' }],
  [
    'reply: company domain as a prefix of a longer domain',
    { from: 'x@pebblevina.com.evil.vn' },
    { kind: 'reply', from: 'x@pebblevina.com.evil.vn' },
  ],
  [
    'reply: company domain as a subdomain suffix only',
    { from: 'x@notpebblevina.com' },
    { kind: 'reply', from: 'x@notpebblevina.com' },
  ],
  [
    'reply: company domain in the local part',
    { from: 'pebblevina.com@other.vn' },
    { kind: 'reply', from: 'pebblevina.com@other.vn' },
  ],
  [
    'hard bounce: Gmail failure DSN',
    {
      from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
      subject: 'Delivery Status Notification (Failure)',
      'x-failed-recipients': 'gone@khach.vn',
      'auto-submitted': 'auto-replied',
    },
    { kind: 'bounce', hard: true, failed: ['gone@khach.vn'] },
  ],
  [
    'hard bounce: several recipients, mixed case and spacing, google.com daemon',
    {
      from: 'MAILER-DAEMON@Google.com',
      subject: 'Delivery Status Notification (Failure)',
      'x-failed-recipients': ' A@khach.vn , <b@Khach.vn>',
    },
    { kind: 'bounce', hard: true, failed: ['a@khach.vn', 'b@khach.vn'] },
  ],
  [
    'auto: Google daemon naming nobody is noise, never a bounce and never a person',
    { from: 'mailer-daemon@googlemail.com', subject: 'Delivery Status Notification (Failure)' },
    { kind: 'auto' },
  ],
  [
    'reply: forged daemon on a foreign domain cannot bounce anyone',
    {
      from: 'Mail Delivery Subsystem <mailer-daemon@khach.vn>',
      subject: 'Delivery Status Notification (Failure)',
      'x-failed-recipients': 'lan@khach.vn, other@khach.vn',
    },
    { kind: 'reply', from: 'mailer-daemon@khach.vn' },
  ],
  [
    'auto: foreign daemon that declares itself automatic',
    {
      from: 'MAILER-DAEMON@mx.khach.vn',
      subject: 'Undeliverable: Báo giá',
      'x-failed-recipients': 'a@khach.vn',
      'auto-submitted': 'auto-replied',
    },
    { kind: 'auto' },
  ],
  [
    'reply: a lookalike of the Google daemon domain',
    { from: 'mailer-daemon@googlemail.com.evil.vn', 'x-failed-recipients': 'lan@khach.vn' },
    { kind: 'reply', from: 'mailer-daemon@googlemail.com.evil.vn' },
  ],
  [
    'reply: a customer writing from postmaster@',
    { from: 'postmaster@smallco.vn', subject: 'Re: Báo giá' },
    { kind: 'reply', from: 'postmaster@smallco.vn' },
  ],
  [
    'delay bounce: still trying is not a dead mailbox',
    {
      from: 'mailer-daemon@googlemail.com',
      subject: 'Delivery Status Notification (Delay)',
      'x-failed-recipients': 'slow@khach.vn',
    },
    { kind: 'bounce', hard: false, failed: ['slow@khach.vn'] },
  ],
  [
    'auto: out-of-office by Auto-Submitted',
    { from: 'chi@khach.vn', subject: 'Automatic reply', 'auto-submitted': 'auto-replied' },
    { kind: 'auto' },
  ],
  [
    'auto: out-of-office by X-Autoreply alone',
    { from: 'chi@khach.vn', 'x-autoreply': 'yes' },
    { kind: 'auto' },
  ],
  [
    'auto: Precedence auto_reply, value case differs',
    { from: 'chi@khach.vn', precedence: 'Auto_Reply' },
    { kind: 'auto' },
  ],
  ['auto: list mail', { from: 'news@khach.vn', precedence: 'bulk' }, { kind: 'auto' }],
  ['auto: junk precedence', { from: 'news@khach.vn', precedence: ' JUNK ' }, { kind: 'auto' }],
  ['auto: no readable sender', { subject: 'Re: Báo giá' }, { kind: 'auto' }],
  [
    'reply: a person answering',
    { from: 'Chị Lan <Lan@Khach.vn>', subject: 'Re: Báo giá' },
    { kind: 'reply', from: 'lan@khach.vn' },
  ],
  ['reply: bare address', { from: ' lan@khach.vn ' }, { kind: 'reply', from: 'lan@khach.vn' }],
  [
    'reply: Auto-Submitted "no" is a person',
    { from: 'lan@khach.vn', 'auto-submitted': 'No' },
    { kind: 'reply', from: 'lan@khach.vn' },
  ],
  [
    'reply: ordinary Precedence does not hide a person',
    { from: 'lan@khach.vn', precedence: 'first-class' },
    { kind: 'reply', from: 'lan@khach.vn' },
  ],
  [
    'reply: a colleague of the customer whose name merely contains a daemon word',
    { from: 'postmaster.lan@khach.vn' },
    { kind: 'reply', from: 'postmaster.lan@khach.vn' },
  ],
]

describe('classifyThreadMessage', () => {
  it.each(cases)('%s', (_name, headers, expected) => {
    expect(classifyThreadMessage(headers, SENDER, DOMAIN)).toEqual(expected)
  })

  it('reads the sender mailbox in any From form', () => {
    expect(
      classifyThreadMessage({ from: SENDER }, `"An" <${SENDER.toUpperCase()}>`, 'other.vn'),
    ).toEqual({
      kind: 'own',
    })
  })
})

describe('addressOf', () => {
  it.each([
    ['"Lan, Chị" <Lan@Khach.vn>', 'lan@khach.vn'],
    ['Lan <lan@khach.vn> ', 'lan@khach.vn'],
    ['<lan@khach.vn>', 'lan@khach.vn'],
    ['LAN@KHACH.VN', 'lan@khach.vn'],
    [undefined, ''],
  ])('%s → %s', (value, expected) => {
    expect(addressOf(value)).toBe(expected)
  })
})
