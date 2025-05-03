document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selections ---
    const themeToggleButton = document.getElementById('theme-toggle');
    const setupScreen = document.getElementById('setup-screen');
    const pvpButton = document.getElementById('pvp-button');
    const pveButton = document.getElementById('pve-button');
    const difficultySelection = document.getElementById('difficulty-selection');
    const difficultyButtons = document.querySelectorAll('.difficulty-button');
    const startGameButton = document.getElementById('start-game-button');
    // *** Select the new wrapper ***
    const startButtonWrapper = document.querySelector('.start-button-wrapper');
    const gameContainer = document.getElementById('game-container');
    const boardOuterContainer = document.querySelector('.board-outer-container');
    const boardElement = document.getElementById('game-board');
    const statusMessageElement = document.getElementById('status-message');
    const p1InfoElement = document.querySelector('.player-info.player1');
    const p2InfoElement = document.querySelector('.player-info.player2');
    const p1CountElement = document.getElementById('p1-count');
    const p2CountElement = document.getElementById('p2-count');
    const player2Label = document.getElementById('player2-label');
    const resetButton = document.getElementById('reset-button');
    const winPopup = document.getElementById('win-popup');
    const winPopupMessage = document.getElementById('win-popup-message');
    const playAgainButton = document.getElementById('play-again-button');
    const p1DominanceElement = document.getElementById('p1-dominance');
    const p2DominanceElement = document.getElementById('p2-dominance');

    // --- Game Settings ---
    const ROWS = 8;
    const COLS = 10;
    const PLAYER1 = 1;
    const PLAYER2 = 2;
    const AI_PLAYER = PLAYER2;
    const EXPLOSION_DELAY = 55;
    const AI_THINK_DELAY = 400;
    const MAX_EXPLOSION_STEPS = ROWS * COLS * 5;
    const MAX_VISUAL_ORBS = 3;
    const MIN_CELL_SIZE = 28;
    const MAX_CELL_SIZE = 60;

    // --- Audio Pitch Settings ---
    const MERGE_PITCH_MIN = 0.85;
    const MERGE_PITCH_MAX = 1.25;
    const BURST_PITCH_MIN = 0.8;
    const BURST_PITCH_MAX = 1.2;


    // --- Game State ---
    let boardState;
    let currentPlayer;
    let gameOver;
    let turnInProgress;
    let playerOrbCounts;
    let turnCount;
    let gameMode = null;
    let aiDifficulty = 'hard';
    let aiThinking = false;

    // --- Audio ---
    let mergeSound = null;
    let burstSound = null;
    try {
        mergeSound = new Audio('merge.mp3');
        burstSound = new Audio('burst.mp3');
        mergeSound.load();
        burstSound.load();
    } catch (e) {
        console.error("Error loading audio files:", e);
    }

    function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    function playSound(audioElement, pitchMin, pitchMax, soundName = 'sound') {
        if (audioElement && audioElement.readyState >= 2) {
            try {
                const randomPitch = randomInRange(pitchMin, pitchMax);
                audioElement.preservesPitch = false;
                audioElement.playbackRate = randomPitch;
                audioElement.currentTime = 0;
                const playPromise = audioElement.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        if (error.name !== 'NotAllowedError') {
                            console.error(`Error playing ${soundName}:`, error);
                        }
                    });
                }
            } catch (e) {
                console.error(`Error setting audio properties for ${soundName}:`, e);
            }
        }
    }

    function playMergeSound() { playSound(mergeSound, MERGE_PITCH_MIN, MERGE_PITCH_MAX, 'merge'); }
    function playBurstSound() { playSound(burstSound, BURST_PITCH_MIN, BURST_PITCH_MAX, 'burst'); }

    // --- Theme Logic ---
    function applyTheme(theme) {
        if (theme === 'dark') { document.body.classList.add('dark-theme'); themeToggleButton.textContent = '🌙'; localStorage.setItem('theme', 'dark'); }
        else { document.body.classList.remove('dark-theme'); themeToggleButton.textContent = '☀️'; localStorage.setItem('theme', 'light'); }
    }
    themeToggleButton.addEventListener('click', () => { applyTheme(document.body.classList.contains('dark-theme') ? 'light' : 'dark'); });
    applyTheme(localStorage.getItem('theme') || 'light');


    // --- Setup Logic ---
    pvpButton.addEventListener('click', () => selectMode('pvp'));
    pveButton.addEventListener('click', () => selectMode('pve'));
    difficultyButtons.forEach(button => { button.addEventListener('click', () => selectDifficulty(button.dataset.difficulty)); });
    // *** Add listener to the actual button, not the wrapper ***
    startGameButton.addEventListener('click', startGame);
    resetButton.addEventListener('click', resetToSetup);
    playAgainButton.addEventListener('click', () => { hideWinPopup(); resetToSetup(); });

    function resetToSetup() {
        gameContainer.style.display = 'none'; setupScreen.style.display = 'block';
        // *** Hide the wrapper ***
        if(startButtonWrapper) startButtonWrapper.style.display = 'none';
        difficultySelection.style.display = 'none';
        gameMode = null;
        difficultyButtons.forEach(btn => btn.classList.remove('selected'));
        document.querySelector(`.difficulty-button[data-difficulty="${aiDifficulty}"]`)?.classList.add('selected');
        hideWinPopup();
    }
    function selectMode(mode) {
        gameMode = mode;
        difficultySelection.style.display = (mode === 'pve') ? 'block' : 'none';
        if (mode === 'pve') selectDifficulty(aiDifficulty);
         // *** Show the wrapper ***
        if(startButtonWrapper) startButtonWrapper.style.display = 'block'; // Or 'flex'/'inline-block' depending on CSS
    }
    function selectDifficulty(difficulty) {
        aiDifficulty = difficulty;
        difficultyButtons.forEach(button => { button.classList.toggle('selected', button.dataset.difficulty === difficulty); });
    }
     function startGame() { setupScreen.style.display = 'none'; gameContainer.style.display = 'block'; initGame(); }


    // --- Initialization ---
    function initGame() {
        boardState = Array(ROWS).fill(null).map(() => Array(COLS).fill(null).map(() => ({ owner: null, orbs: 0 })));
        currentPlayer = PLAYER1; gameOver = false; turnInProgress = false; aiThinking = false;
        turnCount = 0; playerOrbCounts = { [PLAYER1]: 0, [PLAYER2]: 0 };

        boardElement.innerHTML = '';
        boardElement.classList.remove('game-over', 'ai-thinking');

        updateBoardSize(); // Calculate and set cell size first

        boardElement.style.gridTemplateColumns = `repeat(${COLS}, var(--cell-size))`;
        boardElement.style.gridTemplateRows = `repeat(${ROWS}, var(--cell-size))`;

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.addEventListener('click', handleCellClick);
                boardElement.appendChild(cell);
            }
        }
        player2Label.textContent = (gameMode === 'pve') ? `AI (${aiDifficulty.substring(0,1).toUpperCase()})` : 'P2';

        hideWinPopup(); updateStatus(); updateOrbCountsDisplay(); updateDominanceBar();
    }

    // --- Responsive Board Sizing ---
    function updateBoardSize() {
        if (!boardOuterContainer || !document.documentElement) return;
        const containerWidth = boardOuterContainer.clientWidth;
        const bodyHeight = document.body.clientHeight;
        const estimatedNonBoardHeight = 200;
        const availableHeight = Math.max(bodyHeight - estimatedNonBoardHeight, 150);

        if (containerWidth <= 0 || availableHeight <= 0) return;

        const sizeFromWidth = Math.floor(containerWidth / COLS) - 2;
        const sizeFromHeight = Math.floor(availableHeight / ROWS) - 2;
        let cellSize = Math.min(sizeFromWidth, sizeFromHeight);
        cellSize = Math.max(MIN_CELL_SIZE, Math.min(cellSize, MAX_CELL_SIZE));

        document.documentElement.style.setProperty('--cell-size', `${cellSize}px`);

        boardElement.style.gridTemplateColumns = `repeat(${COLS}, var(--cell-size))`;
        boardElement.style.gridTemplateRows = `repeat(${ROWS}, var(--cell-size))`;
    }

    // --- Game Logic Helpers ---
    function getCellCapacity(r, c) { const isCorner = (r === 0 || r === ROWS - 1) && (c === 0 || c === COLS - 1); const isEdge = !isCorner && (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1); if (isCorner) return 1; if (isEdge) return 2; return 3; }
    function getNeighbors(r, c) { const neighbors = []; const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]; for (const [dr, dc] of directions) { const nr = r + dr; const nc = c + dc; if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) { neighbors.push({ r: nr, c: nc }); } } return neighbors; }


    // --- Core Turn Logic ---
    async function handleCellClick(event) {
        if (gameOver || turnInProgress || aiThinking) return;
        const cellElement = event.currentTarget; const r = parseInt(cellElement.dataset.row); const c = parseInt(cellElement.dataset.col); const cellState = boardState[r]?.[c];
        if (!cellState || (cellState.owner !== null && cellState.owner !== currentPlayer)) return;
        if (gameMode === 'pve' && currentPlayer === AI_PLAYER) return;
        turnCount++; console.log(`Turn ${turnCount} started by Player ${currentPlayer}`);
        await processTurnAction(r, c, currentPlayer);
    }

    async function processTurnAction(r, c, player) {
        if (gameOver || !boardState[r]?.[c]) return;
        turnInProgress = true; aiThinking = (gameMode === 'pve' && player === AI_PLAYER);
        if (aiThinking) { boardElement.classList.add('ai-thinking'); updateStatus(); } else { updateStatus(); }

        await addOrbAndExplode(r, c, player);

        const gameEndedByThisMove = checkWinConditionAndEndGame();

        if (!gameEndedByThisMove) {
            switchPlayer(); updateStatus();
            if (gameMode === 'pve' && currentPlayer === AI_PLAYER && !gameOver) {
                aiThinking = true; boardElement.classList.add('ai-thinking'); updateStatus();
                await new Promise(resolve => setTimeout(resolve, AI_THINK_DELAY));
                if (!gameOver) {
                    let aiMoveResult = getAIMove(); let aiMove = null;
                    if (aiMoveResult instanceof Promise) { aiMove = await aiMoveResult; } else { aiMove = aiMoveResult; }

                    if (aiMove && boardState[aiMove.r]?.[aiMove.c]) {
                        const targetCell = boardState[aiMove.r][aiMove.c];
                        if (targetCell.owner === null || targetCell.owner === AI_PLAYER) {
                            turnCount++; console.log(`Turn ${turnCount} started by Player ${currentPlayer} (AI)`);
                            await processTurnAction(aiMove.r, aiMove.c, AI_PLAYER);
                        } else { console.error("AI Error: Invalid move target (occupied by P1):", aiMove); aiThinking = false; boardElement.classList.remove('ai-thinking'); switchPlayer(); updateStatus(); }
                    } else { console.error("AI Error: Invalid or null move generated.", aiMove); aiThinking = false; boardElement.classList.remove('ai-thinking'); switchPlayer(); updateStatus(); }
                } else { aiThinking = false; boardElement.classList.remove('ai-thinking'); }
            } else { turnInProgress = false; aiThinking = false; boardElement.classList.remove('ai-thinking'); }
        } else { turnInProgress = false; aiThinking = false; boardElement.classList.remove('ai-thinking'); }
    }


    // --- Orb Placement and Explosion Handling ---
    async function addOrbAndExplode(r, c, player) {
        const cellState = boardState[r]?.[c];
        if (!cellState) return;

        const oldOwner = cellState.owner; const oldOrbs = cellState.orbs;
        cellState.owner = player; cellState.orbs++;
        playMergeSound();
        if (oldOwner !== null && oldOwner !== player) { playerOrbCounts[oldOwner] = Math.max(0, (playerOrbCounts[oldOwner] || 0) - oldOrbs); }
        playerOrbCounts[player] = (playerOrbCounts[player] || 0) + 1;
        updateCellView(r, c);
        const capacity = getCellCapacity(r, c);
        if (cellState.orbs > capacity) {
            await runExplosionSimulation(boardState, playerOrbCounts, r, c, player, true);
        }
        updateOrbCountsDisplay();
        updateDominanceBar();
    }


    // --- Explosion Simulation ---
    async function runExplosionSimulation(boardData, counts, startR, startC, initialPlayer, updateUI) {
        const explosionQueue = [{ r: startR, c: startC, explodingPlayer: initialPlayer }];
        let steps = 0;
        const processedInStep = new Set();

        while (explosionQueue.length > 0) {
            steps++; if (steps > MAX_EXPLOSION_STEPS) { console.warn(`Max steps (${MAX_EXPLOSION_STEPS}) reached in explosion chain.`); break; }
            const currentWaveSize = explosionQueue.length;
            processedInStep.clear();
            let waveExploded = false;

            for(let i=0; i < currentWaveSize; i++) {
                const { r, c, explodingPlayer } = explosionQueue.shift();
                const cellKey = `${r}-${c}`;
                if (processedInStep.has(cellKey)) continue;
                const currentCellState = boardData[r]?.[c];
                if (!currentCellState || currentCellState.orbs === 0 || currentCellState.orbs <= getCellCapacity(r, c)) continue;

                waveExploded = true;
                processedInStep.add(cellKey);
                if (updateUI) playBurstSound();
                const orbsInCell = currentCellState.orbs;
                if (currentCellState.owner !== null && counts[currentCellState.owner]) {
                    counts[currentCellState.owner] = Math.max(0, counts[currentCellState.owner] - orbsInCell);
                }
                currentCellState.orbs = 0; currentCellState.owner = null;
                if (updateUI) updateCellView(r, c);

                const neighbors = getNeighbors(r, c);
                for (const neighbor of neighbors) {
                    const { r: nr, c: nc } = neighbor;
                    const neighborState = boardData[nr]?.[nc];
                    if (!neighborState) continue;
                    const neighborOldOwner = neighborState.owner;
                    const neighborOldOrbs = neighborState.orbs;
                    if (neighborOldOwner !== null && neighborOldOwner !== explodingPlayer) {
                        counts[neighborOldOwner] = Math.max(0, (counts[neighborOldOwner] || 0) - neighborOldOrbs);
                        counts[explodingPlayer] = (counts[explodingPlayer] || 0) + neighborOldOrbs;
                    }
                    counts[explodingPlayer] = (counts[explodingPlayer] || 0) + 1;
                    neighborState.owner = explodingPlayer;
                    neighborState.orbs++;
                    if (updateUI) {
                        playMergeSound();
                        updateCellView(nr, nc);
                    }
                    if (neighborState.orbs > getCellCapacity(nr, nc)) {
                        if (!explosionQueue.some(item => item.r === nr && item.c === nc)) {
                           explosionQueue.push({ r: nr, c: nc, explodingPlayer: explodingPlayer });
                        }
                    }
                }
            }
             if (updateUI && waveExploded && explosionQueue.length > 0) {
                  await new Promise(resolve => setTimeout(resolve, EXPLOSION_DELAY));
             }
        }
        if (updateUI) { updateOrbCountsDisplay(); updateDominanceBar(); }
    }


    // --- Player Switching ---
    function switchPlayer() { currentPlayer = (currentPlayer === PLAYER1) ? PLAYER2 : PLAYER1; }


    // --- Win Condition Check & End Game Handling ---
    function checkWinConditionAndEndGame() {
        if (gameOver) return true;
        const currentCounts = { [PLAYER1]: 0, [PLAYER2]: 0 };
        let p1Cells = 0, p2Cells = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const cell = boardState[r]?.[c];
                if(cell) {
                    if (cell.owner === PLAYER1) { currentCounts[PLAYER1] += cell.orbs; p1Cells++; }
                    else if (cell.owner === PLAYER2) { currentCounts[PLAYER2] += cell.orbs; p2Cells++; }
                }
            }
        }
        playerOrbCounts = currentCounts;
        updateOrbCountsDisplay();
        updateDominanceBar();
        let gameHasEnded = false;
        if (turnCount > 1) {
            const p1HasPresence = playerOrbCounts[PLAYER1] > 0 || p1Cells > 0;
            const p2HasPresence = playerOrbCounts[PLAYER2] > 0 || p2Cells > 0;
            if (p1HasPresence && !p2HasPresence) { gameHasEnded = true; endGame(`Player 1 Wins!`); }
            else if (p2HasPresence && !p1HasPresence) { gameHasEnded = true; endGame((gameMode === 'pve') ? `AI (${aiDifficulty}) Wins!` : `Player 2 Wins!`); }
        }
        return gameHasEnded;
    }
    function endGame(winnerMessage) {
        gameOver = true; boardElement.classList.add('game-over');
        statusMessageElement.textContent = winnerMessage; showWinPopup(winnerMessage);
        console.log(`Game Over on Turn ${turnCount}: ${winnerMessage}`);
    }


    // --- Win Popup Functions ---
    function showWinPopup(message) { winPopupMessage.textContent = message; winPopup.style.display = 'flex'; setTimeout(() => { winPopup.classList.add('visible'); }, 10); }
    function hideWinPopup() { winPopup.classList.remove('visible'); setTimeout(() => { if (winPopup) winPopup.style.display = 'none'; }, 300); }


    // --- AI Logic ---
    function getValidMoves(player) { const moves = []; for (let r = 0; r < ROWS; r++) { for (let c = 0; c < COLS; c++) { if (boardState[r]?.[c] && (boardState[r][c].owner === null || boardState[r][c].owner === player)) { moves.push({ r, c }); } } } return moves; }
    function getAIMove() {
        const validMoves = getValidMoves(AI_PLAYER); if (validMoves.length === 0) return null; if (gameMode !== 'pve') return null;
        if (aiDifficulty === 'easy') {
            if (Math.random() < 0.6) { return validMoves[Math.floor(Math.random() * validMoves.length)]; }
            const explodingMoves = validMoves.filter(move => (boardState[move.r][move.c].orbs + 1) > getCellCapacity(move.r, move.c));
            const safeMoves = validMoves.filter(move => !getNeighbors(move.r, move.c).some(n => boardState[n.r]?.[n.c]?.owner === PLAYER1 && (boardState[n.r][n.c].orbs + 1) > getCellCapacity(n.r, n.c)));
            if (explodingMoves.length > 0 && Math.random() < 0.7) { return explodingMoves[Math.floor(Math.random() * explodingMoves.length)]; }
            if (safeMoves.length > 0) { return safeMoves[Math.floor(Math.random() * safeMoves.length)]; }
            return validMoves[Math.floor(Math.random() * validMoves.length)];
        }
        else if (aiDifficulty === 'medium') {
             if (Math.random() < 0.15) { return validMoves[Math.floor(Math.random() * validMoves.length)]; }
            let scoredMoves = [];
            for (const move of validMoves) {
                let score = 0; const r = move.r, c = move.c; const cell = boardState[r][c]; const capacity = getCellCapacity(r, c); const willExplode = (cell.orbs + 1) > capacity;
                if (willExplode) { score += 5; score += getNeighbors(r,c).reduce((acc, n) => acc + (boardState[n.r]?.[n.c]?.owner === PLAYER1 ? boardState[n.r][n.c].orbs * 2 : 0), 0); }
                let isUnsafe = getNeighbors(r,c).some(n => { const neighborCell = boardState[n.r]?.[n.c]; return neighborCell && neighborCell.owner === PLAYER1 && (neighborCell.orbs + 1) > getCellCapacity(n.r, n.c); });
                if (isUnsafe) score -= 15;
                else { score -= getNeighbors(r,c).reduce((acc, n) => acc + (boardState[n.r]?.[n.c]?.owner === PLAYER1 && boardState[n.r][n.c].orbs >= getCellCapacity(n.r, n.c) - 1 ? 3 : 0), 0); }
                if (capacity === 1) score += 1; else if (capacity === 2) score += 0.5;
                if (!willExplode && cell.owner === AI_PLAYER && cell.orbs + 1 === capacity) { score += 3; }
                scoredMoves.push({ move, score });
            }
            scoredMoves.sort((a, b) => b.score - a.score);
            const topN = Math.min(scoredMoves.length, 3); const randomChoice = Math.random();
            if(scoredMoves.length === 0) return null;
            if(randomChoice < 0.7 || topN <= 1) return scoredMoves[0].move;
            if(randomChoice < 0.9 && topN >= 2) return scoredMoves[1].move;
            if (topN >= 3) return scoredMoves[2].move;
            return scoredMoves[0].move;
        }
        else if (aiDifficulty === 'hard') {
            return new Promise(async (resolveOuter) => {
                const simulationPromises = validMoves.map(move => {
                    return new Promise(async (resolve) => {
                        let tempBoardState; let tempPlayerCounts;
                        try { tempBoardState = structuredClone(boardState); tempPlayerCounts = structuredClone(playerOrbCounts); }
                        catch(e) { tempBoardState = JSON.parse(JSON.stringify(boardState)); tempPlayerCounts = JSON.parse(JSON.stringify(playerOrbCounts)); }
                        const simCell = tempBoardState[move.r][move.c]; const simOldOwner = simCell.owner; const simOldOrbs = simCell.orbs;
                        if (simOldOwner !== null && simOldOwner !== AI_PLAYER) { tempPlayerCounts[simOldOwner] = Math.max(0, (tempPlayerCounts[simOldOwner] || 0) - simOldOrbs); }
                        tempPlayerCounts[AI_PLAYER] = (tempPlayerCounts[AI_PLAYER] || 0) + 1;
                        simCell.owner = AI_PLAYER; simCell.orbs++;
                        await runExplosionSimulation(tempBoardState, tempPlayerCounts, move.r, move.c, AI_PLAYER, false);
                        const finalP1Orbs = Object.values(tempBoardState).flat().reduce((sum, cell) => sum + (cell.owner === PLAYER1 ? cell.orbs : 0), 0);
                        const finalP2Orbs = Object.values(tempBoardState).flat().reduce((sum, cell) => sum + (cell.owner === AI_PLAYER ? cell.orbs : 0), 0);
                        let score = finalP2Orbs - finalP1Orbs;
                        if (finalP1Orbs === 0 && finalP2Orbs > 0) score += 1000;
                        let leadsToP1WinDanger = false; let potentialAICritical = 0;
                        for(let r=0; r < ROWS; r++){ for(let c=0; c < COLS; c++){ const finalCell = tempBoardState[r]?.[c]; if (!finalCell) continue; if(finalCell.owner === PLAYER1 && (finalCell.orbs >= getCellCapacity(r,c))){ leadsToP1WinDanger = true; score -= 500; break; } if(finalCell.owner === AI_PLAYER && finalCell.orbs === getCellCapacity(r,c)){ potentialAICritical++; } } if(leadsToP1WinDanger) break; }
                        score += potentialAICritical * 2;
                        resolve({ move, score });
                    });
                });
                Promise.all(simulationPromises).then(scoredMoves => {
                    if (scoredMoves.length === 0) { resolveOuter(validMoves[0] || null); return; }
                    scoredMoves.sort((a, b) => b.score - a.score);
                    const bestScore = scoredMoves[0].score; const topMoves = scoredMoves.filter(m => m.score >= bestScore - 5);
                    let chosenMove;
                    if (Math.random() < 0.05 && scoredMoves.length > 1) { chosenMove = scoredMoves[1].move; }
                    else if (topMoves.length > 1 && Math.random() < 0.15) { chosenMove = topMoves[Math.floor(Math.random() * topMoves.length)].move; }
                    else { chosenMove = scoredMoves[0].move; }
                    resolveOuter(chosenMove);
                }).catch(error => { console.error("Error during Hard AI simulation aggregation:", error); resolveOuter(validMoves[Math.floor(Math.random() * validMoves.length)]); });
            });
        }
        return validMoves[Math.floor(Math.random() * validMoves.length)];
    }


    // --- UI Update Functions ---
    function updateStatus() {
        if (gameOver) return;
        let message = '';
        if (aiThinking) { message = `AI (${aiDifficulty.substring(0,1).toUpperCase()}) is thinking...`; }
        else { const playerLabel = currentPlayer === PLAYER1 ? 'P1' : (gameMode === 'pve' ? `AI (${aiDifficulty.substring(0,1).toUpperCase()})` : 'P2'); message = `${playerLabel}'s Turn`; }
        statusMessageElement.textContent = message;
        p1InfoElement.classList.toggle('active', currentPlayer === PLAYER1 && !aiThinking);
        p2InfoElement.classList.toggle('active', currentPlayer === PLAYER2 && !aiThinking);
    }
    function updateOrbCountsDisplay() { p1CountElement.textContent = playerOrbCounts[PLAYER1] || 0; p2CountElement.textContent = playerOrbCounts[PLAYER2] || 0; }
    function updateDominanceBar() { const p1Orbs = playerOrbCounts[PLAYER1] || 0; const p2Orbs = playerOrbCounts[PLAYER2] || 0; const totalOrbs = p1Orbs + p2Orbs; let p1Percent = 50; if (totalOrbs > 0) { p1Percent = (p1Orbs / totalOrbs) * 100; } const p2Percent = 100 - p1Percent; if(p1DominanceElement && p2DominanceElement) { p1DominanceElement.style.width = `${p1Percent}%`; p2DominanceElement.style.width = `${p2Percent}%`; } }

    function updateCellView(r, c) {
        const cellElement = boardElement.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
        if (!cellElement) return;
        const cellData = boardState[r]?.[c];
        if(!cellData) return;
        const owner = cellData.owner; const orbs = cellData.orbs;
        cellElement.innerHTML = ''; cellElement.classList.remove('p1', 'p2');
        if (orbs > 0 && owner !== null) {
            const playerClass = owner === PLAYER1 ? 'p1' : 'p2';
            cellElement.classList.add(playerClass);
            const displayOrbCount = Math.min(orbs, MAX_VISUAL_ORBS);
            const countClass = `orb-visual-count-${displayOrbCount}`;
            for (let i = 0; i < displayOrbCount; i++) {
                const orbElement = document.createElement('div');
                orbElement.classList.add('orb', playerClass, countClass);
                orbElement.style.animation = 'none'; void orbElement.offsetWidth;
                orbElement.style.animation = `orb-appear 0.4s ease-out forwards`;
                cellElement.appendChild(orbElement);
            }
            const countText = document.createElement('span');
            countText.textContent = orbs;
            countText.classList.add('orb-count-text');
            cellElement.appendChild(countText);
        }
    }

    // --- Event Listeners ---
    window.addEventListener('resize', updateBoardSize);

    // --- Initial Setup Visibility ---
    gameContainer.style.display = 'none';
    setupScreen.style.display = 'block';

}); // End DOMContentLoaded