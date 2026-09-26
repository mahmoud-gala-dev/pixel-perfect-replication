// =====================================================================
// KNOWLEDGE BRAIN — P1: KEY VAULT (CLOUD-ENCRYPTED KEY SYNC)
// Zero-knowledge client-side encryption via Web Crypto API (SubtleCrypto)
// AES-GCM 256-bit with PBKDF2 key derivation (100,000 iterations)
// =====================================================================

import { supabase } from "@/integrations/supabase/client";
import {
  encryptApiKeys,
  decryptApiKeys,
  type EncryptedKeyPayload,
} from "@/lib/ai/key-sync-crypto";

export type { EncryptedKeyPayload };

export class KeyVault {
  /**
   * Encrypts API keys client-side using user session entropy and optional passphrase.
   */
  static async encrypt(
    payload: EncryptedKeyPayload,
    userId: string,
    passphrase?: string,
  ): Promise<string> {
    const entropy = passphrase ? `${userId}:${passphrase}` : userId;
    return await encryptApiKeys(payload, entropy);
  }

  /**
   * Decrypts encrypted API keys client-side.
   */
  static async decrypt(
    encryptedString: string,
    userId: string,
    passphrase?: string,
  ): Promise<EncryptedKeyPayload> {
    const entropy = passphrase ? `${userId}:${passphrase}` : userId;
    return await decryptApiKeys(encryptedString, entropy);
  }

  /**
   * Encrypts and syncs AI keys to the user's Supabase settings row.
   */
  static async syncToCloud(
    keys: { geminiApiKey: string; openrouterApiKey: string },
    userId: string,
    passphrase?: string,
  ): Promise<{ success: boolean; syncedAt: string; error?: string }> {
    try {
      const now = new Date().toISOString();
      const ciphertext = await this.encrypt(
        {
          geminiApiKey: keys.geminiApiKey,
          openrouterApiKey: keys.openrouterApiKey,
          updatedAt: now,
        },
        userId,
        passphrase,
      );

      const { error } = await (supabase.from("knowledge_settings") as any).upsert({
        user_id: userId,
        sync_keys_to_cloud: true,
        synced_ai_keys_encrypted: ciphertext,
        encrypted_api_keys: ciphertext,
        keys_synced_at: now,
        updated_at: now,
      });

      if (error) {
        throw new Error(error.message);
      }

      return { success: true, syncedAt: now };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to sync encrypted keys";
      return { success: false, syncedAt: "", error: message };
    }
  }

  /**
   * Loads and decrypts cloud-synced keys from Supabase settings.
   */
  static async loadFromCloud(
    userId: string,
    passphrase?: string,
  ): Promise<EncryptedKeyPayload | null> {
    try {
      const { data, error } = await (supabase.from("knowledge_settings") as any)
        .select("sync_keys_to_cloud, synced_ai_keys_encrypted, encrypted_api_keys")
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data) return null;

      const payload = data.synced_ai_keys_encrypted || data.encrypted_api_keys;
      if (!data.sync_keys_to_cloud || !payload) {
        return null;
      }

      return await this.decrypt(payload, userId, passphrase);
    } catch (err) {
      console.warn("[KeyVault] Could not decrypt cloud keys:", err);
      return null;
    }
  }

  /**
   * Clears cloud-stored encrypted keys for the user.
   */
  static async clearCloudSync(userId: string): Promise<boolean> {
    try {
      await (supabase.from("knowledge_settings") as any).upsert({
        user_id: userId,
        sync_keys_to_cloud: false,
        synced_ai_keys_encrypted: null,
        encrypted_api_keys: null,
        updated_at: new Date().toISOString(),
      });
      return true;
    } catch {
      return false;
    }
  }
}
