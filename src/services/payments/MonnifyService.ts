import axios from "axios";
import crypto from "crypto";

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

export class MonnifyService {
  constructor(private readonly tenantToken: string) {}

  async setupWebhook(config: MonnifyWebhookConfig): Promise<void> {
    await axios.put(`${MONNIFY_BASE_URL}/tenant/integrations/webhook`, config, {
      headers: {
        Authorization: `Bearer ${this.tenantToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  async createCharge(input: MonnifyChargeInput): Promise<unknown> {
    const response = await axios.post(`${MONNIFY_BASE_URL}/tenant/charges`, input, {
      headers: {
        Authorization: `Bearer ${this.tenantToken}`,
        "Content-Type": "application/json",
      },
    });

    return response.data;
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
