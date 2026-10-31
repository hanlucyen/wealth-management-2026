import { UnprocessableEntityException } from '@nestjs/common';
import { ValuationService, HoldingInput } from './valuation.service';
import { AssetClass } from './product-valuation.types';

const deposit: HoldingInput = {
  assetId: 'TD-01',
  assetClass: AssetClass.TERM_DEPOSIT,
  quantity: 0,
  avgCost: 0,
  principal: 200_000_000,
  accruedInterest: 2_000_000,
};
const fund: HoldingInput = {
  assetId: 'FUND-01',
  assetClass: AssetClass.MUTUAL_FUND,
  quantity: 1000,
  avgCost: 10_000,
  principal: 0,
  accruedInterest: 0,
};
const bond: HoldingInput = {
  assetId: 'BOND-01',
  assetClass: AssetClass.BOND,
  quantity: 50,
  avgCost: 990_000,
  principal: 0,
  accruedInterest: 0,
};

describe('ValuationService (UC-11, BR-17)', () => {
  const service = new ValuationService();
  const prices = new Map([
    ['FUND-01', 12_000],
    ['BOND-01', 1_000_000],
  ]);

  it('tính AUM và giá trị từng nhóm tài sản', () => {
    const result = service.calculate({
      cashBalance: 100_000_000,
      holdings: [deposit, fund, bond],
      latestPrices: prices,
    });

    expect(result.depositValue).toBe(202_000_000);
    expect(result.fundValue).toBe(12_000_000);
    expect(result.bondValue).toBe(50_000_000);
    expect(result.aum).toBe(364_000_000);
  });

  it('tính lãi/lỗ chưa thực hiện (lãi dự thu + chênh lệch giá thị trường)', () => {
    const result = service.calculate({
      cashBalance: 0,
      holdings: [deposit, fund, bond],
      latestPrices: prices,
    });

    expect(result.unrealizedPnL).toBe(4_500_000);
  });

  it('ra số âm khi giá thị trường thấp hơn giá vốn', () => {
    const result = service.calculate({
      cashBalance: 0,
      holdings: [fund],
      latestPrices: new Map([['FUND-01', 9_000]]),
    });

    expect(result.unrealizedPnL).toBe(-1_000_000);
  });

  it('danh mục rỗng: AUM bằng tiền mặt, lãi/lỗ bằng 0', () => {
    const result = service.calculate({
      cashBalance: 5_000_000,
      holdings: [],
      latestPrices: new Map(),
    });

    expect(result).toEqual({
      aum: 5_000_000,
      cashBalance: 5_000_000,
      depositValue: 0,
      bondValue: 0,
      fundValue: 0,
      unrealizedPnL: 0,
    });
  });

  it('báo lỗi khi thiếu giá APPLIED cho CCQ hoặc trái phiếu', () => {
    expect(() =>
      service.calculate({
        cashBalance: 0,
        holdings: [fund],
        latestPrices: new Map(),
      }),
    ).toThrow(UnprocessableEntityException);
  });
});
