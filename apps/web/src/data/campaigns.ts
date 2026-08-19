import { queryOptions } from '@tanstack/react-query'
import {
  DAS_VINA_LEAD,
  dasVina,
  LEADS,
  SOURCES,
  sourceStats,
  type Lead,
  type Source,
  type WaveChannel,
} from '@pv/engines/fixtures/das-vina'

/** Nguồn lead — module 1 · Chiến dịch & Sự kiện. Kịch bản 2 · DAS Vina.
 *
 *  Đây là chỗ DUY NHẤT màn lấy chiến dịch và số của nó. Khi có backend, đổi thân
 *  hai hàm `fetch*` thành lời gọi HTTP; màn không phải sửa.
 *
 *  Số của một chiến dịch KHÔNG tính ở tầng màn — `sourceStats` nằm trong fixture
 *  vì "lead tốt" là khái niệm của cổng init data, không phải của giao diện. */

export type SourceRow = Source &
  ReturnType<typeof sourceStats> & {
    /** Mã đơn của nguồn này ĐANG CÓ MẶT trong đồ thị E1, nếu có.
     *
     *  Đây là chỗ ContextRail bám vào (luật 10): chiến dịch chưa có `ObjectKind`
     *  riêng trong E1 nên rail phải mượn một đơn mà nguồn đã kéo về. Tìm bằng
     *  code trên fixture, KHÔNG gõ cặp mã nào ra tay.
     *
     *  Lọc thêm bằng `dasVina.graph.get` chứ không lấy đơn ĐẦU TIÊN có
     *  `dealCode`: đồ thị của DAS Vina mới có bốn object (AC-0142 · CT-0391 ·
     *  OP-0288 · BG-1077), nên một đơn ngoài đồ thị chỉ làm `story()` trả rỗng —
     *  tức trường này nói "có chuỗi" trong khi không có.
     *
     *  Thực tế hôm nay: ĐÚNG MỘT trong tám nguồn ra được chuỗi thật — nguồn đã
     *  kéo chính DAS Vina về. Bảy nguồn còn lại rail rút về một chip của chính
     *  mã nguồn, giống hệt lead chưa vào pipeline ở module 2; đó là thiếu object
     *  trong đồ thị chứ không phải rail hỏng. Khi E1 có `ObjectKind` cho chiến
     *  dịch thì đưa thẳng chiến dịch vào đồ thị và bỏ đường vòng này. */
    anchorDeal?: string
  }

/** Nguồn mồi mọi lần mở màn: nguồn đã kéo chính DAS Vina về.
 *  Suy từ `DAS_VINA_LEAD`, không gõ mã chiến dịch thẳng vào màn. */
export const ANCHOR_SOURCE =
  LEADS.find((l) => l.code === DAS_VINA_LEAD)?.source ?? SOURCES[0]?.code ?? ''

/** Nguồn mẫu của tab "Tạo mới": nguồn ĐÃ CHẠY ĐỢT và ra nhiều lead nhất trong
 *  kỳ. Chọn bằng số chứ không chỉ tay vào một mã — đổi fixture thì mẫu tự đi
 *  theo. */
const SAMPLE = [...SOURCES].filter((s) => s.waves.length > 0).sort((a, b) => b.leads - a.leads)[0]

/** Sự kiện đông lead nhất — chỉ dùng để gợi ý ô địa điểm. */
const SAMPLE_EVENT = [...SOURCES].filter((s) => s.venue).sort((a, b) => b.leads - a.leads)[0]

export type DraftWave = { label: string; channel: WaveChannel; afterDays: number }

/** Bản nháp mở đầu của tab "Tạo mới" — CHÉP NHỊP của nguồn mẫu, không phải số
 *  đo của chiến dịch mới.
 *
 *  Mọi giá trị suy từ fixture. Gõ tay "1200 người nhận" hay "sau 14 ngày" thì
 *  đổi fixture là ô nhập nói một đằng, chuỗi đợt đã chạy nói một nẻo, mà không
 *  ai biết — và trên màn con số gõ tay trông hệt như một số đo thật. */
export const DRAFT_TEMPLATE = {
  /** Nguồn được chép, để màn nói thẳng bản nháp này từ đâu ra. */
  fromCode: SAMPLE?.code ?? '',
  name: SAMPLE?.label ?? '',
  venue: SAMPLE_EVENT?.venue ?? '',
  /** Số người nhận của đợt mở màn nguồn mẫu — điểm xuất phát để người soạn sửa. */
  audience: SAMPLE?.waves[0]?.sent ?? 0,
  waves: (SAMPLE?.waves ?? []).map((w): DraftWave => ({
    label: w.label,
    channel: w.channel,
    afterDays: w.day - (SAMPLE?.waves[0]?.day ?? w.day),
  })),
}

/** Nhịp mặc định khi bấm "Thêm đợt": khoảng cách giữa hai đợt cuối của nguồn
 *  mẫu, không phải một con số tròn ai đó thấy đẹp. */
export const DRAFT_STEP_DAYS = (() => {
  const w = DRAFT_TEMPLATE.waves
  const last = w[w.length - 1]?.afterDays ?? 0
  const prev = w[w.length - 2]?.afterDays ?? 0
  return Math.max(1, last - prev)
})()

async function fetchSources(): Promise<SourceRow[]> {
  return SOURCES.map((s) => ({
    ...s,
    ...sourceStats(s.code),
    anchorDeal: LEADS.find(
      (l) => l.source === s.code && l.dealCode && dasVina.graph.get(l.dealCode),
    )?.dealCode,
  }))
}

async function fetchLeadsOfSource(code: string): Promise<Lead[]> {
  return LEADS.filter((l) => l.source === code)
}

export const sourcesQuery = queryOptions({
  queryKey: ['sales', 'sources'] as const,
  queryFn: fetchSources,
})

export const sourceLeadsQuery = (code: string) =>
  queryOptions({
    queryKey: ['sales', 'sources', code, 'leads'] as const,
    queryFn: () => fetchLeadsOfSource(code),
  })
