import {
  formatPeso,
  getExteriorEstimate,
  type HouseDesign,
} from "@/components/ui/house-design-data";

type ProjectExteriorEstimatePanelProps = {
  design: HouseDesign;
  selections: number[];
  editorRole?: "Admin" | "Client";
};

export function ProjectExteriorEstimatePanel({
  design,
  selections,
  editorRole = "Client",
}: ProjectExteriorEstimatePanelProps) {
  const { baseEstimate, exteriorRows, exteriorTotal, revisedEstimate } =
    getExteriorEstimate(design, selections);
  const customCount = exteriorRows.filter((row) => row.isCustom).length;

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Cost Estimation / Material Breakdown
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
            {editorRole === "Admin"
              ? "Use Edit Design to change materials, add custom exterior items, or update the design details. Changes recalculate the estimated project cost."
              : "Review the materials used for this project. Clients may request preferred changes, but material management stays with Admin."}
          </p>
        </div>
        <div className="grid gap-1 rounded-lg border border-stone-200 p-4 text-right">
          <p className="text-xs font-semibold uppercase text-stone-500">
            Revised Estimate
          </p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums text-red-700">
            {formatPeso(revisedEstimate)}
          </p>
          <p className="text-xs tabular-nums text-stone-600">
            Base {formatPeso(baseEstimate)} + exterior {formatPeso(exteriorTotal)}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-stone-200 p-4">
          <p className="text-xs font-semibold uppercase text-stone-500">House Type</p>
          <p className="mt-1 font-semibold text-stone-950">{design.houseType}</p>
        </div>
        <div className="rounded-lg border border-stone-200 p-4">
          <p className="text-xs font-semibold uppercase text-stone-500">Floor Area</p>
          <p className="mt-1 font-semibold tabular-nums text-stone-950">
            {design.area} sqm
          </p>
        </div>
        <div className="rounded-lg border border-stone-200 p-4">
          <p className="text-xs font-semibold uppercase text-stone-500">Room Setup</p>
          <p className="mt-1 font-semibold text-stone-950">{design.rooms}</p>
        </div>
        <div className="rounded-lg border border-stone-200 p-4">
          <p className="text-xs font-semibold uppercase text-stone-500">Finish</p>
          <p className="mt-1 font-semibold text-stone-950">{design.finish}</p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            Exterior material breakdown for {design.name}
          </caption>
          <thead>
            <tr className="text-left text-xs font-semibold uppercase text-stone-500">
              <th scope="col" className="border-b border-stone-200 px-3 py-3">
                Exterior Item
              </th>
              <th scope="col" className="border-b border-stone-200 px-3 py-3">
                Selected Material
              </th>
              <th scope="col" className="border-b border-stone-200 px-3 py-3">
                Unit
              </th>
              <th
                scope="col"
                className="border-b border-stone-200 px-3 py-3 text-right"
              >
                Quantity
              </th>
              <th
                scope="col"
                className="border-b border-stone-200 px-3 py-3 text-right"
              >
                Unit Price
              </th>
              <th
                scope="col"
                className="border-b border-stone-200 px-3 py-3 text-right"
              >
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {exteriorRows.map((material) => (
              <tr key={material.key}>
                <td className="border-b border-stone-100 px-3 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-stone-950">{material.item}</p>
                    {material.isCustom ? (
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700">
                        Custom
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-stone-600">{material.detail}</p>
                </td>
                <td className="border-b border-stone-100 px-3 py-4">
                  <p className="font-medium text-stone-950">{material.material}</p>
                </td>
                <td className="border-b border-stone-100 px-3 py-4 text-stone-600">
                  {material.unit}
                </td>
                <td className="border-b border-stone-100 px-3 py-4 text-right font-medium tabular-nums">
                  {material.quantity}
                </td>
                <td className="border-b border-stone-100 px-3 py-4 text-right tabular-nums">
                  {formatPeso(material.unitPrice)}
                </td>
                <td className="border-b border-stone-100 px-3 py-4 text-right font-semibold tabular-nums text-stone-950">
                  {formatPeso(material.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-900">
          {customCount > 0
            ? `Includes ${customCount} custom exterior item${customCount === 1 ? "" : "s"} defined by Admin for this design.`
            : "The material list is shown for review. Admin controls material selection and pricing setup."}
        </div>
        <div className="rounded-lg border border-stone-200 p-4 text-right">
          <p className="text-xs font-semibold uppercase text-stone-500">
            Exterior Subtotal
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-red-700">
            {formatPeso(exteriorTotal)}
          </p>
        </div>
      </div>
    </section>
  );
}
