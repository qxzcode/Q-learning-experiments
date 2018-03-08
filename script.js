const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

canvas.width = 500;
canvas.height = 250;

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
let rewardAcc = 0, rewardCount = 0;
function draw(time) {
    requestAnimationFrame(draw);
    if (lastFrame === null) lastFrame = time;
    let dt = (time - lastFrame)/1000;
    if (dt > 1/30) dt = 1/30;
    lastFrame = time;
    
    ///// update
    update(dt);
    
    
    
    // clear the canvas
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // pendulum and stuff
    ctx.strokeStyle = "gray";
    drawLine(0, canvas.height/2, canvas.width, canvas.height/2);
    drawLine(canvas.width/2, 0, canvas.width/2, canvas.height);
    ctx.strokeStyle = "green";
    drawLine(canvas.width/2-50, 0, canvas.width/2-50, canvas.height);
    drawLine(canvas.width/2+50, 0, canvas.width/2+50, canvas.height);
    
    const curState = getState(globalVars);
    // drawState(curState.getNextState(0).getVars(), "pink");
    // drawState(curState.getNextState(1).getVars(), "lightgreen");
    // drawState(curState.getNextState(2).getVars(), "lightblue");
    drawState(curState.getVars(), "gray");
    drawState(globalVars, "black");
    
    function drawState(vars, color) {
        const xPos = canvas.width/2 + vars.cartX;
        const yPos = canvas.height/2;
        ctx.strokeStyle = color;
        drawLine(xPos, yPos, xPos+PENDULUM_RADIUS*Math.cos(vars.angle),
                             yPos-PENDULUM_RADIUS*Math.sin(vars.angle));
        
        ctx.fillStyle = color;
        ctx.fillRect(xPos - 5, yPos - 5, 10, 10);
    }
    
    function getMaxQ(a) {
        const Q = curState.getNextState(a).getMaxQ();
        document.getElementById("q"+a).textContent = Q;
    }
    [0,1,2].map(getMaxQ);
}

requestAnimationFrame(draw);


function jump(time) {
    const dt = 1/30;
    for (let t = 0; t < time; t += dt) {
        update(dt);
    }
}
function jumpRT(time) {
    const dt = 1/30;
    const start = Date.now();
    while (Date.now()-start < time) {
        update(dt);
    }
}
let int = null;
function startFast() {
    if (int == null) {
        int = setInterval(() => jumpRT(1000), 1500);
        qRandomness = 0.5;
    }
}
function stopFast() {
    clearInterval(int);
    int = null;
    qRandomness = 0.001;
}

function update(dt) {
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
}


const CART_MASS = 1;
const PENDULUM_MASS = 1;
const PENDULUM_RADIUS = 100;
const MOTOR_SPEED = 60;
const MOTOR_POWER = 10;
const END_BUFFER = 0.03;
const GRAVITY = 70;
const CART_FRICTION = 0.2;
const PENDULUM_FRICTION = 100;
const PENDULUM_I = PENDULUM_MASS * PENDULUM_RADIUS*PENDULUM_RADIUS;
function simulate(vars, dt) {
    //// cart X force
    // motor
    let mSpeed = MOTOR_SPEED * ([-1, 0, 1])[vars.lastAction];
    // push back from edges
    if (vars.cartX < MIN_X) mSpeed -= MOTOR_SPEED*(vars.cartX-MIN_X)*END_BUFFER;
    if (vars.cartX > MAX_X) mSpeed -= MOTOR_SPEED*(vars.cartX-MAX_X)*END_BUFFER;
    let cartForce = MOTOR_POWER*(mSpeed-vars.dCartX);
    // friction
    const Fn = GRAVITY*(CART_MASS + PENDULUM_MASS);
    cartForce -= CART_FRICTION*Fn*Math.sign(vars.dCartX);
    // pendulum push on cart
    cartForce -= PENDULUM_MASS*GRAVITY * Math.sin(vars.angle)*Math.cos(vars.angle);
    
    //// pendulum torque
    let penTorque = cartForce*PENDULUM_RADIUS*Math.sin(vars.angle) -
                    PENDULUM_MASS*GRAVITY*PENDULUM_RADIUS*Math.cos(vars.angle);
    // friction
    penTorque -= PENDULUM_FRICTION*Math.sign(vars.dAngle);
    
    //// move values
    vars.dCartX += cartForce/CART_MASS * dt;
    vars.dAngle += penTorque/PENDULUM_I * dt;
    vars.dAngle = Math.min(vars.dAngle, daRange[1]);
    vars.dAngle = Math.max(vars.dAngle, daRange[0]);
    vars.cartX += vars.dCartX * dt;
    vars.angle += vars.dAngle * dt;
}

