/* ============================================================
   GAME NIGHT — party games for the big screen (trivia + anagrams + most likely to + common threads)
   Stack: GitHub Pages + Supabase (REST + Realtime Broadcast)
   ============================================================ */

const SUPABASE_URL = "https://ukrxoqsvyvlyeblubjeo.supabase.co";
const SUPABASE_KEY = "sb_publishable_hXr3XBpmRYSDiJNiOzt6yw_DttyIY6y";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const BUILD = "1790322522"; // deploy.sh replaces this with a timestamp

// Stale-tab nudge: each deploy ships a fresh app.js?v= token, but a tab opened
// before the deploy keeps running old code. Check for a newer build once a
// minute (and when the tab becomes visible) and offer a one-tap reload.
let updateBannerShown = false;
async function checkForUpdate() {
  if (updateBannerShown || !/^\d+$/.test(String(BUILD))) return;
  try {
    const html = await (await fetch("index.html?v=" + Date.now(), { cache: "no-store" })).text();
    const m = html.match(/app\.js\?v=(\d+)/);
    if (m && m[1] !== String(BUILD)) {
      updateBannerShown = true;
      const b = document.createElement("div");
      b.id = "updateBanner";
      b.innerHTML = `🔄 New version available <button class="btn primary">Update</button>`;
      b.querySelector("button").onclick = () => location.reload();
      document.body.prepend(b);
    }
  } catch {}
}
setInterval(checkForUpdate, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkForUpdate(); });

// QR codes are drawn on-device with a tiny local library — the join URL never
// leaves the page. Falls back to a free QR image API only if the library fails.
function makeQr(url) {
  try {
    if (typeof qrcode !== "undefined") {
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      return qr.createDataURL(6, 4);
    }
  } catch {}
  return "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(url);
}

/* ---------------- music: procedural game-show audio ----------------
   Everything is synthesized live with the Web Audio API — no audio files,
   no downloads, no licensing. Starts only after the user taps something
   (browsers block sound before that). */
const Music = (() => {
  const LS = "gn_muted";
  const LS_VOL = "gn_volume";
  let ctx = null, master = null;
  let muted = false;
  try { muted = localStorage.getItem(LS) === "1"; } catch {}
  let volume = 0.5; // 0..1
  try {
    const v = parseInt(localStorage.getItem(LS_VOL), 10);
    if (v >= 0 && v <= 100) volume = v / 100;
  } catch {}
  let mode = null, step = 0, nextT = 0, timer = null, lastTickSec = -1;
  let gameStyle = "gameshow"; // gameshow | kawaii | chiptune
  try {
    const gs = localStorage.getItem("gn_music_style");
    if (["gameshow", "kawaii", "chiptune"].includes(gs)) gameStyle = gs;
  } catch {}

  const mf = (m) => 440 * Math.pow(2, (m - 69) / 12); // midi -> hz

  // Original game-show-style themes (NOT the Jeopardy melody — that's copyrighted).
  // Written bright (lead up in octave 5-6) so it's audible on phone speakers.
  // 4 bars x 16 steps of midi notes (0 = rest).
  // home: mellow music-box welcome loop for the landing page.
  const SONGS = {
    home: { bpm: 92, bassType: "triangle", bassVol: 0.4, leadType: "triangle", leadVol: 0.3,
      bass: [48,0,0,0,0,0,0,0,55,0,0,0,0,0,0,0, 45,0,0,0,0,0,0,0,52,0,0,0,0,0,0,0, 41,0,0,0,0,0,0,0,48,0,0,0,0,0,0,0, 43,0,0,0,0,0,0,0,50,0,0,0,0,0,0,0],
      lead: [72,0,0,76,0,0,79,0,0,0,84,0,79,0,0,0, 81,0,0,79,0,0,76,0,0,0,74,0,76,0,0,0, 77,0,0,81,0,0,84,0,0,0,81,0,79,0,0,0, 83,0,0,79,0,0,77,0,0,0,79,0,0,0,0,0] },
    lobby: { bpm: 120, bassType: "triangle", bassVol: 0.32, leadType: "triangle", leadVol: 0.36,
      bass: [48,0,48,0,55,0,48,0,48,0,48,0,55,0,53,0, 53,0,53,0,60,0,53,0,53,0,53,0,60,0,57,0, 55,0,55,0,62,0,55,0,55,0,55,0,62,0,59,0, 48,0,48,0,55,0,48,0,53,0,55,0,48,0,0,0],
      lead: [72,0,76,0,79,0,76,0,81,0,79,0,76,0,72,0, 77,0,81,0,84,0,81,0,79,0,81,0,77,0,74,0, 74,0,79,0,83,0,79,0,81,0,83,0,86,0,83,0, 84,0,81,0,79,0,76,0,74,0,72,0,74,0,0,0] },
    game_gameshow: { bpm: 132, bassType: "triangle", bassVol: 0.34, leadType: "triangle", leadVol: 0.4,
      bass: [45,0,45,0,45,0,52,0,45,0,45,0,45,0,52,0, 41,0,41,0,41,0,48,0,41,0,41,0,41,0,48,0, 48,0,48,0,48,0,55,0,48,0,48,0,48,0,55,0, 43,0,43,0,43,0,50,0,43,0,43,0,50,0,43,0],
      lead: [81,0,84,81,0,79,0,81,84,0,81,0,79,0,76,0, 77,0,81,77,0,84,0,81,77,0,74,0,77,0,0,0, 79,0,84,79,0,76,0,79,84,0,86,0,84,0,79,0, 83,0,79,83,0,86,0,83,79,0,77,0,79,0,74,0] },
    game_kawaii: { bpm: 140, bassType: "triangle", bassVol: 0.3, leadType: "triangle", leadVol: 0.35,
      bass: [48,0,48,0,55,0,52,0,48,0,48,0,55,0,52,0, 43,0,43,0,50,0,47,0,43,0,43,0,50,0,47,0, 45,0,45,0,52,0,48,0,45,0,45,0,52,0,48,0, 41,0,41,0,48,0,45,0,41,0,41,0,48,0,45,0],
      lead: [72,0,76,0,79,0,76,0,81,0,79,0,76,0,72,0, 74,0,79,0,83,0,79,0,81,0,79,0,74,0,71,0, 72,0,76,0,81,0,76,0,84,0,81,0,79,0,76,0, 77,0,81,0,79,0,77,0,76,0,74,0,72,0,0,0] },
    game_chiptune: { bpm: 150, bassType: "square", bassVol: 0.24, leadType: "square", leadVol: 0.3,
      bass: [45,0,57,0,45,0,57,0,45,0,57,0,60,0,57,0, 41,0,53,0,41,0,53,0,41,0,53,0,55,0,53,0, 48,0,60,0,48,0,60,0,48,0,60,0,62,0,60,0, 43,0,55,0,43,0,55,0,43,0,55,0,59,0,55,0],
      lead: [69,72,76,79,76,72,76,79,81,79,76,72,76,79,76,72, 65,69,72,77,72,69,72,77,81,77,72,69,72,77,72,69, 72,76,79,84,79,76,79,84,79,76,72,76,79,76,72,0, 67,71,74,79,74,71,79,74,83,79,74,71,79,74,71,0] },
  };
  function songFor(m) { return m === "game" ? SONGS["game_" + gameStyle] : SONGS[m]; }

  function ensure() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      applyGain();
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }
  function tone(freq, t, dur, type, vol, slideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.5), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function schedule() {
    const song = songFor(mode);
    if (!song || !ctx) return;
    // If the AudioContext got suspended (screen lock, hidden tab, iOS backgrounding),
    // its clock freezes — don't schedule into a frozen clock, just try to resume.
    if (ctx.state !== "running") { ctx.resume().catch(() => {}); return; }
    // If we fell behind (throttled tab / just resumed), snap forward instead of
    // burst-scheduling a wall of catch-up notes.
    if (nextT < ctx.currentTime - 0.3) nextT = ctx.currentTime + 0.06;
    const stepDur = 60 / song.bpm / 4;
    const bt = song.bassType || "square", lt = song.leadType || "square";
    const bv = song.bassVol ?? 0.28, lv = song.leadVol ?? 0.34;
    while (nextT < ctx.currentTime + 0.15) {
      const i = step % 64, b = song.bass[i], l = song.lead[i];
      if (b) tone(mf(b), nextT, stepDur * 0.9, bt, bv);
      if (l) tone(mf(l), nextT, stepDur * 0.9, lt, lv);
      nextT += stepDur; step++;
    }
  }
  function startLoop() {
    stopLoop();
    if (!ctx || !mode || !songFor(mode)) return;
    step = 0; nextT = ctx.currentTime + 0.06;
    timer = setInterval(schedule, 40);
  }
  function stopLoop() { if (timer) { clearInterval(timer); timer = null; } }
  function applyGain() { if (master) master.gain.value = muted ? 0 : volume * 0.5; }

  // Watchdog: if a song should be playing but the scheduler died (throttled/crashed
  // tab), restart it. Runs on its own interval so it survives scheduler starvation.
  setInterval(() => {
    try { if (mode && songFor(mode) && ctx && ctx.state === "running" && !timer) startLoop(); }
    catch {}
  }, 2000);

  return {
    unlock() { if (ensure() && mode && !timer) startLoop(); },
    setMode(m) {
      if (m === mode) return;
      mode = m;
      if (!ctx) return;
      if (mode && songFor(mode)) startLoop(); else stopLoop();
    },
    sting(name, opt) {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.01;
      if (name === "click") tone(880, t, 0.06, "square", 0.3);
      else if (name === "tile") { const f = 620 + ((opt | 0) % 8) * 80; tone(f, t, 0.09, "triangle", 0.55, f * 1.6); }
      else if (name === "pop") tone(660, t, 0.09, "square", 0.4, 990);
      else if (name === "join") { tone(523, t, 0.09, "square", 0.4); tone(784, t + 0.09, 0.12, "square", 0.4); }
      else if (name === "tick") tone(1250, t, 0.045, "square", 0.2);
      else if (name === "correct") [72, 76, 79].forEach((n, i) => tone(mf(n), t + i * 0.09, 0.14, "square", 0.45));
      else if (name === "wrong") { tone(mf(64), t, 0.16, "sawtooth", 0.32); tone(mf(60), t + 0.16, 0.28, "sawtooth", 0.32); }
      else if (name === "win") [72, 76, 79, 84].forEach((n, i) => tone(mf(n), t + i * 0.13, i === 3 ? 0.5 : 0.14, "triangle", 0.5));
    },
    tick(sec) {
      if (sec >= 1 && sec <= 5 && sec !== lastTickSec) { lastTickSec = sec; this.sting("tick"); }
      else if (sec < 1 || sec > 5) lastTickSec = -1;
    },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem(LS, muted ? "1" : "0"); } catch {}
      applyGain();
      return muted;
    },
    setVolume(v) {
      volume = Math.min(1, Math.max(0, v));
      try { localStorage.setItem(LS_VOL, String(Math.round(volume * 100))); } catch {}
      if (volume > 0 && muted) { muted = false; try { localStorage.setItem(LS, "0"); } catch {} }
      applyGain();
      return muted;
    },
    getGameStyle() { return gameStyle; },
    setGameStyle(s) {
      if (!["gameshow", "kawaii", "chiptune"].includes(s) || s === gameStyle) return gameStyle;
      gameStyle = s;
      try { localStorage.setItem("gn_music_style", s); } catch {}
      if (mode === "game" && ctx) startLoop(); // switch immediately mid-game
      return gameStyle;
    },
    getVolume() { return volume; },
    isMuted() { return muted; },
  };
})();

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
let grading = false;      // gradeTrivia re-entry guard (timer vs early-advance)
let winStungFor = null;   // room id that already got the win fanfare
let stungReveal = "";     // room:id:index already stung for correct/wrong
let WORDS = null;         // Scrabble word Set, lazy-loaded
let pickedGame = "trivia";
let otdbCategories = [];
let hostVotes = [];       // mlt_votes rows for the current round (host view)
let myVote = null;        // this player's vote for the current round
let hostGuesses = [];     // cx_guesses rows for the current puzzle (host + player views)
let cxSelected = [];      // words currently tapped on this device (player / solo)
let cxSelKey = "";        // room+index (or solo puzzle id) the selection belongs to
let cxOrder = [];         // local display order for shuffle (player / solo)
let cxStatusMsg = "";     // last wrong-guess status line, kept across re-renders (party)
let soloStatusMsg = "";   // same for solo mode

