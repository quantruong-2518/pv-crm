/** Tầng toán của mô hình chi phí nguồn lead.
 *
 *  File này **không import gì cả**: không React, không fixture, không engine
 *  anh em. Nó nhận số và trả số. Hai lý do, cả hai đều là điều kiện sống:
 *
 *   · `@pv/engines` phải mang được sang backend (CLAUDE.md · "Biên giới
 *     package"). Một hàm thống kê lỡ biết tới `das-vina.ts` thì không mang đi
 *     đâu được nữa.
 *   · Test của nó không cần kịch bản nào. Mọi con số trong `stats.test.ts` là
 *     số **tính tay**, không phải số đọc ra từ fixture — fixture đổi mà số
 *     tính tay không đổi thì test này vẫn phải xanh.
 *
 *  Đây **không** phải engine thứ năm: không giữ trạng thái, không có
 *  `create*`, không có vòng đời. Chỉ là hàm thuần. Gọi nó là "E6" thì phá định
 *  nghĩa engine.
 *
 *  Một luật xuyên suốt file: **không hàm nào ném, không hàm nào trả `Infinity`
 *  hay `NaN` cho tiền.** Mấy hàm này chạy ngay giữa lúc render một bảng tám
 *  dòng; một ngoại lệ ở đây là một màn trắng. Chỗ nào không biết thì trả `null`
 *  và nói rõ ở JSDoc, để tầng trên buộc phải xử "chưa đủ dữ liệu". */

/** z của mức tin cậy 95%. Số tính tay dùng đúng số này (z² = 3,8416),
 *  nên đổi nó là đổi mọi con số đã khoá trong `stats.test.ts`. */
const Z95 = 1.96

/** Một tử số trên một mẫu số: `x` lead tốt trên `n` lead. */
export type Rate = { x: number; n: number }

/** Cùng chuyện đó nhưng có tiền đứng sau — đơn vị của `cost` là **đồng**. */
export type PricedRate = Rate & { cost: number }

export type WilsonInterval = {
  /** Ước lượng điểm `x/n`. `n = 0` trả 0 theo quy ước, xem `wilson`. */
  p: number
  lo: number
  hi: number
}

export type ChiSquareResult = { chi2: number; df: number; p: number }

/** Dải chi phí mỗi lead tốt, **đồng nguyên**. `point` là số hôm nay vẫn hiện;
 *  `lo`/`hi` là hai đầu suy từ khoảng Wilson của mẫu số. */
