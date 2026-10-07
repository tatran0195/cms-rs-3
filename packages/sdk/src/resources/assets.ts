import type { HttpClient } from '../http';
import type {
  ProjectId,
  AssetResponse,
  PresignAssetResponse,
  ConfirmAssetResponse,
} from '../types';

export class AssetsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Request presigned URL for direct asset upload
   */
  async presign(
    projectId: ProjectId,
    payload: { filename: string; mimeType: string; sizeBytes: number }
  ): Promise<PresignAssetResponse> {
    return this.http.post<PresignAssetResponse>(`/api/app/projects/${projectId}/assets/presign`, payload);
  }

  /**
   * Confirm an uploaded asset
   */
  async confirm(
    projectId: ProjectId,
    payload: ConfirmAssetResponse
  ): Promise<AssetResponse> {
    return this.http.post<AssetResponse>(`/api/app/projects/${projectId}/assets/confirm`, payload);
  }
}
