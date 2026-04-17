import { describe, expect, it } from "vitest";

import { buildObsidianImportPreview, type ObsidianImportOptions } from "./obsidianImport";

const baseOptions: ObsidianImportOptions = {
  vaultName: "organise",
  graphTitle: "organise",
  subject: "organise",
  language: "en",
  relation: "bridges",
  useFoldersAsZones: true,
  autofillDescriptions: true,
  createArtifactsFromNotes: false,
  createPlaceholderTopics: false,
};

describe("buildObsidianImportPreview", () => {
  it("imports markdown notes with wikilinks and folder zones", () => {
    const preview = buildObsidianImportPreview(
      [
        { path: "projects/mapmind.md", content: "MapMind note\n\n[[projects/importer]]" },
        { path: "projects/importer.md", content: "Importer note" },
      ],
      baseOptions,
    );

    expect(preview.package).not.toBeNull();
    expect(preview.topicCount).toBe(2);
    expect(preview.edgeCount).toBe(1);
    expect(preview.zoneCount).toBe(1);
    expect(preview.issues).toHaveLength(0);
  });

  it("fails closed on ambiguous basename links", () => {
    const preview = buildObsidianImportPreview(
      [
        { path: "projects/alpha.md", content: "[[shared]]" },
        { path: "a/shared.md", content: "" },
        { path: "b/shared.md", content: "" },
      ],
      baseOptions,
    );

    expect(preview.package).toBeNull();
    expect(preview.issues.some((issue) => issue.code === "ambiguous_link" && issue.level === "error")).toBe(true);
  });

  it("can create placeholder topics for missing notes", () => {
    const preview = buildObsidianImportPreview(
      [{ path: "topic.md", content: "[[missing note]]" }],
      { ...baseOptions, createPlaceholderTopics: true },
    );

    expect(preview.package).not.toBeNull();
    expect(preview.topicCount).toBe(2);
    expect(preview.edgeCount).toBe(1);
    expect(preview.issues.some((issue) => issue.code === "unresolved_link")).toBe(true);
  });

  it("strips aliases and heading fragments from obsidian links", () => {
    const preview = buildObsidianImportPreview(
      [
        { path: "a.md", content: "[[folder/b#Heading|Alias]]" },
        { path: "folder/b.md", content: "Real note body with enough words to become the description paragraph for import." },
      ],
      baseOptions,
    );

    expect(preview.package).not.toBeNull();
    expect(preview.edgeCount).toBe(1);
    expect(preview.issues).toHaveLength(0);
  });
});
