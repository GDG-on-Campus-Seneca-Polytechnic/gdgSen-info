import { api, id } from "./api.js";

const title = document.querySelector("#title");
const status = document.querySelector("#status");
const ballot = document.querySelector("#ballot");
const projects = document.querySelector("#projects");
const results = document.querySelector("#results");
const message = document.querySelector("#message");
const submit = ballot.querySelector("button");
let phase;

function render(poll) {
  if (phase === "closed" || phase === poll.phase || (phase === "open" && poll.phase === "ready")) return;
  phase = poll.phase;
  title.textContent = poll.title;
  ballot.hidden = phase !== "open";
  results.hidden = phase !== "closed";

  if (phase === "ready") {
    status.textContent = "Voting has not opened yet. Keep this page open.";
  } else if (phase === "open") {
    status.textContent = "Choose a project and enter the code you received at check-in.";
    for (const [index, name] of poll.projects.entries()) {
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "project";
      radio.value = index;
      radio.required = true;
      const label = document.createElement("label");
      label.className = "choice";
      label.append(radio, name);
      projects.append(label);
    }
  } else {
    const ranked = poll.projects.map((name, index) => ({ name, votes: poll.results[index] }));
    ranked.sort((a, b) => b.votes - a.votes);
    const leaders = ranked.filter(project => project.votes === ranked[0].votes);
    if (ranked[0].votes === 0) {
      status.textContent = "Voting closed. No ballots were cast.";
    } else if (leaders.length > 1) {
      status.textContent = `Voting closed. Tie for first between ${leaders.map(project => project.name).join(", ")}.`;
    } else {
      status.textContent = `Voting closed. ${leaders[0].name} received the most votes.`;
    }
    for (const { name, votes } of ranked) {
      const item = document.createElement("li");
      item.textContent = `${name} · ${votes} ${votes === 1 ? "vote" : "votes"}`;
      results.append(item);
    }
  }
}

async function refresh() {
  try {
    render(await api(`/${id}`));
  } catch (error) {
    if (!phase) status.textContent = error.message;
  }
}

ballot.addEventListener("submit", async event => {
  event.preventDefault();
  submit.disabled = true;
  message.textContent = "Submitting…";
  try {
    const project = Number(new FormData(ballot).get("project") ?? NaN);
    const code = document.querySelector("#code").value;
    await api(`/${id}/vote`, { method: "POST", data: { project, code } });
    projects.disabled = true;
    document.querySelector("#code").disabled = true;
    message.textContent = "Your vote was counted.";
  } catch (error) {
    submit.disabled = false;
    message.textContent = error.message;
    refresh();
  }
});

if (id) {
  refresh();
  const timer = setInterval(() => {
    if (phase === "closed") clearInterval(timer);
    else if (!document.hidden) refresh();
  }, 3000);
} else {
  status.textContent = "Scan the QR code or open the ballot link shared by your host.";
}
