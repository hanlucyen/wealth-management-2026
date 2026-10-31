import { Injectable } from '@nestjs/common';
import { AssetClass, DRIFT_THRESHOLD_PP } from './product-valuation.types';
import { ValuationResult } from './valuation.service';

export type TargetAllocation = Record<AssetClass, number>;

export interface DriftFinding {
  assetClass: AssetClass;
  actualWeight: number;
  targetWeight: number;
  deviation: number;
  suggestion: { direction: 'INCREASE' | 'DECREASE'; adjustAmount: number };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** UC-12 / BR-16: cảnh báo khi tỷ trọng thực tế lệch từ 5 điểm phần trăm. */
@Injectable()
export class DriftDetectionService {
  detect(snapshot: ValuationResult, target: TargetAllocation): DriftFinding[] {
    if (snapshot.aum <= 0) {
      return [];
    }
    const values: Record<AssetClass, number> = {
      [AssetClass.TERM_DEPOSIT]: snapshot.depositValue,
      [AssetClass.BOND]: snapshot.bondValue,
      [AssetClass.MUTUAL_FUND]: snapshot.fundValue,
    };

    const findings: DriftFinding[] = [];
    for (const assetClass of Object.values(AssetClass)) {
      const actualWeight = round4((values[assetClass] / snapshot.aum) * 100);
      const targetWeight = target[assetClass];
      const deviation = round4(Math.abs(actualWeight - targetWeight));
      if (deviation < DRIFT_THRESHOLD_PP) {
        continue;
      }
      findings.push({
        assetClass,
        actualWeight,
        targetWeight,
        deviation,
        suggestion: {
          direction: targetWeight > actualWeight ? 'INCREASE' : 'DECREASE',
          adjustAmount: Math.round((deviation / 100) * snapshot.aum),
        },
      });
    }
    return findings;
  }
}
