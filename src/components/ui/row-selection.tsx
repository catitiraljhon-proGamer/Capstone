"use client";

/** Optional row checkboxes; reports use them to choose which records to export. */
export type RowSelection = { selected: ReadonlySet<string>; onChange: (selected: Set<string>) => void };

const checkboxClass = "h-4 w-4 cursor-pointer accent-red-700";

export function SelectAllHeader({ ids, selection }: { ids: string[]; selection: RowSelection }) {
  const count = ids.filter((id) => selection.selected.has(id)).length;
  return <th scope="col" className="w-10 py-3 pl-4">
    <input
      type="checkbox"
      className={checkboxClass}
      aria-label="Select all rows"
      checked={count > 0 && count === ids.length}
      ref={(input) => { if (input) input.indeterminate = count > 0 && count < ids.length; }}
      onChange={(event) => selection.onChange(new Set(event.target.checked ? ids : []))}
    />
  </th>;
}

export function SelectRowCell({ id, label, selection }: { id: string; label: string; selection: RowSelection }) {
  return <td className="w-10 py-4 pl-4 align-top">
    <input
      type="checkbox"
      className={checkboxClass}
      aria-label={`Select ${label}`}
      checked={selection.selected.has(id)}
      onChange={(event) => {
        const next = new Set(selection.selected);
        if (event.target.checked) next.add(id); else next.delete(id);
        selection.onChange(next);
      }}
    />
  </td>;
}
