export enum AssetClass {
  TERM_DEPOSIT = 'TERM_DEPOSIT',
  BOND = 'BOND',
  MUTUAL_FUND = 'MUTUAL_FUND',
}

export enum AssetStatus {
  ON_SALE = 'ON_SALE',
  DISCONTINUED = 'DISCONTINUED',
}

export enum PriceType {
  NAV = 'NAV',
  BOND_PRICE = 'BOND_PRICE',
  INTEREST_RATE = 'INTEREST_RATE',
}

export enum PricingStatus {
  APPLIED = 'APPLIED',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  REJECTED = 'REJECTED',
}

export enum ApprovalDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum AuditAction {
  INSERT_PRICE = 'INSERT_PRICE',
  APPROVE_PRICE = 'APPROVE_PRICE',
  REJECT_PRICE = 'REJECT_PRICE',
  CREATE_DRIFT_ALERT = 'CREATE_DRIFT_ALERT',
}

/** BR-15: biến động giá trên ngưỡng này phải qua Maker-Checker. */
export const PRICE_CHANGE_THRESHOLD_PCT = 20;
/** BR-16: lệch từ ngưỡng này (điểm phần trăm) trở lên thì sinh cảnh báo. */
export const DRIFT_THRESHOLD_PP = 5;

export const ASSET_REPOSITORY = 'ASSET_REPOSITORY';
export const PRICING_REPOSITORY = 'PRICING_REPOSITORY';
export const AUDIT_LOG_REPOSITORY = 'AUDIT_LOG_REPOSITORY';

export interface Asset {
  assetId: string;
  assetClass: AssetClass;
  status: AssetStatus;
}

export interface AssetPricing {
  pricingId: string;
  assetId: string;
  priceType: PriceType;
  value: number;
  previousValue: number | null;
  changePct: number;
  effectiveDate: Date;
  status: PricingStatus;
  createdBy: string;
  createdAt: Date;
}

export type NewAssetPricing = Omit<AssetPricing, 'pricingId' | 'createdAt'>;

export interface PriceApproval {
  pricingId: string;
  makerId: string;
  checkerId: string;
  decision: ApprovalDecision;
  reason: string | null;
  decidedAt: Date;
}

export interface AuditEntry {
  referenceId: string;
  actorId: string;
  actorRole: 'BACK_OFFICE' | 'SYSTEM_JOB';
  action: AuditAction;
  payload: Record<string, unknown>;
}

export interface AssetRepository {
  findById(assetId: string): Promise<Asset | null>;
}

export interface PricingRepository {
  findLatestApplied(assetId: string): Promise<AssetPricing | null>;
  findById(pricingId: string): Promise<AssetPricing | null>;
  insert(pricing: NewAssetPricing): Promise<AssetPricing>;
  updateStatus(pricingId: string, status: PricingStatus): Promise<AssetPricing>;
  insertApproval(approval: PriceApproval): Promise<void>;
}

export interface AuditLogRepository {
  append(entry: AuditEntry): Promise<void>;
}
