import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCmsClient } from '../context';
import { queryKeys } from '../query-keys';

/**
 * Upload an asset using the unified 3-step workflow (presign -> PUT bytes -> confirm).
 */
export const useUploadAsset = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const result = await client.assets.upload(projectId, file);
      return result as unknown as T;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all(projectId) }),
  });
};
