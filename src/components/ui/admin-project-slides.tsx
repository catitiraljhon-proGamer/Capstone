"use client";

import { formatPeso } from "@/components/ui/house-design-data";
import { useEffect, useState } from "react";

type ProjectDto = {
  id: string;
  reference: string;
  name: string;
  customer: string;
  status: string;
  contractPrice: number;
  updatedAt: string;
};

export function AdminProjectSlides() {
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          projects?: ProjectDto[];
          error?: string;
        };
        if (!response.ok || !payload.projects) {
          throw new Error(payload.error ?? "Unable to load projects.");
        }
        return payload.projects;
      })
      .then((items) => {
        if (active) setProjects(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load projects.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Project Records</h1>
        <p className="mt-1 text-sm text-stone-600">
          Projects and contract values stored in MongoDB.
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p className="mt-5 text-sm text-stone-500">Loading project records…</p>
      ) : projects.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase text-stone-500">
              <tr>
                <th className="border-b border-stone-200 px-3 py-3">Reference</th>
                <th className="border-b border-stone-200 px-3 py-3">Project</th>
                <th className="border-b border-stone-200 px-3 py-3">Customer</th>
                <th className="border-b border-stone-200 px-3 py-3">Status</th>
                <th className="border-b border-stone-200 px-3 py-3 text-right">Contract Price</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td className="border-b border-stone-100 px-3 py-4 font-semibold">
                    {project.reference}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-4">{project.name}</td>
                  <td className="border-b border-stone-100 px-3 py-4">{project.customer}</td>
                  <td className="border-b border-stone-100 px-3 py-4">
                    <span className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                      {project.status}
                    </span>
                  </td>
                  <td className="border-b border-stone-100 px-3 py-4 text-right font-semibold">
                    {formatPeso(project.contractPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">
          No project records yet.
        </p>
      )}
    </section>
  );
}
