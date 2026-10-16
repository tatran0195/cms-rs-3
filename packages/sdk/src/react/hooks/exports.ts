import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExportJob, ExportSchedule } from '../../resources/exports';
import { useCmsClient } from '../context';

export const exportQueryKeys = {
  all: ['exports'] as const,
  jobs: (params?: Record<string, unknown>) =>
    params !== undefined ? ([...exportQueryKeys.all, 'jobs', params] as const) : ([...exportQueryKeys.all, 'jobs'] as const),
  schedules: (projectId: string) => [...exportQueryKeys.all, 'schedules', projectId] as const,
};

export const useListExportJobs = <T = ExportJob>(
  params?: { limit?: number; offset?: number; snapshot_id?: string; project_id?: string },
  options?: { enabled?: boolean; refetchInterval?: number | false },
) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: exportQueryKeys.jobs(params as Record<string, unknown> | undefined),
    enabled: options?.enabled ?? true,
    queryFn: async () => (await client.exports.listJobs(params)) as unknown as T[],
    refetchInterval: options?.refetchInterval ?? false,
  });
};

export const useListExportSchedules = <T = ExportSchedule>(projectId: string | undefined, options?: { enabled?: boolean }) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: exportQueryKeys.schedules(projectId ?? ''),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required');
      return (await client.exports.listSchedules(projectId)) as unknown as T[];
    },
  });
};

export const useCreateExportSchedule = <T = ExportSchedule>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await client.exports.createSchedule(projectId, payload)) as unknown as T,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exportQueryKeys.schedules(projectId) });
    },
  });
};

export const useUpdateExportSchedule = <T = ExportSchedule>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ scheduleId, payload }: { scheduleId: string; payload: Record<string, unknown> }) =>
      (await client.exports.updateSchedule(scheduleId, payload)) as unknown as T,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exportQueryKeys.schedules(projectId) });
    },
  });
};

export const useDeleteExportSchedule = (projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (scheduleId: string) => client.exports.deleteSchedule(scheduleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exportQueryKeys.schedules(projectId) });
    },
  });
};

export const useRunExportSchedule = <T = ExportJob>(projectId: string) => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (scheduleId: string) => (await client.exports.runSchedule(projectId, scheduleId)) as unknown as T,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exportQueryKeys.jobs() });
    },
  });
};

export const useCreateExportJob = <T = ExportJob>() => {
  const client = useCmsClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await client.exports.createJob(payload)) as unknown as T,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exportQueryKeys.jobs() });
    },
  });
};

export const useGetExportDownload = () => {
  const client = useCmsClient();
  return useMutation({
    mutationFn: async ({ jobId, artifactId }: { jobId: string; artifactId?: string }) => {
      try {
        const res = await client.exports.getJobDownload(jobId);
        if (res?.download_url) {
          return { url: res.download_url };
        }
      } catch {
        // Fallback to computed URL
      }
      return { url: client.exports.getDownloadUrl(jobId, artifactId) };
    },
  });
};
