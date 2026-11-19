"use strict";

/* =========================================================
   游戏配置
   ========================================================= */

const EMPTY = 0;
const HUMAN = 1; // 玩家：红棋
const AI = 2; // AI：黄棋
const WIN_SCORE = 1_000_000;
const SOUND_STORAGE_KEY = "connect4.sfx";

const BOARD_SIZES = {
  small: { cols: 7, rows: 6, maxWidth: 620, label: "Small" },
  medium: { cols: 8, rows: 7, maxWidth: 700, label: "Medium" },
  large: { cols: 9, rows: 8, maxWidth: 780, label: "Large" },
};

/* 用字符网格保存像素画，再转换成 SVG。
   每个字符对应调色板中的一个颜色，点号代表透明。 */
const CHICKEN_SPRITE = [
  "................",
  "......rr........",
  ".....rrrr.......",
  ".....rrrr.......",
  "...kkkkkkkk.....",
  "..kwwwwwwwwk....",
  ".kwwwwwwwwwwk...",
  ".kwweeeewwebwk..",
  ".kwweeebwweewk..",
  ".kwwwwwwwwwwk...",
  ".kwwwwoooowwk...",
  ".kwwwwoppowwwk..",
  ".kwwwwwwwwwwk...",
  "..kwwwwwwwwk....",
  "...kkkkkkkk.....",
  "..ooo....ooo....",
];

const CAT_SPRITE = [
  "................",
  "..kk......kk....",
  "..kgk....kgk....",
  "..kggk..kggk....",
  ".kggggkkggggk...",
  ".kggggggggggk...",
  ".kggggggggggk...",
  ".kggyyggyyggk...",
  ".kggybggbyggk...",
  ".kggggggggggk...",
  ".kgggggnnggggk..",
  ".kgggwwwwgggk...",
  ".kggwwkwwgggk...",
  "..kggggggggk....",
  "...kggggggk.....",
  "....kkkkkk......",
];

const TREX_SPRITE = [
  "..........................",
  "..............kkkkkkk.....",
  "............kkkgggggkkk...",
  "...........kkgggggggggkk..",
  "...........kgggggkkkgggk..",
  "..........kkgggggybbgggkkk",
  "..........kggggggyyykgkggk",
  "..........kgggggggkkkkkkgk",
  "..........kgggggggmtmtmtgk",
  "........kkkkggggggmmmmmmgk",
  "......kkkgggggggggtktktggk",
  ".....kkgggggggggggggggkkkk",
  "....kkggglgglgggggggkkk...",
  "...kkggglgglggggggkkk.....",
  ".kkkgggggglgglggggggk.....",
  ".kggggGgglgglggglllkkk....",
  ".kgGgggGlgglggggglgkgk....",
  ".kggGgggGGlGGlggtktkkk....",
  ".kggggggGlGGlGgggkkk......",
  ".kkkkkgggggggggggk........",
  ".....kgggggkgggggk........",
  "....kkgggggkgggggk........",
  "....kggggggggggggk........",
  "....kgtggtggtggtgk........",
  "....kggggggggggggk........",
  "....kkkkkkkkkkkkkk........",
];

