import type { Lang } from '@/app/i18n'
import { PASSWORD_MIN, type AuthError, type AuthErrorKey } from './auth'

/** Auth flow copy — three languages, ONE place. Split out of `auth.ts` because
 *  that file is LOGIC and this is display TEXT; merged, every wording change
 *  means scanning past the server calls to find the right line. */
type Text = Record<Lang, string>

function tr(vi: string, en: string, ko: string): Text {
  return { vi, en, ko }
}

export function t(lang: Lang, text: Text): string {
  return text[lang]
}

/** Reads an `AuthError` whether it points at a translatable key or carries a
 *  server sentence verbatim (the `message` branch of `AuthError`, `data/auth.ts`). */
export function authErrorText(lang: Lang, error: AuthError): string {
  return 'key' in error ? t(lang, AUTH_ERROR_TEXT[error.key]) : error.message
}

const AUTH_ERROR_TEXT: Record<AuthErrorKey, Text> = {
  wrongPair: tr(
    'Email hoặc mật khẩu không đúng.',
    'Incorrect email or password.',
    '이메일 또는 비밀번호가 올바르지 않습니다.',
  ),
  offline: tr(
    'Không nối được máy chủ. Kiểm tra mạng rồi thử lại.',
    'Could not reach the server. Check your connection and try again.',
    '서버에 연결할 수 없습니다. 연결 상태를 확인한 후 다시 시도하세요.',
  ),
  tooFast: tr(
    'Bạn thử quá nhiều lần. Chờ một lát rồi thử lại.',
    'Too many attempts. Wait a moment and try again.',
    '시도 횟수가 너무 많습니다. 잠시 후 다시 시도하세요.',
  ),
  serverTrouble: tr(
    'Máy chủ đang trục trặc. Thử lại sau ít phút.',
    'The server is having trouble. Try again in a few minutes.',
    '서버에 문제가 발생했습니다. 잠시 후 다시 시도하세요.',
  ),
  unreadable: tr(
    'Máy chủ trả dữ liệu phiên không đọc được. Báo quản trị hệ thống.',
    'The server returned session data that can’t be read. Report it to your administrator.',
    '서버가 읽을 수 없는 세션 데이터를 반환했습니다. 관리자에게 문의하세요.',
  ),
  missingEmail: tr('Chưa nhập email.', 'Enter your email.', '이메일을 입력하세요.'),
  missingPassword: tr('Chưa nhập mật khẩu.', 'Enter your password.', '비밀번호를 입력하세요.'),
  invalidEmail: tr('Email sai dạng.', 'Invalid email format.', '이메일 형식이 올바르지 않습니다.'),
  missingCurrentPassword: tr(
    'Chưa nhập mật khẩu hiện tại.',
    'Enter your current password.',
    '현재 비밀번호를 입력하세요.',
  ),
  passwordTooShort: tr(
    `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự.`,
    `Password must be at least ${PASSWORD_MIN} characters.`,
    `비밀번호는 최소 ${PASSWORD_MIN}자여야 합니다.`,
  ),
  samePassword: tr(
    'Mật khẩu mới phải khác mật khẩu đang dùng.',
    'New password must be different from your current one.',
    '새 비밀번호는 현재 비밀번호와 달라야 합니다.',
  ),
  wrongCurrentPassword: tr(
    'Mật khẩu hiện tại không đúng.',
    'Current password is incorrect.',
    '현재 비밀번호가 올바르지 않습니다.',
  ),
  invalidNewPassword: tr(
    'Mật khẩu mới chưa hợp lệ.',
    'New password is invalid.',
    '새 비밀번호가 유효하지 않습니다.',
  ),
  missingNewPassword: tr(
    'Chưa nhập mật khẩu mới.',
    'Enter your new password.',
    '새 비밀번호를 입력하세요.',
  ),
  passwordMismatch: tr(
    'Hai ô chưa khớp nhau.',
    'The two boxes don’t match.',
    '두 항목이 일치하지 않습니다.',
  ),
  resetLinkExpired: tr(
    'Link đặt lại đã hết hạn. Xin một link mới rồi thử lại.',
    'The reset link has expired. Request a new one and try again.',
    '재설정 링크가 만료되었습니다. 새 링크를 요청한 후 다시 시도하세요.',
  ),
  passwordRequirementsNotMet: tr(
    `Mật khẩu chưa đạt yêu cầu — tối thiểu ${PASSWORD_MIN} ký tự.`,
    `Password doesn't meet requirements — at least ${PASSWORD_MIN} characters.`,
    `비밀번호가 요구 사항을 충족하지 않습니다 — 최소 ${PASSWORD_MIN}자.`,
  ),
  sessionExpired: tr(
    'Phiên đã hết hạn. Đăng nhập lại để tiếp tục.',
    'Your session has expired. Sign in again to continue.',
    '세션이 만료되었습니다. 계속하려면 다시 로그인하세요.',
  ),
}

