// =====================================================================
// KNOWLEDGE BRAIN — CLIENT-SIDE ENCRYPTED AI KEY SYNC
// End-to-end zero-knowledge encryption using Web Crypto API (AES-GCM 256)
// =====================================================================

export interface EncryptedKeyPayload {
  geminiApiKey: string;
  openrouterApiKey: string;
  updatedAt?: string;
}

/**
 * Derives an AES-GCM 256-bit encryption key from user entropy using PBKDF2.
 */
async function deriveEncryptionKey(
  userEntropy: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) {
    throw new Error("Web Crypto API is not supported in this environment");
  }

  const encoder = new TextEncoder();
  const rawKeyMaterial = encoder.encode(`KB_KEY_SYNC_V1_${userEntropy}`);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    rawKeyMaterial,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypts API keys client-side before sending to Supabase cloud.
 * Format: `${salt_b64}.${iv_b64}.${ciphertext_b64}`
 */
export async function encryptApiKeys(
  payload: EncryptedKeyPayload,
  userEntropy: string,
): Promise<string> {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) {
    throw new Error("Web Crypto API is not available");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(userEntropy, salt);

  const encoder = new TextEncoder();
  const fullPayload: EncryptedKeyPayload = {
    geminiApiKey: payload.geminiApiKey || "",
    openrouterApiKey: payload.openrouterApiKey || "",
    updatedAt: payload.updatedAt || new Date().toISOString(),
  };
  const plaintext = encoder.encode(JSON.stringify(fullPayload));

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    plaintext,
  );

  return `${arrayBufferToBase64(salt)}.${arrayBufferToBase64(iv)}.${arrayBufferToBase64(new Uint8Array(ciphertext))}`;
}

/**
 * Decrypts cloud-synced API keys client-side.
 */
export async function decryptApiKeys(
  encryptedString: string,
  userEntropy: string,
): Promise<EncryptedKeyPayload> {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) {
    throw new Error("Web Crypto API is not available");
  }

  const parts = encryptedString.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted key payload format");
  }

  const salt = base64ToArrayBuffer(parts[0]!);
  const iv = base64ToArrayBuffer(parts[1]!);
  const ciphertext = base64ToArrayBuffer(parts[2]!);

  const key = await deriveEncryptionKey(userEntropy, salt);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv as any,
    },
    key,
    ciphertext as any,
  );

  const decoder = new TextDecoder();
  const jsonStr = decoder.decode(decryptedBuffer);
  return JSON.parse(jsonStr) as EncryptedKeyPayload;
}