const AI_PROFILES = {
  easy: {
    name: "Dizzy Cluck",
    level: "Easy",
    style: "Barnyard goof",
    motto: "“Bwok? Wait... whose turn is it?”",
    note: "A daydreaming chicken who pecks at random. A gentle warm-up.",
    ariaLabel: "Pixel-art chicken opponent",
    sprite: CHICKEN_SPRITE,
    palette: {
      k: "#241a2b",
      w: "#f2dfb2",
      r: "#ef4444",
      o: "#f59e0b",
      p: "#fb7185",
      e: "#ffffff",
      b: "#14121f",
    },
  },
  medium: {
    name: "Sly Whiskers",
    level: "Medium",
    style: "Schemer",
    motto: "“I saw that move three turns ago.”",
    note: "A sharp cat who pounces on every opening and blocks obvious threats.",
    ariaLabel: "Pixel-art cat opponent",
    sprite: CAT_SPRITE,
    palette: {
      k: "#0b1020",
      g: "#8c98b8",
      y: "#facc15",
      b: "#111827",
      n: "#ffb4c2",
      w: "#eef2ff",
    },
  },
  hard: {
    name: "Rex",
    level: "Hard",
    style: "Apex predator",
    motto: "“Your little discs look like snacks.”",
    note: "A ruthless T-Rex that plans five moves ahead. Bring a plan.",
    ariaLabel: "Pixel-art T-Rex opponent",
    sprite: TREX_SPRITE,
    palette: {
      k: "#0a101c",
      g: "#4a9b50",
      l: "#7ec75f",
      G: "#2d7032",
      y: "#facc15",
      b: "#0c0a12",
      t: "#fff7d6",
      m: "#b1262d",
    },
  },
};

/* =========================================================
   DOM
   ========================================================= */

const gamePanel = document.getElementById("game-panel");
const boardEl = document.getElementById("board");
const boardShell = document.getElementById("board-shell");
const turnIndicator = document.getElementById("turn-indicator");
const newGameBtn = document.getElementById("new-game");
const startGameBtn = document.getElementById("start-game");
const difficultySelect = document.getElementById("difficulty");
const boardSizeSelect = document.getElementById("board-size");
const startScreen = document.getElementById("start-screen");
const gameScreen = document.getElementById("game-screen");
const boardHint = document.getElementById("board-hint");
const soundToggle = document.getElementById("sound-toggle");

const opponentCard = document.getElementById("opponent-card");
const startAvatar = document.getElementById("start-avatar");
const opponentName = document.getElementById("opponent-name");
const opponentLevel = document.getElementById("opponent-level");
const opponentMotto = document.getElementById("opponent-motto");
const opponentNote = document.getElementById("opponent-note");
const opponentStyle = document.getElementById("opponent-style");
const startGridSize = document.getElementById("start-grid-size");

const gameOpponent = document.getElementById("game-opponent");
const gameAvatar = document.getElementById("game-avatar");
const gameOpponentName = document.getElementById("game-opponent-name");
const gameOpponentLevel = document.getElementById("game-opponent-level");
const gameGridSize = document.getElementById("game-grid-size");
const gameMode = document.getElementById("game-mode");

/* =========================================================
   状态
   ========================================================= */

let boardConfig = BOARD_SIZES[boardSizeSelect.value] ?? BOARD_SIZES.small;
let rows = boardConfig.rows;
let cols = boardConfig.cols;
let centerOrder = makeCenterOrder(cols);
let board = createEmptyBoard();
let currentTurn = HUMAN;
let difficulty = difficultySelect.value;
let gameStarted = false;
let gameOver = true;
let lastMove = null;
let winningCells = new Set();
let aiTimeoutId = null;
let gameId = 0;
let soundEnabled = readSoundPreference();
let audioContext = null;

/* =========================================================
   像素画
   ========================================================= */

function pixelSprite(sprite, palette) {
  const width = sprite[0].length;
  const rects = [];

  sprite.forEach((row, y) => {
    let x = 0;

    while (x < row.length) {
      const key = row[x];

      if (key === ".") {
        x += 1;
        continue;
      }

      let end = x + 1;
      while (end < row.length && row[end] === key) end += 1;

      rects.push(
        `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${palette[key] || "#ff00ff"}"/>`,
      );
      x = end;
    }
  });

  return `<svg class="pixel-art" viewBox="0 0 ${width} ${sprite.length}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects.join("")}</svg>`;
}

