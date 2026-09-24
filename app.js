/* ============================================================
   GAME NIGHT — party games for the big screen (trivia + anagrams)
   Stack: GitHub Pages + Supabase (REST + Realtime Broadcast)
   ============================================================ */

const SUPABASE_URL = "https://ukrxoqsvyvlyeblubjeo.supabase.co";
const SUPABASE_KEY = "sb_publishable_hXr3XBpmRYSDiJNiOzt6yw_DttyIY6y";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------------- question packs (2.0-ready) ----------------
   A pack is { id, name, fetchQuestions(opts) -> [{category, question,
   correct_answer, incorrect_answers[]}] }. Family packs slot in here. */
const PACKS = {
  opentdb: {
    id: "opentdb",
    name: "Open Trivia DB",
    fetchQuestions: fetchOpenTDBQuestions,
  },
  // 2.0: custom: { id: "custom", name: "Family Pack", fetchQuestions: fetchCustomPack },
};
const ACTIVE_PACK = "opentdb";

/* ---------------- state ---------------- */
let session = JSON.parse(sessionStorage.getItem("gn_session") || "null"); // {role, room_id, room_code, player_id, name}
let room = null;          // game_rooms row
let players = [];         // game_players rows
let myAnswers = [];       // this player's answers (player view)
let myWords = [];         // this player's words (player view)
let allWords = [];        // all words this round (host view)
let rtChannel = null;
let tickTimer = null;
let WORDS = null;         // Scrabble word Set, lazy-loaded
let pickedGame = "trivia";
let otdbCategories = [];

/* ---------------- helpers ---------------- */
function show(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $(id).classList.remove("hidden");
  window.scrollTo(0, 0);
}
function toast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add("hidden"), ms);
}
function saveSession() { sessionStorage.setItem("gn_session", JSON.stringify(session)); }
function api(path, opts = {}) {
  return fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      "x-room-id": session?.room_id || "",
      ...(opts.headers || {}),
    },
  });
}
async function rpc(fn, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.text()).slice(0, 160));
  return r.json();
}
function joinUrl(code) {
  return location.origin + location.pathname + "?room=" + code;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------- realtime (broadcast pings + REST refetch) ---------------- */
function connectChannel() {
  if (rtChannel) sb.removeChannel(rtChannel);
  rtChannel = sb.channel("game:" + session.room_id, { config: { broadcast: { ack: true } } });
  rtChannel
    .on("broadcast", { event: "state" }, async () => { await loadRoom(); render(); })
    .on("broadcast", { event: "players" }, async () => { await loadPlayers(); render(); })
    .on("broadcast", { event: "answers" }, async () => { if (session.role === "host") { await loadHostAnswers(); render(); } })
    .on("broadcast", { event: "words" }, async () => { await loadWords(); render(); })
    .subscribe();
}
function ping(ev) { try { rtChannel?.send({ type: "broadcast", event: ev }); } catch {} }

/* ---------------- data loaders ---------------- */
async function loadRoom() {
  const r = await api(`game_rooms?id=eq.${session.room_id}&select=*`);
  room = (await r.json())[0] || null;
}
async function loadPlayers() {
  const r = await api(`game_players?room_id=eq.${session.room_id}&select=*&order=score.desc&order=name.asc`);
  players = await r.json();
}
async function loadHostAnswers() {
  if (!room || room.game_type !== "trivia") return;
  const r = await api(`game_answers?room_id=eq.${session.room_id}&question_index=eq.${room.current_index}&select=*,game_players(name)`);
  hostAnswers = await r.json();
}
async function loadWords() {
  const r = await api(`game_words?room_id=eq.${session.room_id}&select=*,game_players(name)`);
  allWords = await r.json();
  if (session.role === "player") myWords = allWords.filter((w) => w.player_id === session.player_id);
}
let hostAnswers = [];
async function loadMyAnswer() {
  const r = await api(`game_answers?player_id=eq.${session.player_id}&question_index=eq.${room.current_index}&select=*`);
  myAnswers = await r.json();
}

/* ---------------- Open Trivia DB pack ---------------- */
async function otdbToken() {
  let t = localStorage.getItem("otdb_token");
  if (!t) {
    const r = await fetch("https://opentdb.com/api_token.php?command=request");
    t = (await r.json()).token;
    localStorage.setItem("otdb_token", t);
  }
  return t;
}
async function loadCategories() {
  try {
    const r = await fetch("https://opentdb.com/api_category.php");
    otdbCategories = (await r.json()).trivia_categories || [];
    const sel = $("selCategory");
    otdbCategories.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id; o.textContent = c.name.replace(/^Entertainment: |^Science: /, "");
      sel.appendChild(o);
    });
  } catch { /* categories optional */ }
}
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
async function fetchOpenTDBQuestions({ category, difficulty, amount }) {
  const token = await otdbToken();
  const q = new URLSearchParams({ amount: String(amount), type: "multiple", encode: "url3986", token });
  if (category) q.set("category", category);
  if (difficulty) q.set("difficulty", difficulty);
  let data = await (await fetch("https://opentdb.com/api.php?" + q)).json();
  if (data.response_code === 4) { // token empty -> reset and retry once
    await fetch(`https://opentdb.com/api_token.php?command=reset&token=${token}`);
    data = await (await fetch("https://opentdb.com/api.php?" + q)).json();
  }
  if (data.response_code !== 0 || !data.results?.length) throw new Error("No questions available for those settings — try different ones.");
  return data.results.map((r) => ({
    category: dec(r.category),
    question: dec(r.question),
    correct_answer: dec(r.correct_answer),
    incorrect_answers: r.incorrect_answers.map(dec),
  }));
}

