const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "小王", "大王"];
const SUITS = ["♠", "♥", "♣", "♦"];
const PLAYERS = ["human", "ai1", "ai2"];
const USER_KEY = "ddz_users_v1";
const SESSION_KEY = "ddz_current_user_v1";
const SUPABASE_REST_URL = "https://axpvwjybndwglkurzoqu.supabase.co/rest/v1";
const SUPABASE_PUBLIC_KEY = "sb_publishable_HE45_MzfzUx8pf1ZAyI1QQ_yPPQk7u7";
const memoryStore = {};
let persistentStorageAvailable = true;

function storageGet(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    persistentStorageAvailable = false;
    return memoryStore[key] ?? fallback;
  }
}

function storageSet(key, value) {
  memoryStore[key] = value;
  try {
    localStorage.setItem(key, value);
    persistentStorageAvailable = true;
    return true;
  } catch {
    persistentStorageAvailable = false;
    return false;
  }
}

function storageRemove(key) {
  delete memoryStore[key];
  try {
    localStorage.removeItem(key);
  } catch {
    persistentStorageAvailable = false;
    // 本地文件环境可能禁用存储，忽略即可。
  }
}

const state = {
  hands: { human: [], ai1: [], ai2: [] },
  roles: { human: "农民", ai1: "农民", ai2: "农民" },
  kitty: [],
  selected: new Set(),
  current: "human",
  landlord: null,
  phase: "idle",
  lastCombo: null,
  lastPlayer: null,
  passes: 0,
  messageTimer: null,
  thinkingPlayer: null,
  aiTimer: null,
  currentUser: storageGet(SESSION_KEY),
  accountMode: "login",
  rankMode: "wins",
  cloudRankRows: null,
  cloudRankLoading: false,
  cloudRankError: "",
  dragSelect: { active: false, mode: "add", seen: new Set(), moved: false },
};

const els = {
  table: document.querySelector("#table"),
  status: document.querySelector("#status"),
  accountName: document.querySelector("#accountName"),
  accountButton: document.querySelector("#accountButton"),
  rankButton: document.querySelector("#rankButton"),
  newGame: document.querySelector("#newGame"),
  hand: document.querySelector("#hand"),
  kitty: document.querySelector("#kitty"),
  dealLayer: document.querySelector("#dealLayer"),
  bidding: document.querySelector("#bidding"),
  bidYes: document.querySelector("#bidYes"),
  bidNo: document.querySelector("#bidNo"),
  playActions: document.querySelector("#playActions"),
  play: document.querySelector("#play"),
  pass: document.querySelector("#pass"),
  hint: document.querySelector("#hint"),
  lastSummary: document.querySelector("#lastSummary"),
  accountDialog: document.querySelector("#accountDialog"),
  accountForm: document.querySelector("#accountForm"),
  accountTitle: document.querySelector("#accountTitle"),
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
  confirmWrap: document.querySelector("#confirmWrap"),
  confirmPassword: document.querySelector("#confirmPassword"),
  accountMessage: document.querySelector("#accountMessage"),
  toggleAccountMode: document.querySelector("#toggleAccountMode"),
  submitAccount: document.querySelector("#submitAccount"),
  closeAccount: document.querySelector("#closeAccount"),
  rankDialog: document.querySelector("#rankDialog"),
  closeRank: document.querySelector("#closeRank"),
  rankList: document.querySelector("#rankList"),
  panels: {
    human: document.querySelector("#humanPanel"),
    ai1: document.querySelector("#ai1Panel"),
    ai2: document.querySelector("#ai2Panel"),
  },
  counts: {
    ai1: document.querySelector("#ai1Count"),
    ai2: document.querySelector("#ai2Count"),
  },
  roles: {
    human: document.querySelector("#humanRole"),
    ai1: document.querySelector("#ai1Role"),
    ai2: document.querySelector("#ai2Role"),
  },
  last: {
    human: document.querySelector("#humanLast"),
    ai1: document.querySelector("#ai1Last"),
    ai2: document.querySelector("#ai2Last"),
  },
  rankTabs: [...document.querySelectorAll(".rank-tab")],
};