function renderOpponentProfile() {
  const profile = AI_PROFILES[difficulty] ?? AI_PROFILES.medium;
  const sprite = pixelSprite(profile.sprite, profile.palette);

  startAvatar.innerHTML = sprite;
  gameAvatar.innerHTML = sprite;
  startAvatar.setAttribute("aria-label", profile.ariaLabel);

  opponentName.textContent = profile.name;
  opponentLevel.textContent = profile.level.toUpperCase();
  opponentMotto.textContent = profile.motto;
  opponentNote.textContent = profile.note;
  opponentStyle.textContent = profile.style.toUpperCase();

  gameOpponentName.textContent = profile.name;
  gameOpponentLevel.textContent = `${profile.level.toUpperCase()} MODE`;
  gameMode.textContent = `${profile.level.toUpperCase()} AI`;

  gamePanel.dataset.rival = difficulty;
  opponentCard.dataset.rival = difficulty;
  gameOpponent.dataset.rival = difficulty;

  updateSetupMeta();
}

function updateSetupMeta() {
  const dims = `${cols} × ${rows}`;
  startGridSize.textContent = dims;
  gameGridSize.textContent = dims;
}

/* =========================================================
   音效（Web Audio 合成，不需要外部音频文件）
   ========================================================= */

function readSoundPreference() {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveSoundPreference() {
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? "on" : "off");
  } catch {
    // localStorage 不可用时，本次页面内仍然可以正常切换音效。
  }
}

function syncSoundButton() {
  soundToggle.textContent = soundEnabled ? "SFX ON" : "SFX OFF";
  soundToggle.classList.toggle("is-off", !soundEnabled);
  soundToggle.setAttribute("aria-pressed", String(soundEnabled));
  soundToggle.setAttribute(
    "aria-label",
    soundEnabled ? "Mute sound effects" : "Enable sound effects",
  );
}

function ensureAudioContext() {
  if (!soundEnabled) return null;

  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return null;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    return audioContext;
  } catch {
    return null;
  }
}

function playDropSound(player) {
  if (!soundEnabled) return;

  const ctx = ensureAudioContext();
  if (!ctx) return;

  try {
    const isHuman = player === HUMAN;
    const start = ctx.currentTime + 0.01;

    // 落子的“咻”声
    const swoop = ctx.createOscillator();
    const swoopGain = ctx.createGain();
    swoop.type = "square";
    swoop.frequency.setValueAtTime(isHuman ? 780 : 420, start);
    swoop.frequency.exponentialRampToValueAtTime(
      isHuman ? 190 : 90,
      start + 0.16,
    );
    swoopGain.gain.setValueAtTime(0.0001, start);
    swoopGain.gain.exponentialRampToValueAtTime(0.045, start + 0.012);
    swoopGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    swoop.connect(swoopGain).connect(ctx.destination);
    swoop.start(start);
    swoop.stop(start + 0.2);

    // 落到底部的低频“咚”
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = "triangle";
    thump.frequency.setValueAtTime(isHuman ? 170 : 105, start + 0.12);
    thump.frequency.exponentialRampToValueAtTime(55, start + 0.24);
    thumpGain.gain.setValueAtTime(0.0001, start + 0.12);
    thumpGain.gain.exponentialRampToValueAtTime(0.07, start + 0.14);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
    thump.connect(thumpGain).connect(ctx.destination);
    thump.start(start + 0.12);
    thump.stop(start + 0.28);
  } catch {
    // 某些浏览器可能限制音频；游戏逻辑不应因此中断。
  }
}

function playSoundToggleBlip() {
  if (!soundEnabled) return;

  const ctx = ensureAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1320, now + 0.06);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  } catch {
    // 忽略音频异常，保证按钮仍然可以切换静音状态。
  }
}

/* =========================================================
   开始 / 重置一局游戏
   ========================================================= */

function createEmptyBoard() {
  return Array.from({ length: rows }, () => Array(cols).fill(EMPTY));
}

