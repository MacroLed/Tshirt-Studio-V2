import type { Point } from './geometry';
import type { GroupPatch } from './groupTransform';
import type { DesignDocument, DesignElement, ImageElement, PlacementId, TextElement } from './schema';

/** Czyste komendy na dokumencie: zwracają nowy dokument i niczego nie modyfikują. */

export function setFabricColor(document: DesignDocument, fabricColor: string): DesignDocument {
  if (document.fabricColor.toLowerCase() === fabricColor.toLowerCase()) return document;
  return { ...document, fabricColor };
}

export function setActivePlacement(document: DesignDocument, activePlacement: PlacementId): DesignDocument {
  if (document.editor.activePlacement === activePlacement) return document;
  return { ...document, editor: { ...document.editor, activePlacement } };
}

/** Dodaje element na wierzch obszaru. */
export function addElement(document: DesignDocument, placement: PlacementId, element: DesignElement): DesignDocument {
  const { elements } = document.placements[placement];
  return {
    ...document,
    placements: { ...document.placements, [placement]: { elements: [...elements, element] } },
  };
}

function mapPlacement(
  document: DesignDocument,
  placement: PlacementId,
  change: (elements: DesignElement[]) => DesignElement[],
): DesignDocument {
  const { elements } = document.placements[placement];
  const next = change(elements);
  if (next === elements) return document;
  return { ...document, placements: { ...document.placements, [placement]: { elements: next } } };
}

/** Zmienia pola elementu. Rodzaj elementu jest stały, stąd osobne typy dla tekstu i obrazu. */
export function updateElement(
  document: DesignDocument,
  placement: PlacementId,
  elementId: string,
  patch: Partial<Omit<TextElement, 'type' | 'id'>> | Partial<Omit<ImageElement, 'type' | 'id'>>,
): DesignDocument {
  return mapPlacement(document, placement, (elements) => {
    const index = elements.findIndex((element) => element.id === elementId);
    const current = elements[index];
    if (!current) return elements;
    const entries = Object.entries(patch) as [keyof DesignElement, unknown][];
    if (entries.every(([key, value]) => current[key] === value)) return elements;
    const next = [...elements];
    next[index] = { ...current, ...patch } as DesignElement;
    return next;
  });
}

export function removeElement(document: DesignDocument, placement: PlacementId, elementId: string): DesignDocument {
  return mapPlacement(document, placement, (elements) =>
    elements.some((element) => element.id === elementId)
      ? elements.filter((element) => element.id !== elementId)
      : elements,
  );
}

export type LayerDirection = 'forward' | 'backward';

/** Przesuwa element o jedną warstwę: `forward` ku wierzchowi, `backward` ku spodowi. */
export function moveLayer(
  document: DesignDocument,
  placement: PlacementId,
  elementId: string,
  direction: LayerDirection,
): DesignDocument {
  return mapPlacement(document, placement, (elements) => {
    const index = elements.findIndex((element) => element.id === elementId);
    const target = index + (direction === 'forward' ? 1 : -1);
    const [current, neighbour] = [elements[index], elements[target]];
    if (!current || !neighbour) return elements;
    const next = [...elements];
    next[index] = neighbour;
    next[target] = current;
    return next;
  });
}

/** Ustawia pozycje kilku elementów naraz, np. podczas przeciągania grupy. */
export function moveElements(
  document: DesignDocument,
  placement: PlacementId,
  positions: ReadonlyMap<string, Point>,
): DesignDocument {
  return mapPlacement(document, placement, (elements) => {
    let changed = false;
    const next = elements.map((element) => {
      const position = positions.get(element.id);
      if (!position || (position.x === element.xMm && position.y === element.yMm)) return element;
      changed = true;
      return { ...element, xMm: position.x, yMm: position.y };
    });
    return changed ? next : elements;
  });
}

/** Nakłada wynik skalowania lub obrotu grupy; rodzaj elementu decyduje, które pola go dotyczą. */
export function patchElements(
  document: DesignDocument,
  placement: PlacementId,
  patches: ReadonlyMap<string, GroupPatch>,
): DesignDocument {
  return mapPlacement(document, placement, (elements) => {
    let changed = false;
    const next = elements.map((element) => {
      const patch = patches.get(element.id);
      if (!patch) return element;
      changed = true;
      return { ...element, ...patch } as DesignElement;
    });
    return changed ? next : elements;
  });
}

/** Kopia leży tuż nad oryginałem i jest przesunięta, żeby od razu było ją widać. */
export function duplicateElement(
  document: DesignDocument,
  placement: PlacementId,
  elementId: string,
  newId: string,
  offsetMm = 8,
): DesignDocument {
  return mapPlacement(document, placement, (elements) => {
    const index = elements.findIndex((element) => element.id === elementId);
    const current = elements[index];
    if (!current) return elements;
    const copy: DesignElement = {
      ...structuredClone(current),
      id: newId,
      xMm: current.xMm + offsetMm,
      yMm: current.yMm + offsetMm,
    };
    return [...elements.slice(0, index + 1), copy, ...elements.slice(index + 1)];
  });
}

/** Kopia wzoru produktu do edycji, z początkowym kolorem i obszarem. */
export function createWorkingCopy(original: DesignDocument, fabricColor: string): DesignDocument {
  return { ...structuredClone(original), fabricColor, editor: { activePlacement: 'front' } };
}
