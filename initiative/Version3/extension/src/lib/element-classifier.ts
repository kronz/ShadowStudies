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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true if any ancestor path segment is a UUID, which indicates
 * the element was imported as part of a surrounding-buildings dataset
 * rather than created in the design proposal.
 */
function isUnderContextImport(path: string): boolean {
  const segments = path.split("/");
  for (let i = 1; i < segments.length - 1; i++) {
    if (UUID_RE.test(segments[i])) return true;
  }
  return false;
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

  // For each building, check if it should be classified as design.
  // A building is design if it has design representations, design
  // descendants, or children — OR if it lives in the proposal tree
  // (not under a UUID-keyed context import container).
  const designBuildingSet = new Set<string>();
  for (const { path, element } of entries) {
    if (element.properties?.category !== "building") continue;

    const hasDesignDescendant = leafDesignPaths.some((dp) =>
      dp.startsWith(path + "/"),
    );
    const hasChildren = !!(element.children && element.children.length > 0);
    const selfDesign = hasDesignRepresentations(element);
    const contextImport = isUnderContextImport(path);
    const proposalNative = !contextImport;

    const isDesign = hasDesignDescendant || hasChildren || selfDesign || proposalNative;

    if (isDesign) {
      designBuildingSet.add(path);
    }

    console.log(
      `[classifier] BUILDING ${path} → ${isDesign ? "DESIGN" : "CONTEXT"}`,
      {
        hasDesignDescendant,
        hasChildren,
        selfDesign,
        proposalNative,
        childCount: element.children?.length ?? 0,
        name: element.properties?.name,
        repKeys: Object.keys(element.representations || {}),
      },
    );
  }

  // Descendants of design buildings inherit design status so that
  // Forma.render.elementColors.set colors them correctly.
  const designDescendantPaths = new Set<string>();
  for (const { path } of entries) {
    for (const dbPath of designBuildingSet) {
      if (path.startsWith(dbPath + "/")) {
        designDescendantPaths.add(path);
        break;
      }
    }
  }

  // Pass 2: classify all elements
  const designPaths: string[] = [];
  const contextPaths: string[] = [];

  for (const { path, element } of entries) {
    const selfDesign = hasDesignRepresentations(element);

    if (
      selfDesign ||
      designBuildingSet.has(path) ||
      designDescendantPaths.has(path)
    ) {
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
