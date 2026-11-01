import {
  Facebook,
  Globe,
  Linkedin,
  Mail,
  MessageCircle,
  Send,
  Smartphone,
  type IconGlyph,
} from '@pv/ui'
import { type WaveChannel } from '@pv/engines/fixtures/das-vina'

/** What a send channel is called and looks like, everywhere the app names one.
 *  A leaf on purpose: `comms.ts` reads these while it loads, so they cannot sit in
 *  a file on the import cycle through `sales-config.ts`, or the app starts blank.
 *  Here and not in `@pv/ui`, which must not know that Zalo OA exists. */

/** Product names stay in English (law 14). */
export const CHANNEL_LABEL: Record<WaveChannel, string> = {
  email: 'Email',
  'zalo-oa': 'Zalo OA',
  telegram: 'Telegram',
  'in-app': 'Trong app',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  website: 'Website',
}

/** E4's four channels show the sending tool; the rest show the platform, because
 *  they are places to post, not to send. */
export const CHANNEL_ICON: Record<WaveChannel, IconGlyph> = {
  email: Mail,
  'zalo-oa': MessageCircle,
  telegram: Send,
  'in-app': Smartphone,
  linkedin: Linkedin,
  facebook: Facebook,
  website: Globe,
}
