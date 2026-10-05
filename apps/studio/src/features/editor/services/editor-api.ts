import type {
  AiDraftBody,
  CreateBranchBody,
  CreateCommentBody,
  CreateLanguageBody,
  CreatePageBody,
  ReorderPagesBody,
  UpdateLanguageBody,
  UpdatePageBody,
} from '@cms/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../shared/services/api';
import { getData, mutateData } from '../../../shared/hooks/api/client-helpers';
import { queryKeys } from '../../../shared/hooks/api/query-keys';
import type { Branch, Comment, Language, Page, PageNode } from '../../../shared/hooks/api/types';

export const usePages = (projectId: string | undefined, languageId?: string, branchId?: string) =>
  useQuery({
    queryKey: queryKeys.pages.all(projectId ?? '', languageId, branchId),
    enabled: Boolean(projectId),
    queryFn: async () =>
      getData<PageNode[]>(
        await api.app.projects[':projectId'].pages.$get({
          param: { projectId: projectId! },
          query: {
            ...(languageId ? { languageId } : {}),
            ...(branchId ? { branchId } : {}),
          },
        }),
        'pages',
      ),
  });

export const usePage = (projectId: string | undefined, pageId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.pages.detail(projectId ?? '', pageId ?? ''),
    enabled: Boolean(projectId && pageId),
    queryFn: async () =>
      getData<Page>(
        await api.app.projects[':projectId'].pages[':id'].$get({
          param: { projectId: projectId!, id: pageId! },
        }),
        'page',
      ),
  });

export const useBranches = (projectId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.branches.all(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () =>
      getData<Branch[]>(
        await api.app.projects[':projectId'].branches.$get({
          param: { projectId: projectId! },
        }),
        'branches',
      ),
  });

export const useLanguages = (projectId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.languages.all(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () =>
      getData<Language[]>(
        await api.app.projects[':projectId'].languages.$get({
          param: { projectId: projectId! },
        }),
        'languages',
      ),
  });

export const useComments = (projectId: string | undefined, pageId?: string) =>
  useQuery({
    queryKey: queryKeys.comments.all(projectId ?? '', pageId),
    enabled: Boolean(projectId),
    queryFn: async () =>
      getData<Comment[]>(
        await api.app.projects[':projectId'].comments.$get({
          param: { projectId: projectId! },
          query: pageId ? { pageId } : {},
        }),
        'comments',
      ),
  });

export const useCreatePage = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreatePageBody) =>
      mutateData<Page>(await api.app.projects[':projectId'].pages.$post({ param: { projectId }, json: body }), 'Could not create the page.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) }),
  });
};

export const useUpdatePage = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pageId, body }: { pageId: string; body: UpdatePageBody }) =>
      mutateData<Page>(
        await api.app.projects[':projectId'].pages[':id'].$patch({ param: { projectId, id: pageId }, json: body }),
        'Could not save the page.',
      ),
    onSuccess: (_data, { pageId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.pages.detail(projectId, pageId) });
    },
  });
};

export const useDeletePage = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pageId: string) =>
      mutateData(await api.app.projects[':projectId'].pages[':id'].$delete({ param: { projectId, id: pageId } }), 'Could not delete the page.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) }),
  });
};

export const useReorderPages = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ReorderPagesBody) =>
      mutateData(await api.app.projects[':projectId'].pages.reorder.$post({ param: { projectId }, json: body }), 'Could not reorder pages.'),
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
    mutationFn: async (body: CreateBranchBody) =>
      mutateData(await api.app.projects[':projectId'].branches.$post({ param: { projectId }, json: body }), 'Could not create the branch.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.branches.all(projectId) }),
  });
};

export const useMergeBranch = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      mutateData(await api.app.projects[':projectId'].branches[':id'].merge.$post({ param: { projectId, id } }), 'Could not merge the branch.'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.branches.all(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.pages.allForProject(projectId) });
    },
  });
};

export const useCreateLanguage = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateLanguageBody) =>
      mutateData<Language>(await api.app.projects[':projectId'].languages.$post({ param: { projectId }, json: body }), 'Could not add the language.'),
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
      mutateData<Language>(
        await api.app.projects[':projectId'].languages[':id'].$patch({ param: { projectId, id }, json: body }),
        'Could not update the language.',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.languages.all(projectId) }),
  });
};

export const useDeleteLanguage = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      mutateData(await api.app.projects[':projectId'].languages[':id'].$delete({ param: { projectId, id } }), 'Could not delete the language.'),
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
      mutateData<Comment>(await api.app.projects[':projectId'].comments.$post({ param: { projectId }, json: body }), 'Could not post the comment.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', projectId] }),
  });
};

export const useResolveComment = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) =>
      mutateData<Comment>(
        await api.app.projects[':projectId'].comments[':id'].$patch({ param: { projectId, id }, json: { resolved } }),
        'Could not update the comment.',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', projectId] }),
  });
};

export const useDeleteComment = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      mutateData(await api.app.projects[':projectId'].comments[':id'].$delete({ param: { projectId, id } }), 'Could not delete the comment.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', projectId] }),
  });
};

export const useAiDraft = (projectId: string) =>
  useMutation({
    mutationFn: async (body: AiDraftBody) =>
      mutateData(await api.app.projects[':projectId'].ai.$post({ param: { projectId }, json: body }), 'Could not draft content.'),
  });