/* ---------------- anagram helpers ---------------- */
async function loadWords_dict() {
  if (WORDS) return WORDS;
  const txt = await (await fetch("words.txt")).text();
  WORDS = new Set(txt.split(/\s+/).filter(Boolean));
  return WORDS;
}
const LETTER_BAG = "EEEEEEEEEEEEAAAAAAAAAIIIIIIIIIOOOOOOOONNNNNNRRRRRRTTTTTTLLLLSSSSUUUUDDDDGGGBBCCMMPPFFHHVVWWYYKJXQZ";
function genLetters() {
  for (let attempt = 0; attempt < 50; attempt++) {
    let s = "";
    for (let i = 0; i < 6; i++) s += LETTER_BAG[Math.floor(Math.random() * LETTER_BAG.length)];
    const vowels = (s.match(/[AEIOU]/g) || []).length;
    if (vowels >= 2 && vowels <= 4) return s;
  }
  return "AEIRST";
}
function canForm(word, letters) {
  const counts = {};
  for (const ch of letters) counts[ch] = (counts[ch] || 0) + 1;
  for (const ch of word) {
    if (!counts[ch]) return false;
    counts[ch]--;
  }
  return true;
}
const anagramPoints = (len) => ({ 3: 100, 4: 200, 5: 400, 6: 800 }[len] || 0);

/* ============================================================
   HOST FLOW
   ============================================================ */
function initHome() {
  const params = new URLSearchParams(location.search);
  const code = (params.get("room") || "").toUpperCase();
  if (code) { // player join link
    joinWithCode(code);
    return;
  }
  if (session?.role === "host" && session.room_id) { resumeHost(); return; }
  if (session?.role === "player" && session.room_id) { resumePlayer(); return; }
  show("view-home");
}

async function resumeHost() {
  await loadRoom(); await loadPlayers();
  if (!room) { session = null; saveSession(); show("view-home"); return; }
  connectChannel();
  $("roomBadge").textContent = "🏠 " + room.room_code;
  $("roomBadge").classList.remove("hidden");
  if (room.status === "lobby") renderLobby(); else renderStage();
  startTick();
}

