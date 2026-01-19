import axios from "axios";
import crypto from "crypto";

import type { IPaymentGateway, PaymentResponse, PaymentWebhookResult } from "./IPaymentGateway";

const MONNIFY_BASE_URL = "https://api.monnify.com/api/v1";

type MonnifyWebhookConfig = {
  url: string;
  secret: string;
  events: string[];
  status: "enabled" | "disabled";
};

type MonnifyChargeInput = {
  amount: number;
  type: "immediate";
  metadata: Record<string, string>;
};

type MonnifyChargeSuccessResponse = {
  requestSuccessful: true;
  responseMessage?: string;
  responseCode?: string;
  responseBody?: {
    paymentReference?: string;
    transactionReference?: string;
    qrCode?: string;
    qrCodeBase64?: string;
  };
};

type MonnifyChargeErrorResponse = {
  requestSuccessful: false;
  responseMessage?: string;
  responseCode?: string;
  responseBody?: {
    errorCode?: string;
    errorDescription?: string;
  };
};

type MonnifyChargeResponse = MonnifyChargeSuccessResponse | MonnifyChargeErrorResponse;

type MonnifyWebhookPayload = {
  eventType?: string;
  eventData?: {
    paymentReference?: string;
    transactionReference?: string;
    metaData?: Record<string, string>;
  };
};

export class MonnifyService implements IPaymentGateway {
  constructor(private readonly tenantToken: string, private readonly webhookSecret?: string) {}

  async setupWebhook(config: MonnifyWebhookConfig): Promise<void> {
    await axios.put(`${MONNIFY_BASE_URL}/tenant/integrations/webhook`, config, {
      headers: {
        Authorization: `Bearer ${this.tenantToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  async createCharge(input: MonnifyChargeInput): Promise<MonnifyChargeResponse> {
    const response = await axios.post(`${MONNIFY_BASE_URL}/tenant/charges`, input, {
      headers: {
        Authorization: `Bearer ${this.tenantToken}`,
        "Content-Type": "application/json",
      },
    });

    return response.data as MonnifyChargeResponse;
  }

  async createPayment(input: {
    amount: number;
    description: string;
    payer: { email: string; name?: string; document?: string };
    metadata?: Record<string, string>;
  }): Promise<PaymentResponse> {
    const response = await this.createCharge({
      amount: input.amount,
      type: "immediate",
      metadata: input.metadata ?? {},
    });

    const responseBody = response as MonnifyChargeResponse;

    return {
      paymentId:
        responseBody.responseBody?.paymentReference ??
        responseBody.responseBody?.transactionReference ??
        "",
      status: "PENDING",
      qrCode: responseBody.responseBody?.qrCode ?? "",
      qrCodeBase64: responseBody.responseBody?.qrCodeBase64 ?? "",
    };
  }

  async handleWebhook(
    payload: unknown,
    headers: Record<string, string | string[]>,
  ): Promise<PaymentWebhookResult> {
    const signatureHeader = headers["x-monnify-signature"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    if (!this.webhookSecret) {
      throw new Error("Webhook secret não configurado.");
    }

    MonnifyService.validateWebhookSignature(payload, signature, this.webhookSecret);

    const data = payload as MonnifyWebhookPayload;
    const status = data.eventType === "transaction.successful" ? "PAID" : "CANCELED";
    const metadata = data.eventData?.metaData;
    const paymentId = data.eventData?.paymentReference ?? data.eventData?.transactionReference ?? "";

    return {
      paymentId,
      status,
      metadata,
    };
  }

  static generateWebhookSecret(seed: string): string {
    const random = crypto.randomBytes(32).toString("hex");

    return crypto.createHash("sha256").update(`${seed}:${random}`).digest("hex");
  }

  static validateWebhookSignature(payload: unknown, signature: string | undefined, secret: string): void {
    if (!signature) {
      throw new Error("Assinatura do webhook ausente.");
    }

    const rawPayload = JSON.stringify(payload);
    const expectedSignature = crypto.createHmac("sha256", secret).update(rawPayload).digest("hex");

    if (signature !== expectedSignature) {
      throw new Error("Assinatura do webhook inválida.");
    }
  }
}
