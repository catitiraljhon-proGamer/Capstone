import { professionalInitials, type Professional, type ProfessionalRole } from "@/lib/professionals";
import { cn } from "@/lib/utils";

const roleTint: Record<ProfessionalRole, string> = {
  Architect: "bg-rose-50 text-red-700",
  Engineer: "bg-stone-100 text-stone-600",
};

/** The person's square photo, or their initials on a tint when no photo was uploaded. Size it with `className`. */
export function ProfessionalPhoto({
  professional,
  className,
  initialsClassName = "text-2xl",
}: {
  professional: Pick<Professional, "name" | "role" | "photo">;
  className?: string;
  initialsClassName?: string;
}) {
  if (professional.photo) {
    return (
      <span
        role="img"
        aria-label={`Photo of ${professional.name}`}
        className={cn("block shrink-0 bg-stone-100 bg-cover bg-center", className)}
        style={{ backgroundImage: `url(${professional.photo})` }}
      />
    );
  }
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center font-semibold tracking-tight", roleTint[professional.role], className)}>
      <span className={initialsClassName}>{professionalInitials(professional.name)}</span>
    </span>
  );
}

/** "Architect" or "Engineer" as a small tag. */
export function ProfessionalRoleBadge({ role }: { role: ProfessionalRole }) {
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-semibold", roleTint[role])}>
      {role}
    </span>
  );
}