export type CostBandValue = {
  /** `cost / x`. **`null` khi `x = 0`** — chưa có lead tốt nào thì không có
   *  giá mỗi lead tốt. Đây là chỗ dễ nói ngược nhất cả file: in "0 đồng" cho
   *  một nguồn 0 lead tốt là khẳng định nó rẻ nhất sổ. */
  point: number | null
  /** Đầu RẺ: `cost / (n · p_trên)`. Luôn có số, vì `p_trên > 0` với mọi `n ≥ 1`.
   *  `n = 0` trả 0 — cận dưới duy nhất còn đúng khi không có quan sát nào là
   *  cận dưới rỗng nghĩa. */
  lo: number
  /** Đầu ĐẮT: `cost / (n · p_dưới)` — **số dùng để xếp hạng**.
   *  **`null` khi `p_dưới = 0`**, tức khi `x = 0` hoặc `n = 0`: đầu đắt lúc đó
   *  là vô cực, và vô cực không phải một số tiền. */
  hi: number | null
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// ---------------------------------------------------------------------------
// Khoảng tin cậy
// ---------------------------------------------------------------------------

/** Khoảng tin cậy **Wilson** cho một tỉ lệ.
 *
 *  ```
 *            p̂ + z²/(2n)                    z            ┌───────────────────────┐
 *   tâm  =  ──────────────      nửa  =  ──────────  · √   │ p̂(1−p̂)/n + z²/(4n²)   │
 *             1 + z²/n                   1 + z²/n         └───────────────────────┘
 *  ```
 *
 *  **Vì sao không Wald** (`p̂ ± z·√(p̂q̂/n)`): trên cỡ mẫu 5–22 của kịch bản
 *  này Wald hỏng theo hai cách, và cả hai đều xảy ra thật —
 *   · cận dưới **âm**: CD-0105 (1/9) ra `[−9,42% ; 31,64%]`, một xác suất dưới không;
 *   · bề rộng **bằng 0** khi `x = 0`: ra `[0% ; 0%]`, tức "chắc chắn 0%".
 *  Wilson giải phương trình theo `p` thật thay vì nhét `p̂` vào chỗ của `p`
 *  trong sai số chuẩn, nên không có hai bệnh đó. Với 0/9 nó trả `[0% ; 29,92%]`.
 *
 *  Biên, không ca nào ném:
 *   · `n = 0` → `{ p: 0, lo: 0, hi: 1 }`. Không quan sát nào thì không có tỉ lệ;
 *     dải rộng hết cỡ chính là câu "không biết gì". Trả `NaN` sẽ rò ra tận nhãn
 *     trên màn, nên không trả `NaN`.
 *   · `x = 0` → `lo = 0` **đúng bằng 0** (tâm và nửa khoảng bằng nhau), `hi = 2·tâm`.
 *   · `x = n` → `hi = 1` đúng bằng 1, `lo` là cận dưới thật (5/5 ra 0,5655).
 *   · `n = 1` chạy bình thường: 1/1 ra `[0,2065 ; 1]`.
 *  Hai đầu được kẹp về `[0, 1]` để sai số dấu phẩy động không đẻ ra `-1e-17`. */
export function wilson(x: number, n: number, z: number = Z95): WilsonInterval {
  if (!(n > 0)) return { p: 0, lo: 0, hi: 1 }

  const hits = clamp(x, 0, n)
  const p = hits / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const centre = (p + z2 / (2 * n)) / denom
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))

  // Hai đầu này ĐÚNG BẰNG 0 và 1 về mặt đại số — với `x = 0` thì tâm và nửa
  // khoảng bằng nhau, với `x = n` thì `tâm + nửa = (1 + z²/n)/(1 + z²/n)`. Dấu
  // phẩy động không cho ra đúng số đó (nó để lại vụn cỡ 1e-17), và vụn ấy KHÔNG
  // vô hại: `costBand` chia cho `n · p_dưới`, nên `p_dưới = 3e-17` biến một
  // nguồn chưa có lead tốt nào thành "4,7e23 đồng mỗi lead tốt" thay vì `null`.
  // Vì thế hai ca này gán thẳng, không để phép trừ quyết định.
  const lo = hits === 0 ? 0 : clamp(centre - half, 0, 1)
  const hi = hits === n ? 1 : clamp(centre + half, 0, 1)

  return { p, lo, hi }
}

/** Hai tỉ lệ có **tách được** không — hai khoảng Wilson rời nhau.
 *
 *  Đây là cổng chặn mọi câu khẳng định so sánh **về tỉ lệ** trên giao diện.
 *  Trên fixture DAS Vina nó trả `false` cho cả 28 cặp của tám nguồn: cận dưới
 *  cao nhất là 23,26% (CD-0101), cận trên thấp nhất là 43,50% (CD-0105), nên
 *  tồn tại dải `[23,26% ; 43,50%]` nằm trong cả tám khoảng.
 *
 *  **Không dùng hàm này để chấm câu "A rẻ hơn B".** Câu về TIỀN đứng trên dải
 *  chi phí, mà chi phí còn phụ thuộc `cost` — dùng `separableCost`. Hai khái
 *  niệm khác nhau: theo tỉ lệ thì 0/15 cặp tách được, theo tiền thì 5/15.
 *
 *  `n = 0` cho khoảng `[0 ; 1]`, nên nguồn không có lead nào không bao giờ tách
 *  được với ai — đúng ý muốn. */
export function separable(a: Rate, b: Rate, z: number = Z95): boolean {
  const wa = wilson(a.x, a.n, z)
  const wb = wilson(b.x, b.n, z)
  return wa.hi < wb.lo || wb.hi < wa.lo
}

// ---------------------------------------------------------------------------
// Co ngót
// ---------------------------------------------------------------------------

