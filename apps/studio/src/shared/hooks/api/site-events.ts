import { useMutation } from '@tanstack/react-query';
import { cmsClient } from '../../services/cms-client';

export type PublicAnalyticsPayload =
  | { name: 'page_view' | 'page_engaged'; path: string; language?: string; referrer?: string; engagementMs?: number; scrollDepth?: number }
  | {
      name: 'navigation_clicked' | 'cta_clicked' | 'outbound_link_clicked';
      path?: string;
      targetPath?: string;
      placement?: string;
      language?: string;
    }
  | { name: 'code_copied'; path?: string; placement?: string; language?: string }
  | { name: 'search_result_clicked'; path?: string; resultId?: string; resultPosition?: number; language?: string }
  | { name: 'feedback_submitted'; path?: string; feedback: 'helpful' | 'not_helpful'; target: 'page' };

interface SiteAnalyticsEvent {
  eventId: string;
  occurredAt: string;
  sessionId?: string;
  payload: PublicAnalyticsPayload;
}

export const useCreateSiteAnalyticsEvent = (projectId: string) =>
  useMutation({
    mutationFn: async (event: SiteAnalyticsEvent) => {
      await cmsClient.public.recordEvent(projectId, event);
    },
  });
