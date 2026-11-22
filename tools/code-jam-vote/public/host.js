import { api, id } from "./api.js";

const create = document.querySelector("#create");
const controls = document.querySelector("#controls");
const key = document.querySelector("#key");
const status = document.querySelector("#status");
const message = document.querySelector("#message");
const open = document.querySelector("#open");
const close = document.querySelector("#close");
const projectForm = document.querySelector("#projects");
const entries = document.querySelector("#entries");
const codeForm = document.querySelector("#codes");
const codeList = document.querySelector("#code-list");
let poll;

function render() {
  document.querySelector("#title").textContent = poll.title;
  const labels = { ready: "Ready to open", open: "Voting is open", closed: "Voting is closed" };
  status.textContent = labels[poll.phase];
  open.disabled = poll.phase !== "ready";
  close.disabled = poll.phase !== "open";
  codeForm.hidden = poll.phase === "closed";
  projectForm.hidden = poll.phase !== "ready";
}

async function run(button, action) {
  button.disabled = true;
  message.textContent = "Working…";
  try {
    message.textContent = (await action()) || "";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    if (poll) render();
  }
}

function post(path, data) {
  return api(path, { method: "POST", key: key.value.trim(), data });
}

create.addEventListener("submit", event => {
  event.preventDefault();
  run(create.querySelector("button"), async () => {
    const title = document.querySelector("#name").value;
    const created = await post("", { title });
    location.replace(`/host.html?poll=${created.id}`);
  });
});

projectForm.addEventListener("submit", event => {
  event.preventDefault();
  run(projectForm.querySelector("button"), async () => {
    const projects = entries.value.split("\n").map(line => line.trim()).filter(Boolean);
    poll = await post(`/${id}/projects`, { projects });
    entries.value = poll.projects.join("\n");
    return "Projects saved.";
  });
});

codeForm.addEventListener("submit", event => {
  event.preventDefault();
  run(codeForm.querySelector("button"), async () => {
    const count = Number(document.querySelector("#count").value);
    const { codes } = await post(`/${id}/codes`, { count });
    codeList.value += (codeList.value ? "\n" : "") + codes.join("\n");
    document.querySelector("#batch").hidden = false;
  });
});

document.querySelector("#download").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([codeList.value + "\n"], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendee-codes-${id}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

open.addEventListener("click", () => run(open, async () => {
  if (entries.value.trim() !== poll.projects.join("\n")) {
    return "Save your project list before opening voting.";
  }
  poll = await post(`/${id}/open`);
}));

close.addEventListener("click", () => {
  if (!confirm("Close this ballot and publish the tally? This cannot be undone.")) return;
  run(close, async () => {
    poll = await post(`/${id}/close`);
  });
});

if (id) {
  try {
    poll = await api(`/${id}`);
    document.querySelector("#link").href = `/?poll=${id}`;
    const qr = `/api/polls/${id}/qr`;
    document.querySelector("#qr").src = qr;
    document.querySelector("#qr-link").href = qr;
    entries.value = poll.projects.join("\n");
    controls.hidden = false;
    render();
  } catch (error) {
    status.textContent = error.message;
  }
} else {
  create.hidden = false;
}
