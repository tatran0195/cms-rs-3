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

  /**
   * High-level complete asset upload workflow (presign -> binary PUT -> confirm)
   */
  async upload<T = AssetResponse>(
    projectId: ProjectId,
    file: File | Blob | { name?: string; size: number; arrayBuffer(): Promise<ArrayBuffer>; type?: string },
    options?: { mimeType?: string; onProgress?: (bytesUploaded: number, totalBytes: number) => void },
  ): Promise<T> {
    const filename = ('name' in file && typeof file.name === 'string') ? file.name : 'upload.bin';
    const sizeBytes = file.size;
    const mimeType = options?.mimeType || file.type || 'application/octet-stream';

    // 1. Presign
    const presign = await this.presign(projectId, {
      filename,
      mimeType,
      sizeBytes,
    });

    // 2. Binary PUT
    const customFetch = this.http.options.fetch || fetch;
    const uploadRes = await customFetch(presign.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
      },
      body: file as BodyInit,
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload failed with status ${uploadRes.status}`);
    }

    // 3. Confirm
    return this.confirm<T>(projectId, {
      assetId: presign.assetId,
      key: presign.key,
      size: sizeBytes,
      contentType: mimeType,
    });
  }
}