function makeCenterOrder(columnCount) {
  const center = (columnCount - 1) / 2;
  return Array.from({ length: columnCount }, (_, index) => index).sort(
    (a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b,
  );
}

function syncBoardConfigFromSelect() {
  boardConfig =
    BOARD_SIZES[boardSizeSelect.value] ?? BOARD_SIZES.small;
  rows = boardConfig.rows;
  cols = boardConfig.cols;
  centerOrder = makeCenterOrder(cols);
}

function applyBoardMetrics() {
  boardShell.style.setProperty("--cols", String(cols));
  boardShell.style.setProperty("--rows", String(rows));
  boardShell.style.setProperty("--board-max", `${boardConfig.maxWidth}px`);
}

function startGame() {
  cancelAiMove();
  gameId += 1;

  syncBoardConfigFromSelect();
  board = createEmptyBoard();
  currentTurn = HUMAN;
  difficulty = difficultySelect.value;
  gameOver = false;
  gameStarted = true;
  lastMove = null;
  winningCells = new Set();

  startScreen.hidden = true;
  gameScreen.hidden = false;
  gamePanel.classList.add("is-playing");

  buildBoardUi();
  applyBoardMetrics();
  renderOpponentProfile();
  renderBoard();

  setThinking(false);
  setTurn("Your turn", "normal");
  boardHint.textContent =
    "Choose a column to drop your disc. First to connect four wins.";

  // 在用户点击“Start Game”的手势中解锁音频，之后 AI 落子也能发声。
  ensureAudioContext();
}

/* =========================================================
   棋盘渲染与玩家操作
   ========================================================= */

function buildBoardUi() {
  boardEl.innerHTML = "";

  for (let col = 0; col < cols; col += 1) {
    const column = document.createElement("button");
    column.type = "button";
    column.className = "column";
    column.dataset.col = String(col);
    column.setAttribute(
      "aria-label",
      `Drop a disc in column ${col + 1} of ${cols}`,
    );

    for (let row = 0; row < rows; row += 1) {
      const slot = document.createElement("span");
      slot.className = "slot";
      slot.dataset.row = String(row);
      slot.setAttribute("aria-hidden", "true");

      const disc = document.createElement("span");
      disc.className = "disc";
      slot.appendChild(disc);

      column.appendChild(slot);
    }

    column.addEventListener("pointerenter", () => previewColumn(col));
    column.addEventListener("pointerleave", clearPreview);
    column.addEventListener("focus", () => previewColumn(col));
    column.addEventListener("blur", clearPreview);

    boardEl.appendChild(column);
  }
}

function previewColumn(col) {
  clearPreview();

  if (
    !gameStarted ||
    gameOver ||
    currentTurn !== HUMAN ||
    !isColumnPlayable(board, col)
  ) {
    return;
  }

  const column = boardEl.querySelector(`.column[data-col="${col}"]`);
  if (!column) return;

  for (let row = rows - 1; row >= 0; row -= 1) {
    if (board[row][col] === EMPTY) {
      column.children[row].classList.add("preview");
      break;
    }
  }
}

function clearPreview() {
  boardEl.querySelectorAll(".slot.preview").forEach((slot) => {
    slot.classList.remove("preview");
  });
}

function renderBoard() {
  const isPlayerTurn = gameStarted && !gameOver && currentTurn === HUMAN;
  const columns = boardEl.querySelectorAll(".column");

  columns.forEach((column, col) => {
    const columnFull = !isColumnPlayable(board, col);
    const slots = column.querySelectorAll(".slot");

    slots.forEach((slot, row) => {
      const value = board[row][col];
      const disc = slot.firstElementChild;

      slot.className = "slot";
      disc.className = "disc";

      if (value !== EMPTY) {
        slot.classList.add(value === HUMAN ? "player-1" : "player-2");

        if (lastMove && lastMove.row === row && lastMove.col === col) {
          slot.classList.add("dropped");
        }

        if (winningCells.has(`${row},${col}`)) {
          slot.classList.add("winning");
        }
      }
    });

    column.disabled = !isPlayerTurn || columnFull;
    column.setAttribute(
      "aria-label",
      columnFull
        ? `Column ${col + 1} of ${cols}, full`
        : `Drop a disc in column ${col + 1} of ${cols}`,
    );
  });

  const sizeName = boardConfig.label.toLowerCase();
  let boardLabel;

  if (!gameStarted) {
    boardLabel = `Connect 4 board, ${sizeName}, game not started`;
  } else if (gameOver) {
    boardLabel = `Connect 4 board, ${sizeName}, game over`;
  } else if (currentTurn === HUMAN) {
    boardLabel = `Connect 4 board, ${sizeName}, your turn`;
  } else {
    boardLabel = `Connect 4 board, ${sizeName}, AI thinking`;
  }

  boardEl.setAttribute("aria-label", boardLabel);
  boardEl.setAttribute(
    "aria-busy",
    String(gameStarted && !gameOver && currentTurn === AI),
  );
}

function setThinking(isThinking) {
  gameOpponent.classList.toggle("is-thinking", isThinking);
  turnIndicator.classList.toggle("is-thinking", isThinking);
}

function setTurn(message, state = "normal") {
  turnIndicator.textContent = message;
  turnIndicator.classList.toggle("is-win", state === "win");
  turnIndicator.classList.toggle("is-loss", state === "loss");
  turnIndicator.classList.toggle("is-draw", state === "draw");
  turnIndicator.classList.toggle("is-thinking", state === "thinking");
  gameOpponent.classList.toggle("is-thinking", state === "thinking");
}

function handleHumanMove(col) {
  if (
    !gameStarted ||
    gameOver ||
    currentTurn !== HUMAN ||
    !isColumnPlayable(board, col)
  ) {
    return;
  }

  const move = dropDisc(board, col, HUMAN);
  if (!move) return;

  lastMove = move;
  playDropSound(HUMAN);

  const result = findWinningLine(board);
  if (result) {
    finishGame(HUMAN, result.cells);
    return;
  }

  if (isBoardFull(board)) {
    finishGame(null);
    return;
  }

  currentTurn = AI;
  setTurn("AI thinking...", "thinking");
  boardHint.textContent = "The AI is choosing its move.";
  renderBoard();
  scheduleAiMove();
}

boardEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const column = target.closest(".column");
  if (!column) return;

  handleHumanMove(Number(column.dataset.col));
});

