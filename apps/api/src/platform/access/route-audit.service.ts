import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { PATH_METADATA } from '@nestjs/common/constants'
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core'
import { NEED_KEY, PUBLIC_KEY } from './need.decorator'

/** Quét mọi route lúc khởi động và KHÔNG cho máy chủ lên nếu còn endpoint
 *  chưa khai `@Need` hoặc `@Public`.
 *
 *  `AccessGuard` đã hỏng theo hướng đóng, nên một endpoint quên khai sẽ trả
 *  403. Nhưng 403 đó chỉ xuất hiện khi có người thật gọi vào — có thể là vài
 *  tuần sau, có thể là khách hàng. Chỗ đúng để phát hiện là lúc triển khai,
 *  và giá phải trả là ba mươi dòng dưới đây.
 *
 *  Cùng tinh thần với `pnpm tokens:check` và `pnpm css:check`: thứ máy kiểm
 *  được thì đừng bắt người nhớ. */
@Injectable()
export class RouteAudit implements OnApplicationBootstrap {
  private readonly log = new Logger('access')

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    const naked: string[] = []
    let checked = 0

    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper
      if (!instance || !metatype) continue
      const proto = Object.getPrototypeOf(instance) as object

      for (const method of this.scanner.getAllMethodNames(proto)) {
        const handler = (proto as Record<string, unknown>)[method]
        /* Chỉ hàm nào thật sự là route mới bị hỏi — controller vẫn được có
           phương thức nội bộ. */
        if (typeof handler !== 'function') continue
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue

        checked++
        const targets = [handler, metatype]
        const need = this.reflector.getAllAndOverride(NEED_KEY, targets)
        const isPublic = this.reflector.getAllAndOverride(PUBLIC_KEY, targets)
        if (!need && !isPublic) naked.push(`${metatype.name}.${method}`)
      }
    }

    if (naked.length > 0) {
      throw new Error(
        `${naked.length} đường dữ liệu chưa khai quyền — thêm @Need(...) hoặc @Public():\n` +
          naked.map((n) => `  · ${n}`).join('\n'),
      )
    }

    this.log.log(`${checked} đường dữ liệu, đều đã khai quyền.`)
  }
}