/* ---------------- most likely to: prompt deck ----------------
   Warm, funny, family-friendly — written for 2 people on a couch up to a
   small party. Shown as "Most likely to <prompt>". */
const MLT_PROMPTS = [
  "fall asleep on the couch",
  "hog the TV remote",
  "cry at a movie",
  "eat the last slice without asking",
  "be late to everything",
  "win an argument",
  "lose their phone inside their own house",
  "become a millionaire",
  "survive on a deserted island",
  "order dessert first",
  "talk to a stranger like an old friend",
  "forget why they walked into a room",
  "sing in the shower",
  "know every lyric to a song from 2008",
  "trip over absolutely nothing",
  "take 100 photos of the same sunset",
  "start a group chat and never reply",
  "finish everyone else's fries",
  "cry laughing at their own joke",
  "rewatch the same show five times",
  "give the best advice",
  "burn toast",
  "become famous",
  "fall for a scam phone call",
  "remember everyone's birthday",
  "nap through a party",
  "start dancing when no music is playing",
  "actually read the instructions first",
  "assemble furniture without instructions (and fail)",
  "bring snacks to everything",
  "get lost with the GPS on",
  "laugh at the wrong moment",
  "win at board games (and brag about it)",
  "adopt every stray animal they meet",
  "stay up all night gaming",
  "plan the entire trip",
  "sleep through their alarm",
  "quote movies nobody has seen",
  "fix anything that's broken",
  "start a business on a whim",
  "cry at a wedding (even a stranger's)",
  "eat cereal for dinner",
];

/* ---------------- helpers ---------------- */
function show(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $(id).classList.remove("hidden");
  window.scrollTo(0, 0);
}

async function showBoard() {
  show("view-board");
  const list = $("boardList");
  list.innerHTML = `<p class="hint">Loading…</p>`;
  try {
    const rows = await rpc("get_leaderboard", { p_limit: 20 });
    if (!rows.length) { list.innerHTML = `<p class="hint">No games played yet. Be the first! 🎮</p>`; return; }
    list.innerHTML = `<table class="score-table">` + rows.map((r, i) =>
      `<tr class="rank-${i + 1}"><td>${i + 1}. ${esc(r.name)}</td><td class="pts">${r.total_points} pts</td><td style="opacity:.65;font-size:.85rem">${r.games_played} game${r.games_played == 1 ? "" : "s"}</td></tr>`
    ).join("") + `</table>`;
  } catch { list.innerHTML = `<p class="hint">Couldn't load the leaderboard. Try again.</p>`; }
}
// Wipes every past game (rooms cascade to players/answers/words), clearing
// test data from the all-time leaderboard. Destructive by design: confirm().
async function resetLeaderboard() {
  if (!confirm("Reset the all-time leaderboard? This erases every past game.")) return;
  try {
    await rpc("reset_leaderboard", {});
    toast("Leaderboard cleared.");
    if (!$("view-board").classList.contains("hidden")) showBoard();
  } catch { toast("Couldn't reset the leaderboard."); }
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
let rtReady = false;
const pingQueue = [];
function connectChannel() {
  if (rtChannel) sb.removeChannel(rtChannel);
  rtReady = false;
  rtChannel = sb.channel("game:" + session.room_id, { config: { broadcast: { ack: true } } });
  rtChannel
    .on("broadcast", { event: "state" }, async () => { await loadRoom(); render(); })
    .on("broadcast", { event: "players" }, async () => { await loadPlayers(); render(); if (session.role === "host") Music.sting("join"); })
    .on("broadcast", { event: "scores" }, async () => { await loadPlayers(); render(); })
    .on("broadcast", { event: "answers" }, async () => {
      if (session.role !== "host") return;
      await loadHostAnswers(); render();
      if (room.status === "question") maybeAdvanceEarly();
    })
    .on("broadcast", { event: "words" }, async () => { await loadWords(); render(); })
    .on("broadcast", { event: "votes" }, async () => {
      if (session.role !== "host") return;
      await loadMltVotes(); render();
      if (room.status === "mlt_vote") maybeRevealMlt();
    })
    .on("broadcast", { event: "guesses" }, async () => {
      if (!room || room.game_type !== "commonthreads") return;
      await loadCxGuesses(); render();
    })
    .subscribe((status) => { rtReady = status === "SUBSCRIBED"; if (rtReady) flushPings(); });
}
// Queue pings until the channel is actually subscribed — sending on a
// not-yet-open channel silently drops the message (this was losing joins).
function ping(ev) {
  if (rtReady && rtChannel) { try { rtChannel.send({ type: "broadcast", event: ev }); return; } catch {} }
  if (pingQueue.length < 10) pingQueue.push(ev);
}
function flushPings() {
  while (pingQueue.length && rtReady && rtChannel) {
    const ev = pingQueue.shift();
    try { rtChannel.send({ type: "broadcast", event: ev }); } catch {}
  }
}
// Host lobby safety net: refetch the player list every 3s while in the lobby,
// so a lost broadcast can never leave the lobby stuck at 0.
let lobbyPoll = null;
function startLobbyPoll() {
  stopLobbyPoll();
  lobbyPoll = setInterval(async () => {
    if (session?.role !== "host" || room?.status !== "lobby") return;
    try { await loadPlayers(); renderLobby(); } catch {}
  }, 3000);
}
function stopLobbyPoll() { if (lobbyPoll) { clearInterval(lobbyPoll); lobbyPoll = null; } }

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
let revealTimer = null, revealFor = null; // auto-advance countdown state
let playerPoll = null;  // player 3s safety-net poller (fix: leaked on rejoin)
let hostBeat = null;    // host heartbeat interval (fix: host-disconnect detection)
const REVEAL_COUNTDOWN = 5;
async function loadMyAnswer() {
  const r = await api(`game_answers?player_id=eq.${session.player_id}&question_index=eq.${room.current_index}&select=*`);
  myAnswers = await r.json();
}

/* ---------------- Open Trivia DB pack ---------------- */
// OpenTDB enforces 1 request per 5s per IP (code 5 otherwise). Serialize every
// call through this queue with 5.5s spacing so parallel category fetches,
// token requests, and rapid restarts never trip the limit.
let otdbLastCall = 0, otdbQueue = Promise.resolve();
function otdbFetch(url) {
  const run = otdbQueue.then(async () => {
    const wait = Math.max(0, 5500 - (Date.now() - otdbLastCall));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    otdbLastCall = Date.now();
    return (await fetch(url)).json();
  });
  otdbQueue = run.catch(() => {}); // keep the chain alive after failures
  return run;
}
async function otdbToken() {
  let t = localStorage.getItem("otdb_token");
  if (!t) {
    const data = await otdbFetch("https://opentdb.com/api_token.php?command=request");
    t = data.token;
    localStorage.setItem("otdb_token", t);
  }
  return t;
}
let selectedCats = []; // up to 3 OpenTDB category ids; empty = all categories
async function loadCategories() {
  try {
    const data = await otdbFetch("https://opentdb.com/api_category.php");
    otdbCategories = data.trivia_categories || [];
    const box = $("catChips");
    box.innerHTML = "";
    otdbCategories.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (selectedCats.includes(c.id) ? " on" : "");
      b.dataset.cid = c.id;
      b.textContent = c.name.replace(/^Entertainment: |^Science: /, "");
      b.onclick = () => toggleCat(c.id, b);
      box.appendChild(b);
    });
  } catch { $("catChips").innerHTML = `<p class="hint">Couldn't load categories — all will be used.</p>`; }
}
function toggleCat(id, el) {
  const i = selectedCats.indexOf(id);
  if (i >= 0) { selectedCats.splice(i, 1); el.classList.remove("on"); }
  else {
    if (selectedCats.length >= 3) { toast("Up to 3 categories — tap a picked one to remove it"); return; }
    selectedCats.push(id); el.classList.add("on");
  }
  Music.sting("click");
}
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
async function fetchOpenTDBQuestions({ categories, category, difficulty, amount }) {
  // Up to 3 categories: split the request per category, fetch in parallel, interleave.
  const cats = ((categories && categories.length ? categories : (category ? [category] : []))).slice(0, 3).map(Number);
  if (cats.length <= 1) return fetchCat(cats[0] || null, difficulty, amount);
  const per = cats.map((_, i) => Math.floor(amount / cats.length) + (i < amount % cats.length ? 1 : 0));
  const lists = await Promise.all(cats.map((c, i) => fetchCat(c, difficulty, per[i]).catch(() => [])));
  const merged = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++)
    for (const l of lists) if (l[i]) merged.push(l[i]);
  if (!merged.length) throw new Error("No questions available for those settings — try different ones.");
  return shuffle(merged);
}
async function fetchCat(category, difficulty, amount) {
  const token = await otdbToken();
  const tryOnce = async (cat, diff, amt) => {
    const q = new URLSearchParams({ amount: String(amt), type: "multiple", encode: "url3986", token });
    if (cat) q.set("category", cat);
    if (diff) q.set("difficulty", diff);
    let data = await otdbFetch("https://opentdb.com/api.php?" + q);
    if (data.response_code === 4 || data.response_code === 3) { // token empty / not found -> reset and retry once
      await otdbFetch(`https://opentdb.com/api_token.php?command=reset&token=${token}`);
      data = await otdbFetch("https://opentdb.com/api.php?" + q);
    }
    return data;
  };
  let data = await tryOnce(category, difficulty, amount);
  // Graceful degradation for thin pools: code 1 = not enough questions for the
  // combo; code 3/4 persisting after a token reset = the pool is exhausted for
  // this query (OpenTDB returns 4 instead of 1 for some thin categories).
  // Fewer questions -> drop difficulty -> fewer without difficulty.
  const exhausted = () => data.response_code === 1 || data.response_code === 3 || data.response_code === 4;
  if (exhausted() && amount > 5) data = await tryOnce(category, difficulty, Math.max(5, Math.floor(amount / 2)));
  if (exhausted() && difficulty) data = await tryOnce(category, null, amount);
  if (exhausted() && (difficulty || amount > 5)) data = await tryOnce(category, null, Math.max(5, Math.floor(amount / 2)));
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
  const txt = await (await fetch(`words.txt?v=${BUILD}`)).text(); // cache-busted: dict grew to 7-8 letters
  WORDS = new Set(txt.split(/\s+/).filter(Boolean));
  return WORDS;
}
const LETTER_BAG = "EEEEEEEEEEEEAAAAAAAAAIIIIIIIIIOOOOOOOONNNNNNRRRRRRTTTTTTLLLLSSSSUUUUDDDDGGGBBCCMMPPFFHHVVWWYYKJXQZ";
// Every valid dictionary word formable from the tiles that nobody found.
let missedCacheKey = "", missedCache = null;
async function computeMissedWords() {
  const key = room ? room.id + "|" + (room.anagram_letters || "") + "|" + (room.round_ends_at || "") : "";
  if (key && key === missedCacheKey) return missedCache;
  await loadWords_dict();
  const tiles = (room && room.anagram_letters) || "";
  const minLen = anagramMinLen();
  const foundSet = new Set(allWords.map((w) => w.word));
  const missed = [...WORDS]
    .filter((w) => w.length >= minLen && !foundSet.has(w) && canForm(w, tiles))
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
  missedCacheKey = key; missedCache = missed;
  return missed;
}
const missedWordsHTML = (missed) =>
  `<h3 class="words-title">Missed words <small style="color:var(--muted)">(${missed.length})</small></h3>` +
  (missed.length
    ? `<div class="word-list missed-list">${missed.map((w) => `<span class="word-chip missed">${esc(w)}</span>`).join("")}</div>`
    : `<p class="hint" style="text-align:center">None — you found them all! 🎉</p>`);
