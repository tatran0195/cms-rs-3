const cleanPath = (path = ''): string => path.replace(/^\/+|\/+$/g, '');

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Percent-encode one path segment exactly once: a raw non-ASCII slug from the
 *  snapshot and an already-encoded segment from an authored link both come out
 *  encoded a single time, so the route's decoded splat matches `page.path`. */
const encodeSegment = (segment: string): string => encodeURIComponent(safeDecode(segment));

/** Split an authored path into its pathname and the `?query#fragment` tail so
 *  only the pathname is encoded and anchors/queries survive untouched. */
const splitPath = (path: string): { pathname: string; query: string; fragment: string } => {
  const hashAt = path.indexOf('#');
  const beforeHash = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const fragment = hashAt >= 0 ? path.slice(hashAt) : '';
  const queryAt = beforeHash.indexOf('?');
  return {
    pathname: queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash,
    query: queryAt >= 0 ? beforeHash.slice(queryAt) : '',
    fragment,
  };
};

/** Omit only a known default language; explicit authored query strings stay intact. */
export function siteLanguageParam(code?: string, defaultCode?: string): string | undefined {
  return code === defaultCode ? undefined : code;
}

export interface SiteHrefOptions {
  lang?: string;
  version?: string;
  basePath?: string;
}

export function siteHref(projectId: string, path = '', options?: SiteHrefOptions): string {
  const { pathname, query, fragment } = splitPath(path);
  const fullPath = [options?.version, cleanPath(pathname)]
    .filter(Boolean)
    .join('/')
    .split('/')
    .filter(Boolean)
    .map(encodeSegment)
    .join('/');

  const prefix = options?.basePath !== undefined
    ? options.basePath
    : (projectId && projectId !== 'standalone' ? `/sites/${projectId}` : '');
  const langParam = options?.lang && !new URLSearchParams(query).has('lang')
    ? `lang=${encodeURIComponent(options.lang)}`
    : '';
  const search = langParam ? `${query ? `${query}&` : '?'}${langParam}` : query;
  const href = `${prefix}${fullPath ? `/${fullPath}` : ''}` || '/';
  return `${href}${search}${fragment}`;
}
