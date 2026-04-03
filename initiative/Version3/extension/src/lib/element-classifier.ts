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
  designBuildingPaths: string[];
}> {
  const { entries } = await getElementTree();

  // Pass 1: find all elements with design-level representations and
  // map each building to whether it has children with those reps.
  const leafDesignPaths: string[] = [];
  const buildingPaths: string[] = [];

  for (const { path, element } of entries) {
    if (hasDesignRepresentations(element)) {
      leafDesignPaths.push(path);
    }
    if (element.properties?.category === "building") {
      buildingPaths.push(path);
    }
  }

  // Diagnostic: show tree structure to understand parent-child relationships
  console.log(
    `[classifier] ${leafDesignPaths.length} elements with design reps, sample paths:`,
    leafDesignPaths.slice(0, 5),
  );
  console.log(
    `[classifier] ${buildingPaths.length} building-category elements, sample paths:`,
    buildingPaths.slice(0, 5),
  );

  // For each building, check if it has children with design reps.
  // Also check if the building element itself has children at all —
  // buildings with children (floors/spaces) are design buildings.
  const designBuildingSet = new Set<string>();
  for (const { path, element } of entries) {
    if (element.properties?.category !== "building") continue;

    // Method 1: descendant has design representations
    const hasDesignDescendant = leafDesignPaths.some((dp) =>
      dp.startsWith(path + "/"),
    );

    // Method 2: building has children (internal structure = floors/spaces)
    const hasChildren = !!(element.children && element.children.length > 0);

    if (hasDesignDescendant || hasChildren) {
      designBuildingSet.add(path);
    }

    console.log(
      `[classifier] BUILDING ${path} → ${hasDesignDescendant || hasChildren ? "DESIGN" : "CONTEXT"}`,
      {
        hasDesignDescendant,
        hasChildren,
        childCount: element.children?.length ?? 0,
        name: element.properties?.name,
        repKeys: Object.keys(element.representations || {}),
      },
    );
  }

  // Pass 2: classify all elements
  const designPaths: string[] = [];
  const contextPaths: string[] = [];

  for (const { path, element } of entries) {
    const selfDesign = hasDesignRepresentations(element);

    if (selfDesign || designBuildingSet.has(path)) {
      designPaths.push(path);
    } else {
      contextPaths.push(path);
    }
  }

  console.log(
    `[element-classifier] ${designPaths.length} design, ${contextPaths.length} context (buildings: ${designBuildingSet.size} design, ${buildingPaths.length - designBuildingSet.size} context)`,
  );

  return { designPaths, contextPaths, designBuildingPaths: Array.from(designBuildingSet) };
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
