// Preserve transport errors even when the API returns a non-RFC7807 payload.
export const backendFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.ok) return response;
  const raw = await response.json().catch(() => ({}));
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store');
  const detail = typeof raw.detail === 'string' ? raw.detail : typeof raw.message === 'string' ? raw.message : Array.isArray(raw.message) ? raw.message.join(', ') : undefined;
  return Response.json({ ...raw, type: 'about:blank', status: response.status,
    title: response.status === 401 ? 'Session expirée. Reconnectez-vous.' : response.status === 403 ? 'Droits ou délégation insuffisants pour cette opération.' : raw.title ?? detail ?? `Erreur serveur ${response.status}`,
    detail: detail ?? (Array.isArray(raw.reasons) ? raw.reasons.join(', ') : undefined),
  }, { status: response.status, headers });
};
