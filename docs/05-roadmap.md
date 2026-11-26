# 05 · v1 范围与路线图 (Roadmap)

## v1 已包含

- [x] SaaS 多租户（Database-per-Tenant）、平台管理后台、套餐限制（门店数 / 员工数）
- [x] 登录、角色权限（OWNER / MANAGER / CASHIER）、多门店切换
- [x] ① 商品：品牌、分类、型号 + SKU（颜色 / 容量 / RAM / 成色）、IMEI 商品 / 配件 / 服务
- [x] ② 库存：IMEI 追踪与完整历史、各门店库存、库存流水、库存调整（含期初入库）、低库存提醒
- [x] ③ 采购：供应商、采购单、分批收货（扫描 / 贴上多个 IMEI，预览清单，二手机逐台填成色和电池）、移动平均成本
- [x] ④ 调货：草稿 → 发出（在途）→ 部分 / 全部收货；没到的货由经理处理（遗失报损 / 退回发出门店）；收到后可"一键退回"
- [x] ⑤ POS：扫码收银、拆单付款、找零、顾客资料、80mm 收据打印、部分 / 全额退款
- [x] 收据快照：结账时保存店名 / UEN / GST 号 / 门店地址 / 页脚 / 收银员，之后改设置不影响旧收据；补印显示 REPRINT
- [x] 电子收据：结账填 email 自动寄出、销售单可重发、顾客专属链接（可存 PDF）、WhatsApp 按钮（免费，店员按发送）
- [x] 二手机收购（Trade-in）：POS 换购（抵扣，GST 照全价）+ 纯回收（付钱给顾客）、IMEI 查历史、检查清单、卖方证件 / 警方查询（可关）、收购单签名、`TRADE_IN` 入库
- [x] 多公司 / GST：门店可以归属不同公司（有 / 没有 GST 登记），收据显示对应的公司名、UEN、GST 号
- [x] Dashboard：今日销售、付款方式统计、今日收购 / 付出现金、低库存、在途调货、最近交易

## 建议的下一步（按优先级）

1. **上线准备**
   - 从 `prisma db push` 切换到 `prisma migrate`（baseline + 每租户 `migrate deploy`）
   - 自动化测试（Playwright 跑收银 / 退款 / 调货主流程）
   - 每日数据库备份（每个租户库）
2. **手机店常用功能**
   - 维修单（Repair job）：接单、状态、零件消耗、取机
   - 交班 / 钱箱（Shift & cash drawer）：开班金额、现金收支、交班对账
   - 保修查询：按 IMEI 查购买日期、顾客
   - 订金 / 预留（Deposit / Layaway）：IMEI 状态加 `RESERVED`
   - 退货给供应商（Supplier return）：IMEI 状态加 `RETURNED_TO_SUPPLIER`
   - 盘点单（Stocktake）：扫描 IMEI 对比系统，自动产生调整
   - 条码 / 价格标签打印
3. **新加坡相关**
   - **二手机 GST Gross Margin Scheme（按毛利计 GST）**：收购成本已按台记录（`StockUnit.costCents`），
     还需要：商品 / 门店设定"用 GMS"、GMS 收据（不显示 GST 金额，加 IRAS 规定的声明）、GMS 报表（每台售价 − 收购价）
   - 收购单：拍照存证（机器 / 证件）、警方系统 API（如有）
   - NETS / PayNow 终端整合
   - WhatsApp 自动发送收据（WhatsApp Business Platform / Cloud API：按条收费，需要 Meta 企业认证和模板审核）
4. **电子收据进阶**
   - 用平台自己的寄件网域（例如 receipts@平台网域，显示店名），或每个租户设定自己的 SMTP
   - 退信（bounce）追踪、邮件里附 PDF
5. **SaaS**
   - 子域名识别租户、订阅计费（Stripe）、租户自助注册
   - Redis + Worker：报表生成、电商平台库存同步（Shopee / Lazada）、通知
   - 审计日志（谁在什么时候改了什么）