const anagramMinLen = () => (room && room.settings && room.settings.min_len) || 3;
// "off" | "full" | "half" — legacy boolean true means "full"
const repeatMode = () => {
  const v = room && room.settings && room.settings.allow_repeats;
  if (v === true || v === "full") return "full";
  if (v === "half") return "half";
  return "off";
};
let WORDS_BY_LEN = {}; // cache of dictionary words by length
function genLetters(n) {
  // Pick a real n-letter word from the dictionary and scramble it, so there is
  // always at least one n-letter word hiding in the tiles.
  n = n || 6;
  // Rebuild if empty: a stale/partial dictionary must never poison the cache.
  if (!WORDS_BY_LEN[n] || !WORDS_BY_LEN[n].length) WORDS_BY_LEN[n] = [...WORDS].filter((w) => w.length === n);
  const pool = WORDS_BY_LEN[n].length ? WORDS_BY_LEN[n] : [...WORDS].filter((w) => w.length === 6);
  const word = pool[Math.floor(Math.random() * pool.length)];
  let arr = word.split(""), s;
  do {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    s = arr.join("");
  } while (s === word);
  return s;
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
const anagramPoints = (len) => ({ 3: 100, 4: 200, 5: 400, 6: 800, 7: 1600, 8: 3200 }[len] || 0);

/* ============================================================
   HOST FLOW
   ============================================================ */
function initHome() {
  Music.setMode("home");
  const params = new URLSearchParams(location.search);
  const code = (params.get("room") || "").toUpperCase();
  if (code) { joinWithCode(code); return; }
  // Don't force-resume an old session (that trapped users in the previous room).
  // Offer it as a choice instead, so starting/joining a new game never needs a fresh tab.
  const rb = $("resumeBox");
  if (session?.room_id && session?.room_code) {
    $("resumeHint").textContent = session.role === "host"
      ? `You were hosting room ${session.room_code}.`
      : `You were playing in room ${session.room_code}${session.name ? ` as ${session.name}` : ""}.`;
    $("resumeBtn").onclick = () => { rb.classList.add("hidden"); session.role === "host" ? resumeHost() : resumePlayer(); };
    $("resumeDiscard").onclick = () => { session = null; saveSession(); rb.classList.add("hidden"); };
    rb.classList.remove("hidden");
  } else {
    rb.classList.add("hidden");
  }
  show("view-home");
}

async function resumeHost() {
  await loadRoom(); await loadPlayers();
  if (!room) { session = null; saveSession(); show("view-home"); return; }
  connectChannel();
  $("roomBadge").textContent = "🏠 " + room.room_code;
  $("roomBadge").classList.remove("hidden");
  if (room.status === "lobby") { renderLobby(); startLobbyPoll(); } else renderStage();
  startTick();
  startHostBeat();
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
      $("mltSettings").classList.toggle("hidden", pickedGame !== "mostlikely");
      $("cxSettings").classList.toggle("hidden", pickedGame !== "commonthreads");
    };
  });
  if (!otdbCategories.length) loadCategories();
}

async function createRoom() {
  const errBox = $("setupError");
  errBox.classList.add("hidden");
  const settings = gatherSettings();
  $("createRoomBtn").disabled = true;
  try {
    const [res] = await rpc("create_game_room", { gtype: pickedGame, p_settings: settings, p_pack_id: ACTIVE_PACK });
    session = { role: "host", room_id: res.room_id, room_code: res.room_code };
    winStungFor = null;
    saveSession();
    await loadRoom(); await loadPlayers();
    connectChannel();
    $("roomBadge").textContent = "🏠 " + room.room_code;
    $("roomBadge").classList.remove("hidden");
    renderLobby();
    startLobbyPoll();
  } catch (e) {
    errBox.textContent = "Couldn't create the room: " + (e && e.message ? e.message : String(e));
    errBox.classList.remove("hidden");
  }
  $("createRoomBtn").disabled = false;
}
async function applyLobbySettings() {
  const errBox = $("setupError");
  errBox.classList.add("hidden");
  $("createRoomBtn").disabled = true;
  try {
    await updateRoom({ game_type: pickedGame, settings: gatherSettings(), pack_id: ACTIVE_PACK });
    await loadRoom();
    editingRoom = false; editingReturn = "start";
    restoreSetupLabels();
    renderLobby();
  } catch (e) {
    errBox.textContent = "Couldn't save: " + (e && e.message ? e.message : String(e));
    errBox.classList.remove("hidden");
  }
  $("createRoomBtn").disabled = false;
}

function renderLobby() {
  show("view-lobby");
  Music.setMode("lobby");
  $("lobbyCode").textContent = room.room_code;
  $("lobbyQr").src = makeQr(joinUrl(room.room_code));
  $("lobbyUrl").textContent = joinUrl(room.room_code);
  $("lobbyCount").textContent = players.length;
  $("lobbyPlayers").innerHTML = players.map((p) => `<li>${esc(p.name)}</li>`).join("") || `<li style="opacity:.6">Waiting for players…</li>`;
  $("stageNextBtn").classList.add("hidden");
  $("startGameBtn").disabled = false; // startGame() disables it; a fresh lobby is always startable
  $("startGameBtn").textContent = "Start game →";
}

