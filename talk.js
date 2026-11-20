// 会話（Lv6：相手のセリフを聞いて、自分の番を言う）
// app.js の $・koVoice・Recognition・compare・marked・scoreMessage と、phrases.js の DIALOGUES を使う

const talk = {
  id: DIALOGUES[0].id,
  step: -1,        // 今いるセリフの番号。-1 はまだ始めていない
  scores: {},      // { セリフ番号: 点数 }（今回の会話で言えたもの）
  result: null,    // 今の自分の番の発音チェック結果
  revealed: false, // 今の自分の番の答えを見たか
  listening: false,
  stats: loadTalkStats(),
};
let talkRec = null;

// ---- 会話の記録 { id: { done, best } } ----
function loadTalkStats() {
  try {
    return JSON.parse(localStorage.getItem("talk") || "{}");
  } catch {
    return {};
  }
}
function saveTalkStats() {
  try {
    localStorage.setItem("talk", JSON.stringify(talk.stats));
  } catch {}
}

function dialog() {
  return DIALOGUES.find((d) => d.id === talk.id);
}

// 相手の声は少し高めにして、自分のお手本と聞き分けやすくする
function utter(line, rate = 1.0) {
  const u = new SpeechSynthesisUtterance(line.ko);
  u.lang = "ko-KR";
  if (koVoice) u.voice = koVoice;
  u.rate = rate;
  u.pitch = line.who === "you" ? 1.25 : 0.95;
  return u;
}
function say(line, rate) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter(line, rate));
}

// ---- 進め方 ----
function resetTalk(id) {
  if (talk.listening && talkRec) talkRec.abort();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  talk.id = id;
  talk.step = -1;
  talk.scores = {};
  talk.result = null;
  talk.revealed = false;
}

// 相手のセリフなら読み上げて次へ進む。自分の番か最後まで来たら止まる
function runPartner() {
  const lines = dialog().lines;
  if (talk.step < lines.length && lines[talk.step].who === "you") {
    say(lines[talk.step]);
    talk.step += 1;
  }
  talk.result = null;
  talk.revealed = false;
  if (talk.step >= lines.length) finishTalk();
  renderTalk();
}

function finishTalk() {
  const vals = Object.values(talk.scores);
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  const s = talk.stats[talk.id] || { done: 0, best: 0 };
  s.done += 1;
  s.best = Math.max(s.best, avg);
  talk.stats[talk.id] = s;
  saveTalkStats();
}

function nextTurn() {
  if (talk.result && !talk.result.error) talk.scores[talk.step] = talk.result.score;
  talk.step += 1;
  runPartner();
}

function talkListen() {
  const line = dialog().lines[talk.step];
  if (!Recognition || !line) return;
  if (talk.listening) {
    talkRec && talkRec.stop();
    return;
  }
  speechSynthesis.cancel();
  talkRec = new Recognition();
  talkRec.lang = "ko-KR";
  talkRec.interimResults = false;
  talkRec.maxAlternatives = 5;

  talkRec.onresult = (e) => {
    const alts = [...e.results[0]].map((r) => r.transcript);
    const best = alts
      .map((t) => ({ t, ...compare(line.ko, t) }))
      .sort((x, y) => y.score - x.score)[0];
    talk.result = best;
    talk.revealed = true;
  };
  talkRec.onerror = (e) => {
    const msg = {
      "no-speech": "🎤 声が聞こえなかったよ。もう一回押して話してね",
      "not-allowed": "🎤 マイクが許可されていないよ。アドレスバーのマイクのマークから許可してね",
      "network": "📶 インターネットにつながっているか確かめてね",
    }[e.error] || "うまく聞き取れなかったよ（" + e.error + "）";
    talk.result = { error: msg };
  };
  talkRec.onend = () => {
    talk.listening = false;
    renderTalk();
  };

  talk.listening = true;
  talk.result = null;
  renderTalk();
  talkRec.start();
}

