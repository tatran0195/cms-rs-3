import { CmsApiError } from '@cms/sdk';

export { CmsApiError };

/**
 * Backward-compatible error representation mapping to canonical CmsApiError
 */
export class ApiResponseError extends CmsApiError {
  constructor(message: string, status: number, code?: string) {
    super({
      status,
      code: code ?? `HTTP_${status}`,
      message,
    });
    this.name = 'ApiResponseError';
  }
}
