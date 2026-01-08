// ArcaneBet — simulation & betting logic (demo)
const matchesEl = document.getElementById('matches');
const betsListEl = document.getElementById('betsList');
const balanceEl = document.getElementById('balance');
const expectedEl = document.getElementById('expected');
const stakeInput = document.getElementById('stake');
const placeBtn = document.getElementById('placeBet');
const speedInput = document.getElementById('speed');
const simClock = document.getElementById('simClock');
const simPlay = document.getElementById('simPlay');
const simPause = document.getElementById('simPause');

let balance = 1250.00;
let simTime = 0; // seconds
let running = false;
let speed = 1;
let lastFrame = null;

const state = {
  matches: [],
  bets: []
};

function seedMatches(){
  const now = 60; // simulated seconds baseline
  state.matches = [
    {id:1,sport:'football',title:'FC Aurora vs Blackbridge',startIn:now+30,duration:300,odds:{home:1.9,draw:3.4,away:4.2},vip:true},
    {id:2,sport:'basketball',title:'Raptors vs Titans',startIn:now+60,duration:240,odds:{home:1.6,away:2.3},vip:false},
    {id:3,sport:'tennis',title:'S. Novak vs A. Medrano',startIn:now+15,duration:120,odds:{home:1.7,away:2.1},vip:true},
    {id:4,sport:'football',title:'Union City vs Valley FC',startIn:now+120,duration:300,odds:{home:2.05,draw:3.1,away:3.6},vip:false},
    {id:5,sport:'basketball',title:'Eagles vs Storm',startIn:now+200,duration:240,odds:{home:1.8,away:2.0},vip:false}
  ];
}

function fmtTime(s){
  const hh = String(Math.floor(s/3600)).padStart(2,'0');
  const mm = String(Math.floor((s%3600)/60)).padStart(2,'0');
  const ss = String(Math.floor(s%60)).padStart(2,'0');
  return `${hh}:${mm}:${ss}`;
}

function renderMatches(filter='all'){
  matchesEl.innerHTML = '';
  const list = state.matches.filter(m=> filter==='all' ? true : m.sport===filter);
  list.forEach(m=>{
    const el = document.createElement('div');
    el.className = 'match';
    el.dataset.id = m.id;

    const meta = document.createElement('div'); meta.className='meta';
    meta.innerHTML = `<div class="sport">${m.sport.toUpperCase()}</div><div class="countdown" data-id="${m.id}">Start in: ${Math.max(0,Math.round(m.startIn-simTime))}s</div>`;
    el.appendChild(meta);

    if(m.vip) el.innerHTML += `<div class="badge">VIP</div>`;

    el.innerHTML += `<div class="teams"><strong>${m.title}</strong><div class="muted">Dauer ${Math.round(m.duration/60)}m</div></div>`;

    const odds = document.createElement('div'); odds.className='odds';
    for(const key in m.odds){
      const o = document.createElement('div'); o.className='odd'; o.dataset.match = m.id; o.dataset.pick = key; o.innerHTML = `<div class="pick">${key.toUpperCase()}</div><div class="price">${m.odds[key].toFixed(2)}</div>`;
      o.addEventListener('click', ()=> addToSlip(m.id,key));
      odds.appendChild(o);
    }
    el.appendChild(odds);
    matchesEl.appendChild(el);
  });
}

function addToSlip(matchId,pick){
  const m = state.matches.find(x=>x.id===matchId);
  if(!m) return;
  const existing = state.bets.find(b=>b.matchId===matchId && b.pick===pick);
  if(existing) return;
  const odd = m.odds[pick];
  state.bets.push({matchId, title:m.title, pick, odd});
  updateSlip();
}

