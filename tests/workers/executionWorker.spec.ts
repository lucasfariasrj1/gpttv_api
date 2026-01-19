const rechargeResellerMock = jest.fn();

const prismaMock = {
  tenant: {
    findUnique: jest.fn(),
  },
  transaction: {
    update: jest.fn(),
    create: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((name, processor, options) => ({
    name,
    processor,
    options,
  })),
}));

jest.mock("../../src/infra/database", () => ({
  prisma: prismaMock,
}));

jest.mock("../../src/infra/redis", () => ({
  redis: {},
}));

jest.mock("../../src/services/WarezService", () => ({
  WarezService: jest.fn().mockImplementation(() => ({
    rechargeReseller: rechargeResellerMock,
  })),
}));

jest.mock("../../src/services/security/encryption", () => ({
  decryptValue: jest.fn((value: string) => value),
}));

describe("executionWorker", () => {
  const jobData = {
    tenantId: "tenant-1",
    targetUser: "target-user",
    amount: 50,
    transactionId: "transaction-1",
    userId: "user-1",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.PAYMENT_ENCRYPTION_KEY = "12345678901234567890123456789012";
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = "secret";

    prismaMock.tenant.findUnique.mockResolvedValue({
      warezUsername: "user",
      warezPassword: "password",
    });
  });

  it("processa recarga com sucesso e marca transação como COMPLETED", async () => {
    const { executionWorker } = await import("../../src/workers/executionWorker");
    const processor = executionWorker.processor as (job: { data: typeof jobData }) => Promise<void>;

    await processor({ data: jobData });

    expect(rechargeResellerMock).toHaveBeenCalledWith({
      tenantId: jobData.tenantId,
      username: "user",
      password: "password",
      targetUser: jobData.targetUser,
      amount: jobData.amount,
    });
    expect(prismaMock.transaction.update).toHaveBeenCalledWith({
      where: { id: jobData.transactionId },
      data: { status: "COMPLETED" },
    });
  });

  it("faz rollback e refund quando a recarga falha", async () => {
    rechargeResellerMock.mockRejectedValueOnce(new Error("failed"));

    const txMock = {
      transaction: {
        update: jest.fn(),
        create: jest.fn(),
      },
      user: {
        update: jest.fn(),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<void>) =>
      callback(txMock),
    );

    const { executionWorker } = await import("../../src/workers/executionWorker");
    const processor = executionWorker.processor as (job: { data: typeof jobData }) => Promise<void>;

    await expect(processor({ data: jobData })).rejects.toThrow("failed");

    expect(rechargeResellerMock).toHaveBeenCalled();
    expect(txMock.transaction.update).toHaveBeenCalledWith({
      where: { id: jobData.transactionId },
      data: { status: "FAILED" },
    });
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: jobData.userId },
      data: {
        balance: {
          increment: jobData.amount,
        },
      },
    });
    expect(txMock.transaction.create).toHaveBeenCalledWith({
      data: {
        tenantId: jobData.tenantId,
        userId: jobData.userId,
        type: "REFUND",
        amount: jobData.amount,
        description: "Refund after recharge failure",
        status: "COMPLETED",
      },
    });
  });
});
