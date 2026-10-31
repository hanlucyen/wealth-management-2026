import { DriftDetectionService, TargetAllocation } from './drift-detection.service';
import { ValuationResult } from './valuation.service';
import { AssetClass } from './product-valuation.types';

/** AUM 1 tỷ: tiền mặt 10%, tiền gửi 30%, trái phiếu 20%, CCQ 40%. */
const snapshot: ValuationResult = {
  aum: 1_000_000_000,
  cashBalance: 100_000_000,
  depositValue: 300_000_000,
  bondValue: 200_000_000,
  fundValue: 400_000_000,
  unrealizedPnL: 0,
};

const target = (deposit: number, bond: number, fund: number): TargetAllocation => ({
  [AssetClass.TERM_DEPOSIT]: deposit,
  [AssetClass.BOND]: bond,
  [AssetClass.MUTUAL_FUND]: fund,
});

describe('DriftDetectionService (UC-12, BR-16)', () => {
  const service = new DriftDetectionService();

  it('không sinh cảnh báo khi mọi nhóm lệch dưới 5 điểm', () => {
    expect(service.detect(snapshot, target(30, 24.99, 40))).toEqual([]);
  });

  it('sinh cảnh báo khi lệch đúng 5 điểm (ngưỡng là "từ 5 trở lên")', () => {
    const findings = service.detect(snapshot, target(30, 25, 40));

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      assetClass: AssetClass.BOND,
      actualWeight: 20,
      targetWeight: 25,
      deviation: 5,
    });
  });

  it('gợi ý INCREASE khi thấp hơn mục tiêu, DECREASE khi cao hơn mục tiêu', () => {
    const findings = service.detect(snapshot, target(30, 30, 30));
    const bond = findings.find((f) => f.assetClass === AssetClass.BOND);
    const fund = findings.find((f) => f.assetClass === AssetClass.MUTUAL_FUND);

    expect(bond?.suggestion).toEqual({ direction: 'INCREASE', adjustAmount: 100_000_000 });
    expect(fund?.suggestion).toEqual({ direction: 'DECREASE', adjustAmount: 100_000_000 });
  });

  it('không cảnh báo nhóm đang khớp mục tiêu', () => {
    const findings = service.detect(snapshot, target(30, 30, 30));

    expect(findings.map((f) => f.assetClass)).not.toContain(AssetClass.TERM_DEPOSIT);
  });

  it('AUM bằng 0: không tính tỷ trọng và không cảnh báo', () => {
    const empty: ValuationResult = {
      aum: 0,
      cashBalance: 0,
      depositValue: 0,
      bondValue: 0,
      fundValue: 0,
      unrealizedPnL: 0,
    };

    expect(service.detect(empty, target(30, 30, 40))).toEqual([]);
  });
});
