// リスニング（初級：聞いて意味を4択で選ぶ）
// app.js の $・speak・PHRASES を使う

// 初級＝決まり文句（Lv1）。中級・上級はあとで追加する
const LISTEN_LEVELS = [
  { id: "beginner", label: "🌱 初級", levels: [1], rate: 0.9 },
  { id: "middle", label: "🌿 中級", soon: true },
  { id: "advanced", label: "🌳 上級", soon: true },
];

// 意味がほとんど同じ文（丁寧さだけ違う）は、同じ問題の選択肢に並べない
// フレーズを追加して似た意味のものができたら、ここに足す
const SAME_MEANING = [
  ["greet-03", "elder-01"], // おやすみ／おやすみなさい
  ["greet-05", "elder-02"], // 行ってくるね／行ってまいります
  ["greet-06", "elder-03"], // ただいま／お母さん、ただいま
  ["food-01", "elder-04"],  // ご飯食べた？／お食事されましたか？
  ["greet-07", "elder-06"], // 気をつけて帰ってね／体に気をつけてくださいね
];

const hearing = {
  level: "beginner",
  q: null,        // { phrase, choices: [ja...] }
  picked: null,   // 選んだ答え
  lastId: null,
  right: 0,
  total: 0,
  stats: loadListenStats(),
};

// ---- 聞き取りの記録 { id: { tries, correct, lastOk } } ----
function loadListenStats() {
  try {
    return JSON.parse(localStorage.getItem("listen") || "{}");
  } catch {
    return {};
  }
}
function saveListenStats() {
  try {
    localStorage.setItem("listen", JSON.stringify(hearing.stats));
  } catch {}
}

function listenLevel() {
  return LISTEN_LEVELS.find((l) => l.id === hearing.level);
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 前回まちがえたもの → まだ出ていないもの → 正解したもの、の順に出やすくする
function pickPhrase() {
  const pool = PHRASES.filter((p) => listenLevel().levels.includes(p.level) && p.id !== hearing.lastId);
  const weight = (p) => {
    const s = hearing.stats[p.id];
    if (!s) return 3;
    return s.lastOk ? 1 : 6;
  };
  let r = Math.random() * pool.reduce((sum, p) => sum + weight(p), 0);
  for (const p of pool) {
    r -= weight(p);
    if (r <= 0) return p;
  }
  return pool[pool.length - 1];
}

function newQuestion({ silent = false } = {}) {
  const phrase = pickPhrase();
  // まちがいの選択肢は同じくらいのレベルから、意味が重ならないものを選ぶ
  const twinsOf = (id) => SAME_MEANING.find((g) => g.includes(id)) || [id];
  const used = [...twinsOf(phrase.id)];
  const others = [];
  for (const p of shuffled(PHRASES.filter((p) => p.level <= 2))) {
    if (others.length === 3) break;
    if (used.includes(p.id) || p.ja === phrase.ja || others.includes(p.ja)) continue;
    others.push(p.ja);
    used.push(...twinsOf(p.id));
  }
  hearing.q = { phrase, choices: shuffled([phrase.ja, ...others]) };
  hearing.picked = null;
  hearing.lastId = phrase.id;
  renderListen();
  if (!silent) speak(phrase.ko, listenLevel().rate);
}

function answer(ja) {
  if (hearing.picked) return;
  const p = hearing.q.phrase;
  const ok = ja === p.ja;
  hearing.picked = ja;
  hearing.total += 1;
  if (ok) hearing.right += 1;
  const s = hearing.stats[p.id] || { tries: 0, correct: 0, lastOk: false };
  s.tries += 1;
  if (ok) s.correct += 1;
  s.lastOk = ok;
  hearing.stats[p.id] = s;
  saveListenStats();
  renderListen();
}

function renderListen() {
  $("listen-levels").innerHTML = LISTEN_LEVELS
    .map((l) => `<button class="chip ${hearing.level === l.id ? "active" : ""}" data-listen="${l.id}" ${l.soon ? "disabled" : ""}>${l.label}${l.soon ? "（準備中）" : ""}</button>`)
    .join("");

  const q = hearing.q;
  if (!q) return;
  const p = q.phrase;
  const answered = !!hearing.picked;

  $("l-level").textContent = listenLevel().label;
  $("l-to").textContent = "👤 " + p.to;
  $("l-choices").innerHTML = q.choices
    .map((ja) => {
      let cls = "";
      if (answered && ja === p.ja) cls = "right";
      else if (answered && ja === hearing.picked) cls = "wrong";
      return `<button class="choice ${cls}" data-ja="${ja}" ${answered ? "disabled" : ""}>${ja}</button>`;
    })
    .join("");

  $("l-answer").hidden = !answered;
  $("l-next").hidden = !answered;
  if (answered) {
    const ok = hearing.picked === p.ja;
    $("l-feedback").textContent = ok ? "⭕ 正解！よく聞き取れたね" : "❌ おしい！もう一回聞いてみよう";
    $("l-ko").textContent = p.ko;
    $("l-pron").textContent = p.pron || "";
    $("l-ja").textContent = p.ja;
    $("l-note").textContent = p.note || "";
  }

  $("l-tally").textContent = hearing.total ? `今回 ${hearing.total}問中 ${hearing.right}問正解` : "";
  const s = hearing.stats[p.id];
  $("l-stat").textContent = s ? `この文：${s.tries}回中 ${s.correct}回正解` : "はじめての文だよ";
}

// ---- 操作 ----
$("listen-levels").addEventListener("click", (e) => {
  const b = e.target.closest("[data-listen]");
  if (!b || b.disabled) return;
  hearing.level = b.dataset.listen;
  newQuestion();
});

$("l-next").addEventListener("click", () => newQuestion());

$("l-choices").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ja]");
  if (b) answer(b.dataset.ja);
});

$("l-play").addEventListener("click", () => speak(hearing.q.phrase.ko, listenLevel().rate));
$("l-slow").addEventListener("click", () => speak(hearing.q.phrase.ko, 0.6));

// ---- フレーズ練習 ⇔ リスニング の切り替え ----
function setMode(mode, { silent = false } = {}) {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (state.listening && recognizer) recognizer.abort();
  $("phrase-mode").hidden = mode !== "phrase";
  $("listen-mode").hidden = mode !== "listen";
  document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  try {
    localStorage.setItem("mode", mode);
  } catch {}
  if (mode === "listen") {
    if (hearing.q) renderListen();
    else newQuestion({ silent });
  }
}

$("modes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mode]");
  if (b) setMode(b.dataset.mode);
});

// 前回リスニングで終わっていたら、リスニングの画面で開く
// （開いた直後はボタンを押すまで音声を出せないブラウザがあるので、読み上げは「聞く」から）
let savedMode = "phrase";
try {
  savedMode = localStorage.getItem("mode") || "phrase";
} catch {}
if (savedMode === "listen") {
  setMode("listen", { silent: true });
}
