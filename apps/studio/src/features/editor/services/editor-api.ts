import type {
  CreateBranchBody,
  CreateCommentBody,
  CreateLanguageBody,
  CreatePageBody,
  ReorderPagesBody,
  UpdateLanguageBody,
  UpdatePageBody,
} from '@cms/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/hooks/api/query-keys';
import type { Branch, Comment, Language, Page, PageNode } from '../../../shared/hooks/api/types';
import { cmsClient } from '../../../shared/services/cms-client';

export const usePages = (projectId: string | undefined, languageId?: string, branchId?: string) =>
  useQuery({
    queryKey: queryKeys.pages.all(projectId ?? '', languageId, branchId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await cmsClient.pages.list(projectId, {
        ...(languageId ? { languageId } : {}),
        ...(branchId ? { branchId } : {}),
      })) as unknown as PageNode[];
    },
  });

export const usePage = (projectId: string | undefined, pageId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.pages.detail(projectId ?? '', pageId ?? ''),
    enabled: Boolean(projectId && pageId),
    queryFn: async () => {
      if (!projectId || !pageId) throw new Error('projectId and pageId are required');
      return (await cmsClient.pages.get(projectId, pageId)) as unknown as Page;
    },
  });

export const useBranches = (projectId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.branches.all(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await cmsClient.branches.list(projectId)) as unknown as Branch[];
    },
  });

export const useLanguages = (projectId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.languages.all(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await cmsClient.languages.list(projectId)) as unknown as Language[];
    },
  });

export const useComments = (projectId: string | undefined, pageId?: string) =>
  useQuery({
    queryKey: queryKeys.comments.all(projectId ?? '', pageId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await cmsClient.comments.list(projectId, pageId ? { pageId } : undefined)) as unknown as Comment[];
    },
  });

export const useCreatePage = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreatePageBody) => (await cmsClient.pages.create(projectId, body)) as unknown as Page,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) }),
  });
};

export const useUpdatePage = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pageId, body }: { pageId: string; body: UpdatePageBody }) =>
      (await cmsClient.pages.update(projectId, pageId, body)) as unknown as Page,
    onSuccess: (_data, { pageId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.pages.detail(projectId, pageId) });
    },
  });
};

export const useDeletePage = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pageId: string) => cmsClient.pages.delete(projectId, pageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) }),
  });
};

export const useReorderPages = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ReorderPagesBody) => cmsClient.pages.reorder(projectId, body),
    onMutate: async (newOrder) => {
      await qc.cancelQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
      const previousPages = qc.getQueriesData<PageNode[]>({
        queryKey: queryKeys.pages.allForProject(projectId),
      });

      const orderMap = new Map(newOrder.items.map((it) => [it.id, it]));
      qc.setQueriesData<PageNode[]>({ queryKey: queryKeys.pages.allForProject(projectId) }, (old) => {
        if (!old) return old;
        return old.map((page) => {
          const update = orderMap.get(page.id);
          if (!update) return page;
          return {
            ...page,
            parentId: update.parentId,
            position: update.position,
          };
        });
      });

      return { previousPages };
    },
    onError: (_err, _newOrder, context) => {
      if (context?.previousPages) {
        for (const [queryKey, data] of context.previousPages) {
          qc.setQueryData(queryKey, data);
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
    },
  });
};

export const useCreateBranch = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateBranchBody) => cmsClient.branches.create(projectId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.branches.all(projectId) }),
  });
};

export const useMergeBranch = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => cmsClient.branches.merge(projectId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.branches.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
    },
  });
};

export const useCreateLanguage = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateLanguageBody) => (await cmsClient.languages.create(projectId, body)) as unknown as Language,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.languages.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
    },
  });
};

export const useUpdateLanguage = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateLanguageBody }) =>
      (await cmsClient.languages.update(projectId, id, body)) as unknown as Language,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.languages.all(projectId) }),
  });
};

export const useDeleteLanguage = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => cmsClient.languages.delete(projectId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.languages.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};

export const useCreateComment = (projectId: string, pageId?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateCommentBody) =>
      (await cmsClient.comments.create(projectId, {
        page_id: pageId ?? null,
        ...body,
      })) as unknown as Comment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', projectId] }),
  });
};

export const useResolveComment = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) =>
      (await cmsClient.comments.update(projectId, id, { resolved })) as unknown as Comment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', projectId] }),
  });
};

export const useDeleteComment = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => cmsClient.comments.delete(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', projectId] }),
  });
};
