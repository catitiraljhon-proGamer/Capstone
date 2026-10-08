/**
 * Inline message under a form field. Give the input `aria-invalid` and
 * `aria-describedby={id}` when `message` is set so screen readers announce it.
 */
export function FieldError({ id, message }: { id: string; message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs font-medium leading-5 text-red-700">
      {message}
    </p>
  );
}