export const passwordEyeText = {
  show: tr('Hiện mật khẩu', 'Show password', '비밀번호 표시'),
  hide: tr('Ẩn mật khẩu', 'Hide password', '비밀번호 숨기기'),
}

export const themeSwitchText = {
  label: tr('Giao diện sáng Đá mịn', 'Light "Stone" appearance', '라이트 "Stone" 테마'),
  toAurora: tr('Chuyển sang Aurora tối', 'Switch to dark Aurora', '어두운 Aurora로 전환'),
  toStone: tr('Chuyển sang Đá mịn sáng', 'Switch to light Stone', '밝은 Stone으로 전환'),
}

export const langSwitchText = {
  label: tr('Đổi ngôn ngữ', 'Change language', '언어 변경'),
}

export const emailHint: Text = tr(
  'ten@pebblevina.com',
  'name@pebblevina.com',
  '이름@pebblevina.com',
)

export const signInText = {
  title: tr('Đăng nhập', 'Sign in', '로그인'),
  email: tr('Email', 'Email', '이메일'),
  password: tr('Mật khẩu', 'Password', '비밀번호'),
  passwordPlaceholder: tr('Mật khẩu của bạn', 'Your password', '비밀번호를 입력하세요'),
  forgotPassword: tr('Quên mật khẩu?', 'Forgot password?', '비밀번호를 잊으셨나요?'),
  remember: tr('Ghi nhớ đăng nhập', 'Remember me', '로그인 정보 저장'),
  submit: tr('Đăng nhập', 'Sign in', '로그인'),
  submitting: tr('Đang vào…', 'Signing in…', '로그인 중…'),
  resetLead: tr(
    'Mật khẩu đã đổi. Đăng nhập lại bằng mật khẩu mới — mọi phiên cũ của tài khoản này đã bị đóng.',
    'Your password has been changed. Sign in again with the new password — every old session on this account has been closed.',
    '비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인하세요 — 이 계정의 기존 세션은 모두 종료되었습니다.',
  ),
  expiredFallback: tr(
    'Phiên trước đã hết hạn. Đăng nhập lại để mở lại trang bạn đang xem.',
    'Your previous session has expired. Sign in again to reopen the page you were on.',
    '이전 세션이 만료되었습니다. 다시 로그인하면 보고 있던 페이지가 열립니다.',
  ),
  why: {
    idle: tr(
      'Máy để không quá lâu nên phiên tự đóng. Đăng nhập lại để mở lại trang bạn đang xem.',
      'The machine sat idle too long and the session closed itself. Sign in again to reopen the page you were on.',
      '기기가 오래 유휴 상태였기 때문에 세션이 자동으로 종료되었습니다. 다시 로그인하면 보고 있던 페이지가 열립니다.',
    ),
    'shift-ended': tr(
      'Hết một ca làm việc. Đăng nhập lại để mở lại trang bạn đang xem.',
      'Your shift has ended. Sign in again to reopen the page you were on.',
      '근무 시간이 종료되었습니다. 다시 로그인하면 보고 있던 페이지가 열립니다.',
    ),
    revoked: tr(
      'Phiên đã bị đóng. Đăng nhập lại nếu người ngồi đây vẫn là bạn.',
      'Your session was closed. Sign in again if it’s still you sitting here.',
      '세션이 종료되었습니다. 계속 본인이 사용 중이라면 다시 로그인하세요.',
    ),
  },
}

