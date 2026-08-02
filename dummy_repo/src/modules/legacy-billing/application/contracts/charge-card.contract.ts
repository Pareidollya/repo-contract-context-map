// Would be an application contract if this module were not excluded.
export interface ChargeCardInput {
  amountCents: number;
  cardToken: string;
}

export interface ChargeResult {
  transactionId: string;
}
