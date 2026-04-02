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
 * Checks whether an element itself has design-level representations:
 * graphBuilding, grossFloorAreaPolygons, or semanticMesh.
 * These are typically found on floor-level children, not the building parent.
 */
function hasDesignRepresentations(element: FormaElement): boolean {
  const reps = element.representations;
  if (!reps) return false;
  return !!(reps.graphBuilding || reps.grossFloorAreaPolygons || reps.semanticMesh);
}

/**
 * Auto-classifies elements into design and context.
 *
 * In Forma's element tree, design representations (graphBuilding, etc.)
 * live on floor-level children, not the building element itself.
 * So we first identify which elements have design reps, then propagate
 * that status up to their parent building-category elements.
 */
export async function classifyElements(): Promise<{
  designPaths: string[];
  contextPaths: string[];
}> {
  const { entries } = await getElementTree();

  // Pass 1: find all paths with design-level representations
  const leafDesignPaths: string[] = [];
  for (const { path, element } of entries) {
    if (hasDesignRepresentations(element)) {
      leafDesignPaths.push(path);
    }
  }

  // Pass 2: for building-category elements, check if any descendant is design.
  // A building is "design" if any of its children/descendants have design reps.
  const designPaths: string[] = [];
  const contextPaths: string[] = [];

  for (const { path, element } of entries) {
    const cat = element.properties?.category;
    const selfDesign = hasDesignRepresentations(element);
    const parentOfDesign =
      cat === "building" &&
      leafDesignPaths.some((dp) => dp.startsWith(path + "/"));

    if (selfDesign || parentOfDesign) {
      designPaths.push(path);
    } else {
      contextPaths.push(path);
    }
  }

  const dBuildings = designPaths.filter((p) =>
    entries.find((e) => e.path === p)?.element.properties?.category === "building",
  ).length;
  const cBuildings = entries.filter(
    (e) =>
      e.element.properties?.category === "building" &&
      !designPaths.includes(e.path),
  ).length;
  console.log(
    `[element-classifier] ${designPaths.length} design, ${contextPaths.length} context (buildings: ${dBuildings} design, ${cBuildings} context)`,
  );

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