function initSetup() {
  show("view-setup");
  document.querySelectorAll(".pick-card").forEach((c) => {
    c.onclick = () => {
      document.querySelectorAll(".pick-card").forEach((x) => x.classList.remove("selected"));
      c.classList.add("selected");
      pickedGame = c.dataset.game;
      $("triviaSettings").classList.toggle("hidden", pickedGame !== "trivia");
      $("anagramSettings").classList.toggle("hidden", pickedGame !== "anagram");
    };
  });
  if (!otdbCategories.length) loadCategories();
}

async function createRoom() {
  const errBox = $("setupError");
  errBox.classList.add("hidden");
  const settings = pickedGame === "trivia"
    ? { category: $("selCategory").value || null, difficulty: $("selDifficulty").value || null, count: parseInt($("selCount").value, 10) }
    : { seconds: parseInt($("selSeconds").value, 10) };
  $("createRoomBtn").disabled = true;
  try {
    const [res] = await rpc("create_game_room", { gtype: pickedGame, p_settings: settings, p_pack_id: ACTIVE_PACK });
    session = { role: "host", room_id: res.room_id, room_code: res.room_code };
    saveSession();
    await loadRoom(); await loadPlayers();
    connectChannel();
    $("roomBadge").textContent = "🏠 " + room.room_code;
    $("roomBadge").classList.remove("hidden");
    renderLobby();
  } catch (e) {
    errBox.textContent = "Couldn't create the room: " + (e && e.message ? e.message : String(e));
    errBox.classList.remove("hidden");
  }
  $("createRoomBtn").disabled = false;
}

function renderLobby() {
  show("view-lobby");
  $("lobbyCode").textContent = room.room_code;
  $("lobbyQr").src = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(joinUrl(room.room_code));
  $("lobbyUrl").textContent = joinUrl(room.room_code);
  $("lobbyCount").textContent = players.length;
  $("lobbyPlayers").innerHTML = players.map((p) => `<li>${esc(p.name)}</li>`).join("") || `<li style="opacity:.6">Waiting for players…</li>`;
  $("stageNextBtn").classList.add("hidden");
}

async function startGame() {
  if (!players.length) { toast("Wait for at least one player to join!"); return; }
  $("startGameBtn").disabled = true;
  try {
    if (room.game_type === "trivia") await startTrivia();
    else await startAnagram();
  } catch (e) {
    toast("Couldn't start: " + e.message);
    $("startGameBtn").disabled = false;
  }
}

async function updateRoom(patch) {
  await api(`game_rooms?id=eq.${session.room_id}`, { method: "PATCH", body: JSON.stringify(patch) });
  await loadRoom();
  ping("state");
}

/* ---------------- host: trivia ---------------- */
async function startTrivia() {
  const s = room.settings || {};
  const questions = await PACKS[room.pack_id].fetchQuestions({
    category: s.category, difficulty: s.difficulty, amount: s.count || 10,
  });
  await updateRoom({
    questions,
    status: "question",
    current_index: 0,
    round_ends_at: new Date(Date.now() + 20000).toISOString(),
  });
  renderStage();
}

async function gradeTrivia() {
  const q = room.questions[room.current_index];
  const r = await api(`game_answers?room_id=eq.${session.room_id}&question_index=eq.${room.current_index}&select=*`);
  const answers = await r.json();
  const endsAt = new Date(room.round_ends_at).getTime();
  for (const a of answers) {
    const correct = a.answer === q.correct_answer;
    const secs = Math.max(0, Math.min(20, (new Date(a.answered_at).getTime() - (endsAt - 20000)) / 1000));
    const pts = correct ? Math.max(100, 1000 - Math.floor(secs) * 40) : 0;
    await api(`game_answers?id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ is_correct: correct, points: pts }) });
    if (pts) {
      const p = players.find((x) => x.id === a.player_id);
      if (p) await api(`game_players?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify({ score: p.score + pts }) });
    }
  }
  await loadPlayers();
  hostAnswers = answers;
  await updateRoom({ status: "reveal" });
  renderStage();
}

