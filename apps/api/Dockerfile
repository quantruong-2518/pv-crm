# Build từ GỐC REPO, không từ thư mục này:
#     docker build -f apps/api/Dockerfile -t pv-api .
#
# Cùng một image chạy được cả HTTP lẫn worker — đổi CMD, không đổi image.
# Xem `src/worker.ts` để biết vì sao đó là đủ thay cho microservice.

FROM node:22-alpine AS base
WORKDIR /repo
RUN corepack enable

# ---------------------------------------------------------------------------
# Manifest của TOÀN BỘ workspace
# ---------------------------------------------------------------------------
# `pnpm-workspace.yaml` khai `apps/*`, `packages/*`, `tools/*`. Thiếu bất kỳ
# package.json nào thì `--frozen-lockfile` báo lockfile không khớp workspace và
# build đứng — kể cả package đó chẳng liên quan gì tới máy chủ.
#
# Tách riêng một stage vì đây là lớp đổi ít nhất: sửa mã nguồn không làm mất
# cache của bước cài đặt.
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/engines/package.json packages/engines/
COPY packages/contracts/package.json packages/contracts/
COPY packages/mail-templates/package.json packages/mail-templates/
COPY packages/ui/package.json packages/ui/
COPY packages/tokens/package.json packages/tokens/
COPY tools/eslint-plugin-aurora/package.json tools/eslint-plugin-aurora/

FROM manifests AS deps
RUN pnpm install --frozen-lockfile --filter @pv/api...

FROM deps AS build
COPY tsconfig.base.json tsconfig.api.json ./
COPY packages/engines packages/engines
COPY packages/contracts packages/contracts
COPY packages/tokens packages/tokens
COPY packages/mail-templates packages/mail-templates
COPY apps/api apps/api
RUN pnpm --filter @pv/api build

# ---------------------------------------------------------------------------
# Ảnh chạy
# ---------------------------------------------------------------------------
# Phụ thuộc được cài LẠI ở đây thay vì `COPY --from=build node_modules`, và đó
# không phải chuyện thẩm mỹ: pnpm dựng node_modules bằng symlink trỏ vào kho
# `.pnpm`, mà symlink không sống qua `COPY --from`. Chép sang thì ảnh lên
# được nhưng `require('@nestjs/core')` không tìm thấy gì.
FROM manifests AS run
ENV NODE_ENV=production
# `--ignore-scripts`: package.json GỐC có `"prepare": "husky"`, chạy sau mọi
# lần install. `husky` là devDependency nên `--prod` không cài nó, và lệnh
# `husky` gọi ở bước `prepare` báo "not found" — vỡ cả bước install. Không
# dependency thật nào của server (drizzle-orm, pg, fastify, @nestjs/*, zod,
# rxjs) cần script cài đặt để chạy, nên bỏ qua an toàn.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @pv/api... \
    && addgroup -S pv && adduser -S pv -G pv

COPY --from=build --chown=pv:pv /repo/apps/api/dist apps/api/dist
COPY --chown=pv:pv apps/api/tsconfig.runtime.json apps/api/

# TypeScript compiles workspace sources into `apps/api/dist/packages/*`, but
# pnpm keeps each workspace package's private runtime dependencies beside its
# source package. Node resolves from the compiled file's directory, so expose
# that same dependency tree at the compiled package root. Without this link,
# `@pv/mail-templates` crashes on startup with `Cannot find module 'react'`.
RUN ln -s /repo/packages/mail-templates/node_modules \
    /repo/apps/api/dist/packages/mail-templates/node_modules

USER pv
WORKDIR /repo/apps/api
EXPOSE 3000

# `tsconfig-paths` phân giải `@pv/engines`, `@pv/contracts`, `@api/*` sang bản
# đã biên dịch trong dist — lý do dài nằm trong `tsconfig.runtime.json`.
ENV TS_NODE_PROJECT=tsconfig.runtime.json

# Alpine không có curl, và Node 22 có sẵn `fetch`.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>r.ok?0:process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "-r", "tsconfig-paths/register", "dist/apps/api/src/main.js"]
