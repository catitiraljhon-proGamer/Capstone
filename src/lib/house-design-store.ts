"use client";

import {
  normalizeSelections,
  seedDesigns,
  type CustomExteriorItem,
  type HouseDesign,
  type HouseDesignStatus,
} from "@/components/ui/house-design-data";
import { useSyncExternalStore } from "react";

const storageKey = "g4-builders-house-designs";

export type NewHouseDesignInput = Omit<
  HouseDesign,
  "id" | "createdAt" | "createdBy"
>;

/** Shape of records written by earlier versions of this store. */
type StoredDesign = Partial<HouseDesign> & { image?: string };

function migrate(design: StoredDesign): HouseDesign {
  const images =
    Array.isArray(design.images) && design.images.length > 0
      ? design.images
      : design.image
        ? [design.image]
        : [];

  return {
    ...(design as HouseDesign),
    images,
    customItems: Array.isArray(design.customItems) ? design.customItems : [],
    defaultSelections: normalizeSelections(design.defaultSelections),
  };
}

const listeners = new Set<() => void>();
let cachedDesigns: HouseDesign[] | null = null;
let storageError: string | null = null;
let isStorageBound = false;

function readStoredDesigns(): HouseDesign[] {
  if (typeof window === "undefined") {
    return seedDesigns;
  }

  try {
    const rawDesigns = window.localStorage.getItem(storageKey);
    if (!rawDesigns) {
      return seedDesigns;
    }

    const parsed = JSON.parse(rawDesigns) as StoredDesign[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return seedDesigns;
    }

    return parsed.map(migrate);
  } catch {
    return seedDesigns;
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function bindStorageSync() {
  if (isStorageBound || typeof window === "undefined") {
    return;
  }

  isStorageBound = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) {
      return;
    }

    cachedDesigns = readStoredDesigns();
    emit();
  });
}

function subscribe(listener: () => void) {
  bindStorageSync();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Snapshot must keep a stable reference between mutations, otherwise
 * useSyncExternalStore re-renders forever.
 */
function getDesignsSnapshot(): HouseDesign[] {
  cachedDesigns ??= readStoredDesigns();
  return cachedDesigns;
}

/** Seeds render on the server and during hydration, so the markup matches. */
function getServerDesignsSnapshot(): HouseDesign[] {
  return seedDesigns;
}

function getStorageErrorSnapshot() {
  return storageError;
}

function getServerStorageErrorSnapshot() {
  return null;
}

function updateDesigns(updater: (current: HouseDesign[]) => HouseDesign[]) {
  const next = updater(getDesignsSnapshot());
  cachedDesigns = next;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    storageError = null;
  } catch {
    storageError =
      "Browser storage is full. Remove a design or upload a smaller image.";
  }

  emit();
}

function createId(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${slug || "design"}-${Date.now().toString(36)}`;
}

export function addDesign(draft: NewHouseDesignInput): HouseDesign {
  const design: HouseDesign = {
    ...draft,
    id: createId(draft.name),
    createdAt: new Date().toISOString(),
    createdBy: "Admin",
  };

  updateDesigns((current) => [design, ...current]);
  return design;
}

export function updateDesign(id: string, changes: NewHouseDesignInput) {
  updateDesigns((current) =>
    current.map((design) =>
      design.id === id ? { ...design, ...changes } : design,
    ),
  );
}

export function setDesignStatus(id: string, status: HouseDesignStatus) {
  updateDesigns((current) =>
    current.map((design) => (design.id === id ? { ...design, status } : design)),
  );
}

export function createCustomItemId(): CustomExteriorItem["id"] {
  return `custom-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/** House design catalog backed by localStorage, shared across roles and tabs. */
export function useHouseDesigns() {
  const designs = useSyncExternalStore(
    subscribe,
    getDesignsSnapshot,
    getServerDesignsSnapshot,
  );
  const error = useSyncExternalStore(
    subscribe,
    getStorageErrorSnapshot,
    getServerStorageErrorSnapshot,
  );

  return {
    designs,
    storageError: error,
    addDesign,
    updateDesign,
    setDesignStatus,
  };
}
