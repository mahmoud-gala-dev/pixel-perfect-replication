/**
 * KNOWLEDGE BRAIN — PHASE 12: SAMPLE CONNECTORS (GitHub & Web/Docs)
 */

import { BaseConnector } from "./base-connector";
import type { ExternalResource } from "./types";

export class MockGitHubConnector extends BaseConnector {
  constructor(id = "conn-github-1", name = "GitHub Documentation") {
    super(id, "github", name);
  }

  public async authenticate(): Promise<boolean> {
    return true;
  }

  public async listResources(): Promise<{ resources: ExternalResource[]; next_cursor?: string }> {
    return {
      resources: [
        {
          id: "gh-res-1",
          external_id: "laravel/framework/README.md",
          title: "Laravel Framework Core Documentation",
          url: "https://github.com/laravel/framework/blob/11.x/README.md",
          raw_content:
            "Laravel is a web application framework with expressive, elegant syntax. Queues allow you to defer the processing of a time-consuming task, such as sending an email, until a later time.",
          content_hash: "hash-laravel-readme-v11",
          last_modified: new Date().toISOString(),
        },
      ],
    };
  }

  public async fetchResource(resourceId: string): Promise<ExternalResource> {
    return {
      id: resourceId,
      external_id: "laravel/framework/README.md",
      title: "Laravel Framework Core Documentation",
      url: "https://github.com/laravel/framework/blob/11.x/README.md",
      raw_content: "Laravel documentation content.",
      content_hash: "hash-laravel-readme-v11",
      last_modified: new Date().toISOString(),
    };
  }
}

export class MockWebConnector extends BaseConnector {
  constructor(id = "conn-web-1", name = "Official Docs Crawler") {
    super(id, "web", name);
  }

  public async authenticate(): Promise<boolean> {
    return true;
  }

  public async listResources(): Promise<{ resources: ExternalResource[]; next_cursor?: string }> {
    return {
      resources: [
        {
          id: "web-res-1",
          external_id: "https://laravel.com/docs/11.x/queues",
          title: "Laravel 11.x Queues Official Guide",
          url: "https://laravel.com/docs/11.x/queues",
          raw_content:
            "The Redis queue driver provides a powerful, high-throughput driver for background jobs in Laravel 11 applications.",
          content_hash: "hash-laravel-queues-v11",
          last_modified: new Date().toISOString(),
        },
      ],
    };
  }

  public async fetchResource(resourceId: string): Promise<ExternalResource> {
    return {
      id: resourceId,
      external_id: "https://laravel.com/docs/11.x/queues",
      title: "Laravel 11.x Queues Official Guide",
      url: "https://laravel.com/docs/11.x/queues",
      raw_content: "The Redis queue driver provides a powerful driver.",
      content_hash: "hash-laravel-queues-v11",
      last_modified: new Date().toISOString(),
    };
  }
}
