import { supabase } from './supabase';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL!;

async function getHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token ?? ''}`,
  };
}

async function handleResponse(res: Response, label: string) {
  if (res.ok) return res.json();
  let message = `${label} ${res.status}`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {}
  const err: any = new Error(message);
  err.status = res.status;
  throw err;
}

async function get(path: string) {
  const headers = await getHeaders();
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return handleResponse(res, `GET ${path}`);
}

async function post(path: string, body?: unknown) {
  const headers = await getHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse(res, `POST ${path}`);
}

async function patch(path: string, body: unknown) {
  const headers = await getHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  return handleResponse(res, `PATCH ${path}`);
}

async function del(path: string) {
  const headers = await getHeaders();
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE', headers });
  return handleResponse(res, `DELETE ${path}`);
}

export const api = { get, post, patch, delete: del };
