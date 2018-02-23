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

const UPDATE_DELAY = 0.4;

let lastFrame = null;
let nextUpdate = UPDATE_DELAY;
let rewardAcc = 0, rewardCount = 0;
function draw(time) {
    requestAnimationFrame(draw);
    if (lastFrame === null) lastFrame = time;
    let dt = time - lastFrame;
    if (dt > 1/30) dt = 1/30;
    lastFrame = time;
    
    ///// update
    const reward = getCurrentReward();
    document.getElementById("reward").textContent = reward.toPrecision(3);
    rewardAcc += reward;
    rewardCount++;
    
    nextUpdate -= dt;
    if (nextUpdate <= 0) {
        nextUpdate += UPDATE_DELAY;
        updateAgent(rewardAcc/rewardCount);
        rewardAcc = rewardCount = 0;
    }
    
    simulate(globalVars, dt);
    
    
    
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


const MOTOR_POWER = 5;
function simulate(vars, dt) {
    // motor
    const motor = [-1, 0, 1][vars.lastAction];
    const ddx = (power) => motor*power*dt + vars.dCartX*(1-Math.pow(0.7, dt));
    vars.dCartX += ddx(MOTOR_POWER);
    // TODO: modify dAngle
    vars.dAngle += ddx(0*MOTOR_POWER) * Math.sin(vars.angle);
    
    // gravity
    const dda = -2*Math.cos(vars.angle) * dt;
    vars.dAngle += dda;
    vars.dCartX += 50 * Math.sin(vars.angle) * dda;
    
    // friction
    // vars.dCartX *= ;
    // vars.dAngle *= Math.pow(0.7, dt);
    
    // move values
    vars.cartX += vars.dCartX * dt;
    vars.angle += vars.dAngle * dt;
    
    // push back from edges (not physically accurate)
    if (vars.cartX < MIN_X) {
        vars.dCartX += 100*dt;
    }
    if (vars.cartX > MAX_X) {
        vars.dCartX -= 100*dt;
    }
}

function simulateFor(vars, time, steps) {
    const dt = time / steps;
    for (let n = 0; n < steps; n++) {
        simulate(vars, dt);
    }
}



///////////// Q-learning /////////////


/// utility functions

const NUM_QUANTS = 7;
function quantize(v, min, max) {
    if (v < min) v = min;
    if (v > max-0.001) v = max-0.001;
    return Math.floor(NUM_QUANTS * (v-min)/(max-min));
}

const states = {};
function getState(vars) {
    const x = quantize(cartX, MIN_X, MAX_X);
    const dx = quantize(dCartX, -150, 150);
    const a = quantize(getNormAngle(), 0, 2*Math.PI);
    const da = quantize(dAngle, -2, 2);
    const key = x+","+dx+","+a+","+da;
    if (states[key])
        return states[key];
    
    return states[key] = {
        0: {Q: INITIAL_Q}, // move left
        1: {Q: INITIAL_Q}, // don't move
        2: {Q: INITIAL_Q}, // move right
        getMaxQ() {
            return Math.max(this[0].Q, this[1].Q, this[2].Q);
        },
        nextStates: [],
        getNextState(a) {
            if (this.nextStates[a]) return this.nextStates[a];
            
            // TODO: init vars to well-defined values based on this state
            let vars = {cartX, dCartX, angle, dAngle, lastAction: a};
            simulateFor(vars, UPDATE_DELAY, UPDATE_DELAY/(1/30));
            return this.nextStates[a] = getState(vars);
        }
    };
}

function getCurrentReward() {
    let a = getNormAngle();
    if (a > Math.PI*3/2) a -= 2*Math.PI;
    return 4 - (Math.abs(cartX)/MAX_X + Math.abs(dCartX)/150 +
                Math.abs(a - Math.PI/2)/Math.PI + Math.abs(dAngle)/2);
}

function getNormAngle() {
    let a = angle % (2*Math.PI);
    if (a < 0) a += 2*Math.PI;
    return a;
}

function takeAction(a) {
    lastAction = a;
}


/// agent control (the meat)

const LEARNING_RATE = 0.2;
const DISCOUNT_FACTOR = 0.90;
const INITIAL_Q = 0;

const MIN_X = -canvas.width/3;
const MAX_X = +canvas.width/3;

let cartX = 0, dCartX = 0;
let angle = -Math.PI/2*0, dAngle = 0;
let lastAction = 1;
const globalVars = {
    get cartX() {return cartX}, set cartX(v) {return cartX = v},
    get dCartX() {return dCartX}, set dCartX(v) {return dCartX = v},
    get angle() {return angle}, set angle(v) {return angle = v},
    get dAngle() {return dAngle}, set dAngle(v) {return dAngle = v},
    get lastAction() {return lastAction}, set lastAction(v) {return lastAction = v},
};

function updateAgent(reward) {
    // observe the reward for being in the current state
    const curState = getState(globalVars);
    observeReward(curState, reward, [0,1,2]);
    
    // move
    let bestAction = null;
    let bestQ = -Infinity;
    for (const a of [0,1,2]) {
        const Q = curState.getNextState(a).getMaxQ() + Math.random()*0.1;
        if (Q > bestQ) {
            bestQ = Q;
            bestAction = a;
        }
    }
    takeAction(bestAction);
}

function observeReward(state, r, actions) {
    const newQ = r + DISCOUNT_FACTOR*Math.max(...actions.map(a => state.getNextState(a).getMaxQ()));
    state[lastAction].Q = (1-LEARNING_RATE)*state[lastAction].Q + (LEARNING_RATE)*newQ;
}