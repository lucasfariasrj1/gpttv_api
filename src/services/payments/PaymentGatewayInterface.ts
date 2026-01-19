export type PaymentPayer = {
  email: string;
  name?: string;
  document?: string;
};

export type PaymentResponse = {
  paymentId: string;
  status: "PENDING" | "PAID" | "CANCELED";
  qrCode: string;
  qrCodeBase64: string;
};

export type PaymentWebhookResult = {
  paymentId: string;
  status: "PAID" | "CANCELED";
  metadata?: Record<string, string>;
};

export interface PaymentGatewayInterface {
  createPayment(input: {
    amount: number;
    description: string;
    payer: PaymentPayer;
    metadata?: Record<string, string>;
  }): Promise<PaymentResponse>;
  handleWebhook(payload: unknown, headers: Record<string, string | string[]>): Promise<PaymentWebhookResult>;
}