function createDeck() {
  const deck = [];
  for (const rank of RANKS.slice(0, 13)) {
    for (const suit of SUITS) {
      deck.push({ rank, suit, value: RANKS.indexOf(rank), id: `${rank}${suit}` });
    }
  }
  deck.push({ rank: "小王", suit: "☆", value: 13, id: "joker-small" });
  deck.push({ rank: "大王", suit: "★", value: 14, id: "joker-big" });
  return deck;
}

function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sortCards(cards) {
  return cards.sort((a, b) => a.value - b.value || a.suit.localeCompare(b.suit));
}

function startGame() {
  window.clearTimeout(state.aiTimer);
  const deck = shuffle(createDeck());
  state.hands.human = sortCards(deck.slice(0, 17));
  state.hands.ai1 = sortCards(deck.slice(17, 34));
  state.hands.ai2 = sortCards(deck.slice(34, 51));
  state.kitty = sortCards(deck.slice(51));
  state.selected.clear();
  state.current = "human";
  state.landlord = null;
  state.phase = "dealing";
  state.lastCombo = null;
  state.lastPlayer = null;
  state.passes = 0;
  state.thinkingPlayer = null;
  for (const player of PLAYERS) {
    state.roles[player] = "农民";
    renderLast(player, []);
  }
  setStatus("正在发牌...");
  render();
  animateDeal(() => {
    state.phase = "bidding";
    setStatus("你先决定是否叫地主。");
    render();
  });
}

function animateDeal(done) {
  els.dealLayer.innerHTML = "";
  els.table.classList.add("dealing");
  const tableRect = els.table.getBoundingClientRect();
  const targets = {
    human: pointTo(els.hand.getBoundingClientRect(), tableRect, 0.5, 0.72),
    ai1: pointTo(els.panels.ai1.getBoundingClientRect(), tableRect, 0.46, 0.62),
    ai2: pointTo(els.panels.ai2.getBoundingClientRect(), tableRect, 0.54, 0.62),
  };
  Array.from({ length: 51 }, (_, index) => PLAYERS[index % 3]).forEach((player, index) => {
    const card = document.createElement("div");
    const jitterX = (Math.random() - 0.5) * 46;
    const jitterY = (Math.random() - 0.5) * 22;
    card.className = "deal-card";
    card.style.setProperty("--tx", `${targets[player].x + jitterX}px`);
    card.style.setProperty("--ty", `${targets[player].y + jitterY}px`);
    card.style.setProperty("--rot", `${(Math.random() - 0.5) * 18}deg`);
    card.style.animationDelay = `${index * 16}ms`;
    els.dealLayer.appendChild(card);
  });
  window.setTimeout(() => {
    els.table.classList.remove("dealing");
    els.dealLayer.innerHTML = "";
    done();
  }, 1380);
}

function pointTo(rect, tableRect, xRatio, yRatio) {
  return {
    x: rect.left + rect.width * xRatio - (tableRect.left + tableRect.width / 2),
    y: rect.top + rect.height * yRatio - (tableRect.top + tableRect.height / 2),
  };
}

function setLandlord(player) {
  state.landlord = player;
  for (const p of PLAYERS) state.roles[p] = p === player ? "地主" : "农民";
  state.hands[player].push(...state.kitty);
  sortCards(state.hands[player]);
  state.current = player;
  state.phase = "play";
  setStatus(`${nameOf(player)}成为地主，${nameOf(player)}先出牌。`);
  render();
  maybeAiTurn();
}

function declineLandlord() {
  const strengths = ["ai1", "ai2"].map((p) => ({ player: p, score: handScore(state.hands[p]) + Math.random() * 5 }));
  const chosen = strengths.sort((a, b) => b.score - a.score)[0];
  setLandlord(chosen.player);
}

function handScore(cards) {
  const groups = groupByValue(cards);
  let score = cards.reduce((sum, card) => sum + Math.max(0, card.value - 7), 0);
  for (const cardsOfRank of groups.values()) {
    if (cardsOfRank.length === 4) score += 13;
    if (cardsOfRank.length === 3) score += 5;
  }
  return score;
}