async function nextTrivia() {
  hostAnswers = [];
  if (room.current_index + 1 >= room.questions.length) {
    await updateRoom({ status: "game_over" });
  } else {
    await updateRoom({
      current_index: room.current_index + 1,
      status: "question",
      round_ends_at: new Date(Date.now() + 20000).toISOString(),
    });
  }
  renderStage();
}

/* ---------------- host: anagram ---------------- */
async function startAnagram() {
  const s = room.settings || {};
  await loadWords_dict();
  await updateRoom({
    anagram_letters: genLetters(),
    status: "anagram_play",
    round_ends_at: new Date(Date.now() + (s.seconds || 60) * 1000).toISOString(),
  });
  await loadWords();
  renderStage();
}

/* ---------------- host: stage rendering ---------------- */
function renderStage() {
  show("view-stage");
  $("stageNextBtn").classList.add("hidden");
  $("stageEndBtn").classList.remove("hidden");
  const c = $("stageContent");
  if (room.status === "question") renderHostQuestion(c);
  else if (room.status === "reveal") renderHostReveal(c);
  else if (room.status === "anagram_play") renderHostAnagram(c);
  else if (room.status === "game_over") renderHostGameOver(c);
  startTick();
}

function renderHostQuestion(c) {
  const q = room.questions[room.current_index];
  const n = room.questions.length;
  c.innerHTML = `
    <p class="q-cat">${esc(q.category)} · ${room.current_index + 1}/${n}</p>
    <p class="q-text">${esc(q.question)}</p>
    <p class="q-meta"><span id="ansCount">${hostAnswers.length}</span> / ${players.length} answered</p>`;
  $("stageTimer").classList.remove("hidden");
}

function renderHostReveal(c) {
  const q = room.questions[room.current_index];
  const rows = [...players].sort((a, b) => b.score - a.score).map((p, i) => {
    const a = hostAnswers.find((x) => x.player_id === p.id);
    const mark = !a ? "—" : a.is_correct ? `✅ +${a.points}` : "❌";
    return `<tr class="${i === 0 ? "rank-1" : ""}"><td>${esc(p.name)}</td><td>${mark}</td><td class="pts">${p.score}</td></tr>`;
  }).join("");
  const last = room.current_index + 1 >= room.questions.length;
  c.innerHTML = `
    <div class="reveal-box">
      <p class="q-cat">Correct answer</p>
      <p class="reveal-answer">${esc(q.correct_answer)}</p>
      <table class="score-table">${rows}</table>
    </div>`;
  const nb = $("stageNextBtn");
  nb.classList.remove("hidden");
  nb.textContent = last ? "See results →" : "Next question →";
  nb.onclick = nextTrivia;
}

function renderHostAnagram(c) {
  const tiles = room.anagram_letters.split("").map((ch) => `<div class="tile">${ch}</div>`).join("");
  const board = [...players].sort((a, b) => b.score - a.score).map((p, i) => {
    const n = allWords.filter((w) => w.player_id === p.id).length;
    return `<tr class="${i === 0 ? "rank-1" : ""}"><td>${esc(p.name)} <small style="color:var(--muted)">(${n} words)</small></td><td class="pts">${p.score}</td></tr>`;
  }).join("");
  const latest = allWords.slice(-3).reverse().map((w) => `${esc(w.game_players?.name || "?")}: ${esc(w.word)}`).join(" · ");
  c.innerHTML = `
    <p class="q-cat">Make words · 3+ letters · Scrabble dictionary</p>
    <div class="letters">${tiles}</div>
    <table class="score-table">${board}</table>
    <p class="word-feed">${esc(latest)}</p>`;
  $("stageTimer").classList.remove("hidden");
}

