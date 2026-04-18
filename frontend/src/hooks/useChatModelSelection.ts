import React from "react";

import type { WorkspaceEnvelope } from "../lib/types";

type WorkspaceConfig = WorkspaceEnvelope["workspace"]["config"] | null | undefined;

export function useChatModelSelection(config: WorkspaceConfig): {
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
    setSelectedChatModel((current) => {
      if (current && chatModelOptions.includes(current)) return current;
      return config?.default_model ?? chatModelOptions[0];
    });
  }, [chatModelOptions, config?.default_model]);

  return { chatModelOptions, selectedChatModel, setSelectedChatModel };
}
