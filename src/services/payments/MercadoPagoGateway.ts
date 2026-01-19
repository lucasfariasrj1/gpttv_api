import axios from "axios";
import crypto from "crypto";

import type { PaymentGatewayInterface, PaymentResponse, PaymentWebhookResult } from "./PaymentGatewayInterface";

export class MercadoPagoGateway implements PaymentGatewayInterface {
  constructor(private readonly accessToken: string, private readonly webhookSecret?: string) {}

  async createPayment(input: {
    amount: number;
    description: string;
    payer: { email: string; name?: string; document?: string };
    metadata?: Record<string, string>;
  }): Promise<PaymentResponse> {
    const response = await axios.post(
      "https://api.mercadopago.com/v1/payments",
      {
        transaction_amount: input.amount,
        description: input.description,
        payment_method_id: "pix",
        payer: {
          email: input.payer.email,
          first_name: input.payer.name,
          identification: input.payer.document
            ? {
                type: "CPF",
                number: input.payer.document,
              }
            : undefined,
        },
        metadata: input.metadata,
      },
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    const transactionData = response.data?.point_of_interaction?.transaction_data;

    return {
      paymentId: String(response.data.id),
      status: "PENDING",
      qrCode: transactionData?.qr_code ?? "",
      qrCodeBase64: transactionData?.qr_code_base64 ?? "",
    };
  }

  async handleWebhook(
    payload: unknown,
    headers: Record<string, string | string[]>,
  ): Promise<PaymentWebhookResult> {
    if (this.webhookSecret) {
      this.validateWebhookSignature(payload, headers);
    }

    const data = payload as {
      data?: { id?: string };
      type?: string;
      action?: string;
    };

    if (!data?.data?.id) {
      throw new Error("Webhook inválido: payment id ausente.");
    }

    const paymentResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${data.data.id}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    const paymentStatus = paymentResponse.data?.status;

    return {
      paymentId: String(paymentResponse.data.id),
      status: paymentStatus === "approved" ? "PAID" : "CANCELED",
      metadata: paymentResponse.data?.metadata ?? undefined,
    };
  }

  private validateWebhookSignature(payload: unknown, headers: Record<string, string | string[]>) {
    const signatureHeader = headers["x-signature"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    if (!signature) {
      throw new Error("Assinatura do webhook ausente.");
    }

    const rawPayload = JSON.stringify(payload);
    const expectedSignature = crypto
      .createHmac("sha256", this.webhookSecret ?? "")
      .update(rawPayload)
      .digest("hex");

    if (signature !== expectedSignature) {
      throw new Error("Assinatura do webhook inválida.");
    }
  }
}
