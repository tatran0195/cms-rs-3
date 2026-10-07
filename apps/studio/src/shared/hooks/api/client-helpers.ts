interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: { errors?: Array<string | { path?: string; message?: string }> };
  };
}

const readApiError = async (res: Response, fallback: string) => {
  try {
    const body = (await res.json()) as ApiErrorBody;
    const message = body.error?.message ?? fallback;
    const issue = body.error?.details?.errors?.[0];
    const detailMessage = typeof issue === 'string' ? issue : issue?.message;
    const detailPath = typeof issue === 'string' ? undefined : issue?.path;
    if (detailMessage) {
      return {
        code: body.error?.code,
        message: `${message} ${detailPath && detailPath !== '$' ? `${detailPath}: ` : ''}${detailMessage}`,
      };
    }
    return { code: body.error?.code, message };
  } catch {
    return { code: undefined, message: fallback };
  }
};

import { CmsApiError } from '@cms/sdk';
export { CmsApiError };

/** Unwrap a `{ data }` envelope, throwing a readable error on failure. */
export class ApiResponseError extends CmsApiError {
  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super({
      status,
      code: code ?? `HTTP_${status}`,
      message,
    });
    this.name = 'ApiResponseError';
  }
}

type JsonData = ReturnType<typeof JSON.parse>;

export async function getData<TData = JsonData, TResponse extends Response = Response>(
  res: TResponse,
  what: string,
  fallback?: string,
): Promise<TData> {
  if (!res.ok) {
    const error = await readApiError(res, fallback ?? `Failed to load ${what}.`);
    throw new ApiResponseError(error.message, res.status, error.code);
  }
  return (await res.json()).data as TData;
}

/** Unwrap a `{ data }` envelope for a mutation, throwing a readable error. */
export async function mutateData<TData = JsonData, TResponse extends Response = Response>(res: TResponse, fallback: string): Promise<TData> {
  if (!res.ok) {
    const error = await readApiError(res, fallback);
    throw new ApiResponseError(error.message, res.status, error.code);
  }
  return (await res.json()).data as TData;
}