/* =========================================================
   规则判断
   ========================================================= */

function isColumnPlayable(state, col) {
  return col >= 0 && col < cols && state[0][col] === EMPTY;
}

function dropDisc(state, col, player) {
  if (col < 0 || col >= cols) return null;

  for (let row = rows - 1; row >= 0; row -= 1) {
    if (state[row][col] === EMPTY) {
      state[row][col] = player;
      return { row, col };
    }
  }

  return null;
}

function isBoardFull(state) {
  return state.every((row) => row.every((cell) => cell !== EMPTY));
}

/**
 * 找出第一组连成四子的棋子。
 * 返回 { winner, cells }，其中 cells 是用于高亮的 [row, col] 数组。
 */
function findWinningLine(state) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const player = state[row][col];
      if (player === EMPTY) continue;

      for (const [dr, dc] of directions) {
        const cells = [[row, col]];

        for (let step = 1; step < 4; step += 1) {
          const nextRow = row + dr * step;
          const nextCol = col + dc * step;

          if (
            nextRow < 0 ||
            nextRow >= rows ||
            nextCol < 0 ||
            nextCol >= cols ||
            state[nextRow][nextCol] !== player
          ) {
            break;
          }

          cells.push([nextRow, nextCol]);
        }

        if (cells.length === 4) {
          return { winner: player, cells };
        }
      }
    }
  }

  return null;
}

function finishGame(winner, cells = []) {
  gameOver = true;
  winningCells = new Set(cells.map(([row, col]) => `${row},${col}`));
  setThinking(false);

  if (winner === HUMAN) {
    setTurn("You win!", "win");
    boardHint.textContent =
      "You connected four. Press New Game to play another round.";
  } else if (winner === AI) {
    setTurn("AI wins!", "loss");
    boardHint.textContent =
      "The AI connected four. Press New Game for a rematch.";
  } else {
    setTurn("Draw game", "draw");
    boardHint.textContent =
      "The board is full. Press New Game to try a different strategy.";
  }

  renderBoard();
}

