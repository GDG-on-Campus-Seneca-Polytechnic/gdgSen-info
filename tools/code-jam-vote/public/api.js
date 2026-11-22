const pollId = new URLSearchParams(location.search).get("poll");
export const id = /^[0-9a-f]{32}$/.test(pollId) ? pollId : null;

export async function api(path, { data, key, method = "GET" } = {}) {
  const headers = {};
  if (data !== undefined) headers["Content-Type"] = "application/json";
  if (key) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`/api/polls${path}`, {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.headers.get("Content-Type")?.includes("application/json")) {
    throw new Error("The server did not respond. Try again.");
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body;
}
