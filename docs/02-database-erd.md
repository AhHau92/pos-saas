# 02 · 数据库 ERD（实体关系图）

> 真正的定义以 `prisma/control/schema.prisma` 和 `prisma/tenant/schema.prisma` 为准，本文件是给人看的说明。
> GitHub 会自动把下面的 Mermaid 代码渲染成图。

## 1. Control DB（SaaS 平台库）

```mermaid
erDiagram
    PLAN ||--o{ SUBSCRIPTION : "used by"
    TENANT ||--o{ SUBSCRIPTION : "has"

    PLAN {
        string id PK
        string code UK "STARTER / GROWTH / ENTERPRISE"
        string name
        int priceCents
        int maxOutlets
        int maxUsers
    }
    TENANT {
        string id PK
        string slug UK "店铺代码, 登录用"
        string name
        enum status "PROVISIONING / ACTIVE / SUSPENDED / FAILED"
        string dbName UK "pos_t_slug"
        string ownerEmail
    }
    SUBSCRIPTION {
        string id PK
        string tenantId FK
        string planId FK
        enum status "TRIALING / ACTIVE / PAST_DUE / CANCELLED"
        datetime currentPeriodEnd
    }
    PLATFORM_ADMIN {
        string id PK
        string email UK
        string passwordHash
    }
```

## 2. Tenant DB（每家客户一个）

### 2.1 总览

```mermaid
erDiagram
    COMPANY |o--o{ OUTLET : "legal entity / GST"
    OUTLET ||--o{ USER : "default outlet"
    OUTLET ||--o{ STOCK_LEVEL : ""
    OUTLET ||--o{ STOCK_UNIT : "located at"
    PRODUCT ||--|{ PRODUCT_VARIANT : "has SKUs"
    PRODUCT_VARIANT ||--o{ STOCK_LEVEL : ""
    PRODUCT_VARIANT ||--o{ STOCK_UNIT : "IMEI units"
    PRODUCT_VARIANT ||--o{ INVENTORY_MOVEMENT : "ledger"
    STOCK_UNIT ||--o{ STOCK_UNIT_EVENT : "history"
    SUPPLIER ||--o{ PURCHASE_ORDER : ""
    PURCHASE_ORDER ||--|{ PURCHASE_ORDER_ITEM : ""
    PURCHASE_ORDER ||--o{ GOODS_RECEIPT : "received by"
    GOODS_RECEIPT ||--|{ GOODS_RECEIPT_ITEM : ""
    GOODS_RECEIPT_ITEM ||--o{ STOCK_UNIT : "creates"
    STOCK_TRANSFER ||--|{ STOCK_TRANSFER_ITEM : ""
    STOCK_TRANSFER_ITEM }o--o| STOCK_UNIT : "IMEI"
    SALE ||--|{ SALE_ITEM : ""
    SALE ||--|{ PAYMENT : ""
    SALE ||--o{ REFUND : ""
    REFUND ||--|{ REFUND_ITEM : ""
    SALE_ITEM }o--o| STOCK_UNIT : "IMEI sold"
    SALE ||--o{ RECEIPT_EMAIL : "e-receipt log"
    CUSTOMER ||--o{ SALE : ""
    PAYMENT_METHOD ||--o{ PAYMENT : ""
    TRADE_IN ||--|{ TRADE_IN_ITEM : ""
    TRADE_IN_ITEM }o--|| STOCK_UNIT : "IMEI bought in"
    TRADE_IN |o--o| SALE : "trade-in credit"
```

### 2.2 ① 商品 Product Management

一个 **Product** = 一个型号（例：iPhone 16 Pro）；一个 **ProductVariant** = 一个 SKU（型号 + 颜色 + 容量 + 成色）。