let wakeLock = null;
async function holdWake() {
  try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch {}
}
function releaseWake() { try { if (wakeLock) wakeLock.release(); } catch {} wakeLock = null; }
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && session?.role === "host" && room && room.status !== "lobby" && room.status !== "game_over") holdWake();
});
async function startGame() {
  if (room.game_type === "mostlikely" && players.length < 2) {
    toast("Most Likely To needs at least 2 players!");
    return;
  }
  if (!players.length) { toast("Wait for at least one player to join!"); return; }
  stopLobbyPoll();
  Music.setMode("game");
  holdWake();
  winStungFor = null;
  startHostBeat();
  const sgb = $("startGameBtn");
  sgb.disabled = true;
  if (room.game_type === "trivia") sgb.textContent = "Loading questions…";
  try {
    if (room.game_type === "trivia") await startTrivia();
    else if (room.game_type === "anagram") await startAnagram();
    else if (room.game_type === "commonthreads") await startCx();
    else await startMlt();
  } catch (e) {
    toast("Couldn't start: " + e.message);
    sgb.disabled = false;
    sgb.textContent = "Start game →";
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
    categories: s.categories || (s.category ? [s.category] : []),
    difficulty: s.difficulty, amount: s.count || 10,
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
  if (grading) return;
  grading = true;
  try {
  const q = room.questions[room.current_index];
  const r = await api(`game_answers?room_id=eq.${session.room_id}&question_index=eq.${room.current_index}&select=*`);
  const answers = await r.json();
  const endsAt = new Date(room.round_ends_at).getTime();
  for (const a of answers) {
    const correct = a.answer === q.correct_answer;
    const secs = Math.max(0, Math.min(20, (new Date(a.answered_at).getTime() - (endsAt - 20000)) / 1000));
    const pts = correct ? Math.max(100, 1000 - Math.floor(secs) * 40) : 0;
    await api(`game_answers?id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ is_correct: correct, points: pts }) });
    a.is_correct = correct; a.points = pts; // keep local copy fresh for the reveal screen
    if (pts) {
      const p = players.find((x) => x.id === a.player_id);
      if (p) await rpc("add_score", { p_player_id: p.id, p_points: pts });
    }
  }
  await loadPlayers();
  ping("scores");
  hostAnswers = answers;
  await updateRoom({ status: "reveal" });
  renderStage();
  } finally { grading = false; }
}

// If every current player has locked in an answer, skip the rest of the timer.
async function maybeAdvanceEarly() {
  if (!room || room.game_type !== "trivia" || room.status !== "question") return;
  await loadPlayers();
  if (!players.length) return;
  const answered = new Set(hostAnswers.map((a) => a.player_id));
  if (players.every((p) => answered.has(p.id))) {
    toast("Everyone's locked in!", 1500);
    await gradeTrivia();
  }
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
    anagram_letters: genLetters(s.letters || 6),
    status: "anagram_play",
    round_ends_at: new Date(Date.now() + (s.seconds || 60) * 1000).toISOString(),
  });
  await loadWords();
  renderStage();
}

/* ---------------- host: most likely to ---------------- */
// Prompts live in game_rooms.questions (jsonb array of strings); the round
// is game_rooms.current_index. Votes go to mlt_votes via the submit_vote RPC.
async function startMlt() {
  const s = room.settings || {};
  const prompts = shuffle(MLT_PROMPTS).slice(0, Math.min(s.rounds || 10, MLT_PROMPTS.length));
  await api(`mlt_votes?room_id=eq.${session.room_id}`, { method: "DELETE" });
  await updateRoom({
    questions: prompts,
    status: "mlt_vote",
    current_index: 0,
    round_ends_at: null,
    anagram_letters: null,
  });
  await loadMltVotes();
  renderStage();
}

async function nextMlt() {
  hostVotes = [];
  if (room.current_index + 1 >= room.questions.length) {
    await updateRoom({ status: "game_over" });
  } else {
    await updateRoom({ current_index: room.current_index + 1, status: "mlt_vote", round_ends_at: null });
    await loadMltVotes();
  }
  renderStage();
}

// The grade_mlt RPC tallies + scores atomically server-side (advisory lock per
// room), so a manual reveal racing the auto-reveal can't double-award.
let gradingMlt = false;
async function gradeMlt() {
  if (gradingMlt) return;
  gradingMlt = true;
  try {
    const [res] = await rpc("grade_mlt", { p_room: session.room_id });
    if (res && res.graded) {
      await loadRoom(); await loadPlayers(); await loadMltVotes();
      ping("scores"); ping("state");
      renderStage();
    }
  } finally { gradingMlt = false; }
}

// If every current player has voted, skip the wait — same early-advance
// courtesy the trivia mode has.
async function maybeRevealMlt() {
  if (!room || room.game_type !== "mostlikely" || room.status !== "mlt_vote") return;
  await loadPlayers();
  if (!players.length) return;
  const voted = new Set(hostVotes.map((v) => v.player_id));
  if (players.every((p) => voted.has(p.id))) {
    toast("Everyone's voted! 🗳️", 1500);
    setTimeout(() => gradeMlt(), 1200);
  }
}

async function loadMltVotes() {
  const r = await api(`mlt_votes?room_id=eq.${session.room_id}&prompt_index=eq.${room.current_index}&select=*`);
  hostVotes = await r.json();
  if (session.role === "player") myVote = hostVotes.find((v) => v.player_id === session.player_id) || null;
}

/* ---------------- host: stage rendering ---------------- */
function renderStage() {
  show("view-stage");
  Music.setMode("game"); // no-op when already playing; recovers a desynced host
  $("stageNextBtn").classList.add("hidden");
  const eb = $("stageEndBtn");
  eb.classList.remove("hidden");
  eb.textContent = "End game";
  eb.onclick = async () => { clearInterval(revealTimer); revealTimer = null; await updateRoom({ status: "game_over" }); renderStage(); };
  const c = $("stageContent");
  if (room.status === "question") renderHostQuestion(c);
  else if (room.status === "reveal") renderHostReveal(c);
  else if (room.status === "anagram_play") renderHostAnagram(c);
  else if (room.status === "mlt_vote") renderHostMltVote(c);
  else if (room.status === "mlt_reveal") renderHostMltReveal(c);
  else if (room.status === "cx_play") renderHostCx(c);
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
    const txt = a && a.answer ? `<div class="ans-pick">${esc(a.answer)}</div>` : "";
    return `<tr class="${i === 0 ? "rank-1" : ""}"><td>${esc(p.name)}${txt}</td><td>${mark}</td><td class="pts">${p.score}</td></tr>`;
  }).join("");
  const last = room.current_index + 1 >= room.questions.length;
  c.innerHTML = `
    <div class="reveal-box">
      <p class="q-cat">Correct answer</p>
      <p class="reveal-answer">${esc(q.correct_answer)}</p>
      <table class="score-table">${rows}</table>
      <p class="reveal-count" id="revealCount"></p>
    </div>`;
  const nb = $("stageNextBtn");
  nb.classList.remove("hidden");
  nb.textContent = last ? "See results →" : "Next question →";
  nb.onclick = () => { clearInterval(revealTimer); revealTimer = null; nextTrivia(); };
  // Auto-advance after a countdown (one countdown per question; manual Next cancels it).
  // Hosts can disable this with the "Auto-advance after reveal" toggle in settings.
  const rk = room.id + ":" + (room.round_ends_at || "") + ":" + room.current_index;
  if (room.settings?.auto_advance !== false && revealFor !== rk) {
    revealFor = rk;
    clearInterval(revealTimer);
    let s = REVEAL_COUNTDOWN;
    // Re-query #revealCount every tick: a re-render (e.g. from a scores
    // broadcast) detaches the old node, freezing the visible countdown.
    const show = () => { const el = $("revealCount"); if (el) el.textContent = last ? `Results in ${s}…` : `Next question in ${s}…`; };
    const advance = async () => {
      try { await nextTrivia(); }
      catch (e) { revealFor = null; setTimeout(() => renderHostReveal(c), 2000); } // retry on failure
    };
    show(); Music.tick(s);
    revealTimer = setInterval(() => {
      s--;
      if (s <= 0) { clearInterval(revealTimer); revealTimer = null; advance(); return; }
      show(); Music.tick(s);
    }, 1000);
  }
}

function renderHostAnagram(c) {
  const letters = room.anagram_letters.split("");
  const rowsCls = letters.length === 8 ? "letters rows-4" : "letters";
  const tiles = letters.map((ch) => `<div class="tile">${ch}</div>`).join("");
  const board = [...players].sort((a, b) => b.score - a.score).map((p, i) => {
    const n = allWords.filter((w) => w.player_id === p.id).length;
    return `<tr class="${i === 0 ? "rank-1" : ""}"><td>${esc(p.name)} <small style="color:var(--muted)">(${n} words)</small></td><td class="pts">${p.score}</td></tr>`;
  }).join("");
  // NOTE: words themselves stay hidden during the round — showing them would
  // give answers away to everyone watching the host screen. Full breakdown
  // appears on the game-over screen instead.
  c.innerHTML = `
    <p class="q-cat">Make words · ${anagramMinLen()}+ letters</p>
    <div class="${rowsCls}">${tiles}</div>
    <table class="score-table">${board}</table>
    <p class="word-feed">${allWords.length} word${allWords.length === 1 ? "" : "s"} found so far…</p>`;
  $("stageTimer").classList.remove("hidden");
}

function renderHostMltVote(c) {
  const prompt = room.questions[room.current_index];
  const n = room.questions.length;
  const voted = new Set(hostVotes.map((v) => v.player_id));
  const is2p = players.length === 2;
  c.innerHTML = `
    <p class="q-cat">${is2p ? "Mind meld 🧠" : "Most likely to"} · ${room.current_index + 1}/${n}</p>
    <p class="q-text">${esc(prompt)}</p>
    <p class="q-meta">${voted.size} / ${players.length} voted</p>
    ${is2p ? `<p class="hint" style="text-align:center">Both players pick the same person to score 🧠</p>` : ""}
    <div class="row center"><button id="mltRevealBtn" class="btn primary big">Reveal →</button></div>`;
  $("stageTimer").classList.add("hidden");
  $("mltRevealBtn").onclick = () => gradeMlt();
}

function renderHostMltReveal(c) {
  const prompt = room.questions[room.current_index];
  const last = room.current_index + 1 >= room.questions.length;
  const is2p = players.length === 2;
  const tally = {};
  hostVotes.forEach((v) => { tally[v.target_id] = (tally[v.target_id] || 0) + 1; });
  const max = Math.max(0, ...Object.values(tally));
  // 2-player "mind meld": both votes on the same person = both score.
  // Crowns only make sense in the classic 3+ player vote.
  const melded = is2p && hostVotes.length === 2 && new Set(hostVotes.map((v) => v.target_id)).size === 1;
  const rows = [...players]
    .sort((a, b) => (tally[b.id] || 0) - (tally[a.id] || 0))
    .map((p) => {
      const votes = tally[p.id] || 0;
      const crown = !is2p && votes === max && max > 0;
      const bar = votes ? "🟣".repeat(Math.min(votes, 12)) : "—";
      return `<tr class="${crown ? "rank-1" : ""}"><td>${crown ? "👑 " : ""}${esc(p.name)}</td><td>${bar} ${votes}</td><td class="pts">${p.score}</td></tr>`;
    }).join("");
  const banner = is2p
    ? `<p class="locked">${melded ? "🧠 Mind meld! +100 for both" : hostVotes.length ? "Split decision — no points 😅" : "No votes this round 😅"}</p>`
    : "";
  c.innerHTML = `
    <div class="reveal-box">
      <p class="q-cat">Most likely to…</p>
      <p class="reveal-answer" style="font-size:1.4rem">${esc(prompt)}</p>
      ${banner}
      <table class="score-table">${rows}</table>
    </div>`;
  $("stageTimer").classList.add("hidden");
  const nb = $("stageNextBtn");
  nb.classList.remove("hidden");
  nb.textContent = last ? "See results →" : "Next →";
  nb.onclick = () => nextMlt();
}

// Standard competition ranking: tied scores share a rank and the next rank
// skips accordingly (e.g. scores 300, 300, 100 -> ranks 1, 1, 3).
function compRank(board, p) { return 1 + board.filter((q) => q.score > p.score).length; }

async function renderHostGameOver(c) {
  Music.setMode(null);
  releaseWake();
  if (winStungFor !== room.id) { winStungFor = room.id; Music.sting("win"); }
  const board = [...players].sort((a, b) => b.score - a.score);
  const winner = board[0];
  const rows = board.map((p) => `<tr class="rank-${compRank(board, p)}"><td>${esc(p.name)}</td><td class="pts">${p.score}</td></tr>`).join("");
  let wordsHTML = "";
  if (room.game_type === "anagram") {
    await loadWords(); // fresh snapshot for the breakdown
    const groups = board.map((p) => {
      const ws = allWords.filter((w) => w.player_id === p.id);
      if (!ws.length) return "";
      const chips = ws.map((w) => `<span class="word-chip">${esc(w.word)}<small>+${w.points}</small></span>`).join("");
      return `<div class="words-group"><p class="words-name">${esc(p.name)} <small style="color:var(--muted)">(${ws.length})</small></p><div class="word-list">${chips}</div></div>`;
    }).join("");
    wordsHTML = `<h3 class="words-title">Words found</h3>${groups || `<p class="hint" style="text-align:center">No words this time.</p>`}` + missedWordsHTML(await computeMissedWords());
  }
  if (room.game_type === "commonthreads") {
    const r = await api(`cx_guesses?room_id=eq.${session.room_id}&correct=eq.true&select=player_id,tier,puzzle_index&order=puzzle_index.asc,created_at.asc`);
    const gs = await r.json();
    const byP = {};
    gs.forEach((g) => { (byP[g.player_id] = byP[g.player_id] || []).push(g); });
    const groups = board.map((p) => {
      const list = byP[p.id] || [];
      if (!list.length) return "";
      const perPuz = {};
      list.forEach((g) => { (perPuz[g.puzzle_index] = perPuz[g.puzzle_index] || []).push(CX_TIER_EMOJI[g.tier]); });
      const lines = Object.keys(perPuz).sort((a, b) => a - b)
        .map((qi) => `<div><small style="color:var(--muted)">Puzzle ${Number(qi) + 1}</small> <span style="font-size:1.1rem">${perPuz[qi].join("")}</span></div>`).join("");
      return `<div class="words-group"><p class="words-name">${esc(p.name)} <small style="color:var(--muted)">(${list.length})</small></p>${lines}</div>`;
    }).join("");
    wordsHTML = `<h3 class="words-title">Groups solved</h3>${groups || `<p class="hint" style="text-align:center">No groups solved this time.</p>`}`;
  }
  c.innerHTML = `
    <p class="q-cat">Game over</p>
    <p class="winner">🏆 ${esc(winner?.name || "—")}</p>
    <table class="score-table">${rows}</table>
    ${wordsHTML}`;
  $("stageTimer").classList.add("hidden");
  const nb = $("stageNextBtn");
  nb.classList.remove("hidden");
  nb.textContent = "🔁 Play again";
  nb.onclick = openRematchSettings;
  const eb = $("stageEndBtn");
  eb.classList.remove("hidden");
  eb.textContent = "← Back to lobby";
  eb.onclick = backToLobby;
}

async function backToLobby() {
  await api(`game_answers?room_id=eq.${session.room_id}`, { method: "DELETE" });
  await api(`game_words?room_id=eq.${session.room_id}`, { method: "DELETE" });
  await api(`mlt_votes?room_id=eq.${session.room_id}`, { method: "DELETE" });
  await api(`cx_guesses?room_id=eq.${session.room_id}`, { method: "DELETE" });
  for (const p of players) await api(`game_players?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify({ score: 0 }) });
  await updateRoom({ status: "lobby", questions: [], current_index: 0, anagram_letters: null, round_ends_at: null });
  await loadPlayers();
  renderLobby();
}

let editingRoom = false; // setup view is editing settings for an existing room (rematch/lobby)
let editingReturn = "start"; // "start" = rematch flow, "lobby" = tweak settings from lobby
function prefillSetupFromRoom() {
  const s = room.settings || {};
  pickedGame = room.game_type || "trivia";
  document.querySelectorAll(".pick-card").forEach((x) => x.classList.toggle("selected", x.dataset.game === pickedGame));
  $("triviaSettings").classList.toggle("hidden", pickedGame !== "trivia");
  $("anagramSettings").classList.toggle("hidden", pickedGame !== "anagram");
  $("mltSettings").classList.toggle("hidden", pickedGame !== "mostlikely");
  $("cxSettings").classList.toggle("hidden", pickedGame !== "commonthreads");
  if (pickedGame === "trivia") {
    selectedCats = [...(s.categories || [])];
    if (!otdbCategories.length) loadCategories();
    document.querySelectorAll("#catChips .chip").forEach((chip) =>
      chip.classList.toggle("on", selectedCats.includes(Number(chip.dataset.cid))));
    $("selDifficulty").value = s.difficulty || "";
    $("selCount").value = String(s.count || 10);
    $("chkAutoAdvance").checked = s.auto_advance !== false;
  } else if (pickedGame === "mostlikely") {
    $("selRounds").value = String(s.rounds || 10);
  } else if (pickedGame === "commonthreads") {
    $("selCxRounds").value = String(s.rounds || 5);
  } else {
    $("selSeconds").value = String(s.seconds || 60);
    $("selLetters").value = String(s.letters || 6);
    $("selMinLen").value = String(s.min_len || 3);
    const ar = s.allow_repeats;
    $("selRepeats").value = (ar === true || ar === "full") ? "full" : ar === "half" ? "half" : "off";
  }
}
function restoreSetupLabels() {
  $("setupTitle").textContent = "Host a game";
  $("createRoomBtn").textContent = "Create room →";
}
function openRematchSettings() {
  editingRoom = true; editingReturn = "start";
  prefillSetupFromRoom();
  $("setupTitle").textContent = "Rematch settings";
  $("createRoomBtn").textContent = "Start game →";
  show("view-setup");
}
function openLobbySettings() {
  editingRoom = true; editingReturn = "lobby";
  prefillSetupFromRoom();
  $("setupTitle").textContent = "Game settings";
  $("createRoomBtn").textContent = "Save →";
  show("view-setup");
}
function cancelRematchEdit() {
  editingRoom = false;
  const ret = editingReturn; editingReturn = "start";
  restoreSetupLabels();
  if (ret === "lobby") renderLobby(); else renderStage();
}
function gatherSettings() {
  if (pickedGame === "trivia")
    return { categories: [...selectedCats], difficulty: $("selDifficulty").value || null, count: parseInt($("selCount").value, 10), auto_advance: $("chkAutoAdvance").checked };
  if (pickedGame === "mostlikely")
    return { rounds: parseInt($("selRounds").value, 10) };
  if (pickedGame === "commonthreads")
    return { rounds: parseInt($("selCxRounds").value, 10) };
  return { seconds: parseInt($("selSeconds").value, 10), letters: parseInt($("selLetters").value, 10), min_len: parseInt($("selMinLen").value, 10), allow_repeats: $("selRepeats").value };
}
async function startRematch() {
  const errBox = $("setupError");
  errBox.classList.add("hidden");
  $("createRoomBtn").disabled = true;
  try {
    await api(`game_answers?room_id=eq.${session.room_id}`, { method: "DELETE" });
    await api(`game_words?room_id=eq.${session.room_id}`, { method: "DELETE" });
    await api(`mlt_votes?room_id=eq.${session.room_id}`, { method: "DELETE" });
    await api(`cx_guesses?room_id=eq.${session.room_id}`, { method: "DELETE" });
    for (const p of players) await api(`game_players?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify({ score: 0 }) });
    await loadPlayers();
    await updateRoom({ game_type: pickedGame, settings: gatherSettings(), questions: [], current_index: 0, anagram_letters: null, round_ends_at: null });
    editingRoom = false; editingReturn = "start";
    restoreSetupLabels();
    await startGame();
  } catch (e) {
    errBox.textContent = "Couldn't start: " + (e && e.message ? e.message : String(e));
    errBox.classList.remove("hidden");
  }
  $("createRoomBtn").disabled = false;
}

/* host clock: drives question/anagram timers */
function startTick() {
  clearInterval(tickTimer);
  tickTimer = setInterval(async () => {
    if (!room?.round_ends_at) { $("stageTimer").classList.add("hidden"); $("playTimer").classList.add("hidden"); return; }
    const ms = new Date(room.round_ends_at).getTime() - Date.now();
    const s = Math.max(0, Math.ceil(ms / 1000));
    Music.tick(s);
    for (const id of ["stageTimer", "playTimer"]) {
      const el = $(id);
      if (!el.classList.contains("hidden")) {
        el.textContent = s + "s";
        el.classList.toggle("low", s <= 5);
      }
    }
    // Double-fire is already prevented by the `grading` re-entry guard plus the
    // status transitions below (gradeTrivia flips status to "reveal", the
    // anagram branch flips to "game_over").
    if (ms <= 0 && session.role === "host") {
      if (room.status === "question") await gradeTrivia();
      else if (room.status === "anagram_play") { await updateRoom({ status: "game_over" }); renderStage(); }
    }
  }, 250);
}

/* ---------------- host disconnect detection ---------------- */
// The host beats host_seen_at every 5s while a game is live. If a player's
// poll sees it go stale, the host tab died (closed / slept / lost network).
// Recovery is deliberately manual: the overlay tells players to reopen the
// host tab, whose resume path self-heals. (A player-side "take over" was
// rejected: two live hosts could both run gradeTrivia and double-award.)
function beatHost() {
  if (session?.role !== "host" || !room || room.status === "lobby" || room.status === "game_over") return;
  // Fire-and-forget: no ping(), so this never triggers a re-render churn.
  api(`game_rooms?id=eq.${session.room_id}`, { method: "PATCH", body: JSON.stringify({ host_seen_at: new Date().toISOString() }) }).catch(() => {});
}
function startHostBeat() {
  beatHost();
  clearInterval(hostBeat);
  hostBeat = setInterval(beatHost, 5000);
}
function checkHostAlive() {
  const overlay = $("hostLostOverlay");
  if (!overlay) return;
  const active = room && ["question", "reveal", "anagram_play", "mlt_vote", "mlt_reveal"].includes(room.status);
  const stale = active && room.host_seen_at && (Date.now() - new Date(room.host_seen_at).getTime() > 10000);
  overlay.classList.toggle("hidden", !stale);
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
    $("joinCodeInput").value = ""; // don't leave the old code sitting in the field
    try {
      const prevName = localStorage.getItem("gn_player_name") || "";
      if (prevName) $("playerNameInput").value = prevName;
    } catch {}
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
    try { localStorage.setItem("gn_player_name", name); } catch {}
    connectChannel();
    ping("players");
    $("roomBadge").textContent = "🎮 " + session.room_code;
    $("roomBadge").classList.remove("hidden");
    $("meName").textContent = name;
    await loadRoom(); await loadPlayers(); await loadWords();
    render();
    // safety net: refetch room state every 3s in case a broadcast is missed
    clearInterval(playerPoll);
    playerPoll = setInterval(async () => { if (session?.role === "player") { await loadRoom(); await loadPlayers(); checkHostAlive(); render(); } }, 3000);
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
  clearInterval(playerPoll);
  playerPoll = setInterval(async () => { if (session?.role === "player") { await loadRoom(); await loadPlayers(); checkHostAlive(); render(); } }, 3000);
}

/* ---------------- player rendering ---------------- */
let shuffledFor = -1, shuffledAnswers = [];
let ansScale = 1;
try { const v = parseFloat(localStorage.getItem("gn_ans_scale")); if (v >= 0.8 && v <= 1.6) ansScale = v; } catch {}
function applyAnsScale() { document.documentElement.style.setProperty("--ans-scale", ansScale); }
function bumpAnsScale(d) {
  ansScale = Math.min(1.6, Math.max(0.8, Math.round((ansScale + d) * 10) / 10));
  try { localStorage.setItem("gn_ans_scale", String(ansScale)); } catch {}
  applyAnsScale();
  document.querySelectorAll(".ans-scale-label").forEach((el) => { el.textContent = Math.round(ansScale * 100) + "%"; });
}
function scaleCtlHTML() {
  return `<div class="scale-ctl">
    <button class="icon-btn ans-smaller" aria-label="Smaller answers">A-</button>
    <span class="ans-scale-label hint-inline">${Math.round(ansScale * 100)}%</span>
    <button class="icon-btn ans-bigger" aria-label="Bigger answers">A+</button>
  </div>`;
}
function wireScaleCtl(c) {
  const sm = c.querySelector(".ans-smaller"), bg = c.querySelector(".ans-bigger");
  if (sm) sm.onclick = () => bumpAnsScale(-0.1);
  if (bg) bg.onclick = () => bumpAnsScale(0.1);
}
function render() {
  if (session.role === "host") { room.status === "lobby" ? renderLobby() : renderStage(); return; }
  // player
  const me = players.find((p) => p.id === session.player_id);
  if (me) $("meScore").textContent = me.score;
  if (!room) return;
  // A live round means a (re)started game: re-arm the win fanfare so players
  // hear it at every game-over, not just the first one in the room.
  if (room.status === "question" || room.status === "anagram_play" || room.status === "mlt_vote" || room.status === "cx_play") winStungFor = null;
  if (room.status === "lobby") Music.setMode("lobby");
  else if (room.status === "game_over") { Music.setMode(null); if (winStungFor !== room.id) { winStungFor = room.id; Music.sting("win"); } }
  else Music.setMode("game");
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
  else if (room.status === "mlt_vote") renderPlayerMltVote(c);
  else if (room.status === "mlt_reveal") renderPlayerMltReveal(c);
  else if (room.status === "cx_play") renderPlayerCx(c);
  else if (room.status === "game_over") renderPlayerGameOver(c);
  startTick();
}

async function renderPlayerQuestion(c) {
  const q = room.questions[room.current_index];
  await loadMyAnswer();
  const answered = myAnswers[0];
  if (shuffledFor !== (room.round_ends_at || "") + "|" + room.current_index) {
    shuffledAnswers = shuffle([q.correct_answer, ...q.incorrect_answers]);
    shuffledFor = (room.round_ends_at || "") + "|" + room.current_index;
  }
  $("playTimer").classList.remove("hidden");
  if (answered) {
    c.innerHTML = `<p class="q-cat">${esc(q.category)}</p><p class="q-text" style="font-size:1.3rem">${esc(q.question)}</p>
      <p class="locked">Locked in! ✅</p>
      <div class="my-answer">Your answer:<br/><strong>${esc(answered.answer)}</strong></div>
      <p class="hint" style="text-align:center">Waiting for everyone…</p>
      ${scaleCtlHTML()}`;
    wireScaleCtl(c);
    return;
  }
  c.innerHTML = `<p class="q-cat">${esc(q.category)}</p><p class="q-text" style="font-size:1.3rem">${esc(q.question)}</p>
    <div class="answer-grid">${shuffledAnswers.map((a) => `<button class="answer-btn" data-a="${esc(a)}">${esc(a)}</button>`).join("")}</div>
    ${scaleCtlHTML()}`;
  wireScaleCtl(c);
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
  const rk = room.id + ":" + (room.round_ends_at || "") + ":" + room.current_index;
  if (stungReveal !== rk) { stungReveal = rk; Music.sting(a && a.is_correct ? "correct" : "wrong"); }
  c.innerHTML = `<div class="reveal-box">
      <p class="q-cat">Correct answer</p>
      <p class="reveal-answer" style="font-size:1.4rem">${esc(q.correct_answer)}</p>
      <p class="locked">${verdict}</p>
    </div>`;
}

let clearAnagramBuilt = null; // reset the tap-to-spell word (set when the round layout builds)

function renderPlayerAnagram(c) {
  $("playTimer").classList.remove("hidden");
  // Build the layout once per round. Later renders only refresh the word
  // chips — rebuilding would wipe the in-progress tapped word.
  const roundKey = room.id + "|" + (room.round_ends_at || "");
  if (!c.dataset.anagramRound || c.dataset.anagramRound !== roundKey) {
    const letters = room.anagram_letters.split("");
    const tiles = letters.map((ch) => `<button type="button" class="tile" data-ch="${ch}">${ch}</button>`).join("");
    const rowsCls = letters.length === 8 ? "letters rows-4" : "letters";
    c.innerHTML = `
      <p class="q-cat">Make words · ${anagramMinLen()}+ letters</p>
      <div class="${rowsCls}">${tiles}</div>
      <div class="build-word" id="buildWord"></div>
      <div class="word-row">
        <button id="shuffleBtn" class="btn" title="Shuffle letters">🔀</button>
        <button id="clearWordBtn" class="btn">Clear</button>
        <button id="backspaceBtn" class="btn" aria-label="Delete last letter">⌫</button>
        <button id="wordGo" class="btn primary">✓</button>
      </div>
      <div class="word-list" id="anagramChips"></div>`;
    c.dataset.anagramRound = roundKey;
    const tileBtns = [...c.querySelectorAll(".tile")];
    let built = []; // indexes into tileBtns, in tap order
    const renderBuilt = () => {
      const bw = $("buildWord");
      bw.innerHTML = built.length
        ? built.map((i, k) => `<span class="btile${k === built.length - 1 ? " fresh" : ""}">${esc(tileBtns[i].dataset.ch)}</span>`).join("")
        : `<span class="build-hint">TAP THE LETTERS</span>`;
      tileBtns.forEach((b, i) => b.classList.toggle("used", built.includes(i)));
      $("wordGo").disabled = built.length < anagramMinLen();
    };
    // Tap a tile to add it, tap again to remove it.
    tileBtns.forEach((b, i) => b.onclick = () => {
      const at = built.indexOf(i);
      if (at >= 0) {
        built.splice(at, 1);
        Music.sting("click");
      } else {
        built.push(i);
        // little jump + rising pop so each tap feels tactile
        try { b.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.25) translateY(-8px)", offset: 0.4 }, { transform: "scale(0.92)" }],
          { duration: 200, easing: "ease-out" }); } catch {}
        Music.sting("tile", built.length);
      }
      renderBuilt();
    });
    $("backspaceBtn").onclick = () => { built.pop(); renderBuilt(); };
    $("clearWordBtn").onclick = () => { built = []; renderBuilt(); };
    clearAnagramBuilt = () => { built = []; renderBuilt(); };
    $("wordGo").onclick = () => submitWord(built.map((i) => tileBtns[i].dataset.ch).join(""));
    $("shuffleBtn").onclick = () => {
      const cont = c.querySelector(".letters");
      const els = [...cont.children];
      for (let i = els.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [els[i], els[j]] = [els[j], els[i]];
      }
      els.forEach((t) => cont.appendChild(t));
      // NB: no explicit sting here — the global .btn click handler already
      // plays one, and doubling it was the reported bug.
    };
    renderBuilt();
  }
  refreshChips();
}

function refreshChips() {
  const el = $("anagramChips");
  if (!el) return;
  // Chat-style: only auto-scroll when the user was already near the bottom.
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  const chips = myWords.map((w) => `<span class="word-chip">${esc(w.word)}<small>+${w.points}</small></span>`).join("");
  el.innerHTML = chips || `<span style="color:var(--muted)">No words yet — go!</span>`;
  if (nearBottom) el.scrollTop = el.scrollHeight;
}

async function submitWord(word) {
  const clearBuilt = () => { if (clearAnagramBuilt) clearAnagramBuilt(); };
  if (word.length < anagramMinLen()) { toast(`Words must be ${anagramMinLen()}+ letters.`); clearBuilt(); return; }
  if (!canForm(word, room.anagram_letters)) { toast("Use only the letters shown!"); clearBuilt(); return; }
  await loadWords_dict();
  if (!WORDS.has(word)) { toast(`"${word}" isn't in the Scrabble dictionary.`); Music.sting("wrong"); clearBuilt(); return; }
  await loadWords(); // fresh snapshot for the friendly "already found by X" message
  const found = allWords.find((w) => w.word === word);
  if (found && found.player_id === session.player_id) {
    toast(`You already found "${word}".`); Music.sting("wrong"); clearBuilt(); return;
  }
  // Server is authoritative: the submit_word RPC atomically verifies the round
  // is live, enforces the repeat-words policy across ALL players, inserts the
  // word, and adds the score. This closes the same-word race (two phones
  // submitting within milliseconds) and rejects submits after the round ends.
  let res = null;
  try { [res] = await rpc("submit_word", { p_room: session.room_id, p_player: session.player_id, p_word: word }); }
  catch { res = null; }
  if (!res || !res.accepted) {
    if (res && res.note === "round_over") toast("Round's over!");
    else if (found) toast(`"${word}" was already found by ${found.game_players?.name || "someone"}!`);
    else toast("Someone beat you to it, or try again.");
    Music.sting("wrong"); clearBuilt(); return;
  }
  await loadPlayers(); await loadWords();
  ping("words"); ping("scores");
  refreshChips();
  if (clearAnagramBuilt) clearAnagramBuilt(); // reset the tap-to-spell word
  const me2 = players.find((p) => p.id === session.player_id);
  if (me2) $("meScore").textContent = me2.score;
  toast(res.note === "repeat" ? `+${res.points} (repeat!) — nice!` : `+${res.points} — nice!`, 1200); Music.sting("pop");
}

/* ---------------- player: most likely to ---------------- */
async function renderPlayerMltVote(c) {
  $("playTimer").classList.add("hidden");
  await loadMltVotes();
  const prompt = room.questions[room.current_index];
  // 2-player "mind meld": voting for yourself is allowed and is the whole
  // point, so both names are shown. 3+ players keep the classic no-self-vote.
  const is2p = players.length === 2;
  const targets = is2p ? players : players.filter((p) => p.id !== session.player_id);
  if (myVote) {
    const t = players.find((p) => p.id === myVote.target_id);
    c.innerHTML = `<p class="q-cat">${is2p ? "Mind meld 🧠" : "Most likely to…"}</p><p class="q-text" style="font-size:1.3rem">${esc(prompt)}</p>
      <p class="locked">Voted for ${esc(t?.name || "…")}! 🗳️</p>
      <p class="hint" style="text-align:center">Waiting for everyone…</p>`;
    return;
  }
  if (!targets.length) {
    c.innerHTML = `<p class="q-cat">${is2p ? "Mind meld 🧠" : "Most likely to…"}</p><p class="q-text" style="font-size:1.3rem">${esc(prompt)}</p>
      <p class="hint" style="text-align:center">Waiting for more players to join…</p>`;
    return;
  }
  c.innerHTML = `<p class="q-cat">${is2p ? "Mind meld 🧠" : "Most likely to…"}</p><p class="q-text" style="font-size:1.3rem">${esc(prompt)}</p>
    ${is2p ? `<p class="hint" style="text-align:center">Pick who fits — voting for yourself is fair game.<br/>Match your partner's pick to score!</p>` : ""}
    <div class="answer-grid">${targets.map((p) => `<button class="answer-btn" data-p="${p.id}">🗳️ ${esc(p.name)}</button>`).join("")}</div>`;
  c.querySelectorAll(".answer-btn").forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      c.querySelectorAll(".answer-btn").forEach((x) => { x.disabled = true; if (x === b) x.classList.add("picked"); });
      // Server is authoritative: the submit_vote RPC rejects self-votes in
      // 3+ player rooms, double votes, and votes after the round closed.
      let ok = false;
      try {
        const [res] = await rpc("submit_vote", { p_room: session.room_id, p_player: session.player_id, p_target: b.dataset.p });
        ok = !!(res && res.accepted);
      } catch {}
      if (!ok) toast("Vote didn't count — try again.");
      else Music.sting("pop");
      ping("votes");
      render();
    };
  });
}

async function renderPlayerMltReveal(c) {
  $("playTimer").classList.add("hidden");
  await loadMltVotes();
  const prompt = room.questions[room.current_index];
  const is2p = players.length === 2;
  const tally = {};
  hostVotes.forEach((v) => { tally[v.target_id] = (tally[v.target_id] || 0) + 1; });
  const max = Math.max(0, ...Object.values(tally));
  const melded = is2p && hostVotes.length === 2 && new Set(hostVotes.map((v) => v.target_id)).size === 1;
  const crowned = !is2p && max > 0 && (tally[session.player_id] || 0) === max;
  const rows = [...players]
    .sort((a, b) => (tally[b.id] || 0) - (tally[a.id] || 0))
    .map((p) => {
      const votes = tally[p.id] || 0;
      const crown = !is2p && votes === max && max > 0;
      return `<tr class="${crown ? "rank-1" : ""}${p.id === session.player_id ? " me" : ""}"><td>${crown ? "👑 " : ""}${esc(p.name)}</td><td>${votes} vote${votes === 1 ? "" : "s"}</td><td class="pts">${p.score}</td></tr>`;
    }).join("");
  const verdict = is2p
    ? melded ? "🧠 Mind meld! +100" : hostVotes.length ? "Split decision — no points 😅" : "No votes this round 😅"
    : crowned ? "👑 That's you! +100" : max > 0 ? "The people have spoken! 🗳️" : "No votes this round 😅";
  c.innerHTML = `<div class="reveal-box">
      <p class="q-cat">${is2p ? "Mind meld 🧠" : "Most likely to…"}</p>
      <p class="reveal-answer" style="font-size:1.4rem">${esc(prompt)}</p>
      <p class="locked">${verdict}</p>
      <table class="score-table">${rows}</table>
    </div>`;
}

async function renderPlayerGameOver(c) {
  $("playTimer").classList.add("hidden");
  const board = [...players].sort((a, b) => b.score - a.score);
  const me = board.find((p) => p.id === session.player_id);
  const rank = me ? compRank(board, me) : board.length;
  const rows = board.map((p) =>
    `<tr class="rank-${compRank(board, p)}${p.id === session.player_id ? " me" : ""}"><td>${esc(p.name)}</td><td class="pts">${p.score}</td></tr>`).join("");
  let wordsHTML = "";
  if (room.game_type === "anagram") {
    const mine = allWords.filter((w) => w.player_id === session.player_id);
    if (mine.length) wordsHTML = `<h3 class="words-title">Your words</h3><div class="word-list" style="justify-content:center">${mine.map((w) => `<span class="word-chip">${esc(w.word)}<small>+${w.points}</small></span>`).join("")}</div>`;
    wordsHTML += missedWordsHTML(await computeMissedWords());
  }
  if (room.game_type === "commonthreads") {
    const r = await api(`cx_guesses?room_id=eq.${session.room_id}&player_id=eq.${session.player_id}&correct=eq.true&select=tier,puzzle_index&order=puzzle_index.asc,created_at.asc`);
    const gs = await r.json();
    const lines = room.questions.map((q, qi) => {
      const em = gs.filter((g) => g.puzzle_index === qi).map((g) => CX_TIER_EMOJI[g.tier]).join("");
      return `Puzzle ${qi + 1}: ${em || "—"}`;
    });
    const shareText = `🧵 Common Threads\n${lines.join("\n")}\n${me ? me.score : 0} pts`;
    cxShareCache = shareText;
    wordsHTML = `<h3 class="words-title">Your solves</h3>
      <div class="cx-share">${esc(shareText)}</div>
      <div class="row center" style="display:flex;justify-content:center"><button id="cxCopyBtn" class="btn">📋 Copy result</button></div>`;
  }
  c.innerHTML = `
    <p class="q-cat">Game over</p>
    <p class="winner" style="font-size:2rem">${rank === 1 ? "🏆 You won!" : `You placed #${rank}`}</p>
    <table class="score-table">${rows}</table>
    ${wordsHTML}
    <div class="row center" style="display:flex;justify-content:center;margin-top:14px">
      <button id="playerRematchBtn" class="btn primary">⚙️ Rematch settings</button>
    </div>
    <p class="hint" style="text-align:center">Tweak the settings and start a rematch — or wait for the host 🎮</p>`;
  const cb = $("cxCopyBtn");
  if (cb) cb.onclick = () => cxCopy(cxShareCache, cb);
  $("playerRematchBtn").onclick = openRematchSettings;
}

/* ============================================================
   COMMON THREADS (party + solo)
   Party: host picks puzzles, phones tap 4 tiles and submit — the
   submit_cx_guess RPC is authoritative (scoring, one-away, lockout).
   Solo: pure client-side, same rules, streak in localStorage.
   ============================================================ */
const CX_TIER_POINTS = { 1: 100, 2: 200, 3: 300, 4: 400 };
const CX_TIER_EMOJI = { 1: "🟨", 2: "🟩", 3: "🟦", 4: "🟪" };
let cxHostRevealKey = "";
let cxHostReveal = false;
let cxShareCache = "";

function cxPuzzle() { return (room && room.questions && room.questions[room.current_index]) || null; }

async function startCx() {
  const n = (room.settings && room.settings.rounds) || 5;
  const idxs = shuffle([...Array(CX_PUZZLES.length).keys()]).slice(0, Math.min(n, CX_PUZZLES.length));
  const puzzles = idxs.map((pi) => {
    const p = CX_PUZZLES[pi];
    return { groups: p.groups, word_order: shuffle(p.groups.flatMap((g) => g.words)) };
  });
  await api(`cx_guesses?room_id=eq.${session.room_id}`, { method: "DELETE" });
  await updateRoom({ questions: puzzles, status: "cx_play", current_index: 0, round_ends_at: null, anagram_letters: null });
  Music.setMode("game");
}

async function nextCx() {
  if (room.current_index + 1 >= room.questions.length) await updateRoom({ status: "game_over" });
  else await updateRoom({ current_index: room.current_index + 1 });
  renderStage();
}

async function loadCxGuesses() {
  if (!room || room.game_type !== "commonthreads") return;
  const r = await api(`cx_guesses?room_id=eq.${session.room_id}&puzzle_index=eq.${room.current_index}&select=*,game_players(name)&order=created_at.asc`);
  hostGuesses = await r.json();
}
function cxGroupByTier(puz, tier) { return puz.groups.find((g) => g.tier === tier); }
// tiers solved on the current puzzle, in solve order
function cxSolvedTiers() {
  const seen = new Set(), out = [];
  hostGuesses.forEach((g) => { if (g.correct && !seen.has(g.tier)) { seen.add(g.tier); out.push(g.tier); } });
  return out;
}
function cxSolvedWords(puz) {
  const words = [];
  cxSolvedTiers().forEach((t) => words.push(...cxGroupByTier(puz, t).words));
  return words;
}
function cxRemaining(puz) {
  const solved = new Set(cxSolvedWords(puz));
  return puz.word_order.filter((w) => !solved.has(w));
}
function cxSolvedBanner(g) {
  return `<div class="solved-banner tier${g.tier}"><div class="cx-cat">${esc(g.name)}</div><div class="cx-words">${g.words.join(" · ")}</div></div>`;
}
function cxMistakesFor(pid) { return hostGuesses.filter((g) => g.player_id === pid && !g.correct).length; }
function cxSolvesFor(pid) {
  const seen = new Set(), out = [];
  hostGuesses.forEach((g) => { if (g.correct && g.player_id === pid && !seen.has(g.tier)) { seen.add(g.tier); out.push(g.tier); } });
  return out;
}

/* ---------------- host board ---------------- */
/* ---------------- host board: build once per puzzle, patch on guesses ---------------- */
let cxHostKey = "";          // room+index the host DOM was built for
let cxHostSolved = [];       // tiers already rendered as banners
let cxHostRevealedTiers = [];// tiers whose answers were shown via "Show answers"

function cxHostRowsHTML() {
  return players.map((p) => {
    const m = cxMistakesFor(p.id), s = cxSolvesFor(p.id).length;
    return `<div class="cx-player-row"><span>${esc(p.name)}${m >= 4 ? " 🔒" : ""}</span><span style="color:var(--bad)">${"✗".repeat(Math.min(m, 4))}</span><span class="pts">${s}/4</span></div>`;
  }).join("");
}

async function renderHostCx(c) {
  await loadCxGuesses();
  const puz = cxPuzzle();
  const key = session.room_id + ":" + room.current_index;
  if (cxHostRevealKey !== key) { cxHostRevealKey = key; cxHostReveal = false; }
  if (cxHostKey !== key) {
    // structural build, once per puzzle
    const n = room.questions.length;
    const solved = cxSolvedTiers();
    const remaining = cxRemaining(puz);
    const tiles = remaining.map((w) => `<button class="cx-tile" disabled>${esc(w)}</button>`).join("");
    c.innerHTML = `
      <p class="q-cat">🧵 Common Threads · puzzle ${room.current_index + 1}/${n}</p>
      <div class="cx-solved" id="cxHostSolved">${solved.map((t) => cxSolvedBanner(cxGroupByTier(puz, t))).join("")}${cxHostReveal ? puz.groups.filter((g) => !solved.includes(g.tier)).map(cxSolvedBanner).join("") : ""}</div>
      <div class="cx-grid" id="cxHostGrid">${tiles}</div>
      <div id="cxHostRows"></div>
      <div id="cxHostFoot"></div>`;
    cxHostKey = key;
    cxHostSolved = solved.slice();
    cxHostRevealedTiers = [];
    $("stageTimer").classList.add("hidden");
  }
  patchHostCx();
}

// Targeted update for guess events: no full-screen rebuild.
function patchHostCx() {
  const puz = cxPuzzle();
  const solvedDiv = $("cxHostSolved"), grid = $("cxHostGrid");
  if (!puz || !solvedDiv || !grid) return;
  const solved = cxSolvedTiers();
  const fresh = solved.filter((t) => !cxHostSolved.includes(t));
  if (fresh.length) {
    const words = new Set();
    fresh.forEach((t) => {
      const g = cxGroupByTier(puz, t);
      if (!cxHostRevealedTiers.includes(t)) solvedDiv.insertAdjacentHTML("beforeend", cxSolvedBanner(g));
      g.words.forEach((w) => words.add(w));
    });
    grid.querySelectorAll(".cx-tile").forEach((el) => { if (words.has(el.textContent)) el.remove(); });
    cxHostSolved = solved.slice();
  }
  if (cxHostReveal && !cxHostRevealedTiers.length) {
    const unsolved = puz.groups.filter((g) => !solved.includes(g.tier));
    solvedDiv.insertAdjacentHTML("beforeend", unsolved.map(cxSolvedBanner).join(""));
    unsolved.forEach((g) => cxHostRevealedTiers.push(g.tier));
  }
  const rowsEl = $("cxHostRows");
  if (rowsEl) rowsEl.innerHTML = cxHostRowsHTML();
  const done = solved.length === 4;
  const allLocked = players.length > 0 && players.every((p) => cxMistakesFor(p.id) >= 4);
  const foot = $("cxHostFoot");
  if (foot) {
    foot.innerHTML = `${done ? `<p class="locked">All four groups found! 🎉</p>` : ""}
      ${!done && allLocked ? `<p class="locked">Everyone's locked out 😅</p>
        <div class="row center" style="display:flex;justify-content:center;margin-bottom:.6rem"><button id="cxRevealBtn" class="btn">👀 Show answers</button></div>` : ""}`;
    const rv = $("cxRevealBtn");
    if (rv) rv.onclick = () => { cxHostReveal = true; patchHostCx(); };
  }
  const nb = $("stageNextBtn");
  if (nb) {
    const last = room.current_index + 1 >= room.questions.length;
    if (done || allLocked) {
      nb.classList.remove("hidden");
      nb.textContent = last ? "See results →" : done ? "Next puzzle →" : "Skip puzzle →";
      nb.onclick = () => nextCx();
    } else nb.classList.add("hidden");
  }
}

/* ---------------- player board: build once per puzzle, patch on guesses ---------------- */
let cxPlayerSolved = [];   // tiers already rendered as banners on this device

function cxDotsHTML(mistakes) {
  const dots = "✗".repeat(mistakes) + "○".repeat(4 - mistakes);
  return dots.split("").map((d) => `<span class="${d === "✗" ? "used" : "left"}">${d}</span>`).join("");
}

function cxPlayerBodyHTML(puz, done, locked, mistakes) {
  if (done) return `<p class="locked">Puzzle complete! 🎉</p><p class="hint" style="text-align:center">Waiting for the host…</p>`;
  const tiles = cxOrder.map((w) =>
    `<button class="cx-tile${cxSelected.includes(w) ? " selected" : ""}"${locked ? " disabled" : ""}>${esc(w)}</button>`).join("");
  if (locked) return `<p class="locked">You're locked out for this puzzle 😅</p><div class="cx-grid" id="cxPlayerGrid">${tiles}</div>`;
  return `<div class="cx-grid" id="cxPlayerGrid">${tiles}</div>
    <div class="cx-status" id="cxStatus">${esc(cxStatusMsg)}</div>
    <div class="cx-controls">
      <button id="cxSubmit" class="btn primary" ${cxSelected.length === 4 ? "" : "disabled"}>Submit</button>
      <button id="cxShuffle" class="btn">🔀 Shuffle</button>
      <button id="cxClear" class="btn ghost">Deselect all</button>
    </div>
    <div class="cx-mistakes" id="cxDots">${cxDotsHTML(mistakes)}</div>
    <p class="hint" style="text-align:center">4 mistakes = locked out</p>`;
}

function wirePlayerTiles() {
  const grid = $("cxPlayerGrid");
  if (!grid) return;
  grid.querySelectorAll(".cx-tile").forEach((t) => {
    const w = t.textContent;
    t.onclick = () => {
      if (cxSelected.includes(w)) { cxSelected = cxSelected.filter((x) => x !== w); t.classList.remove("selected"); }
      else if (cxSelected.length < 4) { cxSelected.push(w); t.classList.add("selected"); }
      else return;
      const sb = $("cxSubmit");
      if (sb) sb.disabled = cxSelected.length !== 4;
    };
  });
}

function wirePlayerControls() {
  const sh = $("cxShuffle"), cl = $("cxClear"), sb = $("cxSubmit");
  if (sh) sh.onclick = () => {
    cxOrder = shuffle(cxOrder);
    const grid = $("cxPlayerGrid");
    if (grid) {
      grid.innerHTML = cxOrder.map((w) =>
        `<button class="cx-tile${cxSelected.includes(w) ? " selected" : ""}>${esc(w)}</button>`).join("");
      wirePlayerTiles();
    }
  };
  if (cl) cl.onclick = () => {
    cxSelected = [];
    document.querySelectorAll("#cxPlayerGrid .cx-tile.selected").forEach((t) => t.classList.remove("selected"));
    const s = $("cxSubmit");
    if (s) s.disabled = true;
  };
  if (sb) sb.onclick = () => submitCxGuess();
}

async function renderPlayerCx(c) {
  $("playTimer").classList.add("hidden");
  await loadCxGuesses();
  const puz = cxPuzzle();
  const key = session.room_id + ":" + room.current_index;
  if (cxSelKey === key && $("cxPlayerSolved") && $("cxPlayerBody")) { patchPlayerCx(); return; }
  // structural build, once per puzzle
  cxSelKey = key; cxSelected = []; cxOrder = cxRemaining(puz); cxStatusMsg = "";
  const solved = cxSolvedTiers();
  const mistakes = cxMistakesFor(session.player_id);
  const locked = mistakes >= 4, done = solved.length === 4;
  cxPlayerSolved = solved.slice();
  c.innerHTML = `
    <p class="q-cat">🧵 Common Threads · puzzle ${room.current_index + 1}/${room.questions.length}</p>
    <div class="cx-solved" id="cxPlayerSolved">${solved.map((t) => cxSolvedBanner(cxGroupByTier(puz, t))).join("")}</div>
    <div id="cxPlayerBody">${cxPlayerBodyHTML(puz, done, locked, mistakes)}</div>`;
  if (done || locked) return;
  wirePlayerTiles();
  wirePlayerControls();
}

// Targeted update for guess events (own + other players'): no full-screen rebuild.
function patchPlayerCx() {
  const puz = cxPuzzle();
  const solvedDiv = $("cxPlayerSolved"), body = $("cxPlayerBody");
  if (!puz || !solvedDiv || !body) { render(); return; }
  const solved = cxSolvedTiers();
  const mistakes = cxMistakesFor(session.player_id);
  const locked = mistakes >= 4, done = solved.length === 4;
  if (done || locked) { cxSelKey = ""; render(); return; }  // structural transition, rare
  const fresh = solved.filter((t) => !cxPlayerSolved.includes(t));
  if (fresh.length) {
    const words = new Set();
    fresh.forEach((t) => {
      const g = cxGroupByTier(puz, t);
      solvedDiv.insertAdjacentHTML("beforeend", cxSolvedBanner(g));
      g.words.forEach((w) => words.add(w));
    });
    const grid = $("cxPlayerGrid");
    if (grid) grid.querySelectorAll(".cx-tile").forEach((el) => { if (words.has(el.textContent)) el.remove(); });
    cxOrder = cxOrder.filter((w) => !words.has(w));
    cxSelected = cxSelected.filter((w) => !words.has(w));
    cxPlayerSolved = solved.slice();
    const sb = $("cxSubmit");
    if (sb) sb.disabled = cxSelected.length !== 4;
  }
  const dots = $("cxDots");
  if (dots) dots.innerHTML = cxDotsHTML(mistakes);
  const st = $("cxStatus");
  if (st && st.textContent !== cxStatusMsg) st.textContent = cxStatusMsg;
}

async function submitCxGuess() {
  const words = [...cxSelected];
  if (words.length !== 4) return;
  const btn = $("cxSubmit");
  if (btn) btn.disabled = true;
  const reenable = () => { const b = $("cxSubmit"); if (b) b.disabled = cxSelected.length !== 4; };
  let res = null;
  try {
    const rows = await rpc("submit_cx_guess", { p_room: session.room_id, p_player: session.player_id, p_words: words });
    res = rows && rows[0];
  } catch { toast("Couldn't submit — try again."); reenable(); return; }
  await loadPlayers(); await loadCxGuesses();
  cxSelected = [];
  document.querySelectorAll("#cxPlayerGrid .cx-tile.selected").forEach((t) => t.classList.remove("selected"));
  if (res && res.result === "correct") {
    cxStatusMsg = "";
    Music.sting(res.final_group ? "win" : "correct");
    toast(res.final_group ? `+${res.points}! Final group 🎉` : `+${res.points}! ${CX_TIER_EMOJI[res.tier]}`);
    // targeted: append banner + remove the 4 solved tiles, no full rebuild
    const puz = cxPuzzle();
    const g = puz ? cxGroupByTier(puz, res.tier) : null;
    if (g) {
      const sd = $("cxPlayerSolved");
      if (sd) sd.insertAdjacentHTML("beforeend", cxSolvedBanner(g));
      if (!cxPlayerSolved.includes(res.tier)) cxPlayerSolved.push(res.tier);
      const wordSet = new Set(g.words);
      const grid = $("cxPlayerGrid");
      if (grid) grid.querySelectorAll(".cx-tile").forEach((el) => { if (wordSet.has(el.textContent)) el.remove(); });
      cxOrder = cxOrder.filter((w) => !wordSet.has(w));
    }
    const st = $("cxStatus");
    if (st) st.textContent = "";
    const sb = $("cxSubmit");
    if (sb) sb.disabled = true;
    if (res.final_group) {
      const body = $("cxPlayerBody");
      if (body) body.innerHTML = `<p class="locked">Puzzle complete! 🎉</p><p class="hint" style="text-align:center">Waiting for the host…</p>`;
    }
    ping("guesses");
    return;
  }
  if (res && res.result === "already") {
    toast("Already tried that combo 🙂");
    reenable();
    ping("guesses");
    return;
  }
  if (res && res.result === "wrong") {
    Music.sting("wrong");
    const tried = new Set(words.map((w) => w.toUpperCase()));
    const shaken = [];
    document.querySelectorAll("#cxPlayerGrid .cx-tile").forEach((t) => {
      if (tried.has(t.textContent.toUpperCase())) { t.classList.add("shake"); shaken.push(t); }
    });
    setTimeout(() => shaken.forEach((t) => t.classList.remove("shake")), 750);
    cxStatusMsg = res.one_away ? "One away… 👀" : "Not quite — try again.";
    const dots = $("cxDots");
    if (dots) dots.innerHTML = cxDotsHTML(cxMistakesFor(session.player_id));
    const st = $("cxStatus");
    if (st) st.textContent = cxStatusMsg;
    if (!res.one_away && !res.locked) toast("Nope — try again.");
    if (res.locked) toast("Locked out for this puzzle 😅");
    ping("guesses");
    if (res.locked) { cxSelKey = ""; render(); }  // structural: locked view
    else { const sb = $("cxSubmit"); if (sb) sb.disabled = true; }
    return;
  }
  if (res && res.result === "locked") {
    toast("You're locked out for this puzzle 😅");
    ping("guesses");
    cxSelKey = "";
    render();
    return;
  }
  toast("Hmm, that didn't go through — try again.");
  ping("guesses");
  reenable();
}

/* ---------------- share / copy ---------------- */
async function cxCopy(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch {}
    ta.remove();
  }
  if (btn) { const t = btn.textContent; btn.textContent = "Copied! ✅"; setTimeout(() => { btn.textContent = t; }, 1500); }
}

/* ---------------- solo ---------------- */
let solo = null;
const CX_RECENT_KEY = "cx_recent_v1", CX_STREAK_KEY = "cx_streak_v1",
      CX_BEST_KEY = "cx_best_v1", CX_STATS_KEY = "cx_stats_v1";
function cxGet(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } }
function cxSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

function initSolo() {
  const total = CX_PUZZLES.length;
  let recent = cxGet(CX_RECENT_KEY, []);
  let pool = [...Array(total).keys()].filter((i) => !recent.includes(i));
  if (!pool.length) { recent = []; pool = [...Array(total).keys()]; }
  const pi = pool[Math.floor(Math.random() * pool.length)];
  recent.push(pi); if (recent.length > 12) recent = recent.slice(-12);
  cxSet(CX_RECENT_KEY, recent);
  const p = CX_PUZZLES[pi];
  solo = { groups: p.groups, order: shuffle(p.groups.flatMap((g) => g.words)), solved: [], mistakes: 0, selected: [], over: false, won: false };
  soloStatusMsg = "";
  Music.setMode("game");
  show("view-solo");
  renderSolo();
}
function soloRemaining() {
  const done = new Set(solo.solved.flatMap((s) => s.words));
  return solo.order.filter((w) => !done.has(w));
}
function renderSolo() {
  const c = $("soloContent");
  if (!solo) { c.innerHTML = `<p class="hint">Loading…</p>`; return; }
  if (solo.over) { renderSoloEnd(c); return; }
  const streak = cxGet(CX_STREAK_KEY, 0);
  const banners = solo.solved.map(cxSolvedBanner).join("");
  const remaining = soloRemaining();
  const tiles = remaining.map((w, i) =>
    `<button class="cx-tile${solo.selected.includes(w) ? " selected" : ""}" data-i="${i}">${esc(w)}</button>`).join("");
  const dots = "✗".repeat(solo.mistakes) + "○".repeat(4 - solo.mistakes);
  c.innerHTML = `
    <p class="q-cat">🧵 Common Threads · solo</p>
    <p class="q-meta">🔥 Streak: ${streak}</p>
    <div class="cx-solved">${banners}</div>
    <div class="cx-grid">${tiles}</div>
    <div class="cx-status" id="cxStatus">${esc(soloStatusMsg)}</div>
    <div class="cx-controls">
      <button id="soloSubmit" class="btn primary" ${solo.selected.length === 4 ? "" : "disabled"}>Submit</button>
      <button id="soloShuffle" class="btn">🔀 Shuffle</button>
      <button id="soloClear" class="btn ghost">Deselect all</button>
    </div>
    <div class="cx-mistakes">${dots.split("").map((d) => `<span class="${d === "✗" ? "used" : "left"}">${d}</span>`).join("")}</div>
    <p class="hint" style="text-align:center">4 mistakes = game over</p>
    <p style="text-align:center"><button id="soloNewBtn" class="link-btn">↻ New puzzle</button></p>`;
  c.querySelectorAll(".cx-tile").forEach((t) => {
    t.onclick = () => {
      const w = soloRemaining()[Number(t.dataset.i)];
      if (solo.selected.includes(w)) solo.selected = solo.selected.filter((x) => x !== w);
      else if (solo.selected.length < 4) solo.selected.push(w);
      else return;
      renderSolo();
    };
  });
  $("soloShuffle").onclick = () => { solo.order = shuffle(solo.order); renderSolo(); };
  $("soloClear").onclick = () => { solo.selected = []; renderSolo(); };
  $("soloSubmit").onclick = soloSubmit;
  $("soloNewBtn").onclick = initSolo;
}
function soloSubmit() {
  const words = [...solo.selected];
  if (words.length !== 4 || solo.over) return;
  const set = new Set(words.map((w) => w.toUpperCase()));
  const unsolved = solo.groups.filter((g) => !solo.solved.some((s) => s.tier === g.tier));
  const hit = unsolved.find((g) => g.words.every((w) => set.has(w.toUpperCase())));
  solo.selected = [];
  if (hit) {
    solo.solved.push({ tier: hit.tier, name: hit.name, words: hit.words });
    soloStatusMsg = "";
    if (solo.solved.length === 4) { soloFinish(true); return; }
    Music.sting("correct");
    toast(`+${CX_TIER_POINTS[hit.tier]}! ${CX_TIER_EMOJI[hit.tier]}`);
    renderSolo();
    return;
  }
  const oneAway = unsolved.some((g) => g.words.filter((w) => set.has(w.toUpperCase())).length === 3);
  solo.mistakes++;
  Music.sting("wrong");
  const tried = new Set(words);
  const rem = soloRemaining();
  document.querySelectorAll("#soloContent .cx-tile").forEach((t) => {
    if (tried.has(rem[Number(t.dataset.i)])) t.classList.add("shake");
  });
  soloStatusMsg = oneAway ? "One away… 👀" : "Not quite — try again.";
  if (solo.mistakes >= 4) { setTimeout(() => soloFinish(false), 700); return; }
  setTimeout(renderSolo, 700);
}
function soloFinish(won) {
  solo.over = true; solo.won = won;
  let streak = cxGet(CX_STREAK_KEY, 0);
  let best = cxGet(CX_BEST_KEY, 0);
  const stats = cxGet(CX_STATS_KEY, { played: 0, won: 0 });
  stats.played++;
  if (won) { streak++; stats.won++; if (streak > best) best = streak; }
  else streak = 0;
  cxSet(CX_STREAK_KEY, streak); cxSet(CX_BEST_KEY, best); cxSet(CX_STATS_KEY, stats);
  Music.sting(won ? "win" : "wrong");
  renderSolo();
}
function renderSoloEnd(c) {
  const streak = cxGet(CX_STREAK_KEY, 0);
  const best = cxGet(CX_BEST_KEY, 0);
  const stats = cxGet(CX_STATS_KEY, { played: 0, won: 0 });
  const emLine = solo.solved.map((s) => CX_TIER_EMOJI[s.tier]).join("");
  const unsolved = solo.groups.filter((g) => !solo.solved.some((s) => s.tier === g.tier));
  const shareText = `🧵 Common Threads (solo)\n${emLine || "—"}\n🔥 Streak: ${streak}`;
  c.innerHTML = `
    <p class="q-cat">🧵 Common Threads · solo</p>
    <p class="winner" style="font-size:1.8rem">${solo.won ? "🎉 Puzzle solved!" : "😅 Out of guesses"}</p>
    <div class="cx-solved">${solo.solved.map(cxSolvedBanner).join("")}${solo.won ? "" : unsolved.map(cxSolvedBanner).join("")}</div>
    <div class="cx-share" id="soloShare">${esc(shareText)}</div>
    <div style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap">
      <button id="soloCopyBtn" class="btn">📋 Copy result</button>
      <button id="soloAgainBtn" class="btn primary">↻ New puzzle</button>
    </div>
    <p class="hint" style="text-align:center">🔥 Streak ${streak} · Best ${best} · Solved ${stats.won}/${stats.played}</p>`;
  $("soloCopyBtn").onclick = (e) => cxCopy(shareText, e.target);
  $("soloAgainBtn").onclick = initSolo;
}

/* ============================================================
   WIRING + INIT
   ============================================================ */
function wire() {
  $("hostBtn").onclick = initSetup;
  $("boardBtn").onclick = showBoard;
  $("resetBoardBtn").onclick = resetLeaderboard;
  $("boardBackBtn").onclick = () => show("view-home");
  $("backHomeBtn").onclick = () => { if (editingRoom) cancelRematchEdit(); else initHome(); };
  $("createRoomBtn").onclick = () => { if (editingRoom) { if (editingReturn === "lobby") applyLobbySettings(); else startRematch(); } else createRoom(); };
  $("lobbyBackBtn").onclick = () => { stopLobbyPoll(); initHome(); };
  $("lobbySettingsBtn").onclick = openLobbySettings;
  $("startGameBtn").onclick = startGame;
  $("stageEndBtn").onclick = async () => { clearInterval(revealTimer); revealTimer = null; await updateRoom({ status: "game_over" }); renderStage(); };
  const goJoin = () => joinWithCode($("joinCodeInput").value);
  $("joinGoBtn").onclick = goJoin;
  $("joinCodeInput").addEventListener("keydown", (e) => { if (e.key === "Enter") goJoin(); });
  $("joinCodeInput").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ""); });
  $("playerJoinBtn").onclick = joinAsPlayer;
  $("soloBtn").onclick = initSolo;
  $("soloBackBtn").onclick = () => { Music.setMode("home"); initHome(); };
  $("playerNameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") joinAsPlayer(); });
  $("leaveBtn").onclick = leaveGame;
  const syncMuteIcon = () => { $("muteBtn").textContent = Music.isMuted() ? "🔇" : "🔊"; };
  syncMuteIcon();
  $("muteBtn").onclick = () => { Music.toggleMute(); syncMuteIcon(); };
  const ss = $("styleSelect");
  if (ss) { ss.value = Music.getGameStyle(); ss.onchange = () => { Music.unlock(); Music.setGameStyle(ss.value); }; }
  const vs = $("volSlider");
  if (vs) {
    vs.value = Math.round(Music.getVolume() * 100);
    vs.addEventListener("input", () => { Music.unlock(); Music.setVolume(vs.value / 100); syncMuteIcon(); });
    vs.addEventListener("change", () => Music.sting("click"));
  }
  document.addEventListener("pointerdown", () => Music.unlock());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) Music.unlock(); });
  document.addEventListener("click", (e) => { if (e.target.closest(".btn")) Music.sting("click"); });
}

async function leaveGame() {
  try {
    if (session?.player_id) {
      await api(`game_players?id=eq.${session.player_id}`, { method: "DELETE" });
      ping("players");
    }
  } catch {}
  if (rtChannel) { try { sb.removeChannel(rtChannel); } catch {} rtChannel = null; }
  rtReady = false; pingQueue.length = 0; stopLobbyPoll();
  clearInterval(revealTimer); revealTimer = null; revealFor = null;
  clearInterval(tickTimer); tickTimer = null;
  clearInterval(playerPoll); playerPoll = null;
  clearInterval(hostBeat); hostBeat = null;
  releaseWake();
  session = null; saveSession();
  room = null; players = [];
  $("roomBadge").classList.add("hidden");
  history.replaceState(null, "", location.pathname);
  Music.setMode("home");
  show("view-home");
}

document.addEventListener("DOMContentLoaded", () => { wire(); applyAnsScale(); initHome(); });