function render() {
  const busy = state.phase === "dealing" || Boolean(state.thinkingPlayer);
  els.bidding.classList.toggle("hidden", state.phase !== "bidding");
  els.playActions.classList.toggle("hidden", state.phase !== "play");
  els.newGame.disabled = state.phase === "dealing";
  els.play.disabled = state.phase !== "play" || state.current !== "human" || busy;
  els.pass.disabled = state.phase !== "play" || state.current !== "human" || !state.lastCombo || busy;
  els.hint.disabled = state.phase !== "play" || state.current !== "human" || busy;
  els.bidYes.disabled = busy;
  els.bidNo.disabled = busy;
  renderAccountBar();

  for (const player of PLAYERS) {
    els.roles[player].textContent = state.roles[player];
    els.panels[player].classList.toggle("active", state.phase === "play" && state.current === player);
    els.panels[player].classList.toggle("thinking", state.thinkingPlayer === player);
  }
  els.counts.ai1.textContent = state.hands.ai1.length;
  els.counts.ai2.textContent = state.hands.ai2.length;

  els.kitty.innerHTML = "";
  if (state.landlord) {
    state.kitty.forEach((card) => els.kitty.appendChild(cardNode(card, true)));
  } else {
    for (let i = 0; i < 3; i++) els.kitty.appendChild(cardBackNode(true));
  }

  els.hand.innerHTML = "";
  els.hand.style.setProperty("--overlap", `${handOverlap(state.hands.human.length)}px`);
  state.hands.human.forEach((card) => {
    const node = cardNode(card, false);
    node.dataset.cardId = card.id;
    node.classList.toggle("selected", state.selected.has(card.id));
    els.hand.appendChild(node);
  });

  els.lastSummary.textContent = state.lastCombo ? comboText(state.lastCombo) : "无";
}

function renderAccountBar() {
  els.accountName.textContent = state.currentUser || "游客";
  els.accountButton.textContent = state.currentUser ? "切换账号" : "登录";
}

function handOverlap(count) {
  if (count <= 12) return -22;
  if (count <= 17) return -29;
  return -35;
}

function cardNode(card, small) {
  const node = document.createElement("button");
  const isJoker = card.rank.includes("王");
  node.type = "button";
  node.className = `card${small ? " small" : ""}${isRed(card) ? " red" : ""}${isJoker ? " joker" : ""}`;
  node.title = `${card.rank}${card.suit}`;
  node.innerHTML = `
    <span class="corner">
      <span class="rank">${card.rank}</span>
      <span class="suit">${card.suit}</span>
    </span>
    <span class="center-mark">${card.suit}</span>
  `;
  return node;
}

function cardBackNode(small) {
  const node = document.createElement("div");
  node.className = `card back${small ? " small" : ""}`;
  return node;
}

function isRed(card) {
  return card.suit === "♥" || card.suit === "♦";
}

function toggleCard(id) {
  if (state.phase !== "play" || state.current !== "human" || state.thinkingPlayer) return;
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  render();
}

function setCardSelection(id, selected) {
  if (selected) state.selected.add(id);
  else state.selected.delete(id);
  const node = [...els.hand.querySelectorAll(".card")].find((card) => card.dataset.cardId === id);
  if (node) node.classList.toggle("selected", selected);
}

function selectedCards() {
  return state.hands.human.filter((card) => state.selected.has(card.id));
}

function playHuman() {
  const cards = selectedCards();
  const combo = analyze(cards);
  if (!combo) return flash("这组牌暂时不能这样出。");
  if (!canBeat(combo, state.lastCombo)) return flash("需要出更大的同牌型，炸弹和王炸除外。");
  commitPlay("human", cards, combo);
}

function passHuman() {
  if (!state.lastCombo) return;
  commitPass("human");
}

function commitPlay(player, cards, combo) {
  removeCards(state.hands[player], cards);
  state.selected.clear();
  state.thinkingPlayer = null;
  state.lastCombo = combo;
  state.lastPlayer = player;
  state.passes = 0;
  renderLast(player, cards);
  setStatus(`${nameOf(player)}出了 ${comboText(combo)}。`);
  if (state.hands[player].length === 0) return finish(player);
  state.current = nextPlayer(player);
  render();
  maybeAiTurn();
}

function commitPass(player) {
  state.thinkingPlayer = null;
  renderLast(player, null);
  state.passes += 1;
  setStatus(`${nameOf(player)}不要。`);
  if (state.passes >= 2) {
    state.current = state.lastPlayer;
    state.lastCombo = null;
    state.passes = 0;
    setStatus(`${nameOf(state.current)}重新领出。`);
  } else {
    state.current = nextPlayer(player);
  }
  render();
  maybeAiTurn();
}