```mermaid
erDiagram
    BRAND ||--o{ PRODUCT : ""
    CATEGORY ||--o{ PRODUCT : ""
    PRODUCT ||--|{ PRODUCT_VARIANT : ""

    PRODUCT {
        string id PK
        string name "iPhone 16 Pro"
        enum type "SERIALIZED / NON_SERIALIZED / SERVICE"
        string brandId FK
        string categoryId FK
        bool isActive
    }
    PRODUCT_VARIANT {
        string id PK
        string productId FK
        string sku UK "APPLE-IPHONE16PRO-256-BLK-NEW"
        string barcode UK
        string color "Black Titanium"
        string storage "256GB"
        string ram "8GB (Android)"
        enum condition "NEW / USED / REFURBISHED"
        int priceCents "零售价"
        int costCents "平均成本"
        int minStock "低库存提醒"
    }
```

| Product.type | 例子 | 库存方式 |
| --- | --- | --- |
| `SERIALIZED` | 手机、平板、手表、笔电 | 每台一条 `StockUnit`（IMEI / 序列号） |
| `NON_SERIALIZED` | 手机壳、保护贴、充电器 | 只记数量（`StockLevel`） |
| `SERVICE` | 贴膜服务费、维修工钱 | 不管库存 |

### 2.3 ② 库存 Inventory Management

```mermaid
erDiagram
    OUTLET ||--o{ STOCK_LEVEL : ""
    PRODUCT_VARIANT ||--o{ STOCK_LEVEL : ""
    STOCK_UNIT ||--o{ STOCK_UNIT_EVENT : ""
    STOCK_UNIT ||--o{ INVENTORY_MOVEMENT : ""
    STOCK_ADJUSTMENT ||..o{ INVENTORY_MOVEMENT : "refType=ADJUSTMENT"

    STOCK_LEVEL {
        string outletId FK "UK(outletId, variantId)"
        string variantId FK
        int quantity "可售在库数量"
    }
    STOCK_UNIT {
        string id PK
        string variantId FK
        string outletId FK "当前所在门店"
        enum status "IN_STOCK / IN_TRANSIT / SOLD / DEFECTIVE / WRITTEN_OFF"
        string imei UK
        string imei2
        string serialNumber UK
        int costCents "这一台的进货成本"
        int priceCents "单台售价(二手机可选)"
        string grade "二手成色 A/B/C"
        int batteryHealth "电池健康 %"
    }
    STOCK_UNIT_EVENT {
        string stockUnitId FK
        enum fromStatus
        enum toStatus
        string outletId
        enum refType "GOODS_RECEIPT / SALE / REFUND / TRANSFER / ADJUSTMENT"
        string refNo
        string userId
        datetime createdAt
    }
    INVENTORY_MOVEMENT {
        string outletId FK
        string variantId FK
        string stockUnitId FK "IMEI 商品才有"
        enum type "见 03 文件"
        int quantity "+入 / -出"
        int balanceAfter "该门店结存"
        int unitCostCents
        enum refType
        string refNo
        datetime createdAt
    }
    STOCK_ADJUSTMENT {
        string id PK
        string number UK "ADJ-2026-00001"
        string outletId FK
        enum reason "OPENING_STOCK / STOCK_COUNT / DAMAGED / LOST / FOUND / REPAIRED / OTHER"
    }
```

- **StockLevel**：每个门店 × 每个 SKU 一行，是"各门店库存"的快速查询表。
- **StockUnit**：一台手机一行（IMEI 唯一）。卖掉后**不删除**，状态变 `SOLD`，以后可查完整生命周期（保修、回收都用得到）。
- **InventoryMovement**：库存流水（只增不改），任何数量变化都有一条记录。
- **StockUnitEvent**：IMEI 状态变化记录（包括不影响数量的变化，例如"退款故障机 SOLD → DEFECTIVE"）。

### 2.4 ③ 采购 Purchase Management

