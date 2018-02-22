const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

const CELL_SIZE = 50;
const GRID_SIZE = 10;
canvas.width = canvas.height = GRID_SIZE*CELL_SIZE;

function drawLine(x0, y0, x1, y1) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
}

function grayColor(br) {
    br = Math.floor(br*255);
    return `rgb(${br},${br},${br})`;
}

window.onkeydown = e => {
    if (e.keyCode == 81) { // Q
        showQ = !showQ;
    }
};

let showQ = false;
function draw(update) {
    // update
    if (update) moveAgent();
    
    // clear the canvas
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // cell contents
    const [minQ, maxQ] = showQ? getMinMaxQ() : [];
    for (let x = 0; x < GRID_SIZE; x++) {
        const cx = x*CELL_SIZE;
        for (let y = 0; y < GRID_SIZE; y++) {
            const cy = y*CELL_SIZE;
            const cell = grid[x][y];
            ctx.fillStyle = showQ? grayColor((cell.Q - minQ) / (maxQ - minQ)) : cell.color;
            ctx.fillRect(cx, cy, CELL_SIZE, CELL_SIZE);
            if (x==agentX && y==agentY) {
                ctx.fillStyle = "orange";
                ctx.strokeStyle = "black";
                ctx.fillRect(cx+CELL_SIZE/4, cy+CELL_SIZE/4, CELL_SIZE/2, CELL_SIZE/2);
                ctx.strokeRect(cx+CELL_SIZE/4, cy+CELL_SIZE/4, CELL_SIZE/2, CELL_SIZE/2);
            }
        }
    }
    
    // grid lines
    ctx.strokeStyle = "black";
    for (let i = 1; i < GRID_SIZE; i++) {
        const v = i*CELL_SIZE;
        drawLine(0, v, canvas.width, v);
        drawLine(v, 0, v, canvas.width);
    }
}

let interval = null;
function setSpeed(delay) {
    clearInterval(interval);
    if (delay == 0) {
        interval = setInterval(() => {
            const start = Date.now();
            while (Date.now()-start < 1)
                moveAgent();
        }, 0);
    } else {
        interval = setInterval(() => draw(true), delay);
    }
}
setSpeed(100);
setTimeout(() => draw(false));



///////////// Q-learning /////////////


/// utility functions

function makeGridArray(func) {
    let grid = [];
    for (let x = 0; x < GRID_SIZE; x++) {
        grid[x] = [];
        for (let y = 0; y < GRID_SIZE; y++) {
            grid[x][y] = func(x, y);
        }
    }
    return grid;
}

function randCoord() {
    return Math.floor(Math.random()*GRID_SIZE);
}

function getMoveOptions() {
    let options = [];
    if (agentX > 0) options.push([agentX-1, agentY]);
    if (agentY > 0) options.push([agentX, agentY-1]);
    if (agentX < GRID_SIZE-1) options.push([agentX+1, agentY]);
    if (agentY < GRID_SIZE-1) options.push([agentX, agentY+1]);
    return options;
}

function getMinMaxQ() {
    let minQ = +Infinity;
    let maxQ = -Infinity;
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
            const Q = grid[x][y].Q;
            minQ = Math.min(minQ, Q);
            maxQ = Math.max(maxQ, Q);
        }
    }
    return [minQ, maxQ];
}


/// grid initialization

const INITIAL_Q = 0.5;
function makeCell(color, reward, isEnd) {
    return {color, reward, isEnd: !!isEnd, Q: INITIAL_Q};
}

const grid = makeGridArray((x, y) => {
    let cell;
    if (Math.random()<0.8) {
        cell = makeCell("white", -0.04);
    } else {
        cell = makeCell("red", -1, true);
    }
    return cell;
});
grid[randCoord()][randCoord()] = makeCell("green", +1, true);


/// agent control (the meat)

const LEARNING_RATE = 0.2;
const DISCOUNT_FACTOR = 0.90;

let agentX = randCoord(), agentY = randCoord();

function moveAgent() {
    // observe the reward for being in the current state
    const cell = grid[agentX][agentY];
    observeReward([agentX,agentY], cell.reward, getMoveOptions(), cell.isEnd);
    if (grid[agentX][agentY].isEnd) {
        agentX = randCoord();
        agentY = randCoord();
        console.log("Hit end tile");
    }
    
    // move
    let bestOption = null;
    let bestQ = -Infinity;
    for (const op of getMoveOptions()) {
        const [x,y] = op;
        const Q = grid[x][y].Q + Math.random()*0.1;
        if (Q > bestQ) {
            bestQ = Q;
            bestOption = op;
        }
    }
    [agentX,agentY] = bestOption;
}

function observeReward([x, y], r, options, isEnd) {
    const cell = grid[x][y];
    if (isEnd) {
        cell.Q = r;
    } else {
        const newQ = r + DISCOUNT_FACTOR*Math.max(...options.map(([x, y]) => grid[x][y].Q));
        cell.Q = (1-LEARNING_RATE)*cell.Q + (LEARNING_RATE)*newQ;
    }
}