function finish(winner) {
  const landlordWon = winner === state.landlord;
  const humanWon = state.roles.human === (landlordWon ? "地主" : "农民");
  state.phase = "finished";
  state.thinkingPlayer = null;
  recordGame(humanWon);
  setStatus(`${nameOf(winner)}出完了，${humanWon ? "你赢了！" : "你输了，再来一局。"}`);
  render();
}

function maybeAiTurn() {
  if (state.phase !== "play" || state.current === "human") return;
  const player = state.current;
  state.thinkingPlayer = player;
  setStatus(`${nameOf(player)}正在思考...`);
  render();
  const delay = Math.min(520 + Math.floor(Math.random() * 520) + tablePressure(player) * 130, 1450);
  state.aiTimer = window.setTimeout(() => {
    const play = chooseAiPlay(player);
    if (play) commitPlay(player, play.cards, play.combo);
    else commitPass(player);
  }, delay);
}

function tablePressure(player) {
  const opponents = PLAYERS.filter((p) => state.roles[p] !== state.roles[player]);
  const lowOpponent = opponents.some((p) => state.hands[p].length <= 3);
  const mustBeat = Boolean(state.lastCombo && state.lastPlayer && state.roles[player] !== state.roles[state.lastPlayer]);
  return (lowOpponent ? 3 : 0) + (mustBeat ? 1 : 0);
}

function chooseAiPlay(player) {
  const hand = state.hands[player];
  const all = generateCandidates(hand);
  if (state.lastCombo && state.lastPlayer && state.roles[player] === state.roles[state.lastPlayer]) {
    const winningPlay = all
      .filter((item) => item.cards.length === hand.length && canBeat(item.combo, state.lastCombo))
      .sort((a, b) => aiPlayScore(player, a) - aiPlayScore(player, b))[0];
    return winningPlay || null;
  }
  const candidates = all
    .filter((item) => canBeat(item.combo, state.lastCombo))
    .filter((item) => shouldSpendBomb(player, item))
    .sort((a, b) => aiPlayScore(player, a) - aiPlayScore(player, b));
  return candidates[0] || null;
}

function shouldSpendBomb(player, item) {
  if (item.combo.type !== "bomb" && item.combo.type !== "rocket") return true;
  if (!state.lastCombo) return state.hands[player].length <= item.cards.length + 2;
  if (state.lastCombo.type === "bomb" || state.lastCombo.type === "rocket") return true;
  const opponents = PLAYERS.filter((p) => state.roles[p] !== state.roles[player]);
  return opponents.some((p) => state.hands[p].length <= 3) || state.hands[player].length <= item.cards.length + 1;
}

function aiPlayScore(player, item) {
  const handAfter = state.hands[player].filter((card) => !item.cards.some((used) => used.id === card.id));
  const keepBomb = item.combo.type === "bomb" || item.combo.type === "rocket" ? 48 : 0;
  const leadBonus = state.lastCombo ? 0 : leadPreference(item.combo);
  const endBonus = handAfter.length === 0 ? -500 : handAfter.length <= 2 ? -70 : 0;
  return handShapeCost(handAfter) + item.combo.value * 0.7 + keepBomb + leadBonus + endBonus;
}

function leadPreference(combo) {
  const scores = {
    straight: -34,
    "pair-straight": -32,
    airplane: -38,
    "airplane-single": -36,
    "airplane-pair": -36,
    "triple-single": -20,
    "triple-pair": -22,
    triple: -14,
    pair: -8,
    single: 4,
    bomb: 60,
    rocket: 80,
  };
  return scores[combo.type] ?? 0;
}

function handShapeCost(cards) {
  if (!cards.length) return -100;
  const groups = [...groupByValue(cards).values()].map((group) => group.length);
  const singles = groups.filter((count) => count === 1).length;
  const pairs = groups.filter((count) => count === 2).length;
  const triples = groups.filter((count) => count === 3).length;
  const bombs = groups.filter((count) => count === 4).length;
  return cards.length * 7 + singles * 5 + pairs * 2 - triples * 4 - bombs * 8;
}

function generateCandidates(hand) {
  const groups = groupByValue(hand);
  const result = [];
  for (const cards of groups.values()) {
    [1, 2, 3, 4].forEach((n) => {
      if (cards.length >= n) addCandidate(result, cards.slice(0, n));
    });
  }
  const jokers = hand.filter((card) => card.value >= 13);
  if (jokers.length === 2) addCandidate(result, jokers);
  addRuns(result, hand, 1, 5);
  addRuns(result, hand, 2, 3);
  addRuns(result, hand, 3, 2);
  addTriplesWith(result, hand, groups);
  return uniqueCandidates(result);
}

