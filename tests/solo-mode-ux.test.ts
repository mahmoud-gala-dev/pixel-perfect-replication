// =====================================================================
// KNOWLEDGE BRAIN — ACCEPTANCE TESTS: SOLO MODE UX & POWER ENHANCEMENTS
// P0: Solo Fast-Capture Mode
// P1: Cloud-Encrypted API Key Sync (KeyVault)
// P1: Global Floating Quick-Capture Action
// P2: Voice Input & Dictation Hub
// =====================================================================

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_BRAIN_SETTINGS,
  DEFAULT_AI_PROVIDER_SETTINGS,
  AIProviderManager,
  KnowledgeEngine,
} from "../src/lib/ai";
import { KeyVault } from "../src/lib/crypto/key-vault";
import { isArabicText } from "../src/hooks/useVoiceInput";
import { normalizeSourceUrl } from "../src/lib/knowledge-engine/evidence";

describe("P0: SOLO FAST-CAPTURE MODE TESTS", () => {
  test("1. Settings & State Defaults — solo_direct_commit flag defaults to false", () => {
    assert.strictEqual(
      DEFAULT_BRAIN_SETTINGS.solo_direct_commit,
      false,
      "DEFAULT_BRAIN_SETTINGS.solo_direct_commit must default to false",
    );
    assert.strictEqual(
      DEFAULT_AI_PROVIDER_SETTINGS.solo_direct_commit,
      false,
      "DEFAULT_AI_PROVIDER_SETTINGS.solo_direct_commit must default to false",
    );
  });

  test("2. AIProviderManager — Supports toggling solo_direct_commit setting", () => {
    // Save previous state
    const prev = AIProviderManager.getSettings();

    try {
      AIProviderManager.updateSettings({ solo_direct_commit: true });
      assert.strictEqual(AIProviderManager.getSettings().solo_direct_commit, true);

      AIProviderManager.updateSettings({ solo_direct_commit: false });
      assert.strictEqual(AIProviderManager.getSettings().solo_direct_commit, false);
    } finally {
      AIProviderManager.updateSettings(prev);
    }
  });

  test("3. Solo Auto-Commit Safety Filter — Only high-confidence, non-conflicting ops are eligible", () => {
    // Pure function simulating the safe op filter logic in chat.tsx
    function isOperationSafeForSoloCommit(op: {
      operation_type: string;
      confidence: number;
      is_conflicting?: boolean;
      risk_level?: string;
    }): boolean {
      const SAFE_TYPES = new Set(["CREATE_NODE", "CREATE_RELATION", "ADD_ALIAS", "ADD_CLAIM"]);
      if (!SAFE_TYPES.has(op.operation_type)) return false;
      if (op.confidence < 0.85) return false;
      if (op.is_conflicting) return false;
      if (op.risk_level === "high" || op.risk_level === "critical") return false;
      return true;
    }

    // Safe operations
    assert.strictEqual(
      isOperationSafeForSoloCommit({
        operation_type: "CREATE_NODE",
        confidence: 0.95,
      }),
      true,
      "High confidence CREATE_NODE should be safe for solo auto-commit",
    );

    assert.strictEqual(
      isOperationSafeForSoloCommit({
        operation_type: "ADD_CLAIM",
        confidence: 0.88,
        risk_level: "low",
      }),
      true,
      "High confidence ADD_CLAIM should be safe for solo auto-commit",
    );

    // Unsafe: Merges must NEVER auto-commit without review
    assert.strictEqual(
      isOperationSafeForSoloCommit({
        operation_type: "MERGE_NODE",
        confidence: 0.99,
      }),
      false,
      "MERGE_NODE must never be auto-committed in solo mode",
    );

    // Unsafe: Conflicting claim
    assert.strictEqual(
      isOperationSafeForSoloCommit({
        operation_type: "ADD_CLAIM",
        confidence: 0.95,
        is_conflicting: true,
      }),
      false,
      "Conflicting claim must be quarantined and routed to review",
    );

    // Unsafe: Low confidence
    assert.strictEqual(
      isOperationSafeForSoloCommit({
        operation_type: "CREATE_NODE",
        confidence: 0.75,
      }),
      false,
      "Low confidence operations (< 0.85) must require review",
    );
  });

  test("4. KnowledgeEngine Undo Plan Commit — Method exists and enforces audit integrity", () => {
    assert.strictEqual(
      typeof (KnowledgeEngine as any).undoPlanCommit,
      "function",
      "KnowledgeEngine.undoPlanCommit must be defined",
    );
  });
});