/** Co ngót Beta-Binomial về trung bình chung — empirical Bayes.
 *
 *  ```
 *   p̃ = (x + k·m) / (n + k)        với  α = k·m,  β = k(1−m),  k = α + β
 *  ```
 *
 *  `priorMean` là trung bình phòng (`m = 0,34` trong DAS Vina), `priorWeight`
 *  là sức mạnh prior tính bằng **số lead tương đương** (`k = 25`). Cả hai là
 *  **số của kịch bản**, không phải hằng toán — vì thế chúng là tham số, và
 *  `stats.ts` không được biết giá trị của chúng.
 *
 *  Vì sao phải co ngót: ước lượng phương sai giữa nhóm ra **số âm**
 *  (`0,842381 − 7 × 0,2244 = −0,728`), tức dữ liệu không thấy tín hiệu nào giữa
 *  tám nguồn. Ước lượng đúng lúc đó là `k = ∞` — mọi nguồn hiện đúng 34,0%.
 *  Một bảng tám dòng cùng in 34,0% thì không dùng được, nên `k` thành **quyết
 *  định sản phẩm**: chọn 25 vì nó phải ≥ n lớn nhất (22), không thì một nguồn
 *  duy nhất tự thắng chính prior của nó.
 *
 *  Kết quả **luôn nằm giữa `x/n` và `m`** — co ngót sai chiều là lỗi im lặng,
 *  nên đó là một ca test riêng.
 *
 *  Biên: `n = 0` → trả đúng `priorMean` (chưa có gì để học thì tin prior);
 *  `priorWeight = 0` → trả đúng `x/n` (không prior thì không co); cả hai bằng 0
 *  → trả `priorMean`, không chia cho không. */
export function shrink(x: number, n: number, priorMean: number, priorWeight: number): number {
  const k = Math.max(0, priorWeight)
  const m = clamp(priorMean, 0, 1)
  const size = Math.max(0, n)
  if (size + k <= 0) return m
  return (clamp(x, 0, size) + k * m) / (size + k)
}

// ---------------------------------------------------------------------------
// Kiểm định đồng nhất
// ---------------------------------------------------------------------------

/** χ² đồng nhất k nhóm — "tám nguồn có khác nhau thật không".
 *
 *  ```
 *   X² = Σ nᵢ(p̂ᵢ − m)² / [ m(1−m) ]        m = Σxᵢ / Σnᵢ,   df = k − 1
 *  ```
 *
 *  Đây đúng là χ² Pearson của bảng 2×k viết gọn: `Σ(O−E)²/E` rút lại thành
 *  dạng trên, không phải một xấp xỉ khác.
 *
 *  Trên tám nguồn DAS Vina: `X² = 3,7539`, `df = 7`, `p ≈ 0,81`. Kỳ vọng của
 *  χ²(7) là 7, quan sát được 3,75 — **thấp hơn cả nhiễu ngẫu nhiên thuần tuý**.
 *  Kết luận cứng: hôm nay chưa có bằng chứng nào cho thấy tám nguồn
 *  khác nhau về tỉ lệ lead tốt; bảng xếp hạng hiện tại đang xếp hạng nhiễu.
 *
 *  Biên:
 *   · nhóm có `n = 0` bị **loại khỏi cả tổng lẫn df**. Nó không mang thông tin
 *     nào, mà tính vào df thì df phồng lên và `p` bị đẩy về 1 — đúng kiểu sai
 *     nguy hiểm: một khác biệt thật bị giấu đi bởi một nhóm rỗng.
 *   · `df ≤ 0` (không nhóm nào, hoặc đúng một nhóm) → `{ 0, 0, 1 }`. Không có
 *     gì để so thì không có khác biệt nào để bác.
 *   · mọi nhóm cùng 0 lead tốt (hoặc cùng toàn lead tốt) → `m(1−m) = 0`, tử số
 *     cũng bằng 0 → trả `chi2 = 0`, `p = 1` thay vì `0/0 = NaN`. */
export function chiSquareHomogeneity(groups: readonly Rate[]): ChiSquareResult {
  const seen = groups.filter((g) => g.n > 0)
  const df = Math.max(0, seen.length - 1)
  if (df === 0) return { chi2: 0, df, p: 1 }

  const totalN = seen.reduce((s, g) => s + g.n, 0)
  const totalX = seen.reduce((s, g) => s + clamp(g.x, 0, g.n), 0)
  const m = totalX / totalN
  const spread = m * (1 - m)
  if (spread <= 0) return { chi2: 0, df, p: 1 }

  const weighted = seen.reduce((s, g) => s + g.n * (clamp(g.x, 0, g.n) / g.n - m) ** 2, 0)
  const chi2 = weighted / spread

  return { chi2, df, p: regularizedUpperGamma(df / 2, chi2 / 2) }
}

