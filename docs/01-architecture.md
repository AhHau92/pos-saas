# 01 · 系统架构 (Architecture)

> 适用版本：v1（第一版）。本文件是整个项目的"宪法"：写代码（包括让 Claude Code 写代码）之前先看这里。

## 1. 技术栈

| 层级 | 技术 | 说明 |
| --- | --- | --- |
| Frontend | Next.js 16（App Router）+ React 19 | 后台管理 + POS 收银界面 |
| UI | Tailwind CSS 4 | 不依赖额外 UI 组件库，组件在 `src/components/ui` |
| 编程语言 | TypeScript（strict） | |
| Backend | Next.js Route Handlers（`src/app/api/**`） | REST + JSON，将来手机 App / 第三方也能直接调用 |
| Database | PostgreSQL 16 | 1 个 Control DB + 每个租户 1 个 Tenant DB |
| ORM | Prisma 7（`prisma-client` generator + `@prisma/adapter-pg`） | 两套 schema：`prisma/control`、`prisma/tenant` |
| 验证 | Zod 4 | 所有 API 输入都经过 schema 校验 |
| Background Jobs | Redis + Worker（v1 未加入） | 等到报表、通知、电商同步时再加 |
| Deployment | Docker + docker-compose | 任何支持 Docker 的云主机 |

## 2. Modular Monolith（模块化单体）

一个 Next.js 项目、一个部署单元，但业务代码按模块切开，**模块之间只能通过公开接口互相调用**。

```
src/
├── app/                    # 路由层：页面 + API（不写业务逻辑，只调用模块）
│   ├── (app)/              #   租户后台页面（需要登录）
│   ├── api/                #   REST API
│   ├── login/              #   登录
│   ├── platform/           #   SaaS 平台管理后台（Tenant / Plan）
│   └── receipt/[id]/       #   收据打印页（80mm 热敏纸）
├── components/             # 共享 UI 组件
├── lib/                    # Shared kernel：数据库连接、认证、错误、金额、单号
└── modules/                # 业务模块（核心）
    ├── tenant/             #   SaaS：租户、套餐、订阅、开通(provisioning)
    ├── settings/           #   商家资料、税率、货币、收据页脚
    ├── outlets/            #   门店
    ├── users/              #   员工账号、角色
    ├── products/           #   ① 商品：品牌、分类、型号、SKU（颜色/容量/成色）
    ├── inventory/          #   ② 库存：IMEI、各门店库存、库存流水、库存调整
    ├── purchasing/         #   ③ 采购：供应商、采购单、收货入库
    ├── transfers/          #   ④ 调货：门店调拨、在途库存、收货确认
    ├── sales/              #   ⑤ POS：收银、付款、退款、收据、客户
    └── reports/            #   只读报表（Dashboard）
```

### 2.1 模块规则（必须遵守）

1. **公开接口**：每个模块只通过 `src/modules/<模块>/index.ts` 对外暴露函数和类型。其他模块只能 `import { ... } from "@/modules/<模块>"`，不能 import 模块内部文件。
   浏览器端组件（`"use client"`）只能 import `@/modules/<模块>/client`（纯函数 + 类型，不含数据库代码），例如 POS 画面和服务器共用 `sales/pricing.ts` 计算价格与税。
2. **表的所有权**：每张表只属于一个模块，只有该模块可以写入。
   - 只有 `inventory` 模块可以写 `StockLevel`、`StockUnit`、`StockUnitEvent`、`InventoryMovement`、`StockAdjustment`。
   - `purchasing`、`transfers`、`sales` 需要改库存时，在**自己的数据库事务里**调用 `inventory` 的函数（把 `tx` 传进去），保证"单据 + 库存"要么一起成功，要么一起回滚。
3. **路由层不写业务**：`src/app/api/**` 只负责：读取请求 → 调用模块 → 返回 JSON。页面（Server Component）读取数据也是调用模块的查询函数。
4. **`reports` 模块只读**：可以跨表查询，但绝不写入。
5. **金额一律用整数"分"**（字段名以 `Cents` 结尾），避免浮点误差。

### 2.2 模块与数据表

| 模块 | 拥有的表 | 依赖的模块 |
| --- | --- | --- |
| tenant | Control DB：`Plan`、`Tenant`、`Subscription`、`PlatformAdmin` | settings、outlets、users、sales（只在开通租户时初始化数据） |
| settings | `BusinessProfile` | – |
| outlets | `Outlet` | – |
| users | `User` | – |
| products | `Brand`、`Category`、`Product`、`ProductVariant` | – |
| inventory | `StockLevel`、`StockUnit`、`StockUnitEvent`、`InventoryMovement`、`StockAdjustment` | products |
| purchasing | `Supplier`、`PurchaseOrder(+Item)`、`GoodsReceipt(+Item)` | inventory、products |
| transfers | `StockTransfer(+Item)` | inventory、products |
| sales | `Customer`、`PaymentMethod`、`Sale`、`SaleItem`、`Payment`、`Refund`、`RefundItem` | inventory、products、settings |
| reports | （只读） | – |
| lib（shared kernel） | `DocumentSequence`（单号流水） | – |

## 3. 多租户：Database-per-Tenant

