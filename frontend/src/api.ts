const BASE = import.meta.env.VITE_API_BASE_URL || "";
export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(`${BASE}/api${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || `API error (${response.status})`);
  return data as T;
}
export function download(
  filename: string,
  content: string,
  type = "application/json",
) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function csv(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((v) => {
            const s = String(v ?? "");
            return (
              '"' + s.replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"'
            );
          })
          .join(","),
      )
      .join("\r\n")
  );
}
