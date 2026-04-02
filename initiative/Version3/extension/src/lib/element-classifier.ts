import { Forma } from "forma-embedded-view-sdk/auto";
import { FormaElement, Urn } from "forma-embedded-view-sdk/elements/types";

type ElementEntry = {
  path: string;
  element: FormaElement;
};

function collectEntries(
  urn: Urn,
  elements: Record<Urn, FormaElement>,
  path: string = "root",
): ElementEntry[] {
  const element = elements[urn];
  if (!element) return [];

  const entries: ElementEntry[] = [{ path, element }];

  if (element.children) {
    for (const child of element.children) {
      entries.push(
        ...collectEntries(child.urn, elements, `${path}/${child.key}`),
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
  const entries = collectEntries(rootUrn, elements);
  return { entries, elements, rootUrn };
}

/**
 * Determines whether an element is a "design" building (has floors)
 * by checking for graphBuilding or grossFloorAreaPolygons representations.
 *
 * Elements with floors → Design building
 * Elements without floors → Context building
 */
function hasFloorRepresentations(element: FormaElement): boolean {
  const reps = element.representations;
  if (!reps) return false;
  return !!(reps.graphBuilding || reps.grossFloorAreaPolygons);
}

/**
 * Auto-classifies elements into design and context based on
 * floor representations. Buildings with graphBuilding or
 * grossFloorAreaPolygons are "design"; all others are "context".
 */
export async function classifyElements(): Promise<{
  designPaths: string[];
  contextPaths: string[];
}> {
  const { entries } = await getElementTree();

  const designPaths: string[] = [];
  const contextPaths: string[] = [];

  for (const { path, element } of entries) {
    if (hasFloorRepresentations(element)) {
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
