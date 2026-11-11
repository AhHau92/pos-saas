# POS SaaS · 手机店收银与库存系统

多门店手机店 POS（Point of Sale）+ 库存管理系统，设计成 **SaaS**：每家客户（租户）有自己独立的数据库。
第一个客户：**Mobile Relation（新加坡）**——默认 SGD、GST 9%（价格含税）。

| | |
| --- | --- |
| 技术栈 | Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 16 · Prisma 7 · Docker |
| 架构 | Modular Monolith（模块化单体）+ Database-per-Tenant |
| 设计文档 | [`docs/`](docs/)：架构、ERD、库存状态机、业务流程、路线图 |

## v1 功能

- **① 商品**：品牌 / 分类 / 型号，SKU = 颜色 × 容量 × RAM × 成色（新机 / 二手 / 翻新）；“颜色 × 容量”一键生成多个 SKU
- **② 库存**：每台手机按 IMEI / 序列号追踪（完整生命周期）、各门店库存矩阵、库存流水、低库存提醒、库存调整（期初入库 / 盘点 / 报损 / 故障）
- **③ 采购**：供应商、采购单、分批收货（扫描 IMEI，二手机可带成色和电池健康）、移动加权平均成本
- **④ 调货**：草稿 → 发出（在途）→ 目的门店确认收货
- **⑤ POS 收银**：扫 IMEI / 条码 / 搜索、改价与折扣、拆单付款（Cash / NETS / Card / PayNow…）、找零、顾客资料、80mm 热敏收据、部分 / 全额退款
- **SaaS**：平台管理后台（开通租户、暂停 / 启用）、套餐限制（门店数 / 员工数）
- **权限**：店主 OWNER / 经理 MANAGER / 收银员 CASHIER（收银员只能在自己的门店）

## 快速开始（本地测试）

**第 1 步：安装两个软件（只需一次）**

- **Node.js 22**：https://nodejs.org （下载 LTS 版本安装）
- **Docker Desktop**：https://www.docker.com/products/docker-desktop/ （Mac 选 Apple Silicon / Apple chip）。
  安装后打开 Docker Desktop，等它显示 **Engine running**。

**第 2 步：在终端（Terminal）依次执行**

```bash
git clone https://github.com/AhHau92/pos-saas.git
cd pos-saas
npm install
docker compose up -d db
npm run setup
npm run dev
```

**第 3 步：** 浏览器打开 http://localhost:3000

说明：

- `docker compose up -d db` 启动 PostgreSQL 数据库（以后开机后要用系统，先打开 Docker Desktop，再执行这一行，或 `npm run db:up`）。
- `npm run setup` 会自动建立 `.env`（并生成随机 `SESSION_SECRET`）、建表、建立套餐和平台管理员，以及一个有示范数据的 demo 店铺。可以重复执行。
- 已经下载过代码，要更新到最新版：在 `pos-saas` 文件夹执行 `git pull`，然后 `npm install`。
- Mac 的终端（zsh）复制命令时，请一行一行复制上面框里的命令，不要把说明文字一起贴进去。

