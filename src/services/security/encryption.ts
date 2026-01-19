import crypto from "crypto";

import { env } from "../../env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const getEncryptionKey = (): Buffer => {
  const key = env.PAYMENT_ENCRYPTION_KEY;

  const keyBuffer = Buffer.from(key, "utf8");

  if (keyBuffer.length !== 32) {
    throw new Error("PAYMENT_ENCRYPTION_KEY deve conter 32 caracteres.");
  }

  return keyBuffer;
};

export const encryptValue = (value: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

export const decryptValue = (encryptedValue: string): string => {
  const buffer = Buffer.from(encryptedValue, "base64");
  const iv = buffer.subarray(0, IV_LENGTH);
  const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + TAG_LENGTH);
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted.toString("utf8");
};
