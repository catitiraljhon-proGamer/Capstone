import {
  designOptions,
  formatPeso,
  getExteriorEstimate,
} from "@/components/ui/house-design-data";

type ProjectExteriorEstimatePanelProps = {
  design: (typeof designOptions)[number];
  selections: number[];
  onSelectionChange: (itemIndex: number, optionIndex: number) => void;
  isEditing: boolean;
  editorRole?: "Admin" | "Client";
};

export function ProjectExteriorEstimatePanel({
  design,
  selections,
  onSelectionChange,
  isEditing,
  editorRole = "Client",
}: ProjectExteriorEstimatePanelProps) {
  const { baseEstimate, exteriorRows, exteriorTotal, revisedEstimate } =
    getExteriorEstimate(design, selections);
  const optionColumnLabel =
    editorRole === "Admin" ? "Admin Material Selection" : "Selected Material";

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Cost Estimation / Material Breakdown
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
            {editorRole === "Admin"
              ? "Admin can update the selected materials for this house design. Changing selections recalculates the estimated project cost."
              : "Review the materials used for this project. Clients may request preferred changes, but material management stays with Admin."}
          </p>
        </div>
        <div className="grid gap-1 rounded-lg border border-stone-200 p-4 text-right">
          <p className="text-xs font-semibold uppercase text-stone-500">
            Revised Estimate
          </p>
          <p className="text-2xl font-semibold tracking-tight text-red-700">
            {formatPeso(revisedEstimate)}
          </p>
          <p className="text-xs text-stone-500">
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
          <p className="mt-1 font-semibold text-stone-950">{design.area} sqm</p>
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
          <thead>
            <tr className="text-left text-xs font-semibold uppercase text-stone-500">
              <th className="border-b border-stone-200 px-3 py-3">Exterior Item</th>
              <th className="border-b border-stone-200 px-3 py-3">{optionColumnLabel}</th>
              <th className="border-b border-stone-200 px-3 py-3">Unit</th>
              <th className="border-b border-stone-200 px-3 py-3 text-right">Quantity</th>
              <th className="border-b border-stone-200 px-3 py-3 text-right">Unit Price</th>
              <th className="border-b border-stone-200 px-3 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {exteriorRows.map((material, itemIndex) => (
              <tr key={material.item}>
                <td className="border-b border-stone-100 px-3 py-4">
                  <p className="font-semibold text-stone-950">{material.item}</p>
                  <p className="mt-1 text-xs text-stone-500">{material.detail}</p>
                </td>
                <td className="border-b border-stone-100 px-3 py-4">
                  {isEditing ? (
                    <select
                      value={selections[itemIndex] ?? 0}
                      onChange={(event) =>
                        onSelectionChange(itemIndex, Number(event.target.value))
                      }
                      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-600"
                      aria-label={`Change ${material.item}`}
                    >
                      {material.options.map((option, optionIndex) => (
                        <option key={option.name} value={optionIndex}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="font-medium text-stone-950">
                      {material.selectedOption.name}
                    </p>
                  )}
                </td>
                <td className="border-b border-stone-100 px-3 py-4 text-stone-600">
                  {material.selectedOption.unit}
                </td>
                <td className="border-b border-stone-100 px-3 py-4 text-right font-medium">
                  {material.quantity}
                </td>
                <td className="border-b border-stone-100 px-3 py-4 text-right">
                  {formatPeso(material.selectedOption.unitPrice)}
                </td>
                <td className="border-b border-stone-100 px-3 py-4 text-right font-semibold text-stone-950">
                  {formatPeso(material.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-900">
          {isEditing
            ? "Changing material selections updates the estimated project cost preview."
            : "The material list is shown for review. Admin controls material selection and pricing setup."}
        </div>
        <div className="rounded-lg border border-stone-200 p-4 text-right">
          <p className="text-xs font-semibold uppercase text-stone-500">
            Exterior Subtotal
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-red-700">
            {formatPeso(exteriorTotal)}
          </p>
        </div>
      </div>
    </section>
  );
}
