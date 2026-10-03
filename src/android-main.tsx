import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./styles.css";
import "./lib/buddy-audio-unlock";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const router = createRouter({
  routeTree,
  basepath: "/",
  context: { queryClient },
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
});

const root = document.getElementById("root");
if (!root) throw new Error("Little Red's Big Studio Android root element is missing.");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