function addCandidate(result, cards) {
  const combo = analyze(cards);
  if (combo) result.push({ cards, combo });
}

function addRuns(result, hand, needCount, minLen) {
  const groups = groupByValue(hand);
  const values = [...groups.keys()].filter((v) => v < 12 && groups.get(v).length >= needCount).sort((a, b) => a - b);
  let run = [];
  for (const value of values) {
    if (!run.length || value === run[run.length - 1] + 1) run.push(value);
    else run = [value];
    if (run.length >= minLen) {
      for (let start = 0; start <= run.length - minLen; start++) {
        const slice = run.slice(start);
        if (slice.length >= minLen) addCandidate(result, slice.flatMap((v) => groups.get(v).slice(0, needCount)));
      }
    }
  }
}

function addTriplesWith(result, hand, groups) {
  for (const [value, cards] of groups.entries()) {
    if (cards.length < 3) continue;
    const triple = cards.slice(0, 3);
    const singles = hand.filter((card) => card.value !== value);
    if (singles.length) addCandidate(result, [...triple, singles[0]]);
    const pair = [...groups.entries()].find(([v, cs]) => v !== value && cs.length >= 2);
    if (pair) addCandidate(result, [...triple, ...pair[1].slice(0, 2)]);
  }
}

function uniqueCandidates(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.cards.map((card) => card.id).sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function analyze(cards) {
  if (!cards.length) return null;
  const sorted = sortCards([...cards]);
  const values = sorted.map((card) => card.value);
  const counts = [...groupByValue(sorted).entries()]
    .map(([value, cs]) => ({ value, count: cs.length }))
    .sort((a, b) => a.value - b.value);
  const countPattern = counts.map((item) => item.count).sort((a, b) => b - a).join("-");
  const len = sorted.length;
  if (len === 2 && values.includes(13) && values.includes(14)) return combo("rocket", len, 99);
  if (len === 4 && countPattern === "4") return combo("bomb", len, counts[0].value);
  if (len === 1) return combo("single", len, values[0]);
  if (len === 2 && countPattern === "2") return combo("pair", len, counts[0].value);
  if (len === 3 && countPattern === "3") return combo("triple", len, counts[0].value);
  if (len === 4 && countPattern === "3-1") return combo("triple-single", len, maxCountValue(counts, 3));
  if (len === 5 && countPattern === "3-2") return combo("triple-pair", len, maxCountValue(counts, 3));
  if (len >= 5 && countPattern.split("-").every((c) => c === "1") && isConsecutive(values)) return combo("straight", len, values.at(-1));
  if (len >= 6 && len % 2 === 0 && counts.every((item) => item.count === 2) && isConsecutive(counts.map((item) => item.value))) return combo("pair-straight", len, counts.at(-1).value);
  if (len >= 6 && len % 3 === 0 && counts.every((item) => item.count === 3) && isConsecutive(counts.map((item) => item.value))) return combo("airplane", len, counts.at(-1).value);
  if (len >= 8 && len % 4 === 0 && airplaneWithWings(counts, 1)) return combo("airplane-single", len, topTripleValue(counts));
  if (len >= 10 && len % 5 === 0 && airplaneWithWings(counts, 2)) return combo("airplane-pair", len, topTripleValue(counts));
  if (len === 6 && countPattern === "4-1-1") return combo("four-two-single", len, maxCountValue(counts, 4));
  if (len === 8 && countPattern === "4-2-2") return combo("four-two-pair", len, maxCountValue(counts, 4));
  return null;
}

function combo(type, length, value) {
  return { type, length, value };
}

function canBeat(combo, target) {
  if (!target) return true;
  if (combo.type === "rocket") return target.type !== "rocket";
  if (combo.type === "bomb" && target.type !== "bomb" && target.type !== "rocket") return true;
  return combo.type === target.type && combo.length === target.length && combo.value > target.value;
}

function groupByValue(cards) {
  const groups = new Map();
  for (const card of cards) {
    if (!groups.has(card.value)) groups.set(card.value, []);
    groups.get(card.value).push(card);
  }
  return groups;
}

function isConsecutive(values) {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.some((v) => v >= 12)) return false;
  return unique.every((value, index) => index === 0 || value === unique[index - 1] + 1);
}

