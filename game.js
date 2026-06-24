const START_CHOICES = 5;
const START_REQUIRED = 2;
const FAILURE_REVIEW_DELAY = 3200;
const HONSHU_PREFECTURES = new Set([
  "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都",
  "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県",
  "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県",
  "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県",
  "島根県", "岡山県", "広島県", "山口県",
]);
const KANTO_PREFECTURES = new Set([
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
]);
const KINKI_PREFECTURES = new Set([
  "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
]);

const elements = {
  choices: document.querySelector("#choices"),
  level: document.querySelector("#level"),
  choiceCount: document.querySelector("#choice-count"),
  requiredCount: document.querySelector("#required-count"),
  selectedCount: document.querySelector("#selected-count"),
  requiredTotal: document.querySelector("#required-total"),
  panel: document.querySelector("#result-panel"),
  judgement: document.querySelector("#judgement"),
  message: document.querySelector("#result-message"),
  detail: document.querySelector("#location-detail"),
  prefecture: document.querySelector("#detail-prefecture"),
  city: document.querySelector("#detail-city"),
  latitude: document.querySelector("#detail-latitude"),
  longitude: document.querySelector("#detail-longitude"),
  newGame: document.querySelector("#new-game"),
  overlay: document.querySelector("#game-over-overlay"),
  resultLevel: document.querySelector("#result-level"),
  gameOverMessage: document.querySelector("#game-over-message"),
  playAgain: document.querySelector("#play-again"),
  mode: document.querySelector("#game-mode"),
  nextLevel: document.querySelector("#next-level"),
  southCount: document.querySelector("#south-count"),
  failureResult: document.querySelector("#failure-result"),
  failureLevel: document.querySelector("#failure-level"),
  failureMessage: document.querySelector("#failure-message"),
  retryGame: document.querySelector("#retry-game"),
};

let level = 1;
let choiceCount = START_CHOICES;
let requiredCount = START_REQUIRED;
let round = [];
let selected = [];
let locked = false;
let audioContext;
let failureTimer;

function modeData() {
  const data = window.MUNICIPALITIES_DATA;
  switch (elements.mode.value) {
    case "tokyo":
      return data.filter((item) => item.prefecture === "東京都");
    case "osaka":
      return data.filter((item) => item.prefecture === "大阪府");
    case "kyoto":
      return data.filter((item) => item.prefecture === "京都府");
    case "cities":
      return data.filter((item) => item.city.endsWith("市"));
    case "kanto":
      return data.filter((item) => KANTO_PREFECTURES.has(item.prefecture));
    case "kinki":
      return data.filter((item) => KINKI_PREFECTURES.has(item.prefecture));
    case "honshu":
      return data.filter((item) => HONSHU_PREFECTURES.has(item.prefecture));
    default:
      return data;
  }
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function playTone(correct) {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
  const now = audioContext.currentTime;
  const notes = correct ? [660, 880] : [220, 150];

  notes.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = correct ? "sine" : "sawtooth";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + index * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.18, now + index * 0.1 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.1 + 0.14);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now + index * 0.1);
    oscillator.stop(now + index * 0.1 + 0.15);
  });
}

function sampleUniqueCities(count) {
  const usedNames = new Set();
  return shuffle(modeData())
    .filter((item) => {
      if (usedNames.has(item.city)) return false;
      usedNames.add(item.city);
      return true;
    })
    .slice(0, count);
}

function renderStatus() {
  elements.level.textContent = level;
  elements.choiceCount.textContent = choiceCount;
  elements.requiredCount.textContent = requiredCount;
  elements.selectedCount.textContent = selected.length;
  elements.requiredTotal.textContent = requiredCount;
}

function renderChoices() {
  elements.choices.replaceChildren();
  const fragment = document.createDocumentFragment();
  round.forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "choice";
    button.type = "button";
    button.dataset.index = String(index);

    const city = document.createElement("span");
    city.className = "choice-city";
    city.textContent = item.city;

    const answer = document.createElement("span");
    answer.className = "choice-answer";
    answer.hidden = true;

    const prefecture = document.createElement("span");
    prefecture.textContent = item.prefecture;
    const kana = document.createElement("span");
    kana.className = "choice-kana";
    kana.textContent = item.kana || "";
    const coordinates = document.createElement("span");
    coordinates.textContent =
      `緯度 ${Number(item.latitude).toFixed(4)} / 経度 ${Number(item.longitude).toFixed(4)}`;
    const rank = document.createElement("strong");
    rank.className = "choice-rank";

    answer.append(prefecture, kana, coordinates, rank);
    button.append(city, answer);
    fragment.appendChild(button);
  });
  elements.choices.appendChild(fragment);
}

