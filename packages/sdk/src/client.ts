import { type KyInstance } from 'ky';
import { HttpClient, type HttpClientOptions } from './http';
import {
  ProjectsResource,
  PagesResource,
  BranchesResource,
  LanguagesResource,
  DeploymentsResource,
  DomainsResource,
  AssetsResource,
  IntegrationsResource,
  GitResource,
  SearchResource,
  CommentsResource,
  OpenApiResource,
  WorkspaceResource,
  ReaderAccessResource,
  AddonsResource,
  ApiKeysResource,
  NotificationsResource,
  PublicResource,
  AuthResource,
} from './resources';

export type CmsClientOptions = HttpClientOptions;

export class CmsClient {
  readonly http: HttpClient;

  readonly projects: ProjectsResource;
  readonly pages: PagesResource;
  readonly branches: BranchesResource;
  readonly languages: LanguagesResource;
  readonly deployments: DeploymentsResource;
  readonly domains: DomainsResource;
  readonly assets: AssetsResource;
  readonly integrations: IntegrationsResource;
  readonly git: GitResource;
  readonly search: SearchResource;
  readonly comments: CommentsResource;
  readonly openapi: OpenApiResource;
  readonly workspace: WorkspaceResource;
  readonly readerAccess: ReaderAccessResource;
  readonly addons: AddonsResource;
  readonly apiKeys: ApiKeysResource;
  readonly notifications: NotificationsResource;
  readonly public: PublicResource;
  readonly auth: AuthResource;

  constructor(options: CmsClientOptions = {}, existingHttp?: HttpClient) {
    this.http = existingHttp ?? new HttpClient(options);

    this.projects = new ProjectsResource(this.http);
    this.pages = new PagesResource(this.http);
    this.branches = new BranchesResource(this.http);
    this.languages = new LanguagesResource(this.http);
    this.deployments = new DeploymentsResource(this.http);
    this.domains = new DomainsResource(this.http);
    this.assets = new AssetsResource(this.http);
    this.integrations = new IntegrationsResource(this.http);
    this.git = new GitResource(this.http);
    this.search = new SearchResource(this.http);
    this.comments = new CommentsResource(this.http);
    this.openapi = new OpenApiResource(this.http);
    this.workspace = new WorkspaceResource(this.http);
    this.readerAccess = new ReaderAccessResource(this.http);
    this.addons = new AddonsResource(this.http);
    this.apiKeys = new ApiKeysResource(this.http);
    this.notifications = new NotificationsResource(this.http);
    this.public = new PublicResource(this.http);
    this.auth = new AuthResource(this.http);
  }

  /**
   * Direct access to the raw underlying Ky instance for custom streaming, blobs, or advanced request pipelines
   */
  get raw(): KyInstance {
    return this.http.raw;
  }

  /**
   * Creates an extended client with additional headers, hooks, or retry settings
   */
  extend(options: Partial<CmsClientOptions>): CmsClient {
    const extendedHttp = this.http.extend(options);
    return new CmsClient(extendedHttp.options, extendedHttp);
  }
}

/**
 * Factory function to create a typed CMS client instance
 */
export function createCmsClient(options: CmsClientOptions = {}): CmsClient {
  return new CmsClient(options);
}