// ---------------------------------------------------------------------------
// Tiền
// ---------------------------------------------------------------------------

/** Dải chi phí mỗi lead tốt. Trả **đồng nguyên**, đã làm tròn.
 *
 *  ```
 *   chi/lead tốt = C / (n · p)
 *
 *   lo (rẻ nhất còn hợp lý) = C / (n · p_trên)
 *   hi (đắt nhất còn hợp lý) = C / (n · p_dưới)   ◄ số dùng để XẾP HẠNG
 *   point (số hôm nay)       = C / x
 *  ```
 *
 *  Xếp hạng bằng `hi` vì đó là **số xấu nhất còn hợp lý**: một nguồn chỉ được
 *  gọi là rẻ nếu nó rẻ cả trong trường hợp xui. Quy tắc này tự phạt cỡ mẫu nhỏ,
 *  không cần thêm luật nào. Ví dụ chốt: CD-0105 điểm 6.000.000 nhưng
 *  `hi = 33.517.055` — đắt thứ nhì cả bảng, chứ không phải rẻ thứ tư.
 *
 *  Biên, đọc kỹ vì đây là chỗ mô hình dễ nói ngược nhất:
 *   · `x = 0` → `point = null` và `hi = null`. **Không bao giờ trả 0** cho
 *     "chưa có lead tốt nào" — in "0 đồng/lead" cho một nguồn chưa ra lead tốt
 *     nào là nói ngược hoàn toàn. Và không trả `Infinity`, vì vô cực không phải
 *     một số tiền: `null` buộc tầng trên phải viết ra "chưa đủ dữ liệu".
 *     `lo` vẫn có số thật và vẫn dùng được — nó đọc là "ít nhất chừng này đồng".
 *   · `n = 0` → `{ null, 0, null }`. Không lead nào thì không có cận nào; cận
 *     dưới rỗng nghĩa (0) là cận dưới duy nhất còn đúng.
 *   · `cost = 0` (GT · TM khi bảng đo **tiền mặt**) → cả ba đầu bằng 0, đúng
 *     nghĩa. Hai nguồn đó chỉ có giá thật khi bảng chuyển sang **chi đầy đủ**
 *     — lúc đó `cost` truyền vào là `fullCost`, không phải `cost`. */
export function costBand(cost: number, x: number, n: number): CostBandValue {
  if (!(n > 0)) return { point: null, lo: 0, hi: null }

  const hits = clamp(x, 0, n)
  const w = wilson(hits, n)
  const mostGood = n * w.hi
  const leastGood = n * w.lo

  return {
    point: hits > 0 ? Math.round(cost / hits) : null,
    lo: mostGood > 0 ? Math.round(cost / mostGood) : 0,
    hi: leastGood > 0 ? Math.round(cost / leastGood) : null,
  }
}

/** Hai nguồn có được phép nói "**A rẻ hơn B**" không — hai DẢI CHI PHÍ rời nhau.
 *
 *  Khác `separable` ở chỗ: `separable` so hai tỉ lệ, hàm này so hai dải tiền,
 *  mà tiền còn phụ thuộc `cost`. Trên sáu nguồn có tiêu tiền của DAS Vina, theo
 *  tỉ lệ thì **0/15** cặp tách được, theo tiền thì **đúng 5/15** — vì `cost`
 *  chênh nhau tới 24 lần trong khi tỉ lệ thì không chênh gì cả.
 *
 *  Số đi kèm câu so sánh phải là **"ít nhất N lần"** = `dear.lo / cheap.hi`,
 *  không bao giờ là tỉ số hai điểm. `plan.ts` hôm nay nói "chênh 24 lần"
 *  (48.333.333 ÷ 2.000.000); câu đứng vững được là "ít nhất 6,6 lần"
 *  (23.303.830 ÷ 3.518.220).
 *
 *  Bên rẻ bắt buộc phải có `hi` hữu hạn: nguồn `x = 0` có dải `[lo ; vô cực)`
 *  nên không bao giờ được đứng ở vế rẻ. */
