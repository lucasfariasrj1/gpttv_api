import { prisma } from "../lib/prisma";
import { redis } from "../lib/queue";

const BASE_URL = "https://mcapi.knewcms.com:2087";
const TOKEN_CACHE_KEY = "warez:token";
const TOKEN_TTL_SECONDS = Number(process.env.WAREZ_TOKEN_TTL ?? 3600);

interface WarezAuthResponse {
  token: string;
}

export class WarezService {
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const responseText = await response.text();
    const responseBody = responseText ? JSON.parse(responseText) : null;

    await prisma.externalLog.create({
      data: {
        endpoint: path,
        requestPayload: init.body ? JSON.parse(init.body.toString()) : {},
        responseData: responseBody,
        statusCode: response.status,
      },
    });

    if (!response.ok) {
      const error = new Error(`Warez request failed: ${response.status}`);
      (error as Error & { responseBody?: unknown }).responseBody = responseBody;
      throw error;
    }

    return responseBody as T;
  }

  async getToken(): Promise<string> {
    const cachedToken = await redis.get(TOKEN_CACHE_KEY);
    if (cachedToken) {
      return cachedToken;
    }

    const username = process.env.WAREZ_USER;
    const password = process.env.WAREZ_PASS;

    if (!username || !password) {
      throw new Error("WAREZ_USER and WAREZ_PASS must be configured");
    }

    const response = await this.request<WarezAuthResponse>("/auth/static-token", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    await redis.set(TOKEN_CACHE_KEY, response.token, "EX", TOKEN_TTL_SECONDS);
    return response.token;
  }

  async rechargeReseller(payload: Record<string, unknown>): Promise<void> {
    const token = await this.getToken();

    await this.request("/reseller/recharge-reseller", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  }
}
