import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { installMobileAudioUnlock } from "./lib/mobile-audio-unlock";

installMobileAudioUnlock();

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    // The production Worker is served at the origin root. Keeping a stale
    // project-specific basepath here makes the bundled Android shell fail to
    // resolve the `/` route on a clean WebView.
    basepath: "/",
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