function renderHostGameOver(c) {
  const board = [...players].sort((a, b) => b.score - a.score);
  const winner = board[0];
  const rows = board.map((p, i) => `<tr class="rank-${i + 1}"><td>${esc(p.name)}</td><td class="pts">${p.score}</td></tr>`).join("");
  c.innerHTML = `
    <p class="q-cat">Game over</p>
    <p class="winner">🏆 ${esc(winner?.name || "—")}</p>
    <table class="score-table">${rows}</table>`;
  $("stageTimer").classList.add("hidden");
  const nb = $("stageNextBtn");
  nb.classList.remove("hidden");
  nb.textContent = "← Back to lobby";
  nb.onclick = backToLobby;
  $("stageEndBtn").classList.add("hidden");
}

async function backToLobby() {
  await api(`game_answers?room_id=eq.${session.room_id}`, { method: "DELETE" });
  await api(`game_words?room_id=eq.${session.room_id}`, { method: "DELETE" });
  for (const p of players) await api(`game_players?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify({ score: 0 }) });
  await updateRoom({ status: "lobby", questions: [], current_index: 0, anagram_letters: null, round_ends_at: null });
  await loadPlayers();
  renderLobby();
}

/* host clock: drives question/anagram timers */
function startTick() {
  clearInterval(tickTimer);
  tickTimer = setInterval(async () => {
    if (!room?.round_ends_at) { $("stageTimer").classList.add("hidden"); $("playTimer").classList.add("hidden"); return; }
    const ms = new Date(room.round_ends_at).getTime() - Date.now();
    const s = Math.max(0, Math.ceil(ms / 1000));
    for (const id of ["stageTimer", "playTimer"]) {
      const el = $(id);
      if (!el.classList.contains("hidden")) {
        el.textContent = s + "s";
        el.classList.toggle("low", s <= 5);
      }
    }
    if (ms <= 0 && session.role === "host" && !tickTimer._fired) {
      tickTimer._fired = true;
      if (room.status === "question") await gradeTrivia();
      else if (room.status === "anagram_play") { await updateRoom({ status: "game_over" }); renderStage(); }
      tickTimer._fired = false;
    }
  }, 250);
}

/* ============================================================
   PLAYER FLOW
   ============================================================ */
async function joinWithCode(code) {
  code = code.trim().toUpperCase();
  if (code.length !== 4) { toast("Enter the 4-letter room code."); return; }
  try {
    const res = await rpc("join_game_room", { code });
    if (!res.length) { toast("No game found with that code."); return; }
    session = { role: "player", room_id: res[0].room_id, room_code: code };
    // returning player? rejoin silently
    const saved = JSON.parse(sessionStorage.getItem("gn_session") || "null");
    if (saved?.role === "player" && saved.room_id === session.room_id && saved.player_id) {
      session = saved; saveSession();
      resumePlayer();
      return;
    }
    saveSession();
    $("joinRoomCode").textContent = code;
    show("view-joinname");
    setTimeout(() => $("playerNameInput").focus(), 100);
  } catch { toast("Couldn't reach the game server. Check your connection."); }
}

async function joinAsPlayer() {
  const name = $("playerNameInput").value.trim().slice(0, 16);
  const err = $("joinError");
  err.classList.add("hidden");
  if (!name) { err.textContent = "Enter a name first."; err.classList.remove("hidden"); return; }
  $("playerJoinBtn").disabled = true;
  try {
    const r = await api("game_players", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ room_id: session.room_id, name }),
    });
    if (!r.ok) {
      const t = await r.text();
      err.textContent = t.includes("duplicate") || r.status === 409 ? "That name's taken — pick another." : "Couldn't join. Try again.";
      err.classList.remove("hidden");
      $("playerJoinBtn").disabled = false;
      return;
    }
    const [p] = await r.json();
    session.player_id = p.id; session.name = name; saveSession();
    connectChannel();
    ping("players");
    $("roomBadge").textContent = "🎮 " + session.room_code;
    $("roomBadge").classList.remove("hidden");
    $("meName").textContent = name;
    await loadRoom(); await loadPlayers(); await loadWords();
    render();
    // safety net: refetch room state every 3s in case a broadcast is missed
    setInterval(async () => { if (session?.role === "player") { await loadRoom(); render(); } }, 3000);
  } catch {
    err.textContent = "Couldn't join. Try again.";
    err.classList.remove("hidden");
    $("playerJoinBtn").disabled = false;
  }
}

async function resumePlayer() {
  await loadRoom(); await loadPlayers(); await loadWords();
  if (!room) { session = null; saveSession(); show("view-home"); return; }
  connectChannel();
  ping("players");
  $("roomBadge").textContent = "🎮 " + session.room_code;
  $("roomBadge").classList.remove("hidden");
  $("meName").textContent = session.name || "";
  render();
  setInterval(async () => { if (session?.role === "player") { await loadRoom(); render(); } }, 3000);
}

/* ---------------- player rendering ---------------- */
let shuffledFor = -1, shuffledAnswers = [];
function render() {
  if (session.role === "host") { room.status === "lobby" ? renderLobby() : renderStage(); return; }
  // player
  const me = players.find((p) => p.id === session.player_id);
  if (me) $("meScore").textContent = me.score;
  if (!room) return;
  show("view-play");
  const c = $("playContent");
  if (room.status === "lobby") {
    $("playTimer").classList.add("hidden");
    c.innerHTML = `<p class="locked">You're in! 🎉<br/><span style="font-size:1rem;color:var(--muted)">Waiting for the host to start…</span></p>
      <h3 style="text-align:center">Players in</h3>
      <ul class="player-list">${players.map((p) => `<li>${esc(p.name)}</li>`).join("")}</ul>`;
  } else if (room.status === "question") renderPlayerQuestion(c);
  else if (room.status === "reveal") renderPlayerReveal(c);
  else if (room.status === "anagram_play") renderPlayerAnagram(c);
  else if (room.status === "game_over") renderPlayerGameOver(c);
  startTick();
}

async function renderPlayerQuestion(c) {
  const q = room.questions[room.current_index];
  await loadMyAnswer();
  const answered = myAnswers[0];
  if (shuffledFor !== room.current_index) {
    shuffledAnswers = shuffle([q.correct_answer, ...q.incorrect_answers]);
    shuffledFor = room.current_index;
  }
  $("playTimer").classList.remove("hidden");
  if (answered) {
    c.innerHTML = `<p class="q-cat">${esc(q.category)}</p><p class="q-text" style="font-size:1.3rem">${esc(q.question)}</p>
      <p class="locked">Locked in! ✅<br/><span style="font-size:1rem;color:var(--muted)">Waiting for everyone…</span></p>`;
    return;
  }
  c.innerHTML = `<p class="q-cat">${esc(q.category)}</p><p class="q-text" style="font-size:1.3rem">${esc(q.question)}</p>
    <div class="answer-grid">${shuffledAnswers.map((a) => `<button class="answer-btn" data-a="${esc(a)}">${esc(a)}</button>`).join("")}</div>`;
  c.querySelectorAll(".answer-btn").forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      c.querySelectorAll(".answer-btn").forEach((x) => { x.disabled = true; if (x === b) x.classList.add("picked"); });
      await api("game_answers", {
        method: "POST",
        body: JSON.stringify({ room_id: session.room_id, player_id: session.player_id, question_index: room.current_index, answer: b.dataset.a }),
      });
      ping("answers");
      render();
    };
  });
}

async function renderPlayerReveal(c) {
  $("playTimer").classList.add("hidden");
  const q = room.questions[room.current_index];
  await loadMyAnswer();
  const a = myAnswers[0];
  const verdict = !a ? "You didn't answer 😅" : a.is_correct ? `✅ Correct! +${a.points}` : "❌ Not quite";
  c.innerHTML = `<div class="reveal-box">
      <p class="q-cat">Correct answer</p>
      <p class="reveal-answer" style="font-size:1.4rem">${esc(q.correct_answer)}</p>
      <p class="locked">${verdict}</p>
    </div>`;
}

function renderPlayerAnagram(c) {
  $("playTimer").classList.remove("hidden");
  const tiles = room.anagram_letters.split("").map((ch) => `<div class="tile">${ch}</div>`).join("");
  const chips = myWords.map((w) => `<span class="word-chip">${esc(w.word)}<small>+${w.points}</small></span>`).join("");
  c.innerHTML = `
    <p class="q-cat">Make words · 3+ letters</p>
    <div class="letters">${tiles}</div>
    <div class="word-row">
      <input id="wordInput" maxlength="6" placeholder="TYPE A WORD" autocomplete="off" autocapitalize="characters" spellcheck="false" />
      <button id="wordGo" class="btn primary">✓</button>
    </div>
    <div class="word-list">${chips || `<span style="color:var(--muted)">No words yet — go!</span>`}</div>`;
  const input = $("wordInput");
  input.focus();
  const submit = () => submitWord(input.value.trim().toUpperCase());
  $("wordGo").onclick = submit;
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
}

async function submitWord(word) {
  if (word.length < 3) { toast("Words must be 3+ letters."); return; }
  if (!canForm(word, room.anagram_letters)) { toast("Use only the letters shown!"); return; }
  await loadWords_dict();
  if (!WORDS.has(word)) { toast(`"${word}" isn't in the Scrabble dictionary.`); return; }
  if (myWords.some((w) => w.word === word)) { toast("You already played that one."); return; }
  const pts = anagramPoints(word.length);
  const r = await api("game_words", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ room_id: session.room_id, player_id: session.player_id, word, points: pts }),
  });
  if (!r.ok) { toast("Someone beat you to it, or try again."); return; }
  const me = players.find((p) => p.id === session.player_id);
  if (me) await api(`game_players?id=eq.${me.id}`, { method: "PATCH", body: JSON.stringify({ score: me.score + pts }) });
  await loadPlayers(); await loadWords();
  ping("words");
  render();
  toast(`+${pts} — nice!`, 1200);
}

