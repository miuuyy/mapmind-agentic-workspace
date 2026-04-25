import React from "react";

import type { WorkspaceEnvelope } from "../lib/types";
import { chatModelStorageKey, readStoredChatModel } from "../lib/appStatePersistence";

type WorkspaceConfig = WorkspaceEnvelope["workspace"]["config"] | null | undefined;

export function resolveSelectedChatModel(params: {
  current: string | null;
  storedModel: string | null;
  chatModelOptions: string[];
  defaultModel: string | null | undefined;
  graphChanged: boolean;
}): string | null {
  const { current, storedModel, chatModelOptions, defaultModel, graphChanged } = params;
  if (chatModelOptions.length === 0) return null;
  if (!graphChanged && current && chatModelOptions.includes(current)) return current;
  if (storedModel && chatModelOptions.includes(storedModel)) return storedModel;
  return defaultModel ?? chatModelOptions[0];
}

export function useChatModelSelection(config: WorkspaceConfig, graphId: string | null | undefined): {
  chatModelOptions: string[];
  selectedChatModel: string | null;
  setSelectedChatModel: React.Dispatch<React.SetStateAction<string | null>>;
} {
  const [selectedChatModel, setSelectedChatModel] = React.useState<string | null>(null);
  const previousGraphIdRef = React.useRef<string | null | undefined>(graphId);

  const chatModelOptions = React.useMemo(() => {
    if (!config) return [] as string[];
    return Array.from(new Set([...(config.model_options ?? []), config.default_model].filter(Boolean)));
  }, [config]);

  React.useEffect(() => {
    if (chatModelOptions.length === 0) {
      setSelectedChatModel(null);
      previousGraphIdRef.current = graphId;
      return;
    }
    const graphChanged = previousGraphIdRef.current !== graphId;
    previousGraphIdRef.current = graphId;
    const storedModel = graphId ? readStoredChatModel(graphId) : null;
    setSelectedChatModel((current) => {
      return resolveSelectedChatModel({
        current,
        storedModel,
        chatModelOptions,
        defaultModel: config?.default_model,
        graphChanged,
      });
    });
  }, [chatModelOptions, config?.default_model, graphId]);

  React.useEffect(() => {
    if (!graphId) return;
    try {
      if (selectedChatModel && chatModelOptions.includes(selectedChatModel)) {
        localStorage.setItem(chatModelStorageKey(graphId), selectedChatModel);
      } else {
        localStorage.removeItem(chatModelStorageKey(graphId));
      }
    } catch {
      // Ignore localStorage write failures.
    }
  }, [chatModelOptions, graphId, selectedChatModel]);

  return { chatModelOptions, selectedChatModel, setSelectedChatModel };
}
