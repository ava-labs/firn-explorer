"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ExplorerFeedBridge } from "@/lib/api/explorer";
import { NetworkProvider, type TenantInfo } from "@/lib/api/network";
import { LivePauseProvider } from "@/lib/api/live-pause";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1_000,
        gcTime: 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function Providers({
  children,
  tenant = null,
}: {
  children: ReactNode;
  tenant?: TenantInfo | null;
}) {
  const [client] = useState(getQueryClient);
  return (
    <QueryClientProvider client={client}>
      <NetworkProvider tenant={tenant}>
        <LivePauseProvider>
          {/* Single SSE bridge drives both the home-page bootstrap
              merge and the per-page list invalidations (/blocks,
              /transactions, /icm). It honors the per-feed pause flags
              from <LivePauseProvider> on both paths. */}
          <ExplorerFeedBridge />
          {children}
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
        </LivePauseProvider>
      </NetworkProvider>
    </QueryClientProvider>
  );
}
