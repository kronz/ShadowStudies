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
 * Determines whether an element is a "design" building (has floors).
 *
 * Checks three signals:
 * 1. graphBuilding / grossFloorAreaPolygons — native Forma buildings
 * 2. semanticMesh — buildings with tagged geometry parts (walls, floors)
 * 3. spacemakerObjectStorageReferences in properties — imported (Revit/AXM)
 *    or 3D Sketch buildings whose floor data lives in external blobs
 */
function isDesignBuilding(element: FormaElement): boolean {
  const reps = element.representations;
  if (reps?.graphBuilding || reps?.grossFloorAreaPolygons || reps?.semanticMesh) {
    return true;
  }

  const props = element.properties;
  if (props?.spacemakerObjectStorageReferences) {
    return true;
  }

  return false;
}

/**
 * Auto-classifies elements into design and context.
 *
 * Design = native floors (graphBuilding/grossFloorAreaPolygons),
 *          semantic mesh, or imported AXM models.
 * Context = everything else.
 */
export async function classifyElements(): Promise<{
  designPaths: string[];
  contextPaths: string[];
}> {
  const { entries } = await getElementTree();

  const designPaths: string[] = [];
  const contextPaths: string[] = [];

  for (const { path, element } of entries) {
    if (isDesignBuilding(element)) {
      designPaths.push(path);
    } else {
      contextPaths.push(path);
    }
  }

  console.log(
    `[element-classifier] ${designPaths.length} design, ${contextPaths.length} context`,
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
