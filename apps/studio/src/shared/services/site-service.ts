import { cmsClient } from './cms-client';

/**
 * Unified site reader service backed directly by cmsClient.sites
 */
export const siteService = cmsClient.sites;
