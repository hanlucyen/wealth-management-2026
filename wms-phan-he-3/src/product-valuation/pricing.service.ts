import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ASSET_REPOSITORY,
  ApprovalDecision,
  AssetPricing,
  AssetRepository,
  AUDIT_LOG_REPOSITORY,
  AuditAction,
  AuditLogRepository,
  PRICE_CHANGE_THRESHOLD_PCT,
  PRICING_REPOSITORY,
  PriceType,
  PricingRepository,
  PricingStatus,
} from './product-valuation.types';

export interface InsertPriceDto {
  assetId: string;
  priceType: PriceType;
  value: number;
  effectiveDate: Date;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

@Injectable()
export class PricingService {
  constructor(
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    @Inject(PRICING_REPOSITORY) private readonly pricings: PricingRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly audit: AuditLogRepository,
  ) {}

  /** UC-10: Maker nhập giá. Giá biến động > 20% bị khóa chờ duyệt (BR-15). */
  async insertPrice(
    dto: InsertPriceDto,
    makerId: string,
    now: Date = new Date(),
  ): Promise<AssetPricing> {
    if (!(dto.value > 0)) {
      throw new BadRequestException('PRICE_MUST_BE_POSITIVE');
    }
    if (dto.effectiveDate.getTime() > now.getTime()) {
      throw new BadRequestException('EFFECTIVE_DATE_IN_FUTURE');
    }
    const asset = await this.assets.findById(dto.assetId);
    if (!asset) {
      throw new NotFoundException('ASSET_NOT_FOUND');
    }

    const previous = await this.pricings.findLatestApplied(dto.assetId);
    const rawChangePct = previous
      ? (Math.abs(dto.value - previous.value) / previous.value) * 100
      : 0;
    const status =
      rawChangePct > PRICE_CHANGE_THRESHOLD_PCT
        ? PricingStatus.PENDING_APPROVAL
        : PricingStatus.APPLIED;

    const saved = await this.pricings.insert({
      assetId: dto.assetId,
      priceType: dto.priceType,
      value: dto.value,
      previousValue: previous ? previous.value : null,
      changePct: round2(rawChangePct),
      effectiveDate: dto.effectiveDate,
      status,
      createdBy: makerId,
    });

    await this.audit.append({
      referenceId: saved.pricingId,
      actorId: makerId,
      actorRole: 'BACK_OFFICE',
      action: AuditAction.INSERT_PRICE,
      payload: { assetId: dto.assetId, value: dto.value, status },
    });
    return saved;
  }

  /** UC-10: Checker duyệt hoặc từ chối giá đang PENDING_APPROVAL. */
  async decide(
    pricingId: string,
    checkerId: string,
    decision: ApprovalDecision,
    reason?: string,
  ): Promise<AssetPricing> {
    const pricing = await this.pricings.findById(pricingId);
    if (!pricing) {
      throw new NotFoundException('PRICING_NOT_FOUND');
    }
    if (pricing.status !== PricingStatus.PENDING_APPROVAL) {
      throw new ConflictException('PRICING_NOT_PENDING');
    }
    if (pricing.createdBy === checkerId) {
      throw new ForbiddenException('MAKER_CHECKER_MUST_DIFFER');
    }
    if (decision === ApprovalDecision.REJECTED && !reason?.trim()) {
      throw new BadRequestException('REJECT_REASON_REQUIRED');
    }

    const approved = decision === ApprovalDecision.APPROVED;
    await this.pricings.insertApproval({
      pricingId,
      makerId: pricing.createdBy,
      checkerId,
      decision,
      reason: reason ?? null,
      decidedAt: new Date(),
    });
    const updated = await this.pricings.updateStatus(
      pricingId,
      approved ? PricingStatus.APPLIED : PricingStatus.REJECTED,
    );

    await this.audit.append({
      referenceId: pricingId,
      actorId: checkerId,
      actorRole: 'BACK_OFFICE',
      action: approved ? AuditAction.APPROVE_PRICE : AuditAction.REJECT_PRICE,
      payload: { makerId: pricing.createdBy, reason: reason ?? null },
    });
    return updated;
  }
}
