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
    drawLine(xPos, yPos, xPos+PENDULUM_RADIUS*Math.cos(angle), yPos-PENDULUM_RADIUS*Math.sin(angle));
    
    ctx.fillStyle = "black";
    ctx.fillRect(xPos - 5, yPos - 5, 10, 10);
}

requestAnimationFrame(draw);


const CART_MASS = 1;
const PENDULUM_MASS = 1;
const PENDULUM_RADIUS = 100;
const MOTOR_SPEED = 80;
const MOTOR_POWER = 10;
const END_BUFFER = 0.03;
const GRAVITY = 70;
const CART_FRICTION = 0.2;
const PENDULUM_FRICTION = 100;
const PENDULUM_I = PENDULUM_MASS * PENDULUM_RADIUS*PENDULUM_RADIUS;
function simulate(vars, dt) {//console.log(dCartX);
    //// cart X force
    // motor
    let mSpeed = MOTOR_SPEED * [-1, 0, 1][vars.lastAction]
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
    if (vars.dAngle > +3) vars.dAngle = +3;
    if (vars.dAngle < -3) vars.dAngle = -3;
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
const dxRange = [-150, 150];
const aRange = [0, 2*Math.PI];
const daRange = [-2, 2];

const NUM_QUANTS = 7;
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

const states = {};
function getState(vars) {
    const x = quantize(cartX, xRange);
    // const dx = quantize(dCartX, dxRange);
    const a = quantize(getNormAngle(), aRange);
    const da = quantize(dAngle, daRange);
    const key = x+","+/*dx+","+*/a+","+da;
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
            
            let vars = this.getVars(a);
            simulateFor(vars, UPDATE_DELAY, UPDATE_DELAY/(1/30));
            return this.nextStates[a] = getState(vars);
        },
        getVars(action) {
            return {
                cartX: unquantize(x, xRange),
                dCartX: 0,//unquantize(dx, dxRange),
                angle: unquantize(a, aRange),
                dAngle: unquantize(da, daRange),
                lastAction: action
            };
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

const LEARNING_RATE = 0.6;
const DISCOUNT_FACTOR = 0.90;
const INITIAL_Q = 0;

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