function renderPlayerGameOver(c) {
  $("playTimer").classList.add("hidden");
  const board = [...players].sort((a, b) => b.score - a.score);
  const rank = board.findIndex((p) => p.id === session.player_id) + 1;
  const rows = board.map((p, i) =>
    `<tr class="rank-${i + 1}${p.id === session.player_id ? " me" : ""}"><td>${esc(p.name)}</td><td class="pts">${p.score}</td></tr>`).join("");
  c.innerHTML = `
    <p class="q-cat">Game over</p>
    <p class="winner" style="font-size:2rem">${rank === 1 ? "🏆 You won!" : `You placed #${rank}`}</p>
    <table class="score-table">${rows}</table>`;
}

/* ============================================================
   WIRING + INIT
   ============================================================ */
function wire() {
  $("hostBtn").onclick = initSetup;
  $("backHomeBtn").onclick = () => show("view-home");
  $("createRoomBtn").onclick = createRoom;
  $("lobbyBackBtn").onclick = () => { show("view-home"); };
  $("startGameBtn").onclick = startGame;
  $("stageEndBtn").onclick = async () => { await updateRoom({ status: "game_over" }); renderStage(); };
  const goJoin = () => joinWithCode($("joinCodeInput").value);
  $("joinGoBtn").onclick = goJoin;
  $("joinCodeInput").addEventListener("keydown", (e) => { if (e.key === "Enter") goJoin(); });
  $("joinCodeInput").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ""); });
  $("playerJoinBtn").onclick = joinAsPlayer;
  $("playerNameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") joinAsPlayer(); });
  $("leaveBtn").onclick = leaveGame;
}

async function leaveGame() {
  try {
    if (session?.player_id) {
      await api(`game_players?id=eq.${session.player_id}`, { method: "DELETE" });
      ping("players");
    }
  } catch {}
  if (rtChannel) { try { sb.removeChannel(rtChannel); } catch {} rtChannel = null; }
  session = null; saveSession();
  room = null; players = [];
  $("roomBadge").classList.add("hidden");
  history.replaceState(null, "", location.pathname);
  show("view-home");
}

document.addEventListener("DOMContentLoaded", () => { wire(); initHome(); });