// ---- 表示 ----
function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function renderTalk() {
  const d = dialog();
  const sceneOf = (id) => SCENES.find((s) => s.id === id) || { emoji: "💬" };

  $("t-list").innerHTML = DIALOGUES
    .map((x) => {
      const s = talk.stats[x.id];
      return `<button class="chip ${x.id === talk.id ? "active" : ""}" data-talk="${x.id}">${sceneOf(x.scene).emoji} ${x.title}${s ? " ✅" : ""}</button>`;
    })
    .join("");

  $("t-title").textContent = d.title;
  $("t-partner").textContent = "👤 " + d.partner;

  const started = talk.step >= 0;
  const finished = talk.step >= d.lines.length;
  const line = started && !finished ? d.lines[talk.step] : null;
  const myTurn = !!line && line.who === "me";

  // ここまでのやりとり（タップでもう一回聞ける）
  const shown = started ? d.lines.slice(0, Math.min(talk.step, d.lines.length)) : [];
  $("t-log").innerHTML = shown
    .map((l, k) => {
      const score = l.who === "me" && talk.scores[k] !== undefined ? `<div class="b-score">🎤 ${talk.scores[k]}点</div>` : "";
      return `<div class="bubble ${l.who}" data-line="${k}"><div class="b-ko">${escapeHtml(l.ko)}</div><div class="b-ja">${escapeHtml(l.ja)}</div>${score}</div>`;
    })
    .join("");

  $("t-start").hidden = started;
  $("t-turn").hidden = !myTurn;
  $("t-end").hidden = !finished;

  if (myTurn) {
    const r = talk.result;
    $("t-ja").textContent = line.ja;
    $("t-answer").hidden = !talk.revealed;
    $("t-ko").textContent = line.ko;
    $("t-pron").textContent = line.pron || "";
    $("t-note").textContent = line.note || "";

    $("t-result").hidden = !r;
    if (r && r.error) {
      $("t-score").textContent = r.error;
      $("t-heard").parentElement.hidden = true;
    } else if (r) {
      $("t-score").textContent = `${r.score}点　${scoreMessage(r.score)}`;
      $("t-heard").innerHTML = r.b.length ? marked(r.b, r.matchedB) : "（聞き取れず）";
      $("t-heard").parentElement.hidden = false;
    }

    $("t-mic").hidden = !Recognition;
    $("t-mic").classList.toggle("listening", talk.listening);
    $("t-mic").textContent = talk.listening
      ? "🎙️ 聞いてるよ…（押すと終了）"
      : r && !r.error ? "🎤 もう一回言ってみる" : "🎤 言ってみる";
    $("t-again").hidden = talk.step === 0 || d.lines[talk.step - 1].who !== "you";
    $("t-show").hidden = talk.revealed;
    $("t-model").hidden = !talk.revealed;
    $("t-next").hidden = !talk.revealed;
  }

  if (finished) {
    const vals = Object.values(talk.scores);
    const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    const s = talk.stats[talk.id];
    $("t-summary").innerHTML =
      `<div class="score">🎉 会話完了！</div>` +
      (avg !== null ? `<div>今回の平均：${avg}点（${scoreMessage(avg)}）</div>` : `<div>次は🎤で言ってみると点数が出るよ</div>`) +
      (s ? `<div class="stat">この会話：${s.done}回完了・最高 ${s.best}点</div>` : "");
  }
}

// ---- 操作 ----
$("t-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-talk]");
  if (!b) return;
  resetTalk(b.dataset.talk);
  renderTalk();
});

$("t-start").addEventListener("click", () => {
  talk.step = 0;
  runPartner();
});

$("t-log").addEventListener("click", (e) => {
  const b = e.target.closest("[data-line]");
  if (b) say(dialog().lines[Number(b.dataset.line)]);
});

$("t-mic").addEventListener("click", talkListen);
$("t-again").addEventListener("click", () => say(dialog().lines[talk.step - 1]));
$("t-show").addEventListener("click", () => {
  talk.revealed = true;
  renderTalk();
  say(dialog().lines[talk.step]);
});
$("t-model").addEventListener("click", () => say(dialog().lines[talk.step]));
$("t-next").addEventListener("click", nextTurn);

$("t-replay").addEventListener("click", () => {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  dialog().lines.forEach((l) => speechSynthesis.speak(utter(l)));
});
$("t-retry").addEventListener("click", () => {
  resetTalk(talk.id);
  talk.step = 0;
  runPartner();
});
$("t-following").addEventListener("click", () => {
  const k = DIALOGUES.findIndex((d) => d.id === talk.id);
  resetTalk(DIALOGUES[(k + 1) % DIALOGUES.length].id);
  renderTalk();
});
