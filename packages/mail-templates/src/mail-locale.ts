export type MailLang = 'vi' | 'en' | 'ko'

export const MAIL_LOCALE: Record<MailLang, string> = {
  vi: 'vi-VN',
  en: 'en-US',
  ko: 'ko-KR',
}

export function mailText(lang: MailLang, vi: string, en: string, ko: string): string {
  return { vi, en, ko }[lang]
}