export const forgotPasswordText = {
  sentTitle: tr('Đã gửi hướng dẫn', 'Instructions sent', '안내 메일 발송됨'),
  sentBefore: tr('Kiểm tra hộp thư ', 'Check your inbox at ', '받은편지함을 확인하세요: '),
  sentAfter: tr(
    '. Link đặt lại sống trong 30 phút; hết hạn thì xin lại từ đầu.',
    '. The reset link is valid for 30 minutes; request a new one if it expires.',
    '. 재설정 링크는 30분 동안 유효합니다. 만료되면 새로 요청하세요.',
  ),
  hint: tr(
    'Thư chưa tới sau vài phút thì xem hộp thư rác, và kiểm lại xem địa chỉ đã gõ đúng chưa. Địa chỉ chưa từng đăng ký thì sẽ không có thư nào cả.',
    'If nothing arrives after a few minutes, check your spam folder and make sure the address was typed correctly. An address with no account will never receive a letter.',
    '몇 분이 지나도 메일이 오지 않으면 스팸함을 확인하고 주소를 올바르게 입력했는지 확인하세요. 계정이 없는 주소로는 메일이 발송되지 않습니다.',
  ),
  title: tr('Quên mật khẩu', 'Forgot password', '비밀번호 찾기'),
  lead: tr(
    'Nhập email của bạn. Chúng tôi gửi một link đặt lại — không hỏi mật khẩu cũ, vì bạn đang không nhớ nó.',
    'Enter your email. We’ll send a reset link — we won’t ask for your old password, since you don’t remember it.',
    '이메일을 입력하세요. 재설정 링크를 보내드립니다 — 이전 비밀번호는 묻지 않습니다.',
  ),
  email: tr('Email', 'Email', '이메일'),
  submit: tr('Gửi link đặt lại', 'Send reset link', '재설정 링크 보내기'),
  submitting: tr('Đang gửi…', 'Sending…', '보내는 중…'),
  back: tr('Về màn đăng nhập', 'Back to sign in', '로그인 화면으로'),
}

export const resetPasswordText = {
  checkingTitle: tr('Đang kiểm tra link…', 'Checking link…', '링크 확인 중…'),
  checkingLead: tr(
    'Chờ một nhịp — hệ đang xem link này còn dùng được không.',
    'One moment — we’re checking whether this link still works.',
    '잠시만 기다려 주세요 — 이 링크가 아직 유효한지 확인 중입니다.',
  ),
  deadTitle: tr('Link không dùng được', 'Link no longer works', '유효하지 않은 링크'),
  deadLead: tr(
    'Vé đặt lại này hỏng hoặc đã hết hạn. Xin một link mới — mất chừng mười giây.',
    'This reset link is broken or has expired. Request a new one — it takes about ten seconds.',
    '이 재설정 링크가 손상되었거나 만료되었습니다. 새 링크를 요청하세요 — 10초 정도 걸립니다.',
  ),
  requestNew: tr('Xin link mới', 'Request a new link', '새 링크 요청'),
  title: tr('Đặt mật khẩu mới', 'Set a new password', '새 비밀번호 설정'),
  leadBefore: tr('Cho tài khoản ', 'For account ', '계정: '),
  leadAfter: (n: number) =>
    tr(
      `. Tối thiểu ${n} ký tự. Đặt xong, mọi phiên cũ của tài khoản này bị đóng và bạn đăng nhập lại bằng mật khẩu mới.`,
      `. At least ${n} characters. Once set, every old session on this account is closed and you sign in again with the new password.`,
      `. 최소 ${n}자. 설정하면 이 계정의 기존 세션이 모두 종료되며 새 비밀번호로 다시 로그인합니다.`,
    ),
  newPassword: tr('Mật khẩu mới', 'New password', '새 비밀번호'),
  newPasswordPlaceholder: (n: number) =>
    tr(`Tối thiểu ${n} ký tự`, `At least ${n} characters`, `최소 ${n}자`),
  confirm: tr('Nhập lại mật khẩu mới', 'Confirm new password', '새 비밀번호 확인'),
  confirmPlaceholder: tr(
    'Gõ lại đúng chuỗi trên',
    'Retype the password above',
    '위 비밀번호를 다시 입력하세요',
  ),
  submit: tr('Đặt lại mật khẩu', 'Set new password', '비밀번호 재설정'),
  submitting: tr('Đang đặt lại…', 'Setting…', '설정 중…'),
  back: tr('Về màn đăng nhập', 'Back to sign in', '로그인 화면으로'),
}

