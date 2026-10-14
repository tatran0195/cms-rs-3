export interface ReaderAccessData {
  accessMode: 'PUBLIC' | 'WORKSPACE' | 'READERS';
  readers: Array<{
    id: string;
    email: string | null;
    name: string | null;
    status: string;
    audiences: Array<{ audience: { id: string; name: string } }>;
    _count: { sessions: number };
  }>;
  audiences: Array<{
    id: string;
    name: string;
    grants: Array<{ pageId: string | null }>;
    _count: { readers: number };
  }>;
  jwt: {
    enabled: boolean;
    issuer: string;
    audience: string;
    jwksUrl: string | null;
    publicJwks: unknown;
    groupsClaim: string;
    claimMapping: unknown;
    sessionTtlMinutes: number;
    maxTokenAgeSeconds: number;
    clockToleranceSecs: number;
  } | null;
  audit: Array<{ id: string; action: string; createdAt: string }>;
}

import {
  useReaderAccess as useSdkReaderAccess,
  useUpdateReaderAccessMode,
  useCreateReaderAudience,
  useDeleteReaderAudience,
  useInviteReader,
  useRevokeReader,
  useUpdateReaderJwt,
  useTestReaderJwt,
  useEmergencyRevokeReaderAccess,
} from '@cms/sdk/react';

export const useReaderAccess = (projectId: string | undefined) =>
  useSdkReaderAccess<ReaderAccessData>(projectId);

export {
  useUpdateReaderAccessMode,
  useCreateReaderAudience,
  useDeleteReaderAudience,
  useInviteReader,
  useRevokeReader,
  useUpdateReaderJwt,
  useTestReaderJwt,
  useEmergencyRevokeReaderAccess,
};