**不想装 Docker？** 可以用 [Postgres.app](https://postgresapp.com)：安装后点 **Initialize**，然后把 `.env` 里的两行改成（`你的Mac用户名` 换成终端提示符 `@` 前面那个名字）：

```bash
CONTROL_DATABASE_URL="postgresql://你的Mac用户名@localhost:5432/pos_control"
TENANT_DATABASE_URL_TEMPLATE="postgresql://你的Mac用户名@localhost:5432/{db}"
```

> 已经有自己的 PostgreSQL？同样修改这两行即可（数据库用户需要 `CREATEDB` 权限）。

### Demo 账号

| 用途 | 网址 | 店铺代码 | Email | 密码 |
| --- | --- | --- | --- | --- |
| 店主 | /login | `demo` | owner@example.com | demo1234 |
| 经理 | /login | `demo` | manager@example.com | demo1234 |
| 收银员（Toa Payoh） | /login | `demo` | cashier@example.com | demo1234 |
| 平台管理员 | /platform | – | `.env` 的 PLATFORM_ADMIN_EMAIL | `.env` 的 PLATFORM_ADMIN_PASSWORD |

### 建议测试流程

1. 用 **owner** 登录 → Dashboard 看今日销售、在途调货、低库存
2. **POS**：搜索 `iphone` → 选一台 IMEI → 再扫条码 `8880000000017`（保护贴）→ 付款选 NETS + Cash → 完成 → 打印收据
3. **Sales**：打开刚才的单 → 退款（选“Back to stock”或“Defective”）
4. **Inventory → IMEI / Serial**：点进任何一台，看完整生命周期（收货 → 调货 → 销售 → 退款）
5. **Purchasing**：打开 `PO-…-00001`（部分收货）→ Receive goods → 512GB 那行贴上测试 IMEI：
   ```
   359900000005007
   359900000005015
   ```
6. **Transfers**：有一张 HQ → TPY 的“在途”调货单。登出，用 **cashier@example.com** 登录（Toa Payoh）→ 确认收货
7. **Inventory → Adjustments**：用 “Stock in · Opening stock” 录入期初库存（更多测试 IMEI：`359900000005023`、`359900000005031`、`359900000005049`）
8. **Settings**：改店名、UEN、GST 号、收据页脚 → 重新打印收据
9. 终端执行 `npm run inventory:check`，确认库存数据全部一致

## 开通真正的店铺

两种方式（会自动建立独立数据库 + HQ 门店 + 店主账号）：

- 平台后台：`http://localhost:3000/platform` → **New tenant**
- 命令行：
  ```bash
  npm run tenant:create -- --slug mobilerelation --name "Mobile Relation" \
    --owner-name "你的名字" --owner-email you@example.com --owner-password "至少8位密码"
  ```

之后登录页的「店铺代码」填 `mobilerelation`。开始使用时，先在 **Settings → Outlets** 建门店、**Users** 建员工，再用 **Inventory → Adjustments → Stock in（Opening stock）** 录入现有库存。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式 |
| `npm run build` / `npm start` | 生产构建 / 启动 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 单元测试（价格 / 税 / 付款 / 退款 / IMEI / 状态机 / 时区 / 密码） |
| `npm run db:up` / `npm run db:down` | 启动 / 停止本地 PostgreSQL（Docker） |
| `npm run setup` | 首次初始化（`-- --no-demo` 不建 demo 店铺）；会自动建立 `.env` |
| `npm run tenant:create -- …` | 开通新租户 |
| `npm run db:push:control` | 同步 Control DB 表结构 |
| `npm run tenants:sync` | 把 `prisma/tenant/schema.prisma` 同步到**所有**租户数据库 |
| `npm run inventory:check -- --tenant demo` | 检查库存不变量（库存 = 流水、IMEI 数 = 库存数…） |
| `npm run prisma:generate` | 重新生成 Prisma Client |

## 修改数据库结构

1. 改 `prisma/tenant/schema.prisma`（或 `prisma/control/schema.prisma`）
2. `npm run prisma:generate`
3. `npm run tenants:sync`（或 `npm run db:push:control`）

> v1 用 `prisma db push`（开发快、不需要 migration 文件）。**正式上线前**要改用 `prisma migrate`，见 [`docs/05-roadmap.md`](docs/05-roadmap.md)。

## 部署（Docker）

整套（PostgreSQL + App）用 Docker 跑：

```bash
docker compose --profile app up -d --build
docker compose exec app npm run setup -- --no-demo
```

正式环境请设置环境变量 `SESSION_SECRET`（随机长字符串）。

云端部署：任何支持 Docker 的主机（AWS / GCP / DigitalOcean / 阿里云…）。建议：

- 用托管 PostgreSQL，用户要有 `CREATEDB` 权限
- 前面加 HTTPS 反向代理（Nginx / Caddy / 云负载均衡）；HTTPS 下 Cookie 自动 `Secure`
- 环境变量参考 `.env.example`；健康检查：`GET /api/health`
- 每日备份每个租户数据库（`pos_t_*`）和 `pos_control`

## 项目结构

```
docs/                 设计文档（先看这里）
prisma/control/       Control DB schema（租户 / 套餐 / 订阅）
prisma/tenant/        Tenant DB schema（业务数据）
scripts/              setup、开通租户、同步表结构、库存检查
src/app/              页面（(app) 后台、pos、receipt、platform）+ API（api/**）
src/components/       UI 组件
src/lib/              数据库连接、认证、权限、错误、金额、时区、单号
src/modules/          业务模块：tenant · settings · outlets · users · products ·
                      inventory · purchasing · transfers · sales · reports
tests/                单元测试
CLAUDE.md             给 Claude Code 的开发规则
```
