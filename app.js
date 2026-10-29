// 韓国語フレーズ練習（ステップ1：カード＋音声）

const $ = (id) => document.getElementById(id);

const state = {
  scene: "all",
  level: "all",
  quiz: false,
  hideDone: false,
  order: PHRASES.map((p) => p.id),
  index: 0,
  revealed: false,
  done: loadDone(),
  stats: loadStats(),
  result: null,
  listening: false,
};

// ---- 覚えた記録（この端末のブラウザに保存） ----
function loadDone() {
  try {
    return new Set(JSON.parse(localStorage.getItem("done") || "[]"));
  } catch {
    return new Set();
  }
}
function saveDone() {
  try {
    localStorage.setItem("done", JSON.stringify([...state.done]));
  } catch {}
}

// ---- 発音チェックの記録 { id: { tries, best, last } } ----
function loadStats() {
  try {
    return JSON.parse(localStorage.getItem("stats") || "{}");
  } catch {
    return {};
  }
}
function saveStats() {
  try {
    localStorage.setItem("stats", JSON.stringify(state.stats));
  } catch {}
}
function recordScore(id, score) {
  const s = state.stats[id] || { tries: 0, best: 0, last: 0 };
  s.tries += 1;
  s.best = Math.max(s.best, score);
  s.last = score;
  state.stats[id] = s;
  saveStats();
}

// ---- 採点：お手本と聞き取れた文字を1文字ずつ比べる ----
function normalize(text) {
  return text.replace(/[\s.,!?~。、！？…'"]/g, "");
}

// 一致した文字（LCS）を求めて、お手本のどの文字が言えたかを返す
function compare(target, heard) {
  const a = [...normalize(target)];
  const b = [...normalize(heard)];
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matchedA = new Array(a.length).fill(false);
  const matchedB = new Array(b.length).fill(false);
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { matchedA[i] = matchedB[j] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  // 余分に言った文字も減点するため、長いほうの長さで割る
  const score = a.length ? Math.round((dp[0][0] / Math.max(a.length, b.length)) * 100) : 0;
  return { score, a, b, matchedA, matchedB };
}

function marked(chars, matched) {
  return chars.map((c, k) => `<span class="${matched[k] ? "ok" : "miss"}">${c}</span>`).join("");
}

function scoreMessage(score) {
  if (score >= 90) return "🎉 完璧！ネイティブに通じるよ";
  if (score >= 70) return "😊 おしい！あと少し";
  if (score >= 40) return "💪 もう一回いってみよう";
  return "🌱 お手本を聞いてから、ゆっくり言ってみてね";
}

// ---- 音声認識（Chrome） ----
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;

function listen() {
  const p = current();
  if (!Recognition || !p) return;
  if (state.listening) {
    recognizer && recognizer.stop();
    return;
  }
  speechSynthesis.cancel();
  recognizer = new Recognition();
  recognizer.lang = "ko-KR";
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 5;

  recognizer.onresult = (e) => {
    // 候補の中からお手本にいちばん近いものを使う
    const alts = [...e.results[0]].map((r) => r.transcript);
    const best = alts
      .map((t) => ({ t, ...compare(p.ko, t) }))
      .sort((x, y) => y.score - x.score)[0];
    recordScore(p.id, best.score);
    state.result = { id: p.id, ...best };
    state.revealed = true;
  };
  recognizer.onerror = (e) => {
    const msg = {
      "no-speech": "🎤 声が聞こえなかったよ。もう一回押して話してね",
      "not-allowed": "🎤 マイクが許可されていないよ。アドレスバーのマイクのマークから許可してね",
      "network": "📶 インターネットにつながっているか確かめてね",
    }[e.error] || "うまく聞き取れなかったよ（" + e.error + "）";
    state.result = { id: p.id, error: msg };
  };
  recognizer.onend = () => {
    state.listening = false;
    render();
  };

  state.listening = true;
  state.result = null;
  render();
  recognizer.start();
}

// ---- 音声 ----
let koVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;
  const ko = voices.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ko"));
  // Google やオンラインの声のほうが自然なことが多いので優先する
  koVoice = ko.find((v) => /google|online|natural/i.test(v.name)) || ko[0] || null;
  $("voice-warning").hidden = !!koVoice;
}

function speak(text, rate) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR";
  if (koVoice) u.voice = koVoice;
  u.rate = rate;
  speechSynthesis.speak(u);
}

// ---- 表示 ----
function visible() {
  const byId = Object.fromEntries(PHRASES.map((p) => [p.id, p]));
  return state.order
    .map((id) => byId[id])
    .filter((p) => state.scene === "all" || p.scene === state.scene)
    .filter((p) => state.level === "all" || p.level === state.level)
    .filter((p) => !(state.hideDone && state.done.has(p.id)));
}

function renderChips() {
  const sceneItems = [{ id: "all", label: "ぜんぶ", emoji: "🌸" }, ...SCENES];
  $("scenes").innerHTML = sceneItems
    .map((s) => `<button class="chip ${state.scene === s.id ? "active" : ""}" data-scene="${s.id}">${s.emoji} ${s.label}</button>`)
    .join("");

  const levels = ["all", ...[...new Set(PHRASES.map((p) => p.level))].sort()];
  $("levels").innerHTML = levels
    .map((lv) => `<button class="chip ${state.level === lv ? "active" : ""}" data-level="${lv}">${lv === "all" ? "全レベル" : "Lv" + lv}</button>`)
    .join("");
}

function render() {
  renderChips();
  const list = visible();
  const empty = list.length === 0;
  $("card").hidden = empty;
  $("empty").hidden = !empty;
  if (empty) {
    const hasAny = state.hideDone && PHRASES.some((p) =>
      (state.scene === "all" || p.scene === state.scene) && (state.level === "all" || p.level === state.level));
    $("empty").textContent = hasAny
      ? "この条件のフレーズは全部覚えたよ！すごい 🎉"
      : "この組み合わせのフレーズはまだないよ。別の場面かレベルを選んでね 😊";
  }
  document.querySelector(".nav").style.visibility = empty ? "hidden" : "visible";
  if (empty) return;

  if (state.index >= list.length) state.index = list.length - 1;
  if (state.index < 0) state.index = 0;
  const p = list[state.index];
  const isDone = state.done.has(p.id);
  const hideKo = state.quiz && !state.revealed;

  $("to").textContent = "👤 " + p.to;
  $("lv").textContent = "Lv" + p.level;
  $("ja").textContent = p.ja;
  $("ko").textContent = p.ko;
  $("pron").textContent = p.pron || "";
  $("polite").textContent = p.polite ? "🙇 丁寧に言うと：" + p.polite : "";
  $("note").textContent = p.note || "";

  $("ko-wrap").hidden = hideKo;
  $("extra").hidden = hideKo;
  $("reveal").hidden = !hideKo;
  $("play").disabled = hideKo;
  $("slow").disabled = hideKo;

  $("card").classList.toggle("done", isDone);
  $("done").classList.toggle("is-done", isDone);
  $("done").textContent = isDone ? "✅ 覚えた！" : "✅ 覚えた";
  $("count").textContent = `${state.index + 1} / ${list.length}`;

  // 発音チェック
  $("mic").hidden = !Recognition;
  $("mic-note").hidden = !!Recognition;
  $("mic").classList.toggle("listening", state.listening);
  $("mic").textContent = state.listening ? "🎙️ 聞いてるよ…（押すと終了）" : "🎤 話して発音チェック";

  const r = state.result && state.result.id === p.id ? state.result : null;
  $("result").hidden = !r;
  if (r && r.error) {
    $("score").textContent = r.error;
    $("heard").innerHTML = "";
    $("target").innerHTML = "";
    $("heard").parentElement.hidden = $("target").parentElement.hidden = true;
  } else if (r) {
    $("score").textContent = `${r.score}点　${scoreMessage(r.score)}`;
    $("heard").innerHTML = r.b.length ? marked(r.b, r.matchedB) : "（聞き取れず）";
    $("target").innerHTML = marked(r.a, r.matchedA);
    $("heard").parentElement.hidden = $("target").parentElement.hidden = false;
  }

  const s = state.stats[p.id];
  $("stat").textContent = s ? `練習 ${s.tries}回・最高 ${s.best}点・前回 ${s.last}点` : "";
}

function go(delta) {
  const n = visible().length;
  if (!n) return;
  state.index = (state.index + delta + n) % n;
  state.revealed = false;
  state.result = null;
  if (state.listening && recognizer) recognizer.abort();
  render();
}

function current() {
  return visible()[state.index];
}

// ---- 操作 ----
$("scenes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-scene]");
  if (!b) return;
  state.scene = b.dataset.scene;
  state.index = 0;
  state.revealed = false;
  render();
});