/* =========================================================
   AI 搜索
   ========================================================= */

function copyBoard(state) {
  return state.map((row) => [...row]);
}

function getLegalColumns(state) {
  return centerOrder.filter((col) => isColumnPlayable(state, col));
}

function findWinningColumn(state, player) {
  for (const col of getLegalColumns(state)) {
    const nextBoard = copyBoard(state);
    dropDisc(nextBoard, col, player);

    const result = findWinningLine(nextBoard);
    if (result && result.winner === player) {
      return col;
    }
  }

  return null;
}

function evaluateWindow(windowValues) {
  let aiCount = 0;
  let humanCount = 0;

  for (const value of windowValues) {
    if (value === AI) aiCount += 1;
    if (value === HUMAN) humanCount += 1;
  }

  if (aiCount > 0 && humanCount > 0) return 0;

  if (aiCount === 3) return 90;
  if (aiCount === 2) return 12;
  if (aiCount === 1) return 1;

  if (humanCount === 3) return -110;
  if (humanCount === 2) return -14;
  if (humanCount === 1) return -1;

  return 0;
}

function evaluateBoard(state) {
  let score = 0;
  const centerCol = Math.floor(cols / 2);

  for (let row = 0; row < rows; row += 1) {
    if (state[row][centerCol] === AI) score += 8;
    if (state[row][centerCol] === HUMAN) score -= 8;
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols - 3; col += 1) {
      score += evaluateWindow([
        state[row][col],
        state[row][col + 1],
        state[row][col + 2],
        state[row][col + 3],
      ]);
    }
  }

  for (let row = 0; row < rows - 3; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      score += evaluateWindow([
        state[row][col],
        state[row + 1][col],
        state[row + 2][col],
        state[row + 3][col],
      ]);
    }
  }

  for (let row = 0; row < rows - 3; row += 1) {
    for (let col = 0; col < cols - 3; col += 1) {
      score += evaluateWindow([
        state[row][col],
        state[row + 1][col + 1],
        state[row + 2][col + 2],
        state[row + 3][col + 3],
      ]);
    }
  }

  for (let row = 3; row < rows; row += 1) {
    for (let col = 0; col < cols - 3; col += 1) {
      score += evaluateWindow([
        state[row][col],
        state[row - 1][col + 1],
        state[row - 2][col + 2],
        state[row - 3][col + 3],
      ]);
    }
  }

  return score;
}

function minimax(state, depth, alpha, beta, maximizingPlayer) {
  const result = findWinningLine(state);

  if (result) {
    return result.winner === AI ? WIN_SCORE + depth : -WIN_SCORE - depth;
  }

  if (isBoardFull(state)) return 0;
  if (depth === 0) return evaluateBoard(state);

  const legalColumns = getLegalColumns(state);
  if (legalColumns.length === 0) return 0;

  if (maximizingPlayer) {
    let bestScore = -Infinity;

    for (const col of legalColumns) {
      const nextBoard = copyBoard(state);
      dropDisc(nextBoard, col, AI);

      const score = minimax(nextBoard, depth - 1, alpha, beta, false);
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, bestScore);

      if (beta <= alpha) break;
    }

    return bestScore;
  }

  let bestScore = Infinity;

  for (const col of legalColumns) {
    const nextBoard = copyBoard(state);
    dropDisc(nextBoard, col, HUMAN);

    const score = minimax(nextBoard, depth - 1, alpha, beta, true);
    bestScore = Math.min(bestScore, score);
    beta = Math.min(beta, bestScore);

    if (beta <= alpha) break;
  }

  return bestScore;
}

