import type { Edge, GraphExportPackagePayload, Topic, Zone } from "./types";

type FrontmatterValue = string | string[];

export type ObsidianVaultEntry = {
  path: string;
  content: string;
};

export type ObsidianImportOptions = {
  vaultName: string;
  graphTitle: string;
  subject: string;
  language: "en" | "uk" | "ru";
  relation: Edge["relation"];
  useFoldersAsZones: boolean;
  autofillDescriptions: boolean;
  createArtifactsFromNotes: boolean;
  createPlaceholderTopics: boolean;
};

export type ObsidianImportIssue = {
  code: string;
  level: "error" | "warning";
  message: string;
};

export type ObsidianImportPreview = {
  package: GraphExportPackagePayload | null;
  noteCount: number;
  topicCount: number;
  edgeCount: number;
  zoneCount: number;
  unresolvedLinkCount: number;
  issues: ObsidianImportIssue[];
};

type ParsedNote = {
  id: string;
  path: string;
  folderPath: string;
  title: string;
  slug: string;
  description: string;
  body: string;
  aliases: string[];
  tags: string[];
  links: string[];
  placeholder: boolean;
};

const ZONE_COLORS = [
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#10b981",
  "#ec4899",
  "#eab308",
  "#6366f1",
  "#ef4444",
] as const;

const INTERNAL_LINK_RE = /!?\[\[([^[\]]+)\]\]/g;
const MARKDOWN_LINK_RE = /\[[^\]]*]\(([^)]+)\)/g;

export function buildObsidianImportPreview(
  entries: ObsidianVaultEntry[],
  options: ObsidianImportOptions,
): ObsidianImportPreview {
  const issues: ObsidianImportIssue[] = [];
  const markdownEntries = entries
    .map((entry) => ({
      path: normalizeVaultPath(entry.path),
      content: entry.content,
    }))
    .filter((entry) => isMarkdownNotePath(entry.path))
    .filter((entry) => !isIgnoredVaultPath(entry.path));

  if (markdownEntries.length === 0) {
    return {
      package: null,
      noteCount: 0,
      topicCount: 0,
      edgeCount: 0,
      zoneCount: 0,
      unresolvedLinkCount: 0,
      issues: [
        {
          code: "no_markdown_notes",
          level: "error",
          message: "No Markdown notes were found in the selected Obsidian vault.",
        },
      ],
    };
  }

  const notes = markdownEntries.map((entry) => parseNote(entry, options.autofillDescriptions, options.createArtifactsFromNotes));
  const notesByPath = new Map<string, ParsedNote>();
  const notesByBaseName = new Map<string, ParsedNote[]>();

  for (const note of notes) {
    notesByPath.set(note.path, note);
    const baseNameKey = normalizeLookupKey(stripMdExtension(note.path).split("/").at(-1) ?? note.title);
    notesByBaseName.set(baseNameKey, [...(notesByBaseName.get(baseNameKey) ?? []), note]);
  }

  const topics = new Map<string, Topic>();
  for (const note of notes) {
    topics.set(note.id, noteToTopic(note, options.createArtifactsFromNotes));
  }

  const edgeIds = new Set<string>();
  const edges: Edge[] = [];
  const unresolvedLinks = new Set<string>();

  for (const note of notes) {
    for (const rawLink of note.links) {
      const resolved = resolveInternalLink(rawLink, note.path, notesByPath, notesByBaseName);
      if (resolved.error) {
        issues.push({
          code: resolved.error === "ambiguous" ? "ambiguous_link" : "unresolved_link",
          level: resolved.error === "ambiguous" ? "error" : "warning",
          message:
            resolved.error === "ambiguous"
              ? `Ambiguous Obsidian link "${rawLink}" in ${note.path}. Use a path-qualified link before import.`
              : `Unresolved Obsidian link "${rawLink}" in ${note.path}.`,
        });
      }

      let target = resolved.note;
      if (!target && options.createPlaceholderTopics) {
        target = makePlaceholderNote(rawLink, options.autofillDescriptions, options.createArtifactsFromNotes);
        if (!topics.has(target.id)) {
          topics.set(target.id, noteToTopic(target, options.createArtifactsFromNotes));
        }
      }
      if (!target) {
        unresolvedLinks.add(rawLink);
        continue;
      }

      const edgeId = `obsidian-edge-${stableHash(`${note.id}:${target.id}:${options.relation}`)}`;
      if (edgeIds.has(edgeId) || note.id === target.id) continue;
      edgeIds.add(edgeId);
      edges.push({
        id: edgeId,
        source_topic_id: note.id,
        target_topic_id: target.id,
        relation: options.relation,
        rationale: `Imported from Obsidian link in ${note.title}.`,
      });
    }
  }

  const zones = options.useFoldersAsZones ? buildZones([...topics.values()], notes, options.vaultName) : [];
  const graphTitle = options.graphTitle.trim() || options.vaultName.trim() || "Obsidian import";
  const subject = options.subject.trim() || graphTitle;

  const errorCount = issues.filter((issue) => issue.level === "error").length;
  const packagePayload =
    errorCount === 0
      ? buildPackage(graphTitle, subject, options, [...topics.values()], edges, zones)
      : null;

  return {
    package: packagePayload,
    noteCount: markdownEntries.length,
    topicCount: topics.size,
    edgeCount: edges.length,
    zoneCount: zones.length,
    unresolvedLinkCount: unresolvedLinks.size,
    issues,
  };
}