function revealAnswers() {
  const ranks = new Map(
    [...round]
      .sort((a, b) => Number(b.latitude) - Number(a.latitude))
      .map((item, index) => [item, index + 1]),
  );

  document.querySelectorAll(".choice").forEach((button) => {
    const item = round[Number(button.dataset.index)];
    const answer = button.querySelector(".choice-answer");
    const rank = button.querySelector(".choice-rank");
    rank.textContent = `北から ${ranks.get(item)} 番目`;
    answer.hidden = false;
    button.classList.add("revealed");
    button.disabled = true;
  });
}

function showDetail(item) {
  elements.detail.hidden = false;
  elements.prefecture.textContent = item.prefecture;
  elements.city.textContent = item.city;
  elements.latitude.textContent = Number(item.latitude).toFixed(6);
  elements.longitude.textContent = Number(item.longitude).toFixed(6);
}

function beginRound() {
  const availableCount = new Set(modeData().map((item) => item.city)).size;
  if (choiceCount > availableCount) {
    locked = true;
    elements.resultLevel.textContent = level - 1;
    elements.gameOverMessage.textContent =
      `このモードの全${availableCount}市区町村を使い切りました。`;
    elements.overlay.hidden = false;
    return;
  }
  round = sampleUniqueCities(choiceCount);
  selected = [];
  locked = false;
  elements.panel.className = "result-panel";
  elements.judgement.textContent = "？";
  elements.message.textContent = "1つ目の市区町村を選んでください";
  elements.detail.hidden = true;
  elements.southCount.hidden = true;
  elements.nextLevel.hidden = true;
  renderStatus();
  renderChoices();
}

function startGame() {
  if (!Array.isArray(window.MUNICIPALITIES_DATA)) {
    elements.message.textContent = "市区町村データを読み込めませんでした。";
    return;
  }
  level = 1;
  choiceCount = START_CHOICES;
  requiredCount = START_REQUIRED;
  window.clearTimeout(failureTimer);
  elements.overlay.hidden = true;
  elements.failureResult.hidden = true;
  beginRound();
}

function finishSuccess() {
  locked = true;
  playTone(true);
  revealAnswers();
  elements.panel.className = "result-panel correct";
  elements.judgement.textContent = "○";
  elements.message.textContent =
    `${requiredCount}個を北から南の順に選べました。答え合わせ後、ボタンで次へ進んでください`;
  elements.nextLevel.hidden = false;
}

function finishFailure(message, resultMessage) {
  locked = true;
  playTone(false);
  revealAnswers();
  elements.panel.className = "result-panel wrong";
  elements.judgement.textContent = "×";
  elements.message.textContent = `${message} カードで答え合わせできます`;

  failureTimer = window.setTimeout(() => {
    elements.failureLevel.textContent = level;
    elements.failureMessage.textContent = resultMessage;
    elements.failureResult.hidden = false;
    elements.failureResult.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, FAILURE_REVIEW_DELAY);
}

elements.choices.addEventListener("click", (event) => {
  const button = event.target.closest(".choice");
  if (!button || button.disabled || locked) return;

  const item = round[Number(button.dataset.index)];
  const previous = selected.at(-1);
  selected.push(item);
  button.disabled = true;
  button.classList.add("selected");
  button.dataset.order = selected.length;
  showDetail(item);
  renderStatus();

  const remainingRequired = requiredCount - selected.length;
  const availableSouth = round.filter(
    (candidate) =>
      !selected.includes(candidate) &&
      Number(candidate.latitude) <= Number(item.latitude),
  ).length;
  elements.southCount.hidden = false;
  elements.southCount.textContent =
    `この場所より南側に選べる候補：${availableSouth}個`;

  if (previous && Number(item.latitude) > Number(previous.latitude)) {
    button.classList.add("wrong");
    finishFailure(
      `${item.city}は、直前の${previous.city}より北にあります。`,
      `レベル${level}の${selected.length}個目で順番が逆になりました。`,
    );
    return;
  }

  if (selected.length === requiredCount) {
    finishSuccess();
    return;
  }

  if (availableSouth < remainingRequired) {
    button.classList.add("wrong");
    finishFailure(
      `残り${remainingRequired}個を選ぶ必要がありますが、南側の候補は${availableSouth}個しかありません。`,
      `レベル${level}の${selected.length}個目で、必要な数を並べられなくなりました。`,
    );
    return;
  }

  if (previous) {
    playTone(true);
    elements.panel.className = "result-panel correct";
    elements.judgement.textContent = "○";
  } else {
    elements.panel.className = "result-panel";
    elements.judgement.textContent = "？";
  }
  elements.message.textContent =
    `${selected.length + 1}つ目を選択してください（今の緯度以下）`;
});

elements.newGame.addEventListener("click", startGame);
elements.playAgain.addEventListener("click", startGame);
elements.mode.addEventListener("change", startGame);
elements.nextLevel.addEventListener("click", () => {
  level += 1;
  choiceCount += 1;
  requiredCount += 1;
  beginRound();
});
elements.retryGame.addEventListener("click", startGame);

startGame();
