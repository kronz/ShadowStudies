import { Forma } from "forma-embedded-view-sdk/auto";
import { FormaElement, Urn } from "forma-embedded-view-sdk/elements/types";

type ElementEntry = {
  path: string;
  element: FormaElement;
};

/**
 * Traverses the element tree and collects path + element pairs for
 * every element matching the predicate.
 */
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

/**
 * Fetches the full element tree from the proposal root.
 */
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
 * Returns true if the element has a Function assigned.
 *
 * In Forma, assigning a Function (residential, office, retail, etc.)
 * to a building populates `properties.functionId`. Elements with a
 * Function are user-placed design buildings. Everything without a
 * Function is context (surrounding site model, terrain, vegetation, etc.).
 */
function hasFunction(element: FormaElement): boolean {
  return element.properties?.functionId !== undefined &&
    element.properties.functionId !== null &&
    element.properties.functionId !== "";
}

/**
 * Classifies elements into design and context based on whether they
 * have a Function assigned.
 *
 * - Design: elements with a `properties.functionId` (user-placed
 *   buildings with an assigned function like residential, office, etc.)
 * - Context: everything else (surrounding buildings, terrain, vegetation)
 */
export async function classifyElements(): Promise<{
  designPaths: string[];
  contextPaths: string[];
}> {
  const { entries } = await getElementTree();

  const designPaths: string[] = [];
  const contextPaths: string[] = [];

  for (const { path, element } of entries) {
    if (hasFunction(element)) {
      designPaths.push(path);
    } else {
      contextPaths.push(path);
    }
  }

  return { designPaths, contextPaths };
}

/**
 * Returns paths for design elements (those with a Function assigned).
 */
export async function getDesignElementPaths(): Promise<string[]> {
  const { designPaths } = await classifyElements();
  return designPaths;
}

/**
 * Returns paths for context elements (those without a Function).
 */
export async function getContextElementPaths(): Promise<string[]> {
  const { contextPaths } = await classifyElements();
  return contextPaths;
}

/**
 * Subscribe to proposal changes and re-run a callback when elements change.
 * Returns an unsubscribe function.
 */
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
