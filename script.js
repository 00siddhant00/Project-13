document.addEventListener('DOMContentLoaded', () => {
    const boardElement = document.getElementById('game-board');
    const statusMessageElement = document.getElementById('status-message');
    const p1InfoElement = document.querySelector('.player-info.player1');
    const p2InfoElement = document.querySelector('.player-info.player2');
    const p1CountElement = document.getElementById('p1-count');
    const p2CountElement = document.getElementById('p2-count');
    const resetButton = document.getElementById('reset-button');

    // --- Game Settings ---
    const ROWS = 8; // Example size
    const COLS = 10; // Example size
    const PLAYER1 = 1;
    const PLAYER2 = 2;
    const EXPLOSION_DELAY = 80; // ms delay between chain reaction steps

    // --- Game State ---
    let boardState; // 2D array: { owner: null | PLAYER1 | PLAYER2, orbs: 0 }
    let currentPlayer;
    let gameOver;
    let turnInProgress; // Flag to prevent clicks during explosion chains
    let playerOrbCounts; // { [PLAYER1]: 0, [PLAYER2]: 0 }
    let turnCount; // To detect game start for win condition check

    // --- Initialization ---
    function initGame() {
        boardState = Array(ROWS).fill(null).map(() =>
            Array(COLS).fill(null).map(() => ({ owner: null, orbs: 0 }))
        );
        currentPlayer = PLAYER1;
        gameOver = false;
        turnInProgress = false;
        turnCount = 0;
        playerOrbCounts = { [PLAYER1]: 0, [PLAYER2]: 0 };

        boardElement.innerHTML = ''; // Clear previous board
        boardElement.style.gridTemplateColumns = `repeat(${COLS}, var(--cell-size))`;
        boardElement.style.gridTemplateRows = `repeat(${ROWS}, var(--cell-size))`;
        boardElement.classList.remove('game-over'); // Ensure clicks enabled


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
        updateStatus();
        updateOrbCountsDisplay();
    }

    // --- Game Logic ---

    function getCellCapacity(r, c) {
        const isCorner = (r === 0 || r === ROWS - 1) && (c === 0 || c === COLS - 1);
        const isEdge = !isCorner && (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1);

        if (isCorner) return 1; // Explodes on 2nd orb
        if (isEdge) return 2;   // Explodes on 3rd orb
        return 3;               // Explodes on 4th orb (Center)
    }

    function getNeighbors(r, c) {
        const neighbors = [];
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // Up, Down, Left, Right
        for (const [dr, dc] of directions) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                neighbors.push({ r: nr, c: nc });
            }
        }
        return neighbors;
    }

    async function handleCellClick(event) {
        if (gameOver || turnInProgress) return;

        const cellElement = event.currentTarget;
        const r = parseInt(cellElement.dataset.row);
        const c = parseInt(cellElement.dataset.col);
        const cellState = boardState[r][c];

        // Allow placement only in empty cells or cells owned by the current player
        if (cellState.owner !== null && cellState.owner !== currentPlayer) {
            // Maybe add a small visual indicator for invalid move?
            console.log("Cannot place orb in opponent's cell.");
            return;
        }

        turnInProgress = true; // Lock clicks during processing
        turnCount++;

        await addOrbAndExplode(r, c, currentPlayer);

        // Check win condition only after all explosions settle
         if (turnCount > 1) { // Don't check win on the very first move
            checkWinCondition();
        }

        if (!gameOver) {
            switchPlayer();
            updateStatus();
        }
        turnInProgress = false; // Release lock
    }

    async function addOrbAndExplode(r, c, player) {
        const cellState = boardState[r][c];

        // Update state
        cellState.owner = player;
        cellState.orbs++;
        playerOrbCounts[player]++; // Increment total count

        updateCellView(r, c); // Show the added orb immediately

        const capacity = getCellCapacity(r, c);

        if (cellState.orbs > capacity) {
            // Explosion needed! Start the chain reaction process.
            await triggerExplosionChain(r, c, player);
        }
         updateOrbCountsDisplay(); // Update counts after potential explosion changes
    }

    async function triggerExplosionChain(startR, startC, initialPlayer) {
        const explosionQueue = [{ r: startR, c: startC, explodingPlayer: initialPlayer }];

        while (explosionQueue.length > 0) {
            const { r, c, explodingPlayer } = explosionQueue.shift(); // Process one explosion step

            // Make sure the cell *still* needs to explode (could have been cleared by another chain)
            if (boardState[r][c].orbs <= getCellCapacity(r, c)) {
                 continue;
            }

            const cellState = boardState[r][c];
            const capacity = getCellCapacity(r, c);
            const orbsToDistribute = cellState.orbs; // Usually capacity + 1

            // Clear the exploding cell state BEFORE distributing
            playerOrbCounts[cellState.owner] -= cellState.orbs; // Deduct exploding orbs
            cellState.orbs = 0;
            cellState.owner = null;
            updateCellView(r, c); // Update view of cleared cell

            const neighbors = getNeighbors(r, c);

            // Add a slight delay for visualization
            await new Promise(resolve => setTimeout(resolve, EXPLOSION_DELAY));

            for (const neighbor of neighbors) {
                const { r: nr, c: nc } = neighbor;
                const neighborState = boardState[nr][nc];

                 // Deduct captured orb count if owner changes
                 if (neighborState.owner !== null && neighborState.owner !== explodingPlayer) {
                     playerOrbCounts[neighborState.owner] -= neighborState.orbs;
                 }
                 // Add to new owner's count (even if owner didn't change)
                 playerOrbCounts[explodingPlayer] += neighborState.orbs; // Add existing orbs count first
                 playerOrbCounts[explodingPlayer]++; // Add the one new orb

                // Update neighbor state (capture)
                neighborState.owner = explodingPlayer;
                neighborState.orbs++;

                updateCellView(nr, nc); // Update neighbor view

                // Check if this neighbor needs to explode
                const neighborCapacity = getCellCapacity(nr, nc);
                if (neighborState.orbs > neighborCapacity) {
                    // Avoid adding duplicates if already scheduled by a parallel chain (less common here)
                    if (!explosionQueue.some(item => item.r === nr && item.c === nc)) {
                         explosionQueue.push({ r: nr, c: nc, explodingPlayer: explodingPlayer });
                    }
                }
            }
             updateOrbCountsDisplay(); // Update counts during the chain
        }
    }

    function switchPlayer() {
        currentPlayer = (currentPlayer === PLAYER1) ? PLAYER2 : PLAYER1;
    }

     function checkWinCondition() {
        // Recalculate counts from the board state for accuracy after explosions
        const currentCounts = { [PLAYER1]: 0, [PLAYER2]: 0 };
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const cell = boardState[r][c];
                if (cell.owner) {
                    currentCounts[cell.owner] += cell.orbs;
                }
            }
        }
         playerOrbCounts = currentCounts; // Sync global counts
         updateOrbCountsDisplay();


        const p1Lost = playerOrbCounts[PLAYER1] === 0;
        const p2Lost = playerOrbCounts[PLAYER2] === 0;

        if (p1Lost && turnCount > 1) { // Ensure game has started
            gameOver = true;
            statusMessageElement.textContent = `Player 2 Wins!`;
             boardElement.classList.add('game-over'); // Disable clicks via CSS potentially
        } else if (p2Lost && turnCount > 1) {
            gameOver = true;
            statusMessageElement.textContent = `Player 1 Wins!`;
            boardElement.classList.add('game-over');
        }
    }


    // --- UI Updates ---

    function updateStatus() {
        if (gameOver) return; // Message is already set by checkWinCondition

        statusMessageElement.textContent = `Player ${currentPlayer}'s Turn`;
        p1InfoElement.classList.toggle('active', currentPlayer === PLAYER1);
        p2InfoElement.classList.toggle('active', currentPlayer === PLAYER2);
    }

     function updateOrbCountsDisplay() {
        p1CountElement.textContent = playerOrbCounts[PLAYER1];
        p2CountElement.textContent = playerOrbCounts[PLAYER2];
    }


    function updateCellView(r, c) {
        const cellElement = boardElement.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
        if (!cellElement) return;

        const { owner, orbs } = boardState[r][c];
        cellElement.innerHTML = ''; // Clear previous orbs

        if (orbs > 0 && owner !== null) {
            const playerClass = owner === PLAYER1 ? 'p1' : 'p2';
            // Simple orb display - adjust CSS for better positioning if needed
            const orbCountClass = `orb-${Math.min(orbs, 3)}`; // Cap visual at 3 for simplicity or add orb-4 CSS

            for (let i = 0; i < orbs; i++) {
                 // Only draw the visible number based on orbCountClass limit for styling
                 if (i < parseInt(orbCountClass.split('-')[1])) {
                    const orbElement = document.createElement('div');
                    orbElement.classList.add('orb', playerClass, orbCountClass);
                    // Add slight animation hint on creation/update
                    orbElement.style.animation = 'pulse 0.2s ease-out';
                    cellElement.appendChild(orbElement);
                 }
            }
             // Optional: Add a text number if orbs exceed visual limit
             if (orbs > 3) {
                  const countText = document.createElement('span');
                  countText.textContent = orbs;
                  countText.style.position = 'absolute';
                  countText.style.bottom = '2px';
                  countText.style.right = '4px';
                  countText.style.fontSize = '0.8em';
                  countText.style.fontWeight = 'bold';
                  countText.style.color = owner === PLAYER1 ? '#fff' : '#fff'; // Adjust color for visibility
                  cellElement.appendChild(countText);
             }

        }
    }

    // --- Event Listeners ---
    resetButton.addEventListener('click', initGame);

    // --- Start Game ---
    initGame();
});