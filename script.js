const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

canvas.width = canvas.height = 500;

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
        // showQ = !showQ;
    }
};

const UPDATE_DELAY = 0.2;

let lastFrame = null;
let nextUpdate = UPDATE_DELAY;
function draw(time) {
    requestAnimationFrame(draw);
    if (lastFrame === null) lastFrame = time;
    let dt = time - lastFrame;
    if (dt > 1/30) dt = 1/30;
    lastFrame = time;
    
    ///// update
    nextUpdate -= dt;
    if (nextUpdate <= 0) {
        nextUpdate += UPDATE_DELAY;
        updateAgent();
    }
    
    // gravity
    const dda = -2*Math.cos(angle) * dt;
    dAngle += dda;
    dCartX += 50 * Math.sin(angle) * dda;
    
    // friction
    dCartX *= Math.pow(0.7, dt);
    dAngle *= Math.pow(0.7, dt);
    
    // move values
    cartX += dCartX * dt;
    angle += dAngle * dt;
    
    // push back from edges (not physically accurate)
    if (cartX < MIN_X) {
        dCartX += 100*dt;
    }
    if (cartX > MAX_X) {
        dCartX -= 100*dt;
    }
    
    
    
    // clear the canvas
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // pendulum and stuff
    ctx.strokeStyle = "gray";
    drawLine(0, canvas.height/2, canvas.width, canvas.height/2);
    
    const xPos = canvas.width/2 + cartX;
    const yPos = canvas.height/2;
    ctx.strokeStyle = "black";
    drawLine(xPos, yPos, xPos+100*Math.cos(angle), yPos-100*Math.sin(angle));
    
    ctx.fillStyle = "black";
    ctx.fillRect(xPos - 5, yPos - 5, 10, 10);
}

requestAnimationFrame(draw);



///////////// Q-learning /////////////


/// utility functions

const NUM_QUANTS = 7;
function quantize(v, min, max) {
    if (v < min) v = min;
    if (v > max-0.001) v = max-0.001;
    return Math.floor(NUM_QUANTS * (v-min)/(max-min));
}

const states = {};
function getState() {
    const x = quantize(cartX, MIN_X, MAX_X);
    const dx = quantize(dCartX, -150, 150);
    let a = angle % (2*Math.PI);
    if (a < 0) a += 2*Math.PI;
    a = quantize(a, 0, 2*Math.PI);
    const da = quantize(dAngle, -2, 2);
    const key = x+","+dx+","+a+","+da;
    if (!states[key]) {
        states[key] = {
            Q: INITIAL_Q
        };
    }
    return states[key];
}


/// agent control (the meat)

const LEARNING_RATE = 0.2;
const DISCOUNT_FACTOR = 0.90;
const INITIAL_Q = 0;

const MIN_X = -canvas.width/3;
const MAX_X = +canvas.width/3;

let cartX = 0, dCartX = 0;
let angle = -Math.PI/2*0, dAngle = 0;

function updateAgent() {return;
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

function observeReward([x, y], r, options) {
    const newQ = r + DISCOUNT_FACTOR*Math.max(...options.map(([x, y]) => grid[x][y].Q));
    cell.Q = (1-LEARNING_RATE)*cell.Q + (LEARNING_RATE)*newQ;
}