export const changePasswordText = {
  title: tr('Đổi mật khẩu', 'Change password', '비밀번호 변경'),
  forcedLead: tr(
    'Tài khoản đang dùng mật khẩu mặc định — mật khẩu này nằm trong mã nguồn nên người khác cũng biết. Đặt mật khẩu của riêng bạn để mở khoá phần còn lại của hệ.',
    'This account is using the default password — since it lives in the source code, other people know it too. Set your own password to unlock the rest of the system.',
    '이 계정은 기본 비밀번호를 사용 중입니다 — 소스 코드에 있어 다른 사람도 알 수 있습니다. 나머지 시스템을 사용하려면 본인만의 비밀번호를 설정하세요.',
  ),
  normalLead: tr(
    'Đặt mật khẩu mới. Mọi phiên khác của bạn sẽ bị đăng xuất; phiên đang dùng thì không.',
    'Set a new password. Every other session of yours will be signed out; this one won’t be.',
    '새 비밀번호를 설정하세요. 현재 세션을 제외한 다른 모든 세션은 로그아웃됩니다.',
  ),
  back: tr('Về trang chủ', 'Back to home', '홈으로'),
  currentPassword: tr('Mật khẩu hiện tại', 'Current password', '현재 비밀번호'),
  currentPasswordPlaceholder: tr(
    'Mật khẩu bạn vừa đăng nhập',
    'The password you just signed in with',
    '방금 로그인에 사용한 비밀번호',
  ),
  newPassword: tr('Mật khẩu mới', 'New password', '새 비밀번호'),
  newPasswordPlaceholder: (n: number) =>
    tr(`Tối thiểu ${n} ký tự`, `At least ${n} characters`, `최소 ${n}자`),
  submit: tr('Đổi mật khẩu', 'Change password', '비밀번호 변경'),
  submitting: tr('Đang đổi…', 'Changing…', '변경 중…'),
}

export const reauthText = {
  dialogLabel: tr('Xác nhận mật khẩu', 'Confirm password', '비밀번호 확인'),
  title: tr('Xác nhận mật khẩu', 'Confirm password', '비밀번호 확인'),
  lead: tr(
    'Thao tác này thay đổi quyền vào hệ thống. Gõ lại mật khẩu để xác nhận đúng là bạn.',
    'This action changes access to the system. Retype your password to confirm it’s you.',
    '이 작업은 시스템 접근 권한을 변경합니다. 본인 확인을 위해 비밀번호를 다시 입력하세요.',
  ),
  passwordPlaceholder: tr('Mật khẩu của bạn', 'Your password', '비밀번호를 입력하세요'),
  confirm: tr('Xác nhận', 'Confirm', '확인'),
  confirming: tr('Đang xác nhận…', 'Confirming…', '확인 중…'),
  cancel: tr('Huỷ', 'Cancel', '취소'),
}
