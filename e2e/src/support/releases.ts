import type { Database } from './db';

/**
 * Read what a release actually froze.
 *
 * The published documentation site is rendered from the immutable
 * `DeploymentSnapshot` / `DeploymentSnapshotPageIndex` rows, never from the
 * mutable editor tables. When the public URL itself cannot be reached (see
 * DEFECT-10), these rows are the authoritative statement of what a reader would
 * have been shown — and they are a genuinely independent read path.
 */
export class ReleaseInspector {
  constructor(private readonly db: Database) {}

  /**
   * The single live release for a project, or null when nothing is live.
   *
   * The version number lives on the snapshot row, not on the deployment.
   */
  async activeDeployment(projectId: string): Promise<{ id: string; version: string } | null> {
    const rows = await this.db.query<{ id: string; version: string }>(
      `SELECT d.id AS id, COALESCE(s.version::text, '') AS version
         FROM "Deployment" d
         LEFT JOIN "DeploymentSnapshot" s ON s.deployment_id = d.id
        WHERE d.project_id = $1 AND d.status = 'ACTIVE'
        ORDER BY d.created_at DESC LIMIT 1`,
      [projectId],
    );
    return rows[0] ?? null;
  }

  /** Every release ever created, newest first. */
  async deploymentHistory(
    projectId: string,
  ): Promise<Array<{ id: string; version: string; status: string; created_at: string }>> {
    return this.db.query(
      `SELECT d.id AS id, COALESCE(s.version::text, '') AS version,
              d.status::text AS status, d.created_at AS created_at
         FROM "Deployment" d
         LEFT JOIN "DeploymentSnapshot" s ON s.deployment_id = d.id
        WHERE d.project_id = $1 ORDER BY s.version DESC NULLS LAST, d.created_at DESC`,
      [projectId],
    );
  }

  /** Every page path frozen into a release, with its stored title. */
  async snapshotPaths(deploymentId: string): Promise<Array<{ path: string; title: string; kind: string }>> {
    return this.db.query(
      `SELECT path, title, kind FROM "DeploymentSnapshotPageIndex" WHERE deployment_id = $1 ORDER BY path`,
      [deploymentId],
    );
  }

  /** The full text of one frozen page, as a reader would receive it. */
  async snapshotPageText(deploymentId: string, path: string): Promise<string> {
    const rows = await this.db.query<{ page_content: string }>(
      `SELECT page_content::text AS page_content FROM "DeploymentSnapshotPageIndex"
        WHERE deployment_id = $1 AND path = $2 LIMIT 1`,
      [deploymentId, path],
    );
    return rows[0]?.page_content ?? '';
  }

  /** Convenience: the text a reader would get for `path` on the live release. */
  async livePageText(projectId: string, path: string): Promise<string | null> {
    const active = await this.activeDeployment(projectId);
    if (!active) return null;
    return this.snapshotPageText(active.id, path);
  }
}
