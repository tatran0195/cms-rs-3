import type { HttpClient } from '../http';
import type { AssetResponse, ProjectId } from '../types';

export interface PresignResult {
  uploadUrl: string;
  assetUrl?: string;
  publicUrl?: string;
  key: string;
  assetId?: string;
}

export class AssetsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Request presigned URL for direct asset upload
   */
  async presign(
    projectId: ProjectId,
    payload: { filename: string; mimeType?: string; contentType?: string; sizeBytes?: number; size?: number },
  ): Promise<PresignResult> {
    const res = await this.http.post<Record<string, unknown>>(`/api/app/projects/${projectId}/assets/presign`, {
      filename: payload.filename,
      contentType: payload.contentType ?? payload.mimeType,
      mimeType: payload.mimeType ?? payload.contentType,
      sizeBytes: payload.sizeBytes ?? payload.size,
      size: payload.size ?? payload.sizeBytes,
    });

    const uploadUrl = String(res.uploadUrl || res.upload_url || '');
    const key = String(res.key || res.assetId || '');
    const assetId = String(res.assetId || res.asset_id || key);
    const assetUrl = String(res.assetUrl || res.asset_url || res.publicUrl || res.public_url || '');
    const publicUrl = String(res.publicUrl || res.public_url || assetUrl);

    return {
      uploadUrl,
      key,
      assetId,
      assetUrl,
      publicUrl,
    };
  }

  /**
   * Confirm an uploaded asset
   */
  async confirm<T = AssetResponse>(
    projectId: ProjectId,
    payload: { key?: string; assetId?: string; contentType?: string; size?: number } & Record<string, unknown>,
  ): Promise<T> {
    const body = {
      key: payload.key ?? payload.assetId,
      ...payload,
    };
    return this.http.post<T>(`/api/app/projects/${projectId}/assets/confirm`, body);
  }
}
