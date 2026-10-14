import type { CmsClient } from './client';
import type { CreatePageRequest, UpdatePageRequest } from './types';
import type { AssetUploadOptions } from './resources/assets';

export class ScopedPagesResource {
  constructor(private readonly client: CmsClient, private readonly projectId: string) {}

  list(params?: { languageId?: string; branchId?: string }) {
    return this.client.pages.list(this.projectId, params);
  }
  get(pageId: string) {
    return this.client.pages.get(this.projectId, pageId);
  }
  create(payload: CreatePageRequest | Record<string, unknown>) {
    return this.client.pages.create(this.projectId, payload);
  }
  update(pageId: string, payload: UpdatePageRequest | Record<string, unknown>) {
    return this.client.pages.update(this.projectId, pageId, payload);
  }
  delete(pageId: string) {
    return this.client.pages.delete(this.projectId, pageId);
  }
  reorder(payload: { items: Array<{ id: string; parentId: string | null; position: number }> }) {
    return this.client.pages.reorder(this.projectId, payload);
  }
}

export class ScopedDeploymentsResource {
  constructor(private readonly client: CmsClient, private readonly projectId: string) {}

  list() {
    return this.client.deployments.list(this.projectId);
  }
  getChanges() {
    return this.client.deployments.getChanges(this.projectId);
  }
  publish(message?: string) {
    return this.client.deployments.trigger(this.projectId, { message });
  }
  publishAnyway(message?: string) {
    return this.client.deployments.forcePublish(this.projectId, { message });
  }
  rollback(deploymentId: string) {
    return this.client.deployments.rollback(this.projectId, deploymentId);
  }
}

export class ScopedAssetsResource {
  constructor(private readonly client: CmsClient, private readonly projectId: string) {}

  upload(
    file: File | Blob | { name?: string; size: number; arrayBuffer(): Promise<ArrayBuffer>; type?: string },
    options?: AssetUploadOptions
  ) {
    return this.client.assets.upload(this.projectId, file, options);
  }
}

export class ScopedGitResource {
  constructor(private readonly client: CmsClient, private readonly projectId: string) {}

  getStatus() {
    return this.client.git.getStatus(this.projectId);
  }
  getWebhookUrl(baseUrl?: string) {
    return this.client.git.getWebhookUrl(this.projectId, baseUrl);
  }
}

export class ScopedProjectContext {
  readonly pages: ScopedPagesResource;
  readonly deployments: ScopedDeploymentsResource;
  readonly assets: ScopedAssetsResource;
  readonly git: ScopedGitResource;

  constructor(readonly client: CmsClient, readonly id: string) {
    this.pages = new ScopedPagesResource(client, id);
    this.deployments = new ScopedDeploymentsResource(client, id);
    this.assets = new ScopedAssetsResource(client, id);
    this.git = new ScopedGitResource(client, id);
  }

  get() {
    return this.client.projects.get(this.id);
  }
  update(payload: Record<string, unknown>) {
    return this.client.projects.update(this.id, payload);
  }
  delete() {
    return this.client.projects.delete(this.id);
  }
  getMembers() {
    return this.client.projects.getMembers(this.id);
  }
  getSettings() {
    return this.client.projects.getSettings(this.id);
  }
  getUsage() {
    return this.client.projects.getUsage(this.id);
  }
  getAnalytics(range?: string, timezone?: string) {
    return this.client.projects.getAnalytics(this.id, { range, timezone });
  }
}
