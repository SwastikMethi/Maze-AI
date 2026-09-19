import type { CompleteRequest, CompleteResponse, FirstResponse } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, ...init })
  if (!res.ok) throw new Error(`${url} → ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json() as Promise<T>
}

export const fetchFirst = () => request<FirstResponse>('/api/first')
export const postComplete = (body: CompleteRequest) => request<CompleteResponse>('/api/complete', { method: 'POST', body: JSON.stringify(body) })