function buildPackage(
  graphTitle: string,
  subject: string,
  options: ObsidianImportOptions,
  topics: Topic[],
  edges: Edge[],
  zones: Zone[],
): GraphExportPackagePayload {
  const exportedAt = new Date().toISOString();
  return {
    kind: "mapmind_graph_export",
    version: 1,
    exported_at: exportedAt,
    source_graph_id: `obsidian-${stableHash(options.vaultName || graphTitle)}`,
    title: graphTitle,
    include_progress: false,
    graph: {
      graph_id: `obsidian-${stableHash(`${graphTitle}:${subject}`)}`,
      subject,
      title: graphTitle,
      language: options.language,
      version: 1,
      topics,
      edges,
      zones,
      quiz_attempts: [],
      metadata: {
        import_source: "obsidian",
        vault_name: options.vaultName,
        relation: options.relation,
        folders_as_zones: options.useFoldersAsZones,
        autofilled_descriptions: options.autofillDescriptions,
        created_placeholder_topics: options.createPlaceholderTopics,
        created_note_artifacts: options.createArtifactsFromNotes,
      },
    },
  };
}

function buildZones(topics: Topic[], notes: ParsedNote[], vaultName: string): Zone[] {
  const notesById = new Map(notes.map((note) => [note.id, note]));
  const zonesByFolder = new Map<string, string[]>();
  for (const topic of topics) {
    const note = notesById.get(topic.id);
    if (!note || !note.folderPath) continue;
    zonesByFolder.set(note.folderPath, [...(zonesByFolder.get(note.folderPath) ?? []), topic.id]);
  }

  return [...zonesByFolder.entries()].map(([folderPath, topicIds], index) => ({
    id: `obsidian-zone-${stableHash(folderPath)}`,
    title: folderPath || vaultName,
    kind: "obsidian_folder",
    color: ZONE_COLORS[index % ZONE_COLORS.length],
    intensity: 0.46,
    topic_ids: topicIds,
  }));
}

