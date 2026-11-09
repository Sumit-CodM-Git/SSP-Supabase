/** undefined preserves an existing slot; null or blank explicitly clears it. */
export function normalizeParkingSlot(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") {
    throw new TypeError("parkingSlot must be text or null.");
  }
  return value.trim() || null;
}

/** Read nullable contact data without confusing it with society parking capacity. */
export function contactParkingSlot(contact: unknown): string | null {
  if (Array.isArray(contact)) return contactParkingSlot(contact[0]);
  if (!contact || typeof contact !== "object") return null;
  const row = contact as { parking_slot?: unknown; parkingSlot?: unknown };
  const value = row.parking_slot !== undefined ? row.parking_slot : row.parkingSlot;
  return typeof value === "string" ? value : null;
}
