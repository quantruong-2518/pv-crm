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

/** Auth responses are shown in the chosen language. The server's own sentence
 *  is never display copy: it may be Vietnamese while this page is in EN/KO. */
export function authErrorText(lang: Lang, error: AuthError): string {
  return t(lang, AUTH_ERROR_TEXT[error.key])
}

const AUTH_ERROR_TEXT: Record<AuthErrorKey, Text> = {
  wrongPair: tr(
    'Email hoặc mật khẩu không đúng.',
    'Incorrect email or password.',
    '이메일 또는 비밀번호가 올바르지 않습니다.',
  ),
  offline: tr(
    'Không kết nối được. Kiểm tra mạng rồi thử lại.',
    'Connection lost. Check your network and try again.',
    '연결할 수 없습니다. 네트워크를 확인하고 다시 시도하세요.',
  ),
  tooFast: tr(
    'Bạn thử quá nhiều lần. Chờ một lát rồi thử lại.',
    'Too many attempts. Wait a moment and try again.',
    '시도 횟수가 너무 많습니다. 잠시 후 다시 시도하세요.',
  ),
  serverTrouble: tr(
    'Hệ thống đang gặp sự cố. Thử lại sau ít phút.',
    'The server is having trouble. Try again in a few minutes.',
    '서버에 문제가 발생했습니다. 잠시 후 다시 시도하세요.',
  ),
  unreadable: tr(
    'Không đọc được tài khoản. Báo quản trị viên.',
    'Your account could not be loaded. Contact an administrator.',
    '계정 정보를 불러올 수 없습니다. 관리자에게 문의하세요.',
  ),
  missingEmail: tr('Chưa nhập email.', 'Enter your email.', '이메일을 입력하세요.'),
  missingPassword: tr('Chưa nhập mật khẩu.', 'Enter your password.', '비밀번호를 입력하세요.'),
  invalidEmail: tr(
    'Email không đúng định dạng.',
    'Invalid email format.',
    '이메일 형식이 올바르지 않습니다.',
  ),
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
    'Hai mật khẩu chưa khớp.',
    'Passwords do not match.',
    '비밀번호가 일치하지 않습니다.',
  ),
  resetLinkExpired: tr(
    'Link đã hết hạn. Xin link mới.',
    'This link has expired. Request a new one.',
    '링크가 만료되었습니다. 새 링크를 요청하세요.',
  ),
  passwordRequirementsNotMet: tr(
    `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự.`,
    `Use at least ${PASSWORD_MIN} characters.`,
    `최소 ${PASSWORD_MIN}자로 입력하세요.`,
  ),
  sessionExpired: tr(
    'Đã hết thời gian đăng nhập. Đăng nhập lại để tiếp tục.',
    'Your session has expired. Sign in again to continue.',
    '세션이 만료되었습니다. 계속하려면 다시 로그인하세요.',
  ),
}

export const passwordEyeText = {
  show: tr('Hiện mật khẩu', 'Show password', '비밀번호 표시'),
  hide: tr('Ẩn mật khẩu', 'Hide password', '비밀번호 숨기기'),
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
    'Mật khẩu đã đổi. Đăng nhập bằng mật khẩu mới.',
    'Password changed. Sign in with your new password.',
    '비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.',
  ),
  expiredFallback: tr(
    'Phiên đăng nhập đã hết hạn. Đăng nhập lại để mở trang trước.',
    'Your session expired. Sign in to reopen the previous page.',
    '세션이 만료되었습니다. 다시 로그인하면 이전 페이지가 열립니다.',
  ),
  why: {
    idle: tr(
      'Bạn đã đăng xuất sau thời gian không hoạt động. Đăng nhập lại để mở trang trước.',
      'You were signed out after being inactive. Sign in to reopen the previous page.',
      '오랫동안 사용하지 않아 로그아웃되었습니다. 다시 로그인하면 이전 페이지가 열립니다.',
    ),
    'shift-ended': tr(
      'Ca làm việc đã kết thúc. Đăng nhập lại để mở trang trước.',
      'Your work shift ended. Sign in to reopen the previous page.',
      '근무 시간이 끝났습니다. 다시 로그인하면 이전 페이지가 열립니다.',
    ),
    revoked: tr(
      'Phiên đăng nhập đã bị đóng. Đăng nhập lại để tiếp tục.',
      'Your session was closed. Sign in again to continue.',
      '세션이 종료되었습니다. 다시 로그인해 계속하세요.',
    ),
  },
}

