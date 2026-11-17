// Entry for the static GitHub Pages build (npm run build:pages).
// Renders the same dashboard as the local app; the AI runs in the browser.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./styles.css";
import { Route } from "./routes/index";

const Dashboard = Route.options.component!;
const queryClient = new QueryClient();

// Installable app: the service worker serves the dashboard offline.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js").then(async () => {
    // Files loaded before the worker existed are cached now, so the next launch works offline.
    const urls = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((u) => new URL(u).origin === location.origin);
    const cache = await caches.open("hazardwatch-v1");
    // One by one: a single failed file must not stop the rest from being cached.
    await Promise.all(["./", ...urls].map((u) => cache.add(u).catch(() => {})));
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  </StrictMode>,
);
