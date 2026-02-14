type RouteModule = () => Promise<{ default: unknown }>;

const routeLoaders: Record<string, RouteModule> = {
  "/": () => import("@/pages/landing"),
  "/home": () => import("@/pages/home"),
  "/pricing": () => import("@/pages/pricing"),
  "/changelog": () => import("@/pages/changelog"),
  "/docs": () => import("@/pages/documentation"),
  "/about": () => import("@/pages/about"),
  "/blog": () => import("@/pages/blog"),
  "/careers": () => import("@/pages/careers"),
  "/contact": () => import("@/pages/contact"),
  "/privacy": () => import("@/pages/privacy"),
  "/terms": () => import("@/pages/terms"),
  "/security": () => import("@/pages/security"),
  "/login": () => import("@/pages/login"),
};

const prefetchedRoutes = new Set<string>();

export function prefetchRoute(path: string): void {
  if (prefetchedRoutes.has(path)) return;

  const loader = routeLoaders[path];
  if (loader) {
    prefetchedRoutes.add(path);
    loader().catch(() => {
      prefetchedRoutes.delete(path);
    });
  }
}

export function getPrefetchHandler(path: string) {
  return () => prefetchRoute(path);
}
