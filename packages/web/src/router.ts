import type { Model } from './engine-host.ts';

/**
 * The views of the site (SPEC section 7.1). A route carries a scheme id only, never a pasted value,
 * so the address of a page can be shared without sharing data (D-11).
 */
export type Route =
  | { view: 'paste' }
  | { view: 'schemes' }
  | { view: 'scheme'; id: string }
  | { view: 'unknown' };

/**
 * Hand-rolled hash routing (RESEARCH Pattern 5, no routing library): `#/` is the paste view,
 * `#/schemes` the list and `#/schemes/<id>` a scheme page. An id resolves only when it is an own key
 * of the model's schemes (T-07-13), so `__proto__` or `constructor` give the unknown route.
 */
export function parseRoute(hash: string, model: Pick<Model, 'schemes'>): Route {
  const path = hash.startsWith('#') ? hash.slice(1) : hash;
  if (path === '' || path === '/') return { view: 'paste' };
  const parts = path.split('/');
  if (parts[0] !== '' || parts[1] !== 'schemes') return { view: 'unknown' };
  if (parts.length === 2) return { view: 'schemes' };
  const id = parts[2];
  if (parts.length === 3 && id !== undefined && Object.hasOwn(model.schemes, id)) {
    return { view: 'scheme', id };
  }
  return { view: 'unknown' };
}

/** The hash of a route; an unknown route has no address of its own and points at the paste view. */
export function routeHref(route: Route): string {
  switch (route.view) {
    case 'schemes':
      return '#/schemes';
    case 'scheme':
      return `#/schemes/${route.id}`;
    default:
      return '#/';
  }
}
