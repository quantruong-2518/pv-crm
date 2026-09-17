/** Bảng token của theme kit, dạng dữ liệu để trang styleguide vẽ lại.
 *  Giá trị màu ở đây trỏ vào biến CSS trong `styles/globals.css` — chuỗi hex
 *  chỉ là NHÃN hiển thị cho người đọc, không phải nguồn màu của giao diện. */

export type Swatch = {
  name: string
  /** nhãn hiển thị */
  hex: string
  /** màu thật lấy từ token */
  css: string
}

/** F-01 · Brand palette — bảng màu gốc Pebble Vina */
export const BRAND_PALETTE: Swatch[] = [
  { name: 'Pebble Blue', hex: '#133A8A', css: 'var(--brand-blue)' },
  // Azure resolves --primary-strong (globals.css) for @pv/mail-templates — email HTML has no
  // var() support, and no gradient either, so it takes the flat end of the primary ramp.
  { name: 'Azure', hex: '#2D59D9', css: 'var(--primary-strong)' },
  { name: 'Deep Navy', hex: '#0F172A', css: 'var(--brand-navy)' },
  { name: 'Slate Gray', hex: '#5E6B80', css: 'var(--brand-slate)' },
  { name: 'Light Gray', hex: '#E5E7EB', css: 'var(--brand-gray)' },
  { name: 'Flag Red', hex: '#DA251D', css: 'var(--brand-red)' },
  { name: 'Flag Yellow', hex: '#FFCD00', css: 'var(--brand-yellow)' },
  {
    name: 'Gold Rim',
    hex: '#C9A227',
    css: 'linear-gradient(135deg,var(--gold-from),var(--brand-gold) 45%,var(--gold-to))',
  },
  { name: 'White', hex: '#FFFFFF', css: 'var(--primary-foreground)' },
]

/** F-02 · Semantic tokens — tên shadcn/ui, đúng thứ tự trong theme kit */
export const SEMANTIC_TOKENS: Array<{ token: string; css: string; note: string }> = [
  { token: '--background', css: 'var(--background)', note: '#070B16 · nền màn' },
  { token: '--foreground', css: 'var(--foreground)', note: '#EEF2FB · chữ chính' },
  { token: '--primary', css: 'var(--primary)', note: '#3D6DF5 · nền nút chính, AI, active' },
  { token: '--accent', css: 'var(--accent)', note: 'brand 16% · nền chip nguồn' },
  {
    token: '--accent-foreground',
    css: 'var(--accent-foreground)',
    note: '#A9C1FF · MỌI chữ màu azure',
  },
  {
    token: '--muted-foreground',
    css: 'var(--muted-foreground)',
    note: '#A3AEC8 · chú thích, nhãn',
  },
  { token: '--success', css: 'var(--success)', note: '#5AD49A · phái sinh, ngoài brand' },
  { token: '--warning', css: 'var(--warning)', note: '#F4B860 · việc cần làm ngay' },
  { token: '--destructive', css: 'var(--destructive)', note: 'Flag Red · chữ #FF8A8F' },
  { token: '--border', css: 'transparent', note: 'transparent · hệ borderless' },
]

/** F-05 · Spacing — chỉ 8 bậc, thang 4px */
export const SPACING_SCALE: Array<{ step: string; px: number; use: string }> = [
  { step: '1', px: 4, use: '4px · gap icon–chữ' },
  { step: '2', px: 8, use: '8px · gap trong chip' },
  { step: '3', px: 12, use: '12px · gap nút' },
  { step: '4', px: 16, use: '16px · gap bento, padding thẻ nhỏ' },
  { step: '5', px: 20, use: '20px · padding thẻ' },
  { step: '6', px: 24, use: '24px · gutter desktop' },
  { step: '8', px: 32, use: '32px · margin màn desktop' },
  { step: '12', px: 48, use: '48px · giữa hai zone' },
]

/** F-06 · Radius */
export const RADIUS_SCALE: Array<{
  token: string
  use: string
  w: number
  h: number
  radius: string
}> = [
  { token: 'rounded-lg', use: '6px · thẻ, panel — bo lớn nhất', w: 52, h: 34, radius: '6px' },
  { token: 'rounded-md', use: '4px · nút, input, nav', w: 52, h: 30, radius: '4px' },
  { token: 'rounded-sm', use: '3px · tag, chip', w: 52, h: 22, radius: '3px' },
  { token: 'rounded-full', use: 'chỉ chấm trạng thái', w: 16, h: 16, radius: '50%' },
]