function maxCountValue(counts, count) {
  return counts.find((item) => item.count === count).value;
}

function topTripleValue(counts) {
  return Math.max(...counts.filter((item) => item.count >= 3).map((item) => item.value));
}

function airplaneWithWings(counts, wingSize) {
  const triples = counts.filter((item) => item.count >= 3).map((item) => item.value).sort((a, b) => a - b);
  for (let start = 0; start < triples.length; start++) {
    for (let end = start + 1; end <= triples.length; end++) {
      const run = triples.slice(start, end);
      if (run.length < 2 || !isConsecutive(run)) continue;
      const leftovers = counts
        .map((item) => ({ value: item.value, count: run.includes(item.value) ? item.count - 3 : item.count }))
        .filter((item) => item.count > 0);
      const wingCards = leftovers.reduce((sum, item) => sum + item.count, 0);
      if (wingCards !== run.length * wingSize) continue;
      if (wingSize === 1 || leftovers.every((item) => item.count === 2)) return true;
    }
  }
  return false;
}

function removeCards(hand, cards) {
  for (const card of cards) {
    const index = hand.findIndex((item) => item.id === card.id);
    if (index >= 0) hand.splice(index, 1);
  }
}

function nextPlayer(player) {
  return PLAYERS[(PLAYERS.indexOf(player) + 1) % PLAYERS.length];
}

function nameOf(player) {
  return player === "human" ? "你" : player === "ai1" ? "左手 AI" : "右手 AI";
}

function comboText(combo) {
  const names = {
    single: "单张",
    pair: "对子",
    triple: "三张",
    "triple-single": "三带一",
    "triple-pair": "三带二",
    straight: "顺子",
    "pair-straight": "连对",
    airplane: "飞机",
    "airplane-single": "飞机带单",
    "airplane-pair": "飞机带对",
    "four-two-single": "四带二",
    "four-two-pair": "四带两对",
    bomb: "炸弹",
    rocket: "王炸",
  };
  return names[combo.type] || combo.type;
}

function renderLast(player, cards) {
  const box = els.last[player];
  box.innerHTML = "";
  if (cards === null) {
    box.textContent = "不要";
    return;
  }
  cards.forEach((card) => box.appendChild(cardNode(card, true)));
}

function flash(text) {
  setStatus(text);
  window.clearTimeout(state.messageTimer);
  state.messageTimer = window.setTimeout(() => renderStatusByTurn(), 1600);
}

function setStatus(text) {
  els.status.textContent = text;
}

function renderStatusByTurn() {
  if (state.phase === "play") setStatus(`轮到${nameOf(state.current)}。`);
}

function hint() {
  const candidates = generateCandidates(state.hands.human)
    .filter((item) => canBeat(item.combo, state.lastCombo))
    .sort((a, b) => aiPlayScore("human", a) - aiPlayScore("human", b));
  const pick = candidates[0];
  state.selected.clear();
  if (!pick) flash("没有能压过的牌，可以不要。");
  else pick.cards.forEach((card) => state.selected.add(card.id));
  render();
}

function users() {
  try {
    return JSON.parse(storageGet(USER_KEY, "{}")) || {};
  } catch {
    return {};
  }
}

function saveUsers(value) {
  return storageSet(USER_KEY, JSON.stringify(value));
}

function ensureUserStats(user = {}) {
  user.games ??= 0;
  user.wins ??= 0;
  user.streak ??= 0;
  user.bestStreak ??= 0;
  return user;
}

