import React from "react";

import type { WorkspaceEnvelope } from "../lib/types";
import { chatModelStorageKey, readStoredChatModel } from "../lib/appStatePersistence";

type WorkspaceConfig = WorkspaceEnvelope["workspace"]["config"] | null | undefined;

export function useChatModelSelection(config: WorkspaceConfig, graphId: string | null | undefined): {
  chatModelOptions: string[];
  selectedChatModel: string | null;
  setSelectedChatModel: React.Dispatch<React.SetStateAction<string | null>>;
} {
  const [selectedChatModel, setSelectedChatModel] = React.useState<string | null>(null);

  const chatModelOptions = React.useMemo(() => {
    if (!config) return [] as string[];
    return Array.from(new Set([...(config.model_options ?? []), config.default_model].filter(Boolean)));
  }, [config]);

  React.useEffect(() => {
    if (chatModelOptions.length === 0) {
      setSelectedChatModel(null);
      return;
    }
    const storedModel = graphId ? readStoredChatModel(graphId) : null;
    setSelectedChatModel((current) => {
      if (current && chatModelOptions.includes(current)) return current;
      if (storedModel && chatModelOptions.includes(storedModel)) return storedModel;
      return config?.default_model ?? chatModelOptions[0];
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
