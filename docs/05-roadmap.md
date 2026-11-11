# 05 · v1 范围与路线图 (Roadmap)

## v1 已包含

- [x] SaaS 多租户（Database-per-Tenant）、平台管理后台、套餐限制（门店数 / 员工数）
- [x] 登录、角色权限（OWNER / MANAGER / CASHIER）、多门店切换
- [x] ① 商品：品牌、分类、型号 + SKU（颜色 / 容量 / RAM / 成色）、IMEI 商品 / 配件 / 服务
- [x] ② 库存：IMEI 追踪与完整历史、各门店库存、库存流水、库存调整（含期初入库）、低库存提醒
- [x] ③ 采购：供应商、采购单、分批收货（扫描 IMEI）、移动平均成本
- [x] ④ 调货：草稿 → 发出（在途）→ 确认收货
- [x] ⑤ POS：扫码收银、拆单付款、找零、顾客资料、80mm 收据打印、部分 / 全额退款
- [x] Dashboard：今日销售、付款方式统计、低库存、在途调货、最近交易

## 建议的下一步（按优先级）

1. **上线准备**
   - 从 `prisma db push` 切换到 `prisma migrate`（baseline + 每租户 `migrate deploy`）
   - 自动化测试（Playwright 跑收银 / 退款 / 调货主流程）
   - 每日数据库备份（每个租户库）
2. **手机店常用功能**
   - 二手机回收（Trade-in）：向顾客收购 → 直接入库为二手 SKU，可抵扣新机价格
   - 维修单（Repair job）：接单、状态、零件消耗、取机
   - 交班 / 钱箱（Shift & cash drawer）：开班金额、现金收支、交班对账
   - 保修查询：按 IMEI 查购买日期、顾客
   - 订金 / 预留（Deposit / Layaway）：IMEI 状态加 `RESERVED`
   - 退货给供应商（Supplier return）：IMEI 状态加 `RETURNED_TO_SUPPLIER`
   - 盘点单（Stocktake）：扫描 IMEI 对比系统，自动产生调整
   - 条码 / 价格标签打印
3. **新加坡相关**
   - 二手机 GST Gross Margin Scheme（按毛利计 GST）
   - NETS / PayNow 终端整合
4. **SaaS**
   - 子域名识别租户、订阅计费（Stripe）、租户自助注册
   - Redis + Worker：报表生成、电商平台库存同步（Shopee / Lazada）、通知
   - 审计日志（谁在什么时候改了什么）