function noteToTopic(note: ParsedNote, includeArtifact: boolean): Topic {
  return {
    id: note.id,
    title: note.title,
    slug: note.slug,
    description: note.description,
    difficulty: 0,
    estimated_minutes: 0,
    level: 0,
    state: "not_started",
    zones: [],
    resources: [],
    artifacts:
      includeArtifact && note.body.trim()
        ? [
            {
              id: `obsidian-artifact-${stableHash(note.path)}`,
              title: "Imported Obsidian note",
              kind: "obsidian_note",
              body: note.body.trim(),
              created_at: new Date().toISOString(),
            },
          ]
        : [],
    metadata: {
      source: "obsidian",
      relative_path: note.path,
      aliases: note.aliases,
      tags: note.tags,
      placeholder: note.placeholder,
    },
  };
}

function parseNote(entry: ObsidianVaultEntry, autofillDescriptions: boolean, createArtifactsFromNotes: boolean): ParsedNote {
  const { body, frontmatter } = parseFrontmatter(entry.content);
  const title = stripMdExtension(entry.path).split("/").at(-1) ?? entry.path;
  const folderPath = dirname(entry.path);
  const aliases = normalizeStringArray(frontmatter.aliases);
  const tags = normalizeStringArray(frontmatter.tags);
  const cleanBody = body.trim();
  const description = autofillDescriptions ? deriveDescription(cleanBody) : "";

  return {
    id: `obsidian-topic-${stableHash(entry.path)}`,
    path: entry.path,
    folderPath,
    title,
    slug: makeUnicodeSlug(title),
    description,
    body: createArtifactsFromNotes ? cleanBody : "",
    aliases,
    tags,
    links: [...extractWikilinks(cleanBody), ...extractMarkdownInternalLinks(cleanBody)],
    placeholder: false,
  };
}

function makePlaceholderNote(rawLink: string, autofillDescriptions: boolean, createArtifactsFromNotes: boolean): ParsedNote {
  const target = normalizeLinkTarget(rawLink);
  const title = stripMdExtension(target.split("/").at(-1) ?? target) || "Missing note";
  const folderPath = dirname(target);
  const placeholderBody = "";
  return {
    id: `obsidian-topic-${stableHash(`placeholder:${target}`)}`,
    path: target,
    folderPath,
    title,
    slug: makeUnicodeSlug(title),
    description: autofillDescriptions ? `Placeholder created from unresolved Obsidian link: ${title}` : "",
    body: createArtifactsFromNotes ? placeholderBody : "",
    aliases: [],
    tags: [],
    links: [],
    placeholder: true,
  };
}

function resolveInternalLink(
  rawLink: string,
  sourcePath: string,
  notesByPath: Map<string, ParsedNote>,
  notesByBaseName: Map<string, ParsedNote[]>,
): { note: ParsedNote | null; error: "unresolved" | "ambiguous" | null } {
  const target = normalizeLinkTarget(rawLink);
  if (!target) return { note: null, error: "unresolved" };

  const directCandidates = new Set<string>();
  directCandidates.add(normalizeVaultPath(`${stripMdExtension(target)}.md`));
  directCandidates.add(normalizeVaultPath(target));
  if (target.includes("/")) {
    const relativeFromSource = normalizeVaultPath(joinPath(dirname(sourcePath), target));
    directCandidates.add(relativeFromSource.endsWith(".md") ? relativeFromSource : `${relativeFromSource}.md`);
  }

  for (const candidate of directCandidates) {
    const note = notesByPath.get(candidate);
    if (note) return { note, error: null };
  }

  const basenameKey = normalizeLookupKey(stripMdExtension(target).split("/").at(-1) ?? target);
  const basenameMatches = notesByBaseName.get(basenameKey) ?? [];
  if (basenameMatches.length === 1) {
    return { note: basenameMatches[0], error: null };
  }
  if (basenameMatches.length > 1) {
    return { note: null, error: "ambiguous" };
  }
  return { note: null, error: "unresolved" };
}