```mermaid
erDiagram
    SUPPLIER ||--o{ PURCHASE_ORDER : ""
    PURCHASE_ORDER ||--|{ PURCHASE_ORDER_ITEM : ""
    PURCHASE_ORDER ||--o{ GOODS_RECEIPT : ""
    GOODS_RECEIPT ||--|{ GOODS_RECEIPT_ITEM : ""
    PURCHASE_ORDER_ITEM ||--o{ GOODS_RECEIPT_ITEM : ""
    GOODS_RECEIPT_ITEM ||--o{ STOCK_UNIT : "IMEI 入库"

    PURCHASE_ORDER {
        string number UK "PO-2026-00001"
        string supplierId FK
        string outletId FK "收货门店"
        enum status "DRAFT / ORDERED / PARTIALLY_RECEIVED / RECEIVED / CANCELLED"
        int totalCents
    }
    PURCHASE_ORDER_ITEM {
        string variantId FK
        int quantity
        int receivedQuantity
        int unitCostCents
    }
    GOODS_RECEIPT {
        string number UK "GRN-2026-00001"
        string purchaseOrderId FK
        string outletId FK
        datetime receivedAt
    }
    GOODS_RECEIPT_ITEM {
        string purchaseOrderItemId FK
        string variantId FK
        int quantity
        int unitCostCents
    }
```

一张采购单可以分多次收货（每次一张 GRN），支持"部分到货"。

### 2.5 ④ 调货 Stock Transfer

```mermaid
erDiagram
    OUTLET ||--o{ STOCK_TRANSFER : "from"
    OUTLET ||--o{ STOCK_TRANSFER : "to"
    STOCK_TRANSFER ||--|{ STOCK_TRANSFER_ITEM : ""
    STOCK_TRANSFER_ITEM }o--o| STOCK_UNIT : ""

    STOCK_TRANSFER {
        string number UK "TR-2026-00001"
        string fromOutletId FK
        string toOutletId FK
        enum status "DRAFT / IN_TRANSIT / PARTIALLY_RECEIVED / RECEIVED / CLOSED / CANCELLED"
        datetime dispatchedAt
        datetime receivedAt "最后一次收货"
        string resolvedById FK "处理没到的货的经理"
        datetime resolvedAt
        string resolutionNote
    }
    STOCK_TRANSFER_ITEM {
        string variantId FK
        string stockUnitId FK "IMEI 商品: 每台一行"
        int quantity "发出数量"
        int unitCostCents
        int receivedQuantity "已收"
        int lostQuantity "途中遗失（报损）"
        int returnedQuantity "退回发出门店"
    }
```

在途数量 = `quantity − receivedQuantity − lostQuantity − returnedQuantity`。

### 2.6 ⑤ POS 销售 Sales

```mermaid
erDiagram
    CUSTOMER ||--o{ SALE : ""
    SALE ||--|{ SALE_ITEM : ""
    SALE ||--|{ PAYMENT : ""
    SALE ||--o{ REFUND : ""
    REFUND ||--|{ REFUND_ITEM : ""
    SALE_ITEM ||--o{ REFUND_ITEM : ""
    PAYMENT_METHOD ||--o{ PAYMENT : ""

    SALE {
        string number UK "HQ-2026-000123"
        string outletId FK
        string cashierId FK
        string customerId FK
        enum status "COMPLETED / PARTIALLY_REFUNDED / REFUNDED"
        int subtotalCents
        int taxCents
        int totalCents
        int paidCents
        int changeCents
        int refundedCents
        string currency "快照"
        string taxName "快照"
        json receiptHeader "快照: 店名 / UEN / GST 号 / 门店地址 / 页脚 / 收银员"
        string receiptToken UK "顾客电子收据链接"
        string receiptEmail "最后寄送的 email"
        int printCount "打印次数（>0 再印 = REPRINT）"
    }
    RECEIPT_EMAIL {
        string saleId FK
        string toEmail
        enum status "SENT / FAILED"
        string error "失败原因"
        string sentById FK
    }
    SALE_ITEM {
        string variantId FK
        string stockUnitId FK
        string description "快照"
        string imei "快照"
        int quantity
        int unitPriceCents
        int discountCents
        int taxCents
        int totalCents
        int unitCostCents "毛利计算"
        int refundedQuantity
    }
    PAYMENT {
        string paymentMethodId FK
        string methodName "快照"
        int amountCents "实际抵扣金额"
        int tenderedCents "现金实收"
        string reference "刷卡授权码等"
    }
    PAYMENT_METHOD {
        string name UK "Cash / NETS / Card / PayNow ..."
        bool isCash "现金才可以找零"
        bool isTradeIn "系统的 Trade-in 付款方式（不显示在付款按钮）"
    }
    REFUND {
        string number UK "RF-2026-00001"
        string saleId FK
        int totalCents
        string reason
    }
    REFUND_ITEM {
        string saleItemId FK
        int quantity
        int amountCents
        enum disposition "RESTOCK / DEFECTIVE"
    }
```