export const forgotPasswordText = {
  sentTitle: tr('Kiểm tra email', 'Check your email', '이메일을 확인하세요'),
  sentBefore: tr('Nếu ', 'If ', '이메일 '),
  sentAfter: tr(
    ' có tài khoản, link đặt lại sẽ được gửi tới địa chỉ này.',
    ' belongs to an account, we will send a reset link there.',
    '에 연결된 계정이 있다면 재설정 링크를 보내드립니다.',
  ),
  hint: tr(
    'Không thấy thư? Kiểm tra thư rác. Gửi lại sẽ làm link cũ hết hiệu lực.',
    'No email? Check spam. Resending will replace the previous link.',
    '메일이 없다면 스팸함을 확인하세요. 다시 보내면 이전 링크는 사용할 수 없습니다.',
  ),
  /** The clock arrives already formatted as mm:ss — Korean puts the duration
   *  before its postposition, so the three sentences cannot share one split. */
  expiresIn: (clock: string) =>
    tr(
      `Link còn hiệu lực ${clock}.`,
      `The link expires in ${clock}.`,
      `링크는 ${clock} 후 만료됩니다.`,
    ),
  expired: tr(
    'Link đã hết hạn. Gửi lại để nhận link mới.',
    'Link expired. Resend to get a new one.',
    '링크가 만료되었습니다. 다시 보내 새 링크를 받으세요.',
  ),
  resend: tr('Gửi lại', 'Resend', '다시 보내기'),
  title: tr('Quên mật khẩu', 'Forgot password', '비밀번호 찾기'),
  lead: tr(
    'Nhập email để xin link đặt lại mật khẩu.',
    'Enter your email to request a password reset link.',
    '비밀번호 재설정 링크를 받을 이메일을 입력하세요.',
  ),
  email: tr('Email', 'Email', '이메일'),
  submit: tr('Gửi link đặt lại', 'Send reset link', '재설정 링크 보내기'),
  submitting: tr('Đang gửi…', 'Sending…', '보내는 중…'),
  back: tr('Về màn đăng nhập', 'Back to sign in', '로그인 화면으로'),
}

export const resetPasswordText = {
  checkingTitle: tr('Đang kiểm tra link…', 'Checking link…', '링크 확인 중…'),
  checkingLead: tr('Đang kiểm tra link.', 'Checking this link.', '링크를 확인하고 있습니다.'),
  deadTitle: tr('Link không dùng được', 'Link no longer works', '유효하지 않은 링크'),
  deadLead: tr(
    'Link không hợp lệ hoặc đã hết hạn. Xin link mới. Nếu đây là thư mời đầu tiên, nhờ Giám đốc gửi lại.',
    'This link is invalid or expired. Request a new one. If this was your first invitation, ask the director to send it again.',
    '링크가 유효하지 않거나 만료되었습니다. 새 링크를 요청하세요. 처음 받은 초대 메일이었다면 관리자에게 다시 보내 달라고 요청하세요.',
  ),
  requestNew: tr('Xin link mới', 'Request a new link', '새 링크 요청'),
  title: tr('Đặt mật khẩu mới', 'Set a new password', '새 비밀번호 설정'),
  leadBefore: tr('Cho tài khoản ', 'For account ', '계정: '),
  leadAfter: (n: number) =>
    tr(
      `. Dùng ít nhất ${n} ký tự. Các thiết bị khác sẽ đăng xuất.`,
      `. Use at least ${n} characters. Other devices will be signed out.`,
      `. 최소 ${n}자로 설정하세요. 다른 기기에서는 로그아웃됩니다.`,
    ),
  newPassword: tr('Mật khẩu mới', 'New password', '새 비밀번호'),
  newPasswordPlaceholder: (n: number) =>
    tr(`Tối thiểu ${n} ký tự`, `At least ${n} characters`, `최소 ${n}자`),
  confirm: tr('Nhập lại mật khẩu mới', 'Confirm new password', '새 비밀번호 확인'),
  confirmPlaceholder: tr(
    'Gõ lại mật khẩu mới',
    'Retype the password above',
    '위 비밀번호를 다시 입력하세요',
  ),
  submit: tr('Đặt lại mật khẩu', 'Set new password', '비밀번호 재설정'),
  submitting: tr('Đang đặt lại…', 'Setting…', '설정 중…'),
  done: tr(
    'Đã đặt lại mật khẩu. Bạn đã đăng nhập.',
    'Password reset — you are signed in.',
    '비밀번호가 재설정되어 로그인되었습니다.',
  ),
  back: tr('Về màn đăng nhập', 'Back to sign in', '로그인 화면으로'),
}

export const changePasswordText = {
  title: tr('Đổi mật khẩu', 'Change password', '비밀번호 변경'),
  forcedLead: tr(
    'Đổi mật khẩu mặc định để tiếp tục.',
    'Change your default password to continue.',
    '계속하려면 기본 비밀번호를 변경하세요.',
  ),
  normalLead: tr(
    'Các thiết bị khác sẽ đăng xuất sau khi đổi mật khẩu.',
    'Other devices will be signed out when you change your password.',
    '비밀번호를 변경하면 다른 기기에서 로그아웃됩니다.',
  ),
  back: tr('Về tài khoản của tôi', 'Back to my account', '내 계정으로'),
  currentPassword: tr('Mật khẩu hiện tại', 'Current password', '현재 비밀번호'),
  currentPasswordPlaceholder: tr(
    'Mật khẩu bạn đang dùng',
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
    'Nhập lại mật khẩu để xác nhận thao tác.',
    'Enter your password again to confirm this action.',
    '이 작업을 확인하려면 비밀번호를 다시 입력하세요.',
  ),
  passwordPlaceholder: tr('Mật khẩu của bạn', 'Your password', '비밀번호를 입력하세요'),
  confirm: tr('Xác nhận', 'Confirm', '확인'),
  confirming: tr('Đang xác nhận…', 'Confirming…', '확인 중…'),
  cancel: tr('Huỷ', 'Cancel', '취소'),
}
