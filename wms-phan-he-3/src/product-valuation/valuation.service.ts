import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { AssetClass } from './product-valuation.types';

export interface HoldingInput {
  assetId: string;
  assetClass: AssetClass;
  quantity: number;
  avgCost: number;
  principal: number;
  accruedInterest: number;
}

export interface ValuationInput {
  cashBalance: number;
  holdings: HoldingInput[];
  /** Chỉ chứa giá APPLIED mới nhất, không có giá PENDING_APPROVAL. */
  latestPrices: Map<string, number>;
}

export interface ValuationResult {
  aum: number;
  cashBalance: number;
  depositValue: number;
  bondValue: number;
  fundValue: number;
  unrealizedPnL: number;
}

/** UC-11 / BR-17: AUM = tiền mặt + giá trị thị trường + gốc và lãi dự thu. */
@Injectable()
export class ValuationService {
  calculate(input: ValuationInput): ValuationResult {
    let depositValue = 0;
    let bondValue = 0;
    let fundValue = 0;
    let unrealizedPnL = 0;

    for (const h of input.holdings) {
      if (h.assetClass === AssetClass.TERM_DEPOSIT) {
        depositValue += h.principal + h.accruedInterest;
        unrealizedPnL += h.accruedInterest;
        continue;
      }
      const price = input.latestPrices.get(h.assetId);
      if (price === undefined) {
        throw new UnprocessableEntityException(`PRICE_NOT_AVAILABLE:${h.assetId}`);
      }
      const marketValue = h.quantity * price;
      unrealizedPnL += marketValue - h.quantity * h.avgCost;
      if (h.assetClass === AssetClass.BOND) {
        bondValue += marketValue;
      } else {
        fundValue += marketValue;
      }
    }

    return {
      aum: input.cashBalance + depositValue + bondValue + fundValue,
      cashBalance: input.cashBalance,
      depositValue,
      bondValue,
      fundValue,
      unrealizedPnL,
    };
  }
}
