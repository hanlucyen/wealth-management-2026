import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PricingService } from './pricing.service';
import {
  ASSET_REPOSITORY,
  ApprovalDecision,
  AssetClass,
  AssetPricing,
  AssetRepository,
  AssetStatus,
  AUDIT_LOG_REPOSITORY,
  AuditAction,
  AuditLogRepository,
  PRICING_REPOSITORY,
  PriceType,
  PricingRepository,
  PricingStatus,
} from './product-valuation.types';

const NOW = new Date('2026-10-31T10:00:00Z');
const YESTERDAY = new Date('2026-10-30T00:00:00Z');

const makePricing = (overrides: Partial<AssetPricing> = {}): AssetPricing => ({
  pricingId: 'P-1',
  assetId: 'FUND-01',
  priceType: PriceType.NAV,
  value: 100,
  previousValue: null,
  changePct: 0,
  effectiveDate: YESTERDAY,
  status: PricingStatus.APPLIED,
  createdBy: 'maker-1',
  createdAt: NOW,
  ...overrides,
});

describe('PricingService', () => {
  let service: PricingService;
  let assets: jest.Mocked<AssetRepository>;
  let pricings: jest.Mocked<PricingRepository>;
  let audit: jest.Mocked<AuditLogRepository>;

  beforeEach(async () => {
    assets = { findById: jest.fn() };
    pricings = {
      findLatestApplied: jest.fn(),
      findById: jest.fn(),
      insert: jest.fn(),
      updateStatus: jest.fn(),
      insertApproval: jest.fn(),
    };
    audit = { append: jest.fn() };

    assets.findById.mockResolvedValue({
      assetId: 'FUND-01',
      assetClass: AssetClass.MUTUAL_FUND,
      status: AssetStatus.ON_SALE,
    });
    pricings.insert.mockImplementation(async (p) => ({
      ...p,
      pricingId: 'P-NEW',
      createdAt: NOW,
    }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: ASSET_REPOSITORY, useValue: assets },
        { provide: PRICING_REPOSITORY, useValue: pricings },
        { provide: AUDIT_LOG_REPOSITORY, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(PricingService);
  });

  describe('insertPrice (UC-10, BR-15)', () => {
    const dto = (value: number) => ({
      assetId: 'FUND-01',
      priceType: PriceType.NAV,
      value,
      effectiveDate: YESTERDAY,
    });

    it('áp dụng ngay khi biến động dưới 20%', async () => {
      pricings.findLatestApplied.mockResolvedValue(makePricing({ value: 100 }));

      const result = await service.insertPrice(dto(110), 'maker-1', NOW);

      expect(result.status).toBe(PricingStatus.APPLIED);
      expect(result.changePct).toBe(10);
      expect(result.previousValue).toBe(100);
    });

    it('áp dụng ngay khi biến động đúng 20% (ngưỡng là "trên 20%")', async () => {
      pricings.findLatestApplied.mockResolvedValue(makePricing({ value: 100 }));

      const result = await service.insertPrice(dto(120), 'maker-1', NOW);

      expect(result.status).toBe(PricingStatus.APPLIED);
    });

    it.each<[string, number]>([
      ['tăng', 120.5],
      ['giảm', 79],
    ])('khóa chờ duyệt khi %s trên 20%%', async (_label, value) => {
      pricings.findLatestApplied.mockResolvedValue(makePricing({ value: 100 }));

      const result = await service.insertPrice(dto(value), 'maker-1', NOW);

      expect(result.status).toBe(PricingStatus.PENDING_APPROVAL);
    });

    it('giá đầu tiên của sản phẩm: APPLIED, changePct = 0, previousValue = null', async () => {
      pricings.findLatestApplied.mockResolvedValue(null);

      const result = await service.insertPrice(dto(100), 'maker-1', NOW);

      expect(result.status).toBe(PricingStatus.APPLIED);
      expect(result.changePct).toBe(0);
      expect(result.previousValue).toBeNull();
    });

    it.each([0, -5])('từ chối giá trị %p và không ghi DB', async (value) => {
      await expect(
        service.insertPrice(dto(value), 'maker-1', NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pricings.insert).not.toHaveBeenCalled();
    });

    it('từ chối ngày hiệu lực ở tương lai', async () => {
      const future = { ...dto(100), effectiveDate: new Date('2026-11-01T00:00:00Z') };

      await expect(
        service.insertPrice(future, 'maker-1', NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('báo 404 khi sản phẩm không tồn tại', async () => {
      assets.findById.mockResolvedValue(null);

      await expect(
        service.insertPrice(dto(100), 'maker-1', NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ghi audit INSERT_PRICE với actorRole BACK_OFFICE (BR-01)', async () => {
      pricings.findLatestApplied.mockResolvedValue(null);

      await service.insertPrice(dto(100), 'maker-1', NOW);

      expect(audit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceId: 'P-NEW',
          actorId: 'maker-1',
          actorRole: 'BACK_OFFICE',
          action: AuditAction.INSERT_PRICE,
        }),
      );
    });
  });

  describe('decide (Maker-Checker)', () => {
    const pending = makePricing({
      status: PricingStatus.PENDING_APPROVAL,
      createdBy: 'maker-1',
    });

    beforeEach(() => {
      pricings.findById.mockResolvedValue(pending);
      pricings.updateStatus.mockImplementation(async (id, status) =>
        makePricing({ pricingId: id, status }),
      );
    });

    it('duyệt: giá chuyển APPLIED, lưu phiên duyệt và ghi audit APPROVE_PRICE', async () => {
      const result = await service.decide('P-1', 'checker-1', ApprovalDecision.APPROVED);

      expect(result.status).toBe(PricingStatus.APPLIED);
      expect(pricings.insertApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          pricingId: 'P-1',
          makerId: 'maker-1',
          checkerId: 'checker-1',
          decision: ApprovalDecision.APPROVED,
        }),
      );
      expect(audit.append).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.APPROVE_PRICE }),
      );
    });

    it('từ chối kèm lý do: giá chuyển REJECTED, audit REJECT_PRICE', async () => {
      const result = await service.decide(
        'P-1',
        'checker-1',
        ApprovalDecision.REJECTED,
        'Sai nguồn dữ liệu',
      );

      expect(result.status).toBe(PricingStatus.REJECTED);
      expect(audit.append).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.REJECT_PRICE }),
      );
    });

    it('từ chối không có lý do thì báo lỗi', async () => {
      await expect(
        service.decide('P-1', 'checker-1', ApprovalDecision.REJECTED, '  '),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pricings.updateStatus).not.toHaveBeenCalled();
    });

    it('Maker không được tự duyệt giá của mình', async () => {
      await expect(
        service.decide('P-1', 'maker-1', ApprovalDecision.APPROVED),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(pricings.updateStatus).not.toHaveBeenCalled();
    });

    it('chỉ duyệt được giá đang PENDING_APPROVAL', async () => {
      pricings.findById.mockResolvedValue(makePricing({ status: PricingStatus.APPLIED }));

      await expect(
        service.decide('P-1', 'checker-1', ApprovalDecision.APPROVED),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('báo 404 khi không có bản ghi giá', async () => {
      pricings.findById.mockResolvedValue(null);

      await expect(
        service.decide('P-X', 'checker-1', ApprovalDecision.APPROVED),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