```mermaid
flowchart TB
    subgraph Control["Control DB · pos_control"]
        T[Tenant] --- S[Subscription] --- P[Plan]
        A[PlatformAdmin]
    end
    Control -->|dbName| TA[("Tenant DB · pos_t_mobilerelation<br/>Outlets · Stock · Sales")]
    Control -->|dbName| TB[("Tenant DB · pos_t_othershop<br/>Outlets · Stock · Sales")]
```

- **Control DB**（`pos_control`）：只放 SaaS 平台数据——租户、套餐、订阅、平台管理员。
- **Tenant DB**（`pos_t_<slug>`）：每家客户一个独立数据库，放所有业务数据（门店、员工、商品、库存、单据）。
- 连接字符串由环境变量模板生成：`TENANT_DATABASE_URL_TEMPLATE=postgresql://user:pass@host:5432/{db}`，`{db}` 替换为 `Tenant.dbName`。Control DB 不保存数据库密码。
- **好处**：客户数据物理隔离（不会因为漏写 `where tenantId` 而串数据）、可以单独备份/恢复/迁移某个客户。
- **代价**：数据库变更要同步到所有租户库（`npm run tenants:sync`）、连接数随租户增长（见 3.3）。

### 3.1 请求如何找到租户

1. 登录页输入 **店铺代码（Shop code，= `Tenant.slug`）+ Email + 密码**。
2. 服务端在 Control DB 找到租户（必须是 `ACTIVE`），连接该租户的数据库，验证员工密码。
3. 签发 Session Cookie（HMAC 签名、HttpOnly、SameSite=Lax），内容是 `{ 租户 slug, 用户 id, 过期时间 }`。
4. 之后每个请求：验证 Cookie → 查租户（内存缓存 30 秒）→ 从连接池缓存拿到该租户的 Prisma Client → 读取用户（确认仍启用）→ 确定"当前门店"。

> 将来可以加"子域名识别租户"（`mobilerelation.yourpos.com`），只需要改 `src/lib/auth/context.ts` 的租户解析逻辑。

### 3.2 开通新租户（Provisioning）

由平台管理后台 `/platform` 或命令 `npm run tenant:create` 触发：

1. Control DB 新增 `Tenant`（状态 `PROVISIONING`）
2. `CREATE DATABASE pos_t_<slug>`
3. `prisma db push`（tenant schema）建表
4. 初始化：商家资料（SGD / GST 9% 含税）、总店 `HQ`、店主账号（OWNER）、默认付款方式
5. 建立 `Subscription`（试用 14 天）→ 租户状态改为 `ACTIVE`

任何一步失败，租户状态变成 `FAILED` 并记录错误。

### 3.3 连接管理

- 每个租户的 Prisma Client 使用独立的 `pg` 连接池（默认 5 个连接），客户端放在 LRU 缓存里（默认最多 50 个），超出时断开最久没用的。
- 租户多了以后建议在 PostgreSQL 前加 **PgBouncer**。

### 3.4 Schema 变更流程（v1）

v1 阶段用 `prisma db push` 同步表结构（开发快、不需要 migration 文件）：

```bash
npm run db:push:control   # Control DB
npm run tenants:sync      # 所有 Tenant DB
```

> ⚠️ 正式上线前要切换到 `prisma migrate`（生成 baseline migration，之后每次改表都产生 migration 文件，并用 `migrate deploy` 依次部署到每个租户库）。见 `docs/05-roadmap.md`。

## 4. 认证与权限

| 角色 | 权限 |
| --- | --- |
| OWNER 店主 | 全部，包括商家设置、门店、员工、付款方式 |
| MANAGER 经理 | 商品、库存调整、采购、调货、退款、所有门店 |
| CASHIER 收银员 | 只能在自己的门店：POS 收银、查看商品与库存、确认调货收货 |

- 权限表在 `src/lib/auth/permissions.ts`，**在 service 层强制检查**（不是只靠前端隐藏按钮）。
- 每个页面自己调用 `requireTenantContext()` 检查登录（Next.js 的 layout 在页面切换时不会重新执行，不能只靠 layout）。
- 密码使用 Node 内置 `scrypt` 加盐哈希。
- 所有写操作 API 只接受 `Content-Type: application/json`，配合 SameSite=Lax Cookie 防 CSRF。
- 平台管理员（`/platform`）使用独立的 Cookie 和账号表（Control DB 的 `PlatformAdmin`）。

## 5. 其他约定

- **金额**：整数"分"。`BusinessProfile.currency` 默认 `SGD`。
- **税**：`BusinessProfile.taxRateBps`（900 = 9%）+ `taxInclusive`（新加坡零售价含 GST，默认 `true`）。税额按每一行计算后加总，方便部分退款。
- **单号**：`DocumentSequence` 表 + `INSERT … ON CONFLICT DO UPDATE … RETURNING`，并发安全。格式：
  - 销售：`<门店代码>-<年>-<6位>`，例：`HQ-2026-000123`
  - 退款 `RF-2026-00001`、采购 `PO-2026-00001`、收货 `GRN-2026-00001`、调货 `TR-2026-00001`、调整 `ADJ-2026-00001`
- **时区**：环境变量 `TZ=Asia/Singapore`，"今天的销售"按此计算。
- **ID**：`cuid()`。
