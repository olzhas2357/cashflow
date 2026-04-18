export type ApiError = {
  error: string
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? ''

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = init
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  })

  if (!res.ok) {
    let body: ApiError | null = null
    try {
      body = (await res.json()) as ApiError
    } catch {
      // ignore
    }
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }

  return (await res.json()) as T
}

