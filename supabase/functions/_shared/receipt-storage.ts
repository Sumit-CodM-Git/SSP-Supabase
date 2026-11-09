const BUCKET = "society-documents";

export function receiptStorageKey(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (url.origin !== new URL(Deno.env.get("SUPABASE_URL")!).origin) return null;
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/society-documents\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  }
  return raw;
}

/** A signed upload URL alone does not establish that the object exists. */
export async function receiptExists(client: any, value: string): Promise<boolean> {
  const key = receiptStorageKey(value);
  if (!key) return false;
  const slash = key.lastIndexOf("/");
  const folder = slash < 0 ? "" : key.slice(0, slash);
  const name = key.slice(slash + 1);
  const { data, error } = await client.storage.from(BUCKET).list(folder, { search: name, limit: 100 });
  if (error) throw new Error(`Receipt verification failed: ${error.message}`);
  return (data ?? []).some((file: any) => file.name === name && file.id && Number(file.metadata?.size) > 0);
}

export async function resolveReceiptImage(client: any, values: unknown[]): Promise<{
  receiptImageUrl: string | null;
  receiptUploadStatus: "uploaded" | "missing" | "not_provided" | "unverified";
}> {
  const paths = [...new Set(values.filter((value): value is string =>
    typeof value === "string" && !!value.trim()).map(value => value.trim()))];
  if (!paths.length) return { receiptImageUrl: null, receiptUploadStatus: "not_provided" };
  let fallback: string | null = null;
  for (const path of paths) {
    const url = /^https?:\/\//i.test(path) ? path
      : `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/${BUCKET}/${path}`;
    try {
      // Preserve legacy external URLs; local storage cannot verify them.
      if (!receiptStorageKey(path)) {
        fallback ??= url;
        continue;
      }
      if (await receiptExists(client, path)) return { receiptImageUrl: url, receiptUploadStatus: "uploaded" };
    } catch {
      // Storage outages must not prevent admins from retrieving bookings.
      fallback ??= url;
    }
  }
  return fallback ? { receiptImageUrl: fallback, receiptUploadStatus: "unverified" }
    : { receiptImageUrl: null, receiptUploadStatus: "missing" };
}
