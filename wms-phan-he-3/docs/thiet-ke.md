# Thiết kế Phân hệ 3 – Sản phẩm và Định giá danh mục

GitHub tự vẽ các sơ đồ Mermaid bên dưới khi bạn mở file này trên web.

## 1. Sơ đồ lớp

```mermaid
classDiagram
  class Asset {
    <<abstract>>
    String assetId PK
    String assetCode
    String assetName
    AssetClass assetClass
    int riskLevel
    Decimal minInvestment
    AssetStatus status
  }
  class TermDeposit { int termMonths
    Decimal interestRate }
  class Bond { Decimal faceValue
    Decimal couponRate
    Date maturityDate
    String issuer }
  class MutualFund { String fundType
    String fundManager }
  class AssetPricing {
    String pricingId PK
    String assetId FK
    PriceType priceType
    Decimal value
    Decimal previousValue
    Decimal changePct
    Date effectiveDate
    PricingStatus status
    String createdBy
  }
  class PriceApproval {
    String approvalId PK
    String pricingId FK
    String makerId
    String checkerId
    ApprovalDecision decision
    String reason
  }
  class PortfolioHolding {
    String holdingId PK
    String accountId FK
    String assetId FK
    Decimal quantity
    Decimal avgCost
    Decimal principal
    Decimal accruedInterest
  }
  class PortfolioSnapshot {
    String snapshotId PK
    String customerId FK
    Date snapshotDate
    Decimal aum
    Decimal cashBalance
    Decimal unrealizedPnL
  }
  class DriftAlert {
    String alertId PK
    String snapshotId FK
    String customerId FK
    String rmId FK
    AssetClass assetClass
    Decimal deviation
    DriftAlertStatus status
  }
  class RebalanceSuggestion {
    String suggestionId PK
    String alertId FK
    String direction
    Decimal adjustAmount
  }
  class AuditLog {
    String logId PK
    String referenceId
    String actorId
    String actorRole
    String action
    String payloadHash
    DateTime timestamp
  }
  Asset <|-- TermDeposit
  Asset <|-- Bond
  Asset <|-- MutualFund
  Asset "1" *-- "0..*" AssetPricing
  AssetPricing "1" -- "0..1" PriceApproval
  Asset "1" -- "0..*" PortfolioHolding
  PortfolioHolding ..> PortfolioSnapshot : dinh gia MtM BR-17
  PortfolioSnapshot "1" -- "0..*" DriftAlert
  DriftAlert "1" *-- "1..*" RebalanceSuggestion
  AuditLog <.. DriftAlert : ghi vet BR-01
```

Lớp ngoài phân hệ chỉ tham chiếu qua khóa ngoại: `Customer`, `RM`, `RiskProfile` (Phân hệ 1) và `InvestmentAccount` (Phân hệ 2).

## 2. Kiến trúc hệ thống (4 tầng)

```mermaid
flowchart TB
  subgraph L1[Tầng 1 - Kênh tương tác]
    M[Mobile App - Khách hàng]
    W[Web Portal - RM]
    B[Portal Back-office]
  end
  subgraph L2[Tầng 2 - Cổng API và bảo mật]
    G[API Gateway: JWT/SSO, RBAC, Idempotency]
  end
  subgraph L3[Tầng 3 - Dịch vụ nghiệp vụ lõi]
    subgraph P3[Phân hệ 3 - Product and Valuation Service]
      C[Catalog UC-09]
      P[Pricing UC-10]
      V[Valuation Engine UC-11]
      D[Drift Detection UC-12]
    end
    J[Job Scheduler 17:00]
    O[Phân hệ 1, 2, 4]
  end
  subgraph L4[Tầng 4 - Dữ liệu và tích hợp]
    PG[(PostgreSQL)]
    RD[(Redis cache)]
    N[Notification]
    I[Bank IAM]
  end
  M --> G
  W --> G
  B --> G
  G --> P3
  C --> P --> V --> D
  J -.-> V
  J -.-> D
  P3 <-.-> O
  P3 --> PG
  P3 --> RD
  P3 --> N
  G -.-> I
```

## 3. Quy tắc nghiệp vụ được kiểm thử

| Mã | Nội dung | Nơi cài đặt |
|---|---|---|
| BR-01 | Mọi thay đổi quan trọng đều ghi audit append-only | `PricingService` |
| BR-14 | `riskLevel` của sản phẩm từ 1 đến 5 | CSDL (ràng buộc CHECK), chưa có ở mã demo |
| BR-15 | Giá biến động trên 20% phải qua Maker-Checker | `PricingService` |
| BR-16 | Lệch tỷ trọng từ 5 điểm phần trăm thì cảnh báo | `DriftDetectionService` |
| BR-17 | AUM = tiền mặt + giá trị thị trường + gốc và lãi dự thu | `ValuationService` |

## 4. Giả định của bản demo

- Lãi dự thu của tiền gửi được tính vào lãi/lỗ chưa thực hiện.
- Thiếu giá APPLIED của CCQ hoặc trái phiếu thì báo lỗi, không dùng giá vốn thay thế.
- Redis chỉ lưu giá NAV mới nhất: đề xuất thiết kế, đặc tả gốc chỉ nêu Redis thuộc tầng dữ liệu.
- Tiền dùng `number` cho gọn; mã thật nên dùng `Decimal`.