function recordGame(won) {
  if (!state.currentUser) return;
  const data = users();
  const user = ensureUserStats(data[state.currentUser]);
  user.games += 1;
  if (won) {
    user.wins += 1;
    user.streak += 1;
    user.bestStreak = Math.max(user.bestStreak, user.streak);
  } else {
    user.streak = 0;
  }
  data[state.currentUser] = user;
  saveUsers(data);
  saveCloudScore(state.currentUser, user);
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_PUBLIC_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function saveCloudScore(name, stats) {
  try {
    const response = await fetch(`${SUPABASE_REST_URL}/doudizhu_scores?on_conflict=player_name`, {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify({
        player_name: name,
        games: stats.games,
        wins: stats.wins,
        streak: stats.streak,
        best_streak: stats.bestStreak,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    state.cloudRankError = "";
    state.cloudRankRows = null;
  } catch (error) {
    console.warn("Supabase 保存失败：", error);
    state.cloudRankError = "云端保存失败，已先保存到本机。";
  }
}

async function loadCloudRanks() {
  const response = await fetch(
    `${SUPABASE_REST_URL}/doudizhu_scores?select=player_name,games,wins,streak,best_streak&order=wins.desc&limit=100`,
    { headers: supabaseHeaders() }
  );
  if (!response.ok) throw new Error(await response.text());
  const rows = await response.json();
  return rows.map((row) => ({
    name: row.player_name,
    games: row.games,
    wins: row.wins,
    rate: row.games ? row.wins / row.games : 0,
    streak: row.best_streak,
  }));
}

function openAccount() {
  state.accountMode = "login";
  renderAccountForm();
  openModal(els.accountDialog);
  els.username.focus();
}

function renderAccountForm() {
  const isRegister = state.accountMode === "register";
  els.accountTitle.textContent = isRegister ? "注册账号" : "登录账号";
  els.confirmWrap.classList.toggle("hidden", !isRegister);
  els.confirmPassword.required = isRegister;
  els.submitAccount.textContent = isRegister ? "注册" : "登录";
  els.toggleAccountMode.textContent = isRegister ? "去登录" : "去注册";
  els.accountMessage.textContent = "";
  els.password.value = "";
  els.confirmPassword.value = "";
}

function submitAccount(event) {
  event.preventDefault();
  const name = els.username.value.trim();
  const password = els.password.value;
  const confirm = els.confirmPassword.value;
  if (!/^[\w\u4e00-\u9fa5]{2,16}$/.test(name)) {
    els.accountMessage.textContent = "用户名需要 2-16 位，可用中文、字母、数字或下划线。";
    return;
  }
  if (password.length < 4) {
    els.accountMessage.textContent = "密码至少 4 位。";
    return;
  }
  const data = users();
  if (state.accountMode === "register") {
    if (data[name]) {
      els.accountMessage.textContent = "这个用户名已经注册。";
      return;
    }
    if (password !== confirm) {
      els.accountMessage.textContent = "两次输入的密码不一致。";
      return;
    }
    data[name] = ensureUserStats({ password });
    saveUsers(data);
  } else if (!data[name] || data[name].password !== password) {
    els.accountMessage.textContent = "用户名或密码不正确。";
    return;
  }
  state.currentUser = name;
  storageSet(SESSION_KEY, name);
  if (!persistentStorageAvailable) {
    els.accountMessage.textContent = "已登录；当前浏览器无法永久保存，刷新后账号可能消失。";
    window.setTimeout(() => {
      closeModal(els.accountDialog);
      render();
    }, 900);
    return;
  }
  closeModal(els.accountDialog);
  render();
}

function openRank() {
  renderRank();
  openModal(els.rankDialog);
  refreshCloudRanks();
}

function renderRank() {
  els.rankTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.rank === state.rankMode));
  const localRows = Object.entries(users()).map(([name, user]) => {
    const stats = ensureUserStats(user);
    return {
      name,
      games: stats.games,
      wins: stats.wins,
      rate: stats.games ? stats.wins / stats.games : 0,
      streak: stats.bestStreak,
    };
  });
  const rows = state.cloudRankRows?.length ? state.cloudRankRows : localRows;
  const sorted = rows.sort((a, b) => {
    if (state.rankMode === "wins") return b.wins - a.wins || b.rate - a.rate;
    if (state.rankMode === "rate") return b.rate - a.rate || b.wins - a.wins;
    return b.streak - a.streak || b.wins - a.wins;
  });
  els.rankList.innerHTML = "";
  if (state.cloudRankLoading) {
    els.rankList.innerHTML = `<div class="rank-row"><strong>读取中</strong><small>正在加载云端排行榜...</small></div>`;
    return;
  }
  if (!sorted.length) {
    const note = state.cloudRankError || "登录后完成对局即可上榜";
    els.rankList.innerHTML = `<div class="rank-row"><strong>暂无数据</strong><small>${escapeHtml(note)}</small></div>`;
    return;
  }
  if (state.cloudRankError) {
    const warning = document.createElement("div");
    warning.className = "rank-row rank-warning";
    warning.innerHTML = `<strong>提示</strong><small>${escapeHtml(state.cloudRankError)}</small><strong>本机</strong>`;
    els.rankList.appendChild(warning);
  }
  sorted.forEach((row, index) => {
    const main = state.rankMode === "wins" ? `${row.wins} 胜` : state.rankMode === "rate" ? `${Math.round(row.rate * 100)}%` : `${row.streak} 连胜`;
    const div = document.createElement("div");
    div.className = "rank-row";
    div.innerHTML = `
      <strong>#${index + 1}</strong>
      <div>
        <strong>${escapeHtml(row.name)}</strong>
        <small>${row.games} 局 / ${row.wins} 胜 / 最佳 ${row.streak} 连胜</small>
      </div>
      <strong>${main}</strong>
    `;
    els.rankList.appendChild(div);
  });
}

async function refreshCloudRanks() {
  state.cloudRankLoading = true;
  state.cloudRankError = "";
  renderRank();
  try {
    state.cloudRankRows = await loadCloudRanks();
  } catch (error) {
    console.warn("Supabase 读取失败：", error);
    state.cloudRankRows = null;
    state.cloudRankError = "云端排行榜读取失败，正在显示本机数据。";
  } finally {
    state.cloudRankLoading = false;
    renderRank();
  }
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function normalizeSession() {
  if (!state.currentUser) return;
  if (!users()[state.currentUser]) {
    state.currentUser = "";
    storageRemove(SESSION_KEY);
  }
}

function openModal(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    return;
  }
  dialog.setAttribute("open", "");
  dialog.classList.add("fallback-open");
}

function closeModal(dialog) {
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
  dialog.classList.remove("fallback-open");
}

function beginDragSelect(event) {
  if (state.phase !== "play" || state.current !== "human" || state.thinkingPlayer) return;
  const card = event.target.closest(".hand .card");
  if (!card?.dataset.cardId) return;
  event.preventDefault();
  els.hand.setPointerCapture(event.pointerId);
  state.dragSelect = {
    active: true,
    mode: state.selected.has(card.dataset.cardId) ? "remove" : "add",
    seen: new Set(),
    moved: false,
  };
  visitDragCard(card);
}

function moveDragSelect(event) {
  if (!state.dragSelect.active) return;
  event.preventDefault();
  state.dragSelect.moved = true;
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const card = element?.closest?.(".hand .card");
  if (card?.dataset.cardId) visitDragCard(card);
}

function endDragSelect(event) {
  if (!state.dragSelect.active) return;
  if (els.hand.hasPointerCapture(event.pointerId)) els.hand.releasePointerCapture(event.pointerId);
  const moved = state.dragSelect.moved;
  state.dragSelect.active = false;
  window.setTimeout(() => {
    state.dragSelect.moved = false;
  }, moved ? 80 : 0);
}

function visitDragCard(card) {
  const id = card.dataset.cardId;
  if (state.dragSelect.seen.has(id)) return;
  state.dragSelect.seen.add(id);
  setCardSelection(id, state.dragSelect.mode === "add");
}

els.newGame.addEventListener("click", startGame);
els.bidYes.addEventListener("click", () => setLandlord("human"));
els.bidNo.addEventListener("click", declineLandlord);
els.play.addEventListener("click", playHuman);
els.pass.addEventListener("click", passHuman);
els.hint.addEventListener("click", hint);
els.accountButton.addEventListener("click", openAccount);
els.rankButton.addEventListener("click", openRank);
els.closeAccount.addEventListener("click", () => closeModal(els.accountDialog));
els.closeRank.addEventListener("click", () => closeModal(els.rankDialog));
els.accountForm.addEventListener("submit", submitAccount);
els.toggleAccountMode.addEventListener("click", () => {
  state.accountMode = state.accountMode === "login" ? "register" : "login";
  renderAccountForm();
});
els.rankTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.rankMode = tab.dataset.rank;
    renderRank();
    if (!state.cloudRankRows && !state.cloudRankLoading) refreshCloudRanks();
  });
});
els.hand.addEventListener("pointerdown", beginDragSelect);
els.hand.addEventListener("pointermove", moveDragSelect);
els.hand.addEventListener("pointerup", endDragSelect);
els.hand.addEventListener("pointercancel", endDragSelect);

normalizeSession();
startGame();
