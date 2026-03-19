"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getConfig,
  getOpenRouterModels,
  updateConfig,
  type AppConfig,
  type AppConfigUpdate,
  type OpenRouterModel,
} from "@/lib/config-api";

export const configQueryKey = ["config"] as const;
export const openRouterModelsQueryKey = [
  "config",
  "openrouter-models",
] as const;

export function useConfig() {
  return useQuery<AppConfig>({
    queryKey: configQueryKey,
    queryFn: getConfig,
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AppConfigUpdate) => updateConfig(payload),
    onSuccess: (config) => {
      queryClient.setQueryData(configQueryKey, config);
      queryClient.invalidateQueries({ queryKey: configQueryKey });
    },
  });
}

export function useOpenRouterModels() {
  return useQuery<{ models: OpenRouterModel[] }>({
    queryKey: openRouterModelsQueryKey,
    queryFn: getOpenRouterModels,
    staleTime: 5 * 60 * 1000,
  });
}