export function separableCost(a: PricedRate, b: PricedRate): boolean {
  const ba = costBand(a.cost, a.x, a.n)
  const bb = costBand(b.cost, b.x, b.n)
  const aCheaper = ba.hi !== null && ba.hi < bb.lo
  const bCheaper = bb.hi !== null && bb.hi < ba.lo
  return aCheaper || bCheaper
}

// ---------------------------------------------------------------------------
// Cỡ mẫu
// ---------------------------------------------------------------------------

/** Cỡ mẫu tối thiểu **mỗi nhóm** để phân biệt hai tỉ lệ.
 *
 *  ```
 *   n = [ z_{α/2}·√(2p̄q̄) + z_β·√(p₁q₁ + p₂q₂) ]² / (p₁ − p₂)²      p̄ = (p₁+p₂)/2
 *  ```
 *
 *  Mặc định `alpha = 0,05` · `power = 0,80`. Trả số
 *  nguyên đã làm tròn LÊN: nửa người không đi khảo sát được.
 *
 *  Con số này là câu sắc nhất của cả tài liệu: `minSampleFor(0,40, 0,25) = 152`
 *  trong khi nguồn lớn nhất của phòng có **22** lead và cả sổ có **100**. Cỡ
 *  mẫu để phân biệt hai nguồn lớn hơn cả sổ lead của cả kỳ.
 *
 *  Biên: `p₁ = p₂` → `Number.POSITIVE_INFINITY`, và đó là câu trả lời đúng —
 *  không cỡ mẫu nào phân biệt được hai thứ bằng nhau. Đây là số ĐẾM chứ không
 *  phải tiền, nên vô cực ở đây đọc được; tầng hiển thị chặn bằng `isFinite`. */
export function minSampleFor(p1: number, p2: number, alpha = 0.05, power = 0.8): number {
  const a = clamp(p1, 0, 1)
  const b = clamp(p2, 0, 1)
  const delta = Math.abs(a - b)
  if (delta === 0) return Number.POSITIVE_INFINITY

  const bar = (a + b) / 2
  const zAlpha = normalQuantile(1 - alpha / 2)
  const zBeta = normalQuantile(power)
  const term =
    zAlpha * Math.sqrt(2 * bar * (1 - bar)) + zBeta * Math.sqrt(a * (1 - a) + b * (1 - b))

  return Math.ceil(term ** 2 / delta ** 2)
}

// ---------------------------------------------------------------------------
// Phần số học nền — không export, nhưng là chỗ dễ sai nhất cả file
// ---------------------------------------------------------------------------
//
// Repo không có thư viện thống kê và KHÔNG được thêm dependency, nên `p` của
// χ² phải tự tính. Bốn mảnh, mảnh sau đứng trên mảnh trước:
//
//   1 · lnΓ(z)                 — xấp xỉ Lanczos, g = 7, 9 hệ số (sai số ~1e-15)
//   2 · P(a,x) chuỗi           — chuỗi luỹ thừa, dùng khi x < a + 1
//   3 · Q(a,x) liên phân số    — khai triển Lentz sửa đổi, dùng khi x ≥ a + 1
//   4 · Φ⁻¹(p)                 — Acklam + một bước Halley, sai số ~1e-15
//
// Chia đôi ở `x = a + 1` là chỗ hai khai triển đều hội tụ nhanh; dùng nhầm phía
// thì vẫn ra số nhưng mất chữ số. Ngưỡng dừng 1e-15 tương đối, trần 300 vòng —
// cả hai khai triển thực tế dừng dưới 50 vòng ở mọi df của repo này.

const LANCZOS_G = 7
const LANCZOS_HEAD = 0.99999999999980993
const LANCZOS_TAIL = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
] as const

const HALF_LOG_TWO_PI = 0.5 * Math.log(2 * Math.PI)
const EPS = 1e-15
const TINY = 1e-300
const MAX_ITER = 300

/** log Γ(z) bằng xấp xỉ Lanczos. `z < 0,5` phản chiếu qua công thức Euler. */
function lnGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)

  const x = z - 1
  const t = x + LANCZOS_G + 0.5
  let series = LANCZOS_HEAD
  LANCZOS_TAIL.forEach((c, i) => {
    series += c / (x + i + 1)
  })

  return HALF_LOG_TWO_PI + (x + 0.5) * Math.log(t) - t + Math.log(series)
}

