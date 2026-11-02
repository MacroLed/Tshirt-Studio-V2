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
