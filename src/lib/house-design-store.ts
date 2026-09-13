"use client";

import type {
  CustomExteriorItem,
  HouseDesign,
  HouseDesignCatalog,
  HouseDesignStatus,
} from "@/components/ui/house-design-data";
import { useCallback, useEffect, useState } from "react";

export type NewHouseDesignInput = Omit<
  HouseDesign,
  "id" | "createdAt" | "createdBy"
>;

const emptyCatalog: HouseDesignCatalog = {
  finishes: [],
  houseTypes: [],
  exteriorItems: [],
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "The server could not complete the request.");
  }

  return payload;
}

export function createCustomItemId(): CustomExteriorItem["id"] {
  return `custom-${crypto.randomUUID()}`;
}

/** MongoDB-backed house-design catalog shared by customer and admin screens. */
export function useHouseDesigns({ includeAll = false } = {}) {
  const [designs, setDesigns] = useState<HouseDesign[]>([]);
  const [catalog, setCatalog] = useState<HouseDesignCatalog>(emptyCatalog);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const scope = includeAll ? "all" : "published";
      const [designResponse, catalogResponse] = await Promise.all([
        fetch(`/api/house-designs?scope=${scope}`, { cache: "no-store" }),
        fetch("/api/catalog/house-designs", { cache: "no-store" }),
      ]);
      const [{ designs: nextDesigns }, nextCatalog] = await Promise.all([
        readJson<{ designs: HouseDesign[] }>(designResponse),
        readJson<HouseDesignCatalog>(catalogResponse),
      ]);

      setDesigns(nextDesigns);
      setCatalog(nextCatalog);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load house-design data.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [includeAll]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const addDesign = useCallback(async (draft: NewHouseDesignInput) => {
    try {
      const response = await fetch("/api/house-designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const { design } = await readJson<{ design: HouseDesign }>(response);
      setDesigns((current) => [design, ...current]);
      setError(null);
      return design;
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Unable to create the house design.";
      setError(message);
      throw mutationError;
    }
  }, []);

  const updateDesign = useCallback(
    async (id: string, changes: NewHouseDesignInput) => {
      try {
        const response = await fetch(`/api/house-designs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        });
        const { design } = await readJson<{ design: HouseDesign }>(response);
        setDesigns((current) =>
          current.map((item) => (item.id === id ? design : item)),
        );
        setError(null);
        return design;
      } catch (mutationError) {
        const message =
          mutationError instanceof Error
            ? mutationError.message
            : "Unable to update the house design.";
        setError(message);
        throw mutationError;
      }
    },
    [],
  );

  const setDesignStatus = useCallback(
    async (id: string, status: HouseDesignStatus) => {
      try {
        const response = await fetch(`/api/house-designs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const { design } = await readJson<{ design: HouseDesign }>(response);
        setDesigns((current) =>
          current.map((item) => (item.id === id ? design : item)),
        );
        setError(null);
        return design;
      } catch (mutationError) {
        const message =
          mutationError instanceof Error
            ? mutationError.message
            : "Unable to change the house-design status.";
        setError(message);
        throw mutationError;
      }
    },
    [],
  );

  return {
    designs,
    catalog,
    isLoading,
    error,
    reload: load,
    addDesign,
    updateDesign,
    setDesignStatus,
  };
}