/** P(a,x) — gamma dưới chuẩn hoá, khai triển chuỗi. Hội tụ nhanh khi x < a + 1. */
function lowerGammaSeries(a: number, x: number): number {
  let term = 1 / a
  let sum = term
  let ap = a

  for (let i = 0; i < MAX_ITER; i += 1) {
    ap += 1
    term *= x / ap
    sum += term
    if (Math.abs(term) < Math.abs(sum) * EPS) break
  }

  return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a))
}

/** Q(a,x) — gamma TRÊN chuẩn hoá, liên phân số kiểu Lentz. Dùng khi x ≥ a + 1. */
function upperGammaFraction(a: number, x: number): number {
  let b = x + 1 - a
  let c = 1 / TINY
  let d = 1 / b
  let h = d

  for (let i = 1; i <= MAX_ITER; i += 1) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < TINY) d = TINY
    c = b + an / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < EPS) break
  }

  return h * Math.exp(-x + a * Math.log(x) - lnGamma(a))
}

/** Q(a,x) = 1 − P(a,x). Đây là hàm cho ra `p` của χ²: `p = Q(df/2, X²/2)`. */
function regularizedUpperGamma(a: number, x: number): number {
  if (!(a > 0)) return 0
  if (!(x > 0)) return 1
  return x < a + 1 ? 1 - lowerGammaSeries(a, x) : upperGammaFraction(a, x)
}

/** Φ(x) — hàm phân phối chuẩn tắc, mượn lại chính hàm gamma ở trên:
 *  `erfc(t) = Q(½, t²)`, và `Φ(x) = 1 − ½·erfc(x/√2)`. Không cần erfc riêng. */
function normalCdf(x: number): number {
  const t = Math.abs(x) / Math.SQRT2
  const tail = 0.5 * regularizedUpperGamma(0.5, t * t)
  return x >= 0 ? 1 - tail : tail
}

const horner = (coefficients: readonly number[], t: number) =>
  coefficients.reduce((acc, c) => acc * t + c, 0)

// Hệ số hữu tỉ của Peter Acklam cho Φ⁻¹ (sai số tương đối ~1,15e-9), viết theo
// thứ tự bậc giảm dần để chạy Horner.
const ACKLAM_LOW_NUM = [
  -7.784894002430293e-3, -0.3223964580411365, -2.400758277161838, -2.549732539343734,
  4.374664141464968, 2.938163982698783,
] as const
const ACKLAM_LOW_DEN = [
  7.784695709041462e-3, 0.3224671290700398, 2.445134137142996, 3.754408661907416, 1,
] as const
const ACKLAM_MID_NUM = [
  -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
  2.506628277459239,
] as const
const ACKLAM_MID_DEN = [
  -54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572,
  1,
] as const

const ACKLAM_BREAK = 0.02425

/** Φ⁻¹(p) — phân vị chuẩn tắc. Acklam cho số khởi đầu, một bước Halley kéo sai
 *  số về mức máy. Cần cho `minSampleFor`: `z_{α/2}` và `z_β`.
 *
 *  Biên: `p ≤ 0` → −∞, `p ≥ 1` → +∞. Hai giá trị đó chảy vào `minSampleFor`
 *  thành `Infinity`, đọc đúng nghĩa "đòi chắc chắn tuyệt đối thì cần vô hạn mẫu". */
function normalQuantile(p: number): number {
  if (p <= 0) return Number.NEGATIVE_INFINITY
  if (p >= 1) return Number.POSITIVE_INFINITY

  let x: number
  if (p < ACKLAM_BREAK) {
    const q = Math.sqrt(-2 * Math.log(p))
    x = horner(ACKLAM_LOW_NUM, q) / horner(ACKLAM_LOW_DEN, q)
  } else if (p > 1 - ACKLAM_BREAK) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    x = -horner(ACKLAM_LOW_NUM, q) / horner(ACKLAM_LOW_DEN, q)
  } else {
    const q = p - 0.5
    const r = q * q
    x = (horner(ACKLAM_MID_NUM, r) * q) / horner(ACKLAM_MID_DEN, r)
  }

  const err = normalCdf(x) - p
  const u = err * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2)
  return x - u / (1 + (x * u) / 2)
}
