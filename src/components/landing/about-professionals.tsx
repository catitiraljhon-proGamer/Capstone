"use client";

import { ProfessionalPhoto, ProfessionalRoleBadge } from "@/components/landing/professional-photo";
import { FormDialog } from "@/components/ui/form-dialog";
import { professionalRoles, type Professional, type ProfessionalDesign, type ProfessionalRole } from "@/lib/professionals";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Filter = "All" | ProfessionalRole;

const filterLabels: Record<Filter, string> = {
  All: "All",
  Architect: "Architects",
  Engineer: "Engineers",
  Designer: "Designers",
  Contractor: "Contractors",
};

const designCountLabel = (count: number) => `${count} published design${count === 1 ? "" : "s"}`;

/** "PRC 0012345 · 12 years", leaving out whatever the Admin did not fill in. */
function credentials(professional: Professional) {
  return [
    professional.licenseNumber ? `PRC ${professional.licenseNumber}` : "",
    professional.yearsOfExperience === null ? "" : `${professional.yearsOfExperience} ${professional.yearsOfExperience === 1 ? "year" : "years"}`,
  ].filter(Boolean).join(" · ");
}

/** The team the Admin lists in Maintenance; each card opens the person's profile. Only professions with people get a filter. */
export function AboutProfessionals({ professionals }: { professionals: Professional[] }) {
  const [filter, setFilter] = useState<Filter>("All");
  const [openId, setOpenId] = useState<string | null>(null);

  if (!professionals.length) return null;

  const roles = professionalRoles.filter((role) => professionals.some((professional) => professional.role === role));
  const shown = filter === "All" ? professionals : professionals.filter((professional) => professional.role === filter);
  const open = professionals.find((professional) => professional.id === openId);

  return (
    <section aria-labelledby="about-professionals" className="mt-10">
      <h2 id="about-professionals" className="text-lg font-semibold tracking-tight">Our Team</h2>
      <p className="mt-1 text-sm leading-6 text-stone-600">
        The architects, engineers, designers, and contractors who design and build every G4 house.
      </p>

      {roles.length > 1 ? (
        <div role="group" aria-label="Show" className="mt-4 flex flex-wrap gap-2">
          {(["All", ...roles] as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 ${
                filter === option ? "bg-red-700 text-white" : "border border-stone-200 text-stone-600 hover:border-stone-300 hover:text-stone-950"
              }`}
            >
              {filterLabels[option]}
            </button>
          ))}
        </div>
      ) : null}

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {shown.map((professional) => {
          const details = credentials(professional);
          return (
            <li key={professional.id} className="min-w-0">
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setOpenId(professional.id)}
                className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-white text-left shadow-sm transition hover:border-stone-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              >
                <ProfessionalPhoto professional={professional} className="aspect-square w-full" initialsClassName="text-3xl sm:text-4xl" />
                <span className="flex flex-1 flex-col p-3">
                  <span><ProfessionalRoleBadge role={professional.role} /></span>
                  <span className="mt-2 break-words text-sm font-semibold text-stone-950 sm:text-base">{professional.name}</span>
                  {professional.specialization ? (
                    <span className="mt-0.5 text-xs text-stone-600 sm:text-sm">{professional.specialization}</span>
                  ) : null}
                  {details ? <span className="mt-auto pt-2 text-xs text-stone-500">{details}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {open ? <ProfessionalProfile key={open.id} professional={open} onClose={() => setOpenId(null)} /> : null}
    </section>
  );
}

function ProfessionalProfile({ professional, onClose }: { professional: Professional; onClose: () => void }) {
  const hasDesigns = professional.designCount > 0;
  const [designs, setDesigns] = useState<ProfessionalDesign[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // Design photos are large, so they load only when someone opens the profile.
  useEffect(() => {
    if (!hasDesigns) return;
    let active = true;
    fetch(`/api/public/professionals/${professional.id}/designs`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ designs: ProfessionalDesign[] }>) : Promise.reject()))
      .then((payload) => {
        if (active) setDesigns(payload.designs);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [hasDesigns, professional.id]);

  const facts = [
    professional.licenseNumber ? { label: "PRC License No.", value: professional.licenseNumber } : null,
    professional.yearsOfExperience === null
      ? null
      : { label: "Experience", value: `${professional.yearsOfExperience} ${professional.yearsOfExperience === 1 ? "year" : "years"}` },
    { label: "House Designs", value: designCountLabel(professional.designCount) },
  ].filter((fact) => fact !== null);

  return (
    <FormDialog
      title={professional.name}
      description={[professional.role, professional.specialization].filter(Boolean).join(" · ")}
      onClose={onClose}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <ProfessionalPhoto professional={professional} className="aspect-square w-40 rounded-xl sm:w-44" initialsClassName="text-4xl" />
        <div className="min-w-0 flex-1">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.label} className="rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-stone-200">
                <dt className="text-xs text-stone-500">{fact.label}</dt>
                <dd className="mt-0.5 text-sm font-semibold text-stone-950">{fact.value}</dd>
              </div>
            ))}
          </dl>
          {professional.bio ? (
            <p className="mt-4 whitespace-pre-line text-sm leading-6 text-stone-600">{professional.bio}</p>
          ) : null}
        </div>
      </div>

      {hasDesigns ? (
        <section aria-labelledby="professional-designs" className="border-t border-stone-200 pt-4">
          <h3 id="professional-designs" className="text-sm font-semibold text-stone-950">Designs by {professional.name}</h3>
          {designs ? (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {designs.map((design) => (
                <li key={design.designId} className="min-w-0">
                  <span
                    role="img"
                    aria-label={`${design.name} exterior`}
                    onContextMenu={(event) => event.preventDefault()}
                    className="block aspect-[1.42/1] rounded-lg bg-stone-100 bg-cover bg-center ring-1 ring-stone-200"
                    style={{ backgroundImage: `url(${design.image})` }}
                  />
                  <p className="mt-1.5 line-clamp-2 break-words text-xs font-medium text-stone-700">{design.name}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-stone-500">{loadFailed ? "The designs could not be loaded. Try again later." : "Loading designs…"}</p>
          )}
          <Link
            href="/login"
            className="mt-4 inline-flex items-center gap-1 rounded text-sm font-semibold text-red-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-red-600"
          >
            Sign in to request a design <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      ) : null}
    </FormDialog>
  );
}
