// =====================================================================
// KNOWLEDGE BRAIN — OFFLINE-FIRST INDEXEDDB CHAT & KNOWLEDGE STORE
// Resilient local caching for conversations, messages & pending outbox
// =====================================================================

const DB_NAME = "KnowledgeBrainOfflineDB";
const DB_VERSION = 1;

export interface CachedConversation {
  id: string;
  title: string;
  updated_at: string;
  status: string;
}

export interface CachedMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface CachedNode {
  id: string;
  canonical_name: string;
  node_type: string;
  status: string;
  description?: string | null;
  updated_at?: string;
}

export interface QueuedOfflineMessage {
  id: string;
  conversation_id: string;
  message: string;
  options?: Record<string, unknown>;
  timestamp: number;
}

class OfflineChatStoreClass {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        reject(new Error("IndexedDB is not available in this environment"));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Conversations Store
        if (!db.objectStoreNames.contains("conversations")) {
          const convStore = db.createObjectStore("conversations", { keyPath: "id" });
          convStore.createIndex("updated_at", "updated_at", { unique: false });
        }

        // 2. Messages Store
        if (!db.objectStoreNames.contains("messages")) {
          const msgStore = db.createObjectStore("messages", { keyPath: "id" });
          msgStore.createIndex("conversation_id", "conversation_id", { unique: false });
          msgStore.createIndex("created_at", "created_at", { unique: false });
        }

        // 3. Knowledge Nodes Store
        if (!db.objectStoreNames.contains("knowledge_nodes")) {
          const nodeStore = db.createObjectStore("knowledge_nodes", { keyPath: "id" });
          nodeStore.createIndex("canonical_name", "canonical_name", { unique: false });
        }

        // 4. Offline Outbox Store
        if (!db.objectStoreNames.contains("offline_outbox")) {
          const outboxStore = db.createObjectStore("offline_outbox", { keyPath: "id" });
          outboxStore.createIndex("timestamp", "timestamp", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  /**
   * Caches active conversations locally (bounded to 20 most recent).
   */
  async cacheConversations(conversations: CachedConversation[]): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction("conversations", "readwrite");
      const store = tx.objectStore("conversations");

      // Save top 20 conversations
      const bounded = conversations.slice(0, 20);
      for (const conv of bounded) {
        store.put(conv);
      }

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn("[OfflineStore] Failed to cache conversations:", err);
    }
  }

  /**
   * Retrieves cached conversations from IndexedDB.
   */
  async getCachedConversations(): Promise<CachedConversation[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction("conversations", "readonly");
      const store = tx.objectStore("conversations");
      const request = store.getAll();

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const list = (request.result || []) as CachedConversation[];
          list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          resolve(list);
        };
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Caches messages for a specific conversation.
   */
  async cacheMessages(conversationId: string, messages: CachedMessage[]): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction("messages", "readwrite");
      const store = tx.objectStore("messages");

      for (const msg of messages) {
        store.put({ ...msg, conversation_id: conversationId });
      }

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn("[OfflineStore] Failed to cache messages:", err);
    }
  }

  /**
   * Retrieves cached messages for a conversation.
   */
  async getCachedMessages(conversationId: string): Promise<CachedMessage[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const index = store.index("conversation_id");
      const request = index.getAll(conversationId);

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const list = (request.result || []) as CachedMessage[];
          list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          resolve(list);
        };
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Caches loaded knowledge nodes.
   */
  async cacheKnowledgeNodes(nodes: CachedNode[]): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction("knowledge_nodes", "readwrite");
      const store = tx.objectStore("knowledge_nodes");

      for (const node of nodes) {
        store.put(node);
      }

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn("[OfflineStore] Failed to cache nodes:", err);
    }
  }

  /**
   * Retrieves cached knowledge nodes.
   */
  async getCachedKnowledgeNodes(): Promise<CachedNode[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction("knowledge_nodes", "readonly");
      const store = tx.objectStore("knowledge_nodes");
      const request = store.getAll();

      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Queues an offline chat message in the outbox.
   */
  async enqueueOfflineMessage(input: {
    conversationId: string;
    message: string;
    options?: Record<string, unknown>;
  }): Promise<QueuedOfflineMessage> {
    const item: QueuedOfflineMessage = {
      id: `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversation_id: input.conversationId,
      message: input.message,
      ...(input.options ? { options: input.options } : {}),
      timestamp: Date.now(),
    };

    const db = await this.getDB();
    const tx = db.transaction("offline_outbox", "readwrite");
    const store = tx.objectStore("offline_outbox");
    store.put(item);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(item);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Retrieves all pending offline outbox messages.
   */
  async getPendingOfflineMessages(): Promise<QueuedOfflineMessage[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction("offline_outbox", "readonly");
      const store = tx.objectStore("offline_outbox");
      const request = store.getAll();

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const list = (request.result || []) as QueuedOfflineMessage[];
          list.sort((a, b) => a.timestamp - b.timestamp);
          resolve(list);
        };
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Removes a processed message from the outbox.
   */
  async removePendingOfflineMessage(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction("offline_outbox", "readwrite");
      const store = tx.objectStore("offline_outbox");
      store.delete(id);

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn("[OfflineStore] Failed to remove message from outbox:", err);
    }
  }
}

export const OfflineChatStore = new OfflineChatStoreClass();
