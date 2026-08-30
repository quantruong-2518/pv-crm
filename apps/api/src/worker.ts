import 'reflect-metadata'
import { Logger, Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { JobWithMetadata, PgBoss } from 'pg-boss'
import { AppModule } from './app.module'
import { CampaignSweeper } from './branches/sales/campaign/campaign.sweeper'
import { LeadModule } from './branches/sales/lead/lead.module'
import { LeadMailComposer } from './branches/sales/lead/lead-mail.composer'
import { OpportunityModule } from './branches/sales/opportunity/opportunity.module'
import { OpportunityMailComposer } from './branches/sales/opportunity/opportunity-mail.composer'
import { MailModule } from './platform/mail/mail.module'
import { MailRunSweeper } from './platform/mail/mail-run.sweeper'
import { MasMailComposer } from './platform/mail/mas.composer'
import { ENV, type Env } from './platform/config/env'
import { EMAIL_QUEUE, type EmailJob } from './platform/mail/mail.contract'
import { BOSS, MailConsumer, MailRelay, QueueModule } from './platform/queue/queue.module'

/** Entrypoint THỨ HAI, trên cùng một image với `main.ts`.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO CÓ FILE NÀY
 *  ------------------------------------------------------------------
 *  Việc nặng — E4 gửi Zalo/email theo lịch và chống trùng, nạp lead từ tệp
 *  hàng nghìn dòng — không được chung tiến trình với web request: một lần
 *  import 5.000 dòng sẽ giữ event loop đủ lâu để mọi người khác thấy app treo.
 *
 *  Nhưng đó KHÔNG cần một service riêng. Cùng codebase, cùng deploy, cùng
 *  image, đổi lệnh chạy:
 *
 *      node dist/apps/api/src/main.js      # HTTP
 *      node dist/apps/api/src/worker.js    # job
 *
 *  Được đúng phần cô lập cần có, không mất gì. Đây là câu trả lời cụ thể cho
 *  "có cần microservice không" — không, cần tách TIẾN TRÌNH, và tách tiến
 *  trình thì rẻ.
 *
 *  `createApplicationContext` dựng cây DI mà KHÔNG mở cổng HTTP: worker dùng
 *  chung engine, repository, cấu hình với máy chủ web, nhưng không nhận
 *  request. pg-boss đã lên: `QueueModule.forWorker()` dựng instance, khởi
 *  động nó và khai hai hàng đợi; consumer lấy sổ gửi, cửa ra Resend và bộ dựng
 *  thân mail từ chính context này.
 *
 *  ------------------------------------------------------------------
 *  ĐÂY LÀ TIẾN TRÌNH DUY NHẤT ĐƯỢC GỌI `boss.work`
 *  ------------------------------------------------------------------
 *  `main.ts` không nhập hàng đợi CHÚT NÀO: nhánh chỉ ghi một dòng sổ gửi
 *  trong transaction của chính nó, và `MailRelay` dưới đây biến dòng đến hạn
 *  thành job. Không phải quy ước phải nhớ — bên đó không có object nào biết
 *  tiêu thụ, mà cũng không có instance pg-boss nào. Xem
 *  `platform/queue/queue.module.ts`. */

/** Cây DI của worker = cây của app + phần hàng đợi có consumer.
 *
 *  Dựng ở đây chứ không thêm vào `AppModule`, vì `AppModule` là thứ CẢ HAI
 *  tiến trình dùng chung: nhét consumer vào đó là đưa nó vào luôn tiến trình
 *  HTTP, đúng thứ việc tách tiến trình sinh ra để tránh. */
@Module({
  imports: [
    AppModule,
    /* `imports` của `forWorker` là chỗ nối module mail vào — nó cung cấp
       `MAIL_LEDGER` và `MAIL_PORT`. `LeadModule` vào cùng vì một trong hai bộ
       dựng thân mail do nhánh Sales cung cấp: `platform/` không được biết bảng
       của nhánh, nên chiều phụ thuộc chạy ngược lại — xem
       `lead-mail.composer.ts`. Thiếu token nào thì Nest báo ngay lúc khởi
       động, không phải lúc có lead đầu tiên.

       `composers` là ĐĂNG BẠ, và đây là file duy nhất được biết cả hai vế của
       nó: Nest không có `multi: true` nên không có gì gộp hai provider cùng
       token ở hai module, còn `QueueModule` thì không được nhắc tên nhánh. Thứ
       tự có nghĩa — `supports()` khớp đầu tiên thắng — và hai template hiện có
       (`mas-v1`, `lead-intake-internal`) không giao nhau, nên thứ tự này chỉ
       là thói quen: nền trước, nhánh sau. */
    QueueModule.forWorker({
      imports: [MailModule, LeadModule, OpportunityModule],
      composers: [MasMailComposer, LeadMailComposer, OpportunityMailComposer],
    }),
  ],
})
class WorkerModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: false })

  /* KHÔNG bật `enableShutdownHooks()` ở đây — khác `main.ts` một cách có chủ
     ý. Nó tự đăng ký handler tín hiệu và gọi thẳng `app.close()`, mà
     `app.close()` sẽ đóng pool Postgres theo thứ tự module Nest tự chọn —
     nghĩa là có thể đóng trong lúc một job đang chạy dở. Ở đây thứ tự là toàn
     bộ vấn đề, nên tự bắt tín hiệu (bên dưới) và tự xếp: rút hàng đợi xong
     rồi mới đóng context. `app.close()` vẫn chạy đủ mọi
     `onApplicationShutdown` — cờ kia chỉ thêm handler tín hiệu, không thêm
     hook. */

  const log = new Logger('worker')
  const env = app.get<Env>(ENV)
  const boss = app.get<PgBoss>(BOSS)
  const consumer = app.get(MailConsumer)
  const relay = app.get(MailRelay)
  const runs = app.get(MailRunSweeper)
  const campaigns = app.get(CampaignSweeper)

  /* `boss.start()` và hai `createQueue` đã chạy trong provider `BOSS`: tiến
     trình HTTP cũng cần lược đồ và cần hàng đợi tồn tại trước khi `send`, nên
     việc đó thuộc về chỗ dựng instance, không thuộc riêng worker. Ở đây chỉ
     còn đúng phần worker mới được làm. */
  await boss.work(
    EMAIL_QUEUE,
    {
      /* TWO, and the number is the whole point rather than a guess.
         `batchSize: 1` read as harmless — pacing is per letter, so batching
         buys no tokens — but it silently made the poll interval the throughput
         ceiling: pg-boss IGNORES `burstWhenBatchFull` at batch size 1 (every
         fetch would count as "full", see `manager.js#resolveInterval`), so a
         worker sent one letter and then slept a whole interval. Two workers ·
         12s meant 10 letters a minute against a gate that allows 240.

         Two is the smallest batch that turns the burst trigger back on, and
         smallest is what keeps one handler's worst case — `batchSize` ×
         `SEND_TIMEOUT_MS` (15s) — inside the queue's `expireInSeconds` of 60.
         The pace itself does not move: every letter still takes its own token
         from `platform.mail_gate`, which is the number Resend counts. This
         only decides how long a worker idles between letters it already owes. */
      batchSize: 2,
      /* Keep fetching with no delay while batches come back full; the first
         short fetch drops back to the poll interval. This is what drains a
         200-letter run at the gate's pace instead of the clock's. */
      burstWhenBatchFull: true,
      /* `retryCount` và `createdOn` là hai thứ quyết định lúc nào một delivery
         thôi đáng thử lại — xem `exhausted()` trong `mail.consumer.ts`. */
      includeMetadata: true,
      /* Số job chạy song song TRÊN MÁY NÀY. Trần gửi thì nằm ở
         `platform.mail_gate`, chia chung cho mọi máy — hai con số khác nhau,
         và chỉ con số kia mới là thứ Resend đếm. */
      localConcurrency: env.PV_EMAIL_WORKER_CONCURRENCY,
      pollingIntervalSeconds: env.PV_QUEUE_POLL_SECONDS,
      /* Khi LISTEN/NOTIFY đứng được, poll chỉ còn là lưới đỡ — thưa hơn thì rẻ
         hơn mà không chậm hơn. Khi không đứng được, pg-boss dùng lại nhịp trên
         và không có gì đổi. */
      notifyPollingIntervalSeconds: Math.max(env.PV_QUEUE_POLL_SECONDS, 30),
    },
    (jobs: JobWithMetadata<EmailJob>[]) => consumer.handle(jobs),
  )

  /* ------------------------------------------------------------------
     BA LƯỢT QUÉT, MỘT ĐỒNG HỒ
     ------------------------------------------------------------------
     Ba tầng của cùng một câu hỏi "còn gì chưa ngã ngũ không", mỗi tầng trên
     một bảng khác:

       `MailRelay`        TỪNG LÁ THƯ — chỗ một dòng sổ gửi trở thành một job.
                          Nhánh chỉ ghi bảng, nên phải có ai đó quét.
       `MailRunSweeper`   CẢ LÔ — lô nào không còn thư nào chờ thì đóng, lô nào
                          bounce vượt trần thì cầu dao ngắt và giữ lại những
                          thư chưa kịp rời máy.
       `CampaignSweeper`  CẢ CHIẾN DỊCH — mọi đợt đã ngã ngũ thì chuyển XONG.
                          Phải hỏi từ phía nhánh: dây `sales.campaign_run` chạy
                          một chiều, `platform` không biết chiến dịch nào đang
                          chờ lô của nó.

     Chung nhịp `PV_QUEUE_POLL_SECONDS`: ba vòng poll khác nhau là ba con số
     phải giải thích, và không có gì để đổi lấy.

     `void` chứ không `await`, và mỗi lượt một `catch` riêng: một vòng quét
     hỏng (Neon ngắt kết nối chẳng hạn) không được giết tiến trình, cũng không
     được kéo theo lượt kia — dòng vẫn `pending`, lô vẫn `SENDING`, chiến dịch
     vẫn `RUNNING`, vòng sau nhặt lại. Đó là toàn bộ lý do sổ gửi là nguồn sự
     thật chứ không phải hàng đợi. */
  const sweep = setInterval(() => {
    void relay.sweep().catch((error: unknown) => {
      log.error(`Relay lỗi: ${error instanceof Error ? error.message : String(error)}`)
    })
    void runs.sweep().catch((error: unknown) => {
      log.error(`Quét lô mail lỗi: ${error instanceof Error ? error.message : String(error)}`)
    })
    void campaigns.sweep().catch((error: unknown) => {
      log.error(`Quét chiến dịch lỗi: ${error instanceof Error ? error.message : String(error)}`)
    })
  }, env.PV_QUEUE_POLL_SECONDS * 1_000)
  /* Đừng giữ tiến trình sống chỉ vì cái đồng hồ này. */
  sweep.unref()

  log.log(
    `Worker đã lên · ${EMAIL_QUEUE} · ${env.PV_EMAIL_WORKER_CONCURRENCY} luồng · ` +
      `poll ${env.PV_QUEUE_POLL_SECONDS}s · gửi thật: ${env.PV_EMAIL_ENABLED ? 'BẬT' : 'tắt'}`,
  )

  /* ------------------------------------------------------------------
     TẮT MÁY ÊM — thứ tự này là lý do file tự bắt tín hiệu
     ------------------------------------------------------------------
     Fly gửi SIGTERM rồi đếm ngược trước khi SIGKILL. Trong khoảng đó:

      1. `boss.stop({ graceful: true })` thôi nhận job mới và CHỜ job đang
         chạy xong. Bỏ bước này thì tiến trình chết giữa lúc Resend đã nhận
         thư còn sổ gửi chưa kịp ghi — chỗ duy nhất trong tính năng này mà
         `idempotencyKey` phải một mình gánh, nên đừng bắt nó gánh vì một cái
         `process.exit` vội.
      2. `app.close()` chạy `onApplicationShutdown` của mọi module, tức đóng
         pool Postgres — sau khi không còn ai dùng nó nữa.

     Tín hiệu thứ hai không làm lại từ đầu: người vận hành gõ Ctrl-C hai lần
     là chuyện thường, và lần thứ hai mà gọi `stop()` song song thì cái đang
     rút bị cắt ngang. */
  let closing = false
  const close = (signal: NodeJS.Signals): void => {
    if (closing) return
    closing = true
    log.log(`${signal} — đang rút hàng đợi…`)
    /* Thôi nạp job mới TRƯỚC khi rút, kẻo vòng quét cuối cùng đẩy thêm việc
       vào đúng lúc hàng đợi đang cố cạn. */
    clearInterval(sweep)
    void (async () => {
      try {
        await boss.stop({ graceful: true, close: true, timeout: SHUTDOWN_TIMEOUT_MS })
      } catch (error) {
        log.error(`Rút hàng đợi lỗi: ${error instanceof Error ? error.message : String(error)}`)
      }
      await app.close()
      log.log('Worker đã tắt.')
    })()
  }

  process.on('SIGTERM', close)
  process.on('SIGINT', close)
}

/** Dưới hạn đếm ngược của Fly (mặc định 5 phút), và trên `expireInSeconds` của
 *  hàng đợi — một job quá mốc đó đã được coi là chết rồi, chờ thêm không đổi
 *  được gì. */
const SHUTDOWN_TIMEOUT_MS = 90_000

void bootstrap()
