import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";

import { AppError } from "../errors/AppError";
import { prisma } from "../infra/database";
import { redis } from "../infra/redis";

const DEFAULT_BASE_URL = "https://mcapi.knewcms.com:2087";
const TOKEN_CACHE_PREFIX = "warez:token:";
const TOKEN_TTL_SECONDS = Number(process.env.WAREZ_TOKEN_TTL ?? 3600);

interface WarezAuthResponse {
  token: string;
}

type WarezCredentials = {
  tenantId: string;
  username: string;
  password: string;
};

type WarezRechargeInput = WarezCredentials & {
  targetUser: string;
  amount: number;
};

export class WarezService {
  private readonly client: AxiosInstance;

  constructor(baseUrl = process.env.WAREZ_API_URL ?? DEFAULT_BASE_URL) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  private async request<T>(
    path: string,
    config: AxiosRequestConfig,
    context: { tenantId?: string; payload?: unknown } = {},
  ): Promise<T> {
    try {
      const response = await this.client.request<T>({
        url: path,
        ...config,
      });

      await prisma.externalLog.create({
        data: {
          tenantId: context.tenantId,
          endpoint: path,
          requestPayload: (context.payload ?? {}) as object,
          responseData: response.data ?? null,
          statusCode: response.status,
        },
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        await prisma.externalLog.create({
          data: {
            tenantId: context.tenantId,
            endpoint: path,
            requestPayload: (context.payload ?? {}) as object,
            responseData: error.response?.data ?? null,
            statusCode: error.response?.status,
          },
        });

        throw new AppError(`Warez request failed: ${error.response?.status ?? "unknown"}`, 502);
      }

      throw error;
    }
  }

  private async getToken({ tenantId, username, password }: WarezCredentials): Promise<string> {
    const cacheKey = `${TOKEN_CACHE_PREFIX}${tenantId}`;
    const cachedToken = await redis.get(cacheKey);

    if (cachedToken) {
      return cachedToken;
    }

    const response = await this.request<WarezAuthResponse>(
      "/auth/static-token",
      {
        method: "POST",
        data: {
          username,
          password,
        },
      },
      {
        tenantId,
        payload: { username },
      },
    );

    if (!response.token) {
      throw new AppError("Token Warez não retornado.", 502);
    }

    await redis.set(cacheKey, response.token, "EX", TOKEN_TTL_SECONDS);
    return response.token;
  }

  async rechargeReseller({ tenantId, username, password, targetUser, amount }: WarezRechargeInput): Promise<void> {
    const token = await this.getToken({ tenantId, username, password });

    await this.request(
      "/reseller/recharge-reseller",
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: {
          target_username: targetUser,
          amount,
        },
      },
      {
        tenantId,
        payload: {
          target_username: targetUser,
          amount,
        },
      },
    );
  }
}
