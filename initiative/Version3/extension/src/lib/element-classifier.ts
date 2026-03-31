import { Forma } from "forma-embedded-view-sdk/auto";
import { FormaElement, Urn } from "forma-embedded-view-sdk/elements/types";

type ElementEntry = {
  path: string;
  element: FormaElement;
};

function collectEntries(
  urn: Urn,
  elements: Record<Urn, FormaElement>,
  predicate: (element: FormaElement) => boolean,
  path: string = "root",
): ElementEntry[] {
  const element = elements[urn];
  if (!element) return [];

  const entries: ElementEntry[] = [];
  if (predicate(element)) {
    entries.push({ path, element });
  }

  if (element.children) {
    for (const child of element.children) {
      entries.push(
        ...collectEntries(child.urn, elements, predicate, `${path}/${child.key}`),
      );
    }
  }
  return entries;
}

async function getElementTree(): Promise<{
  entries: ElementEntry[];
  elements: Record<Urn, FormaElement>;
  rootUrn: Urn;
}> {
  const rootUrn = (await Forma.proposal.getRootUrn()) as Urn;
  const { elements } = await Forma.elements.get({ urn: rootUrn, recursive: true });
  const entries = collectEntries(rootUrn, elements, () => true);
  return { entries, elements, rootUrn };
}

/**
 * Checks if a tree path belongs to a user-tagged design path.
 * Matches:
 *  - Exact path match (user selected this element)
 *  - Descendant match (tree path is a child of a selected element)
 *
 * Does NOT match ancestor paths — a parent group containing both
 * design and context children must stay context so its combined
 * getTriangles() mesh doesn't get tagged as design.
 */
function isDesignBySelection(path: string, designSet: Set<string>): boolean {
  if (designSet.has(path)) return true;
  for (const dp of designSet) {
    if (path.startsWith(dp + "/")) return true;
  }
  return false;
}

/**
 * Classifies elements into design and context.
 *
 * When `designPathOverrides` is provided (user-selected paths from
 * Forma.selection), classification is based on path matching — any
 * element whose path matches or is a descendant of a selected path
 * is tagged as design. Everything else is context.
 *
 * When no overrides are provided, ALL elements are classified as
 * context (no auto-detection).
 */
export async function classifyElements(
  designPathOverrides?: string[],
): Promise<{
  designPaths: string[];
  contextPaths: string[];
}> {
  const { entries } = await getElementTree();

  const designSet = new Set(designPathOverrides ?? []);
  const designPaths: string[] = [];
  const contextPaths: string[] = [];

  for (const { path } of entries) {
    if (designSet.size > 0 && isDesignBySelection(path, designSet)) {
      designPaths.push(path);
    } else {
      contextPaths.push(path);
    }
  }

  return { designPaths, contextPaths };
}

/**
 * Returns all element paths from the proposal tree.
 */
export async function getAllElementPaths(): Promise<string[]> {
  const { entries } = await getElementTree();
  return entries.map((e) => e.path);
}

/**
 * Returns design/context paths using the given overrides.
 */
export async function getDesignElementPaths(
  designPathOverrides?: string[],
): Promise<string[]> {
  const { designPaths } = await classifyElements(designPathOverrides);
  return designPaths;
}

export async function getContextElementPaths(
  designPathOverrides?: string[],
): Promise<string[]> {
  const { contextPaths } = await classifyElements(designPathOverrides);
  return contextPaths;
}

export function subscribeToProposalChanges(callback: () => void): () => void {
  let unsubscribed = false;

  Forma.proposal.subscribe(
    () => {
      if (!unsubscribed) callback();
    },
    { debouncedPersistedOnly: true },
  );

  return () => {
    unsubscribed = true;
  };
}