function parseFrontmatter(content: string): { body: string; frontmatter: Record<string, FrontmatterValue> } {
  if (!content.startsWith("---\n")) {
    return { body: content, frontmatter: {} };
  }
  const closingIndex = content.indexOf("\n---", 4);
  if (closingIndex === -1) {
    return { body: content, frontmatter: {} };
  }

  const rawFrontmatter = content.slice(4, closingIndex).trim();
  const body = content.slice(closingIndex + 4).replace(/^\n/, "");
  return {
    body,
    frontmatter: parseSimpleYamlFrontmatter(rawFrontmatter),
  };
}

function parseSimpleYamlFrontmatter(raw: string): Record<string, FrontmatterValue> {
  const result: Record<string, FrontmatterValue> = {};
  let activeListKey: string | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const listItemMatch = trimmed.match(/^-\s+(.*)$/);
    if (listItemMatch && activeListKey) {
      const current = result[activeListKey];
      const nextValue = cleanupFrontmatterScalar(listItemMatch[1]);
      result[activeListKey] = Array.isArray(current) ? [...current, nextValue] : [nextValue];
      continue;
    }

    activeListKey = null;
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!rawValue) {
      activeListKey = key;
      result[key] = [];
      continue;
    }
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      result[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((item) => cleanupFrontmatterScalar(item))
        .filter(Boolean);
      continue;
    }
    result[key] = cleanupFrontmatterScalar(rawValue);
  }

  return result;
}

function cleanupFrontmatterScalar(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function normalizeStringArray(value: FrontmatterValue | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  return value
    .split(",")
    .map((item) => cleanupFrontmatterScalar(item))
    .filter(Boolean);
}

function extractWikilinks(body: string): string[] {
  const links: string[] = [];
  for (const match of body.matchAll(INTERNAL_LINK_RE)) {
    const target = match[1]?.trim();
    if (target) links.push(target);
  }
  return links;
}

function extractMarkdownInternalLinks(body: string): string[] {
  const links: string[] = [];
  for (const match of body.matchAll(MARKDOWN_LINK_RE)) {
    const target = match[1]?.trim();
    if (!target) continue;
    if (isExternalUrl(target) || target.startsWith("#")) continue;
    if (!target.endsWith(".md") && !target.includes("/")) continue;
    links.push(target);
  }
  return links;
}

function normalizeLinkTarget(rawTarget: string): string {
  let target = rawTarget.trim();
  if (target.startsWith("!")) target = target.slice(1).trim();
  if (target.includes("|")) target = target.split("|", 1)[0].trim();
  if (target.includes("#")) target = target.split("#", 1)[0].trim();
  if (target.includes("^")) target = target.split("^", 1)[0].trim();
  target = target.replace(/^<|>$/g, "");
  return normalizeVaultPath(target);
}

function deriveDescription(body: string): string {
  const candidate = body
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .find((block) => Boolean(block) && !block.startsWith("[[") && !block.startsWith("![[") && block.length > 24);
  if (!candidate) return "";
  const singleLine = candidate.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
  return singleLine.length > 280 ? `${singleLine.slice(0, 277).trimEnd()}...` : singleLine;
}

function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/{2,}/g, "/").trim();
}

function isMarkdownNotePath(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

function isIgnoredVaultPath(path: string): boolean {
  const segments = normalizeVaultPath(path).split("/");
  return segments.some((segment) => segment.startsWith("."));
}

function dirname(path: string): string {
  const normalized = normalizeVaultPath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

function stripMdExtension(path: string): string {
  return path.replace(/\.md$/i, "");
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function joinPath(left: string, right: string): string {
  const leftParts = left ? normalizeVaultPath(left).split("/") : [];
  const rightParts = normalizeVaultPath(right).split("/");
  const merged = [...leftParts];
  for (const part of rightParts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      merged.pop();
      continue;
    }
    merged.push(part);
  }
  return merged.join("/");
}

function isExternalUrl(value: string): boolean {
  return /^[a-z]+:\/\//i.test(value);
}

function makeUnicodeSlug(value: string): string {
  const slug = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `note-${stableHash(value)}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
