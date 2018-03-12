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
    if (e.keyCode == 65) { // A
        showQA = 0;
    }
    if (e.keyCode == 83) { // S
        showQA = 1;
    }
    if (e.keyCode == 68) { // D
        showQA = 2;
    }
};
let showQ = true;
let showQA = 0;

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
const UPDATE_DELAY = 0.1;
let action;
let numUpdates = 1;
function draw(time) {
    //// update
    if (!lastFrame) lastFrame = time;
    const dt = Math.min((time - lastFrame)/1000, 1/30);
    lastFrame = time;
    for (let n = 0; n < numUpdates; n++) update(dt);
    
    // outputE.value = serializeTable()[1];
    
    //// clear the canvas
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (showQ) {
        const a = showQA;
        const dx = WIDTH/QUANTS_X;
        let [min, max] = getMinMaxQ(a);
        min = Math.min(min*1.1, -0.01);
        max = Math.max(max*1.1, 0.01);
        if (max < 0) min = 0;
        
        const zero = getY(0);
        ctx.strokeStyle = "green";
        drawLine(0, zero, WIDTH, zero);
        
        // ctx.strokeStyle = "black";
        // for (let qx = 0; qx < QUANTS_X; qx++) {
        //     const s0 = states[qx], s1 = states[qx+1];
        //     if (!s0 || !s1) continue;
        //     drawLine((qx+0.5)*dx, getY(s0.Q[a]), (qx+1.5)*dx, getY(s1.Q[a]));
        // }
        
        ctx.fillStyle = "blue";
        for (const [x, q] of points[a]) {
            ctx.fillRect(x, getY(q), 1, 1);
        }
        
        function getY(q) {
            return HEIGHT - HEIGHT*(q-min)/(max-min);
        }
    } else {
        // markers
        const h = HEIGHT*5/6;
        ctx.strokeStyle = "green";
        drawLine(0, h, WIDTH, h);
        
        // agent
        ctx.fillStyle = "orange";
        ctx.fillRect(agentX-10, h-10, 20, 20);
    }
    
    requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

const AGENT_SPEED = 140;
function update(dt) {
    lastUpdate += dt;
    if (lastUpdate > UPDATE_DELAY) {
        lastUpdate = 0;
        action = updateAgent();
    }
    
    agentX += [-AGENT_SPEED, 0, +AGENT_SPEED][action]*dt;
    if (agentX > WIDTH) agentX = WIDTH/3;
}



///////////// Q-learning /////////////


/// utility functions

const outputE = document.getElementById("output");

function quantize(x, min, max, n) {
    x = (x-min)/(max-min);
    if (x < 0) x = 0;
    if (x > 1) x = 1;
    return Math.floor(x*n);
}

let states = {};
const QUANTS_X = 50;
const INITIAL_Q = 0.0;
function getState() {
    const qx = quantize(agentX, 0, WIDTH, QUANTS_X);
    const key = qx;
    if (!states[key]) {
        states[key] = {
            Q: [INITIAL_Q,INITIAL_Q,INITIAL_Q],
            getMaxQ() {
                return Math.max(...this.Q);
            }
        };
    }
    return states[key];
}

function getMinMaxQ(a) {
    let minQ = +Infinity;
    let maxQ = -Infinity;
    for (const key in states) {
        const Q = states[key].Q[a];
        if (Q > maxQ) maxQ = Q;
        if (Q < minQ) minQ = Q;
    }
    return [minQ, maxQ];
}

// function serializeTable() {
//     let table = [];
//     for (let qx = 0; qx < QUANTS_X; qx++) {
//         table.push([]);
//         for (let qvx = 0; qvx < QUANTS_VX; qvx++) {
//             const key = qx+","+qvx;
//             const state = states[key] || {Q:[0,0,0]};
//             table[qx].push(state.Q);
//         }
//     }
//     return [table, "{\n    "+table.map(x => `{${x.map(y => `{${y}}`)}}`).join(",\n    ")+"\n}"];
// }

function maxElement(arr) {
    let max = -Infinity;
    let maxI = -1;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] > max) {
            max = arr[i];
            maxI = i;
        }
    }
    return maxI;
}

function weightedRand(arr) {
    let n = Math.random();
    for (let i = 0; i < arr.length; i++) {
        if (n < arr[i]) return i;
        n -= arr[i];
    }
    throw new Error("weightedRand failed");
}


/// agent control (the meat)

const LEARNING_RATE = 0.91;
let   RANDOM_RATE = 0.1;
const DISCOUNT_FACTOR = 0.90;

let agentX = WIDTH/2;

function getCurrentReward() {
    return agentX < WIDTH/6? [1.0, true] : [-0.04, false];
}

let lastState = null, lastX;
function updateAgent() {
    // observe the reward for being in the current state
    if (!lastState) {
        lastState = getState();
        lastX = agentX;
        return 1;
    }
    const [reward, reset] = getCurrentReward();
    const nextState = reset? lastState : getState();
    observeReward(lastState, lastX, action, nextState, reward);
    if (reset) {
        lastState = null;
        agentX = WIDTH/3*(1+2*Math.random());
    } else {
        lastState = nextState;
        lastX = agentX;
    }
    
    // chose action
    if (Math.random() < RANDOM_RATE) return Math.floor(Math.random()*3);
    const actionQs = [0,1,2].map(a => nextState.Q[a]);
    return maxElement(actionQs);
}

let points = [[],[],[]];

function observeReward(curState, x, action, nextState, reward) {
    const newQ = reward + DISCOUNT_FACTOR*nextState.getMaxQ();
    points[action].push([x, newQ]);
    if (points[action].length > 100) points[action].shift();
    curState.Q[action] = (1-LEARNING_RATE)*curState.Q[action] + (LEARNING_RATE)*newQ;
}