import { DurableObject } from "cloudflare:workers";
import qrcode from "qrcode-generator";

const encoder = new TextEncoder();
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const idPattern = /^[0-9a-f]{32}$/;
const keyPattern = /^[0-9a-f]{64}$/;
const codePattern = /^[A-HJ-NP-Z2-9]{12}$/;
const maxCodes = 500;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function failure(status, error) {
  return { status, data: { error } };
}

async function readBody(request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return null;

  const reader = request.body?.getReader();
  if (!reader) return null;
  const bytes = new Uint8Array(32768);
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (length + value.length > bytes.length) {
      await reader.cancel();
      return null;
    }
    bytes.set(value, length);
    length += value.length;
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes.subarray(0, length)));
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function clean(value) {
  return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}

async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))).toHex();
}

function makeCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => alphabet[byte & 31]).join("");
}

function publicPoll(poll) {
  const { title, projects, phase } = poll;
  return { title, projects, phase, results: phase === "closed" ? poll.tally : null };
}

export class Poll extends DurableObject {
  create(title) {
    const store = this.ctx.storage.kv;
    if (store.get("poll")) return false;
    store.put("poll", { title, projects: [], phase: "ready", tally: [], codes: {} });
    return true;
  }

  read() {
    const poll = this.ctx.storage.kv.get("poll");
    return poll ? publicPoll(poll) : null;
  }

  // These mutations do not yield between the read and the single durable write.
  update(action, input) {
    const store = this.ctx.storage.kv;
    const poll = store.get("poll");
    if (!poll) return failure(404, "Poll not found.");

    if (action === "vote") {
      if (poll.phase !== "open") return failure(409, "Voting is not open.");
      if (input.project < 0 || input.project >= poll.projects.length) {
        return failure(400, "Choose a project on this ballot.");
      }
      if (!Object.hasOwn(poll.codes, input.hash)) return failure(403, "This code is not valid for this poll.");
      if (poll.codes[input.hash]) return failure(409, "This code already cast a ballot.");
      poll.codes[input.hash] = true;
      poll.tally[input.project] += 1;
      store.put("poll", poll);
      return { status: 200, data: { voted: true } };
    }

    if (action === "projects") {
      if (poll.phase !== "ready") return failure(409, "Voting has started. The project list is fixed.");
      poll.projects = input;
      poll.tally = input.map(() => 0);
      store.put("poll", poll);
      return { status: 200, data: publicPoll(poll) };
    }

    if (action === "codes") {
      if (poll.phase === "closed") return failure(409, "This poll has closed.");
      if (Object.keys(poll.codes).length + input.length > maxCodes) {
        return failure(409, "This poll has reached its 500-code limit.");
      }
      if (input.some(hash => Object.hasOwn(poll.codes, hash))) {
        return failure(409, "A code overlapped with an earlier batch. Generate the batch again.");
      }
      for (const hash of input) poll.codes[hash] = false;
      store.put("poll", poll);
      return { status: 200, data: {} };
    }

    const next = action === "open" ? "open" : "closed";
    if (poll.phase === next) return { status: 200, data: publicPoll(poll) };
    const expected = action === "open" ? "ready" : "open";
    if (poll.phase !== expected) return failure(409, "The poll cannot make that change.");
    if (action === "open" && (poll.projects.length < 2 || Object.keys(poll.codes).length === 0)) {
      return failure(409, "Save the projects and generate attendee codes before opening voting.");
    }
    poll.phase = next;
    store.put("poll", poll);
    return { status: 200, data: publicPoll(poll) };
  }
}

function hostAuthorized(request, key) {
  if (typeof key !== "string" || !keyPattern.test(key)) return false;
  const supplied = request.headers.get("Authorization")?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
  return Boolean(supplied && crypto.subtle.timingSafeEqual(encoder.encode(supplied), encoder.encode(key)));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/");
    const [, api, resource, id, action] = parts;
    if (api !== "api" || resource !== "polls" || parts.length > 5 || (id && !idPattern.test(id))) {
      return json({ error: "Page not found." }, 404);
    }

    if (request.method === "GET" && id && (!action || action === "qr")) {
      const poll = await env.POLLS.getByName(id).read();
      if (!poll) return json({ error: "Poll not found." }, 404);
      if (!action) return json(poll);

      const link = new URL("/", url);
      link.searchParams.set("poll", id);
      const qr = qrcode(0, "M");
      qr.addData(link.href);
      qr.make();
      return new Response(qr.createSvgTag({ cellSize: 6, margin: 24 }), {
        headers: { "Content-Type": "image/svg+xml", "X-Content-Type-Options": "nosniff" },
      });
    }

    if (request.method !== "POST" || (!id && parts.length !== 3)) {
      return json({ error: "Page not found." }, 404);
    }

    if (id && action === "vote") {
      const body = await readBody(request);
      const code = clean(body?.code).toUpperCase().replace(/[\s-]/g, "");
      if (!codePattern.test(code) || !Number.isInteger(body?.project)) {
        return json({ error: "Choose a project and enter your attendee code." }, 400);
      }
      const result = await env.POLLS.getByName(id).update("vote", {
        project: body.project,
        hash: await digest(code),
      });
      return json(result.data, result.status);
    }

    if (!hostAuthorized(request, env.POLL_HOST_KEY)) return json({ error: "Enter the host key." }, 401);

    if (!id) {
      const body = await readBody(request);
      const title = clean(body?.title);
      if (!title || title.length > 80) {
        return json({ error: "Enter a poll title up to 80 characters." }, 400);
      }
      const pollId = crypto.randomUUID().replaceAll("-", "");
      if (!await env.POLLS.getByName(pollId).create(title)) {
        return json({ error: "A poll ID overlapped. Try creating the poll again." }, 409);
      }
      return json({ id: pollId }, 201);
    }

    if (action === "projects") {
      const body = await readBody(request);
      const projects = Array.isArray(body?.projects) ? body.projects.map(clean) : [];
      if (projects.length < 2 || projects.length > 50 ||
          projects.some(name => !name || name.length > 80) ||
          new Set(projects.map(name => name.toLowerCase())).size !== projects.length) {
        return json({ error: "Enter 2 to 50 distinct project names, each up to 80 characters." }, 400);
      }
      const result = await env.POLLS.getByName(id).update("projects", projects);
      return json(result.data, result.status);
    }

    if (action === "codes") {
      const count = (await readBody(request))?.count;
      if (!Number.isInteger(count) || count < 1 || count > 150) {
        return json({ error: "Generate 1 to 150 codes at a time." }, 400);
      }
      const batch = new Set();
      while (batch.size < count) batch.add(makeCode());
      const codes = [...batch];
      const hashes = await Promise.all(codes.map(digest));
      const result = await env.POLLS.getByName(id).update("codes", hashes);
      if (result.status !== 200) return json(result.data, result.status);
      return json({ codes: codes.map(code => code.match(/.{4}/g).join("-")) });
    }

    if (action === "open" || action === "close") {
      const result = await env.POLLS.getByName(id).update(action);
      return json(result.data, result.status);
    }

    return json({ error: "Page not found." }, 404);
  },
};