function simulateFor(vars, time, steps) {
    const dt = time / steps;
    for (let n = 0; n < steps; n++) {
        simulate(vars, dt);
    }
}



///////////// Q-learning /////////////


/// utility functions

const MIN_X = -canvas.width/3;
const MAX_X = +canvas.width/3;

const xRange = [MIN_X, MAX_X];
const dxRange = [-MOTOR_SPEED, MOTOR_SPEED];
const aRange = [0, 2*Math.PI];
const daRange = [-2, 2];

const NUM_QUANTS = 20;
function quantize(v, [min, max]) {
    if (v < min) v = min;
    if (v > max-0.001) v = max-0.001;
    return Math.floor(NUM_QUANTS * (v-min)/(max-min));
}
function unquantize(i, [min, max]) {
    const INT = (max-min)/NUM_QUANTS;
    return min + i*INT + INT/2;
}

const NUM_STATES = NUM_QUANTS*NUM_QUANTS*NUM_QUANTS*NUM_QUANTS;
document.getElementById("NUM_STATES").textContent = NUM_STATES;
let statesFound = 0;

const states = {};
function getState(vars) {
    const x = quantize(vars.cartX, xRange);
    const dx = quantize(vars.dCartX, dxRange);
    const a = quantize(getNormAngle(vars.angle), aRange);
    const da = quantize(vars.dAngle, daRange);
    const key = x+","+dx+","+a+","+da;
    if (states[key])
        return states[key];
    
    return states[key] = {
        key,
        0: {Q: INITIAL_Q}, // move left
        1: {Q: INITIAL_Q}, // don't move
        2: {Q: INITIAL_Q}, // move right
        getMaxQ() {
            return Math.max(this[0].Q, this[1].Q, this[2].Q);
        },
        nextStates: {},
        getNextState(a) {
            if (this.nextStates[a]) return this.nextStates[a];
            
            let vars = this.getVars(a);
            simulateFor(vars, UPDATE_DELAY, UPDATE_DELAY/(1/30));
            return this.nextStates[a] = getState(vars);
        },
        getVars(action) {
            return {
                cartX: unquantize(x, xRange),
                dCartX: unquantize(dx, dxRange),
                angle: unquantize(a, aRange),
                dAngle: unquantize(da, daRange),
                lastAction: action
            };
        },
        found: false
    };
}

function getCurrentReward() {
    // return 1-Math.abs(cartX)/MAX_X;
    
    let a = getNormAngle(angle);
    if (a > Math.PI*3/2) a -= 2*Math.PI;
    
    a = Math.abs(a - Math.PI/2) / (Math.PI/6);
    const da = Math.abs(dAngle) / 0.4;
    const x = Math.abs(cartX) / MAX_X;
    if (a < 1 &&
        da < 1) {
        document.getElementById("foundGoal").textContent = "yep";
        return (1.0 + (1-a)*1.0 + (1-da)*1.0) * Math.sqrt(1-x);
    } else {
        return -0.04;
    }
    
    // return 4 - (Math.abs(cartX)/MAX_X + Math.abs(dCartX)/150 +
    //             Math.abs(a - Math.PI/2)/Math.PI + Math.abs(dAngle)/2);
}

function getNormAngle(angle) {
    let a = angle % (2*Math.PI);
    if (a < 0) a += 2*Math.PI;
    return a;
}

function takeAction(a) {
    lastAction = a;
}


/// agent control (the meat)

const LEARNING_RATE = 0.94;
const DISCOUNT_FACTOR = 0.80;
const INITIAL_Q = 0;
let qRandomness = 0.5;

let cartX = 0, dCartX = 0;
let angle = -Math.PI/2, dAngle = 0;
let lastAction = 1;
const globalVars = {
    get cartX() {return cartX}, set cartX(v) {return cartX = v},
    get dCartX() {return dCartX}, set dCartX(v) {return dCartX = v},
    get angle() {return angle}, set angle(v) {return angle = v},
    get dAngle() {return dAngle}, set dAngle(v) {return dAngle = v},
    get lastAction() {return lastAction}, set lastAction(v) {return lastAction = v},
};

function updateAgent(reward) {
    // console.log("updateAgent");
    document.getElementById("updates").textContent++;
    
    // observe the reward for being in the current state
    const curState = getState(globalVars);
    observeReward(curState, reward, [0,1,2]);
    if (!curState.found) {
        curState.found = true;
        statesFound++;
        document.getElementById("statesFound").textContent = statesFound;
        document.getElementById("percentFound").textContent = (100*statesFound/NUM_STATES).toFixed(0);
    }
    
    // move
    let bestAction = null;
    let bestQ = -Infinity;
    for (const a of [0,1,2]) {
        const Q = curState.getNextState(a).getMaxQ() + Math.random()*qRandomness;
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