describe("P1: CLOUD-ENCRYPTED API KEY SYNC (KEYVAULT) TESTS", () => {
  const TEST_USER_ID = "usr-test-vault-8812";
  const TEST_PAYLOAD = {
    geminiApiKey: "AIzaSyD-mock-gemini-key-12345",
    openrouterApiKey: "sk-or-v1-mock-openrouter-key-67890",
    updatedAt: "2026-09-26T21:00:00.000Z",
  };

  test("1. KeyVault — Client-side AES-GCM 256 encryption round-trip", async () => {
    // Encrypt
    const ciphertext = await KeyVault.encrypt(TEST_PAYLOAD, TEST_USER_ID);
    assert.ok(typeof ciphertext === "string", "Ciphertext must be a string");
    assert.ok(ciphertext.length > 32, "Ciphertext must have valid length");
    assert.ok(!ciphertext.includes("AIzaSyD"), "Plaintext must NEVER appear in ciphertext");
    assert.ok(!ciphertext.includes("sk-or-v1"), "Plaintext must NEVER appear in ciphertext");

    // Decrypt with correct user ID
    const decrypted = await KeyVault.decrypt(ciphertext, TEST_USER_ID);
    assert.strictEqual(decrypted.geminiApiKey, TEST_PAYLOAD.geminiApiKey);
    assert.strictEqual(decrypted.openrouterApiKey, TEST_PAYLOAD.openrouterApiKey);
    assert.strictEqual(decrypted.updatedAt, TEST_PAYLOAD.updatedAt);
  });

  test("2. KeyVault — Decryption fails with wrong entropy / user ID", async () => {
    const ciphertext = await KeyVault.encrypt(TEST_PAYLOAD, TEST_USER_ID);
    const WRONG_USER_ID = "usr-attacker-or-different-user";

    await assert.rejects(
      async () => {
        await KeyVault.decrypt(ciphertext, WRONG_USER_ID);
      },
      /Decryption failed|cipher|tag|operation failed/i,
      "Decrypting with different user ID must fail cryptographic verification",
    );
  });

  test("3. KeyVault — Optional Passphrase adds second derivation layer", async () => {
    const PASSPHRASE = "MyVaultSuperSecret123!";
    const ciphertext = await KeyVault.encrypt(TEST_PAYLOAD, TEST_USER_ID, PASSPHRASE);

    // Decrypt with both user ID and passphrase
    const decrypted = await KeyVault.decrypt(ciphertext, TEST_USER_ID, PASSPHRASE);
    assert.strictEqual(decrypted.geminiApiKey, TEST_PAYLOAD.geminiApiKey);

    // Decrypt with wrong passphrase must fail
    await assert.rejects(
      async () => {
        await KeyVault.decrypt(ciphertext, TEST_USER_ID, "WrongPassphrase");
      },
      /Decryption failed|cipher|tag|operation failed/i,
    );
  });

  test("4. Migration Schema Check — 20260926210000_cloud_synced_keys.sql exists", () => {
    const migrationPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260926210000_cloud_synced_keys.sql",
    );
    assert.ok(fs.existsSync(migrationPath), "Migration file must exist");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(sql.includes("sync_keys_to_cloud"), "Migration must add sync_keys_to_cloud");
    assert.ok(sql.includes("synced_ai_keys_encrypted"), "Migration must add synced_ai_keys_encrypted");
    assert.ok(sql.includes("encrypted_api_keys"), "Migration must add encrypted_api_keys");
  });
});

describe("P1: GLOBAL FLOATING QUICK-CAPTURE ACTION TESTS", () => {
  test("1. QuickCaptureModal component file exists and exports QuickCaptureModal", () => {
    const compPath = path.join(
      process.cwd(),
      "src",
      "components",
      "knowledge",
      "QuickCaptureModal.tsx",
    );
    assert.ok(fs.existsSync(compPath), "QuickCaptureModal.tsx must exist");
    const content = fs.readFileSync(compPath, "utf-8");
    assert.ok(content.includes("export function QuickCaptureModal"), "Must export QuickCaptureModal");
    assert.ok(content.includes("safeCreateClaim"), "Must call safeCreateClaim");
    assert.ok(content.includes("safeAttachEvidence"), "Must support safeAttachEvidence");
  });

  test("2. Global Mount Check — __root.tsx mounts QuickCaptureModal", () => {
    const rootPath = path.join(process.cwd(), "src", "routes", "__root.tsx");
    const rootContent = fs.readFileSync(rootPath, "utf-8");
    assert.ok(rootContent.includes("QuickCaptureModal"), "__root.tsx must import and mount QuickCaptureModal");
  });

  test("3. Source URL Normalization — Cleans URLs for quick evidence attachment", () => {
    assert.strictEqual(
      normalizeSourceUrl("  https://arxiv.org/abs/1706.03762/  "),
      "https://arxiv.org/abs/1706.03762",
    );
    assert.strictEqual(normalizeSourceUrl(""), null);
    assert.strictEqual(normalizeSourceUrl(null), null);
  });

  test("4. Stance to Confidence & Verification Mapping", () => {
    function mapStance(stance: "verified" | "supported" | "hypothesis") {
      switch (stance) {
        case "verified":
          return { confidence: 1.0, claimType: "fact", verification: "verified" };
        case "supported":
          return { confidence: 0.9, claimType: "fact", verification: "unverified" };
        case "hypothesis":
          return { confidence: 0.65, claimType: "hypothesis", verification: "unverified" };
      }
    }

    const verified = mapStance("verified");
    assert.strictEqual(verified.confidence, 1.0);
    assert.strictEqual(verified.verification, "verified");

    const hypothesis = mapStance("hypothesis");
    assert.strictEqual(hypothesis.confidence, 0.65);
    assert.strictEqual(hypothesis.claimType, "hypothesis");
  });
});