$("levels").addEventListener("click", (e) => {
  const b = e.target.closest("[data-level]");
  if (!b) return;
  state.level = b.dataset.level === "all" ? "all" : Number(b.dataset.level);
  state.index = 0;
  state.revealed = false;
  render();
});

$("quiz").addEventListener("change", (e) => {
  state.quiz = e.target.checked;
  state.revealed = false;
  render();
});

$("hide-done").addEventListener("change", (e) => {
  state.hideDone = e.target.checked;
  state.index = 0;
  render();
});

$("reveal").addEventListener("click", () => {
  state.revealed = true;
  render();
  speak(current().ko, 1.0);
});

$("play").addEventListener("click", () => speak(current().ko, 1.0));
$("slow").addEventListener("click", () => speak(current().ko, 0.6));

$("done").addEventListener("click", () => {
  const p = current();
  if (state.done.has(p.id)) state.done.delete(p.id);
  else state.done.add(p.id);
  saveDone();
  if (state.hideDone && state.done.has(p.id)) state.revealed = false;
  render();
});

$("mic").addEventListener("click", listen);

// 苦手なもの（前回の点が低いもの）から並べる。まだ練習していないものは真ん中あたり
$("weak").addEventListener("click", () => {
  const weight = (id) => (state.stats[id] ? state.stats[id].last : 60);
  state.order = [...state.order].sort((x, y) => weight(x) - weight(y));
  state.index = 0;
  state.revealed = false;
  state.result = null;
  render();
});

$("prev").addEventListener("click", () => go(-1));
$("next").addEventListener("click", () => go(1));

$("shuffle").addEventListener("click", () => {
  const a = [...state.order];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  state.order = a;
  state.index = 0;
  state.revealed = false;
  render();
});

// ---- 開始 ----
if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.addEventListener("voiceschanged", pickVoice);
  // 声の一覧が遅れて届くブラウザがあるので、少し待っても無ければ警告を出す
  setTimeout(pickVoice, 1500);
} else {
  $("voice-warning").hidden = false;
}
render();
