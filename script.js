const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

const WIDTH = 500;
const HEIGHT = 500;
canvas.width = WIDTH;
canvas.height = HEIGHT;

window.onkeydown = e => {
    if (e.keyCode == 81) { // Q
        showQ = !showQ;
    }
};
let showQ = false;

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

// physical constants
const GRAVITY = 1000;
const MOTOR_ACC = 100;

let lastFrame = null;
let lastUpdate = Infinity;
const UPDATE_DELAY = 0.5;
let action;
let numUpdates = 1;
function draw(time) {
    //// update
    if (!lastFrame) lastFrame = time;
    const dt = Math.min((time - lastFrame)/1000, 1/30);
    lastFrame = time;
    for (let n = 0; n < numUpdates; n++) update(dt);
    
    outputE.value = serializeTable()[1];
    
    
    //// clear the canvas
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // markers
    ctx.strokeStyle = "green";
    drawLine(WIDTH/5, 0, WIDTH/5, HEIGHT);
    
    // terrain
    ctx.strokeStyle = "black";
    const dx = WIDTH / 100;
    for (let x = 0; x < WIDTH; x += dx) {
        drawLine(x, HEIGHT-height(x), x+dx, HEIGHT-height(x+dx));
    }
    
    // car
    ctx.fillStyle = "orange";
    ctx.fillRect(carX-10, HEIGHT-height(carX)-10, 20, 20);
    
    requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

function update(dt) {
    lastUpdate += dt;
    if (lastUpdate > UPDATE_DELAY) {
        lastUpdate = 0;
        action = updateAgent();
    }
    
    const dh = dHeight(carX);
    const dh2_1 = 1+dh*dh;
    const motor = [-MOTOR_ACC, 0, +MOTOR_ACC][action];
    carVX += dt * (motor/Math.sqrt(dh2_1) - GRAVITY*dh/dh2_1);
    carX += dt * carVX;
}



///////////// Q-learning /////////////


/// utility functions

const outputE = document.getElementById("output");

function height(x) {
    x = x-WIDTH/2;
    return x*x * 4*HEIGHT/(WIDTH*WIDTH);
}
function dHeight(x) {
    x = x-WIDTH/2;
    return 2*x * 4*HEIGHT/(WIDTH*WIDTH);
}

function quantize(x, min, max, n) {
    x = (x-min)/(max-min);
    if (x < 0) x = 0;
    if (x > 1) x = 1;
    return Math.floor(x*n);
}

let states = {};
const QUANTS_X = 10;
const QUANTS_VX = 6;
function getState() {
    const qx = quantize(carX, 0, WIDTH, QUANTS_X);
    const qvx = quantize(carVX, -500, 500, QUANTS_VX);
    const key = qx+","+qvx;
    if (!states[key]) {
        states[key] = {
            Q: [0, 0, 0],
            getMaxQ() {
                return Math.max(...this.Q);
            }
        };
    }
    return states[key];
}

function serializeTable() {
    let table = [];
    for (let qx = 0; qx < QUANTS_X; qx++) {
        table.push([]);
        for (let qvx = 0; qvx < QUANTS_VX; qvx++) {
            const key = qx+","+qvx;
            const state = states[key] || {Q:[0,0,0]};
            table[qx].push(state.Q);
        }
    }
    return [table, "{\n    "+table.map(x => `{${x.map(y => `{${y}}`)}}`).join(",\n    ")+"\n}"];
}


/// agent control (the meat)

const LEARNING_RATE = 0.2;
const DISCOUNT_FACTOR = 0.90;

let carX = WIDTH/2, carVX = 0;

function getCurrentReward() {
    return carX < WIDTH/5? 1.0 : -0.04;
}

let lastState = null;
function updateAgent() {
    // observe the reward for being in the current state
    if (!lastState) {
        lastState = getState();
        return 1;
    }
    const nextState = getState();
    observeReward(lastState, action, nextState, getCurrentReward());
    lastState = nextState;
    
    // move
    let bestAction = null;
    let bestQ = -Infinity;
    for (const a of [0, 1, 2]) {
        const Q = nextState.Q[a] + Math.random()*0.1;
        if (Q > bestQ) {
            bestQ = Q;
            bestAction = a;
        }
    }
    return bestAction;
}

function observeReward(curState, action, nextState, reward) {
    const newQ = reward + DISCOUNT_FACTOR*nextState.getMaxQ();
    curState.Q[action] = (1-LEARNING_RATE)*curState.Q[action] + (LEARNING_RATE)*newQ;
}