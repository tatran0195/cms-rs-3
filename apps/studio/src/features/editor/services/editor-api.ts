import {
  usePages as useSdkPages,
  usePage as useSdkPage,
  useBranches as useSdkBranches,
  useLanguages as useSdkLanguages,
  useComments as useSdkComments,
  useCreatePage,
  useUpdatePage,
  useDeletePage,
  useReorderPages,
  useCreateBranch,
  useMergeBranch,
  useCreateLanguage,
  useUpdateLanguage,
  useDeleteLanguage,
  useCreateComment,
  useResolveComment,
  useDeleteComment,
} from '@cms/sdk/react';
import type { Branch, Comment, Language, Page, PageNode } from '../../../shared/hooks/api/types';

export const usePages = (projectId: string | undefined, languageId?: string, branchId?: string) =>
  useSdkPages<PageNode>(projectId, languageId, branchId);

export const usePage = (projectId: string | undefined, pageId: string | undefined) =>
  useSdkPage<Page>(projectId, pageId);

export const useBranches = (projectId: string | undefined) =>
  useSdkBranches<Branch>(projectId);

export const useLanguages = (projectId: string | undefined) =>
  useSdkLanguages<Language>(projectId);

export const useComments = (projectId: string | undefined, pageId?: string) =>
  useSdkComments<Comment>(projectId, pageId);

export {
  useCreatePage,
  useUpdatePage,
  useDeletePage,
  useReorderPages,
  useCreateBranch,
  useMergeBranch,
  useCreateLanguage,
  useUpdateLanguage,
  useDeleteLanguage,
  useCreateComment,
  useResolveComment,
  useDeleteComment,
};
