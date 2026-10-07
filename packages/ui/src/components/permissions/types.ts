export type PermissionAction = 'create' | 'read' | 'edit' | 'delete' | 'publish';

export interface PermissionCatalogResource<R extends string = string> {
  key: R;
  actions: PermissionAction[];
}

export interface PermissionCatalog<R extends string = string> {
  resources: PermissionCatalogResource<R>[];
  actions: PermissionAction[];
}

export type PermissionsMatrixState = Record<string, Partial<Record<PermissionAction, boolean>>>;

export interface ResourceCategory {
  id: string;
  label: string;
  description?: string;
  resources: string[];
}
