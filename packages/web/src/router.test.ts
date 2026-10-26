// Tests of the hash router on the real model: WEB-02 (the scheme list and scheme pages are routes)
// and T-07-13 (an id resolves only as an own key of the model's schemes, so prototype keys and
// unknown ids give the unknown route). No pasted value is involved.
import { describe, expect, test } from 'vitest';
import { createHost } from './engine-host.ts';
import { parseRoute, type Route, routeHref } from './router.ts';
import { loadDistJson } from './testing/load-model.ts';

const host = createHost(loadDistJson());
const model = host.model;

describe('parseRoute', () => {
  test.for([[''], ['#'], ['#/']])('%j gives the paste view', ([hash]) => {
    expect(parseRoute(hash as string, model)).toEqual({ view: 'paste' });
  });

  test.for([['#/schemes'], ['#/schemes/']])('%j gives the scheme list', ([hash]) => {
    expect(parseRoute(hash as string, model)).toEqual({ view: 'schemes' });
  });

  test('a scheme of the model gives its page', () => {
    expect(parseRoute('#/schemes/eori', model)).toEqual({ view: 'scheme', id: 'eori' });
  });

  test.for([
    ['#/schemes/nope'],
    ['#/schemes/__proto__'],
    ['#/schemes/constructor'],
    ['#/schemes/toString'],
    ['#/schemes/eori/'],
    ['#/schemes/eori/extra'],
    ['#/other'],
    ['#schemes'],
    ['#/schemes/EORI'],
  ])('%j gives the unknown route', ([hash]) => {
    expect(parseRoute(hash as string, model)).toEqual({ view: 'unknown' });
  });
});

describe('parseRoute: relation view (WEB-03, D-16, T-07-15)', () => {
  test.for([['#/relate'], ['#/relate/']])(
    '%j gives the relation view with nothing chosen',
    ([hash]) => {
      expect(parseRoute(hash as string, model)).toEqual({ view: 'relate', a: null, b: null });
    },
  );

  test('two schemes of the model give the relation view of that pair', () => {
    expect(parseRoute('#/relate/rsin/eori', model)).toEqual({
      view: 'relate',
      a: 'rsin',
      b: 'eori',
    });
  });

  test('the same scheme twice is a valid route, the engine warns about it', () => {
    expect(parseRoute('#/relate/eori/eori', model)).toEqual({
      view: 'relate',
      a: 'eori',
      b: 'eori',
    });
  });

  test.for([
    ['#/relate/rsin'],
    ['#/relate/rsin/'],
    ['#/relate//eori'],
    ['#/relate/rsin/__proto__'],
    ['#/relate/__proto__/eori'],
    ['#/relate/constructor/eori'],
    ['#/relate/rsin/nope'],
    ['#/relate/rsin/eori/'],
    ['#/relate/rsin/eori/extra'],
    ['#/relate/RSIN/eori'],
  ])('%j gives the unknown route', ([hash]) => {
    expect(parseRoute(hash as string, model)).toEqual({ view: 'unknown' });
  });
});

describe('routeHref', () => {
  test('round-trips through parseRoute for the relation view, chosen or not', () => {
    expect(routeHref({ view: 'relate', a: 'rsin', b: 'eori' })).toBe('#/relate/rsin/eori');
    expect(parseRoute(routeHref({ view: 'relate', a: 'rsin', b: 'eori' }), model)).toEqual({
      view: 'relate',
      a: 'rsin',
      b: 'eori',
    });
    expect(routeHref(parseRoute('#/relate', model))).toBe('#/relate');
  });

  test('round-trips through parseRoute for paste, the list and every scheme of the model', () => {
    const routes: Route[] = [
      { view: 'paste' },
      { view: 'schemes' },
      ...Object.keys(model.schemes).map((id): Route => ({ view: 'scheme', id })),
    ];
    expect(routes.length).toBe(Object.keys(model.schemes).length + 2);
    for (const route of routes) expect(parseRoute(routeHref(route), model)).toEqual(route);
  });

  test('an unknown route points at the paste view', () => {
    expect(routeHref({ view: 'unknown' })).toBe('#/');
  });
});
