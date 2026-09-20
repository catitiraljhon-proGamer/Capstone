export const clientProfileUpdatedEvent = "g4-client-profile-updated";

export async function readClientResponse<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string; issues?: { message?: string }[] };
  if (!response.ok) {
    throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "Unable to save client information.");
  }
  return payload;
}