function findBestMove(searchDepth) {
  const legalColumns = getLegalColumns(board);

  if (legalColumns.length === 0) return null;

  let bestScore = -Infinity;
  let bestColumn = legalColumns[0];

  for (const col of legalColumns) {
    const nextBoard = copyBoard(board);
    dropDisc(nextBoard, col, AI);

    const score = minimax(
      nextBoard,
      searchDepth - 1,
      -Infinity,
      Infinity,
      false,
    );

    if (score > bestScore) {
      bestScore = score;
      bestColumn = col;
    }
  }

  return bestColumn;
}

function chooseAiColumn() {
  const legalColumns = getLegalColumns(board);
  if (legalColumns.length === 0) return null;

  const winningMove = findWinningColumn(board, AI);

  if (difficulty === "easy") {
    if (winningMove !== null && Math.random() < 0.5) {
      return winningMove;
    }

    const blockMove = findWinningColumn(board, HUMAN);
    if (blockMove !== null && Math.random() < 0.5) {
      return blockMove;
    }

    return legalColumns[Math.floor(Math.random() * legalColumns.length)];
  }

  if (winningMove !== null) return winningMove;

  const blockMove = findWinningColumn(board, HUMAN);
  if (blockMove !== null) return blockMove;

  // 大棋盘的分支更多，Hard 仍然看 5 层，但通过 Alpha-Beta 剪枝控制耗时。
  const searchDepth = difficulty === "hard" ? 5 : 3;
  return findBestMove(searchDepth);
}

function scheduleAiMove() {
  cancelAiMove();

  const scheduleGameId = gameId;

  aiTimeoutId = window.setTimeout(() => {
    aiTimeoutId = null;

    if (
      !gameStarted ||
      gameOver ||
      currentTurn !== AI ||
      scheduleGameId !== gameId
    ) {
      return;
    }

    makeAiMove();
  }, 420);
}

function cancelAiMove() {
  if (aiTimeoutId !== null) {
    window.clearTimeout(aiTimeoutId);
    aiTimeoutId = null;
  }
}

function makeAiMove() {
  if (!gameStarted || gameOver || currentTurn !== AI) return;

  let col = chooseAiColumn();

  if (col === null || !isColumnPlayable(board, col)) {
    const fallbackColumns = getLegalColumns(board);

    if (fallbackColumns.length === 0) {
      finishGame(null);
      return;
    }

    col = fallbackColumns[0];
  }

  const move = dropDisc(board, col, AI);
  if (!move) return;

  lastMove = move;
  playDropSound(AI);

  const result = findWinningLine(board);
  if (result) {
    finishGame(AI, result.cells);
    return;
  }

  if (isBoardFull(board)) {
    finishGame(null);
    return;
  }

  currentTurn = HUMAN;
  setThinking(false);
  setTurn("Your turn", "normal");
  boardHint.textContent =
    "Choose a column to drop your disc. First to connect four wins.";
  renderBoard();
}

/* =========================================================
   界面事件
   ========================================================= */

newGameBtn.addEventListener("click", startGame);
startGameBtn.addEventListener("click", startGame);

difficultySelect.addEventListener("change", (event) => {
  difficulty = event.target.value;
  renderOpponentProfile();

  if (!gameStarted) {
    setTurn("Ready to play", "normal");
  }
});

boardSizeSelect.addEventListener("change", () => {
  syncBoardConfigFromSelect();

  if (gameStarted) {
    // 尺寸改变后直接开启新棋局，避免棋盘和实际网格尺寸不一致。
    const newSizeLabel = boardConfig.label;
    startGame();
    boardHint.textContent = `${newSizeLabel} board loaded. Choose a column to drop your disc.`;
    return;
  }

  board = createEmptyBoard();
  applyBoardMetrics();
  buildBoardUi();
  renderBoard();
  updateSetupMeta();
});

soundToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  saveSoundPreference();
  syncSoundButton();

  if (soundEnabled) {
    playSoundToggleBlip();
  }
});

/* =========================================================
   初始化
   ========================================================= */

syncBoardConfigFromSelect();
buildBoardUi();
applyBoardMetrics();
renderOpponentProfile();
renderBoard();
syncSoundButton();