**快照原则**：销售明细保存当时的商品名、SKU、IMEI、价格、成本；销售单保存当时的收据抬头（店名、门店所属公司名、UEN、GST 号、门店地址 / 电话、页脚、收银员）、货币、税名和税率——之后改商品资料、设置、公司、门店或员工，都不会影响历史单据和收据。

**二手机收购（Trade-in，见 04 §6）**

```mermaid
erDiagram
    TRADE_IN ||--|{ TRADE_IN_ITEM : ""
    TRADE_IN |o--o| SALE : "换购时抵扣"
    CUSTOMER ||--o{ TRADE_IN : ""
    PAYMENT_METHOD ||--o{ TRADE_IN : "纯回收时付款"
    TRADE_IN_ITEM }o--|| STOCK_UNIT : "入库的 IMEI"
    TRADE_IN_ITEM }o--|| PRODUCT_VARIANT : ""

    TRADE_IN {
        string number UK "TI-2026-00001"
        string outletId FK
        string createdById FK
        string customerId FK
        string sellerName "卖方姓名（必填）"
        enum sellerIdType "NRIC / FIN / PASSPORT / OTHER"
        string sellerIdNumber "只有店主 / 经理看得到完整号码"
        string sellerPhone
        string sellerAddress
        bool policeScreened "已在警方系统查询"
        string policeReference
        string bookingRef
        int totalCents "收购总额"
        enum settlement "PAYOUT（付钱）/ SALE_CREDIT（抵扣销售）"
        string paymentMethodId FK "PAYOUT 时"
        string paymentMethodName "快照"
        string payoutReference
        string saleId FK "SALE_CREDIT 时（唯一）"
    }
    TRADE_IN_ITEM {
        string variantId FK
        string stockUnitId FK
        string description "快照"
        string identifier "IMEI / 序号"
        string grade
        int batteryHealth
        json checklist "检查清单 true / false"
        int priceCents "收购价 = 入库成本"
    }
```

- 换购时，销售单多一笔 `Payment`（`Trade-in` 付款方式，`reference` = TI 单号），`Sale.paidCents` 包含抵扣金额；GST 仍按销售全价计算。

### 2.7 组织与设置

| 表 | 说明 |
| --- | --- |
| `BusinessProfile` | 只有一行（id=1）：品牌名、UEN、GST 注册号（门店没有公司时用）、email（顾客回复电子收据）、货币、税率、是否含税、收据页脚、电话国家码（WhatsApp 用，默认 65）、Trade-in 规则（必须填卖方证件 / 必须警方查询，预设开启） |
| `Company` | 法律实体：公司名、UEN、是否 GST 登记、GST 号、地址（见 04 §7） |
| `Outlet` | 门店，`code` 唯一（例：HQ、TPY、JUR），用于销售单号前缀；`companyId` 可选（没有 = 用 BusinessProfile 的资料） |
| `User` | 员工：email 唯一、角色、默认门店、是否启用 |
| `DocumentSequence` | 单号流水：`key` → 当前值 |
