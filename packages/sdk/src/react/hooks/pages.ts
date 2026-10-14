import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCmsClient } from '../context';
import { queryKeys } from '../query-keys';

export const usePages = <T = any>(projectId: string | undefined, languageId?: string, branchId?: string) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.pages.all(projectId ?? '', languageId, branchId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.pages.list(projectId, {
        ...(languageId ? { languageId } : {}),
        ...(branchId ? { branchId } : {}),
      })) as unknown as T[];
    },
  });
};

export const usePage = <T = any>(projectId: string | undefined, pageId: string | undefined) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.pages.detail(projectId ?? '', pageId ?? ''),
    enabled: Boolean(projectId && pageId),
    queryFn: async () => {
      if (!projectId || !pageId) throw new Error('projectId and pageId are required');
      return (await client.pages.get(projectId, pageId)) as unknown as T;
    },
  });
};

export const useBranches = <T = any>(projectId: string | undefined) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.branches.all(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.branches.list(projectId)) as unknown as T[];
    },
  });
};

export const useLanguages = <T = any>(projectId: string | undefined) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.languages.all(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.languages.list(projectId)) as unknown as T[];
    },
  });
};

export const useComments = <T = any>(projectId: string | undefined, pageId?: string) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.comments.all(projectId ?? '', pageId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.comments.list(projectId, pageId ? { pageId } : undefined)) as unknown as T[];
    },
  });
};

export const useCreatePage = <T = any, TBody = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TBody) => (await client.pages.create(projectId, body as any)) as unknown as T,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) }),
  });
};

export const useUpdatePage = <T = any, TBody = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pageId, body }: { pageId: string; body: TBody }) =>
      (await client.pages.update(projectId, pageId, body as any)) as unknown as T,
    onSuccess: (_data, { pageId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.pages.detail(projectId, pageId) });
    },
  });
};

export const useDeletePage = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pageId: string) => client.pages.delete(projectId, pageId),
    onSuccess: async (_data, pageId) => {
      qc.removeQueries({ queryKey: queryKeys.pages.detail(projectId, pageId), exact: true });
      await qc.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[0] === 'pages' && key[1] === projectId && key.length === 4;
        },
      });
    },
  });
};

export const useReorderPages = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { items: Array<{ id: string; parentId: string | null; position: number }> }) =>
      client.pages.reorder(projectId, body),
    onMutate: async (newOrder) => {
      await qc.cancelQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
      const previousPages = qc.getQueriesData<any[]>({
        queryKey: queryKeys.pages.allForProject(projectId),
      });

      const orderMap = new Map(newOrder.items.map((it) => [it.id, it]));
      qc.setQueriesData<any[]>({ queryKey: queryKeys.pages.allForProject(projectId) }, (old) => {
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
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: any) => client.branches.create(projectId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.branches.all(projectId) }),
  });
};

export const useMergeBranch = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => client.branches.merge(projectId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.branches.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
    },
  });
};

export const useCreateLanguage = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: any) => (await client.languages.create(projectId, body)) as unknown as T,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.languages.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
    },
  });
};

export const useUpdateLanguage = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) =>
      (await client.languages.update(projectId, id, body)) as unknown as T,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.languages.all(projectId) }),
  });
};

export const useDeleteLanguage = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => client.languages.delete(projectId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.languages.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    },
  });
};

export const useCreateComment = <T = any>(projectId: string, pageId?: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: any) =>
      (await client.comments.create(projectId, {
        page_id: pageId ?? null,
        ...body,
      })) as unknown as T,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', projectId] }),
  });
};

export const useResolveComment = <T = any>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) =>
      (await client.comments.update(projectId, id, { resolved })) as unknown as T,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', projectId] }),
  });
};

export const useDeleteComment = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => client.comments.delete(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', projectId] }),
  });
};