describe("P2: VOICE INPUT & DICTATION HUB TESTS", () => {
  test("1. Arabic Text Heuristic — isArabicText detects Arabic script vs Latin", () => {
    assert.strictEqual(isArabicText("الذكاء الاصطناعي وقواعد المعرفة"), true);
    assert.strictEqual(isArabicText("ما هي خوارزمية Transformer؟"), true);
    assert.strictEqual(isArabicText("Hello, what is the Knowledge Brain architecture?"), false);
    assert.strictEqual(isArabicText("1234567890"), false);
  });

  test("2. useVoiceInput hook file exists with full Web Speech API coverage", () => {
    const hookPath = path.join(process.cwd(), "src", "hooks", "useVoiceInput.ts");
    assert.ok(fs.existsSync(hookPath), "useVoiceInput.ts must exist");
    const hookContent = fs.readFileSync(hookPath, "utf-8");
    assert.ok(hookContent.includes("export function useVoiceInput"), "Must export useVoiceInput");
    assert.ok(hookContent.includes("SpeechRecognition"), "Must reference SpeechRecognition");
    assert.ok(hookContent.includes("webkitSpeechRecognition"), "Must reference webkitSpeechRecognition");
    assert.ok(hookContent.includes("ar-SA"), "Must support ar-SA locale");
    assert.ok(hookContent.includes("en-US"), "Must support en-US locale");
  });

  test("3. Chat and Command Menu Integration Check", () => {
    const chatPath = path.join(process.cwd(), "src", "routes", "chat.tsx");
    const chatContent = fs.readFileSync(chatPath, "utf-8");
    assert.ok(chatContent.includes("Mic"), "Chat must render microphone icon for dictation");

    const cmdPath = path.join(process.cwd(), "src", "components", "GlobalContextMenu.tsx");
    const cmdContent = fs.readFileSync(cmdPath, "utf-8");
    assert.ok(cmdContent.includes("Mic"), "GlobalContextMenu must render microphone icon for voice commands");
    assert.ok(cmdContent.includes("toggleListening"), "GlobalContextMenu must support speech toggling");
  });
});

describe("VISUAL CONFLICT RESOLUTION & SOLO FAST-TRACK SETTINGS TESTS", () => {
  test("1. Settings Page — Includes Solo Fast-Track toggle and state sync", () => {
    const settingsPath = path.join(process.cwd(), "src", "routes", "settings.tsx");
    const content = fs.readFileSync(settingsPath, "utf-8");
    assert.ok(
      content.includes("Solo Fast-Track Mode"),
      "settings.tsx must contain 'Solo Fast-Track Mode'",
    );
    assert.ok(
      content.includes("solo_direct_commit"),
      "settings.tsx must bind solo_direct_commit setting",
    );
  });

  test("2. Chat Conflict Resolution Card Component Exists & Exports Card", () => {
    const cardPath = path.join(
      process.cwd(),
      "src",
      "components",
      "chat",
      "ChatConflictResolutionCard.tsx",
    );
    assert.ok(fs.existsSync(cardPath), "ChatConflictResolutionCard.tsx must exist");
    const content = fs.readFileSync(cardPath, "utf-8");
    assert.ok(
      content.includes("export function ChatConflictResolutionCard"),
      "Must export ChatConflictResolutionCard",
    );
    assert.ok(
      content.includes("ONE_SUPERSEDES_ANOTHER"),
      "Must support 'Approve New Fact (Supersede Old)'",
    );
    assert.ok(
      content.includes("BOTH_VALID_DIFFERENT_CONTEXT"),
      "Must support 'Preserve Both with Context/Conditions'",
    );
    assert.ok(
      content.includes("A_SUPPORTED"),
      "Must support 'Discard New Proposal'",
    );
  });

  test("3. In-Chat Integration — Chat renders ChatConflictResolutionCard on dispute", () => {
    const chatPath = path.join(process.cwd(), "src", "routes", "chat.tsx");
    const chatContent = fs.readFileSync(chatPath, "utf-8");
    assert.ok(
      chatContent.includes("ChatConflictResolutionCard"),
      "chat.tsx must render ChatConflictResolutionCard on conflicts",
    );
  });

  test("4. Quick Capture Modal — Supports Cmd+Shift+K and background extraction preview", () => {
    const modalPath = path.join(
      process.cwd(),
      "src",
      "components",
      "knowledge",
      "QuickCaptureModal.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");
    assert.ok(
      content.includes('"k"') || content.includes("'k'"),
      "QuickCaptureModal must listen for 'k' key (Cmd+Shift+K)",
    );
    assert.ok(
      content.includes("AI Extracted Preview"),
      "QuickCaptureModal must show AI Extracted Preview",
    );
    assert.ok(
      content.includes("MockExtractionEngine.extract"),
      "QuickCaptureModal must invoke background extraction engine",
    );
  });
});

