// Would be an outbound port if this module were not excluded.
export interface PaymentGatewayPort {
  charge(input: ChargeCardInput): Promise<ChargeResult>;
}
