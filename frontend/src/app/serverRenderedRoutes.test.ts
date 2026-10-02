import { matchRoutes, type RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes, serverRenderedRouteTree } from './router';

const isSsr = (route: RouteObject) => (route.handle as { ssr?: boolean } | undefined)?.ssr === true;

describe('serverRenderedRouteTree', () => {
  const tree = serverRenderedRouteTree();

  it('keeps only the branches leading to server-rendered routes', () => {
    const leaves: RouteObject[] = [];
    const walk = (list: RouteObject[]) =>
      list.forEach((r) => (isSsr(r) || !r.children ? leaves.push(r) : walk(r.children)));
    walk(tree);
    expect(leaves.length).toBeGreaterThan(20);
    expect(leaves.every(isSsr)).toBe(true);
  });

  it.each(['/', '/pricing', '/services/seo', '/blog/a-post', '/learn/course/lesson', '/about', '/case-studies/x'])(
    'matches %s to the same route objects as the full tree',
    (path) => {
      const full = matchRoutes(routes, path)!.map((m) => m.route);
      const cut = matchRoutes(tree, path)!.map((m) => m.route);
      expect(cut.at(-1)).toBe(full.at(-1));
      expect(isSsr(cut.at(-1)!)).toBe(true);
    },
  );
});