function updateSlip(){
  if(state.bets.length===0){betsListEl.innerText='Keine Wetten ausgewählt.'; expectedEl.innerText='€0.00';return}
  betsListEl.innerHTML = '';
  let totalMult = 1;
  state.bets.forEach((b,idx)=>{
    totalMult *= b.odd;
    const li = document.createElement('div'); li.className='bet-item'; li.innerHTML = `${b.title} — ${b.pick.toUpperCase()} @ <strong>${b.odd.toFixed(2)}</strong>`;
    const rem = document.createElement('button'); rem.innerText='✕'; rem.className='small'; rem.style.float='right'; rem.addEventListener('click',()=>{state.bets.splice(idx,1);updateSlip();});
    li.appendChild(rem);
    betsListEl.appendChild(li);
  });
  const stake = Number(stakeInput.value) || 0;
  const expected = stake * totalMult;
  expectedEl.innerText = `€${expected.toFixed(2)}`;
}

placeBtn.addEventListener('click', ()=>{
  const stake = Number(stakeInput.value) || 0;
  if(state.bets.length===0 || stake<=0){alert('Wähle zuerst mindestens eine Wette und setze einen positiven Stake.');return}
  if(stake>balance){alert('Nicht genügend Guthaben.');return}
  // reserve stake
  balance -= stake; updateBalance();
  // create pending bet
  const bet = {id:Date.now(),bets:JSON.parse(JSON.stringify(state.bets)),stake,placedAt:simTime, settled:false};
  // store on user (simple)
  if(!state.settledBets) state.settledBets = [];
  state.settledBets.push(bet);
  state.bets = [];
  updateSlip();
});

function updateBalance(){
  balanceEl.innerText = `€${balance.toFixed(2)}`;
}

function settleMatches(){
  // check matches that finished
  state.matches.forEach(m=>{
    if(!m._settled && simTime >= (m.startIn + m.duration)){
      // determine winner by odds (convert to implied probability)
      const keys = Object.keys(m.odds);
      const probs = keys.map(k=> 1/m.odds[k] );
      const sum = probs.reduce((a,b)=>a+b,0);
      const norm = probs.map(p=>p/sum);
      let r = Math.random();
      let acc = 0; let choice = keys[0];
      for(let i=0;i<keys.length;i++){acc+=norm[i]; if(r<=acc){choice=keys[i];break}}
      m.result = choice; m._settled=true;
      // settle user bets
      if(state.settledBets){
        state.settledBets.forEach(bet=>{
          if(bet.settled) return;
          // if any picked match in this bet is decided and lost -> mark loss, if all picks resolved and won -> pay
          let allResolved = true; let won = true;
          bet.bets.forEach(pick=>{
            const mm = state.matches.find(x=>x.id===pick.matchId);
            if(mm && mm._settled){
              if(mm.result !== pick.pick) won=false;
            } else { allResolved=false }
          });
          if(allResolved){
            if(won){
              const mult = bet.bets.reduce((acc,x)=>acc * x.odd,1);
              const payout = bet.stake * mult;
              balance += payout;
            }
            bet.settled = true;
          }
        });
      }
    }
  });
}

function renderCountdowns(){
  document.querySelectorAll('.countdown').forEach(el=>{
    const id = Number(el.dataset.id);
    const m = state.matches.find(x=>x.id===id);
    if(!m) return;
    if(simTime < m.startIn) el.innerText = `Start in: ${Math.max(0,Math.round(m.startIn-simTime))}s`;
    else if(simTime < m.startIn + m.duration) el.innerText = `LIVE — ${Math.max(0,Math.round((m.startIn+m.duration)-simTime))}s`; 
    else if(m._settled) el.innerText = `Ergebnis: ${m.result.toUpperCase()}`;
  });
}

function tick(now){
  if(!lastFrame) lastFrame = now; const dt = (now-lastFrame)/1000; lastFrame = now;
  if(running){ simTime += dt * speed; }
  simClock.innerText = fmtTime(Math.floor(simTime));
  renderCountdowns();
  settleMatches();
  updateBalance();
  requestAnimationFrame(tick);
}

// filters
document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',(e)=>{
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  e.currentTarget.classList.add('active'); renderMatches(e.currentTarget.dataset.filter);
}));

speedInput.addEventListener('input',()=>{speed = Number(speedInput.value);});
simPlay.addEventListener('click',()=>{running=true});
simPause.addEventListener('click',()=>{running=false});
stakeInput.addEventListener('input',updateSlip);

// init
seedMatches(); renderMatches(); updateSlip(); updateBalance();
requestAnimationFrame(tick);
