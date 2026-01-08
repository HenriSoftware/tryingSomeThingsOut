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
// app.js
(() => {
  // -----------------------------
  // Utilities
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const round2 = (n) => Math.round(n * 100) / 100;

  function fmtMoneyEUR(n) {
    return n.toLocaleString("en-IE", { style: "currency", currency: "EUR" });
  }

  function fmtTime(d) {
    // Mon 14:05
    const opts = { weekday: "short", hour: "2-digit", minute: "2-digit" };
    return d.toLocaleString("en-GB", opts);
  }

  function uid() {
    return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
  }

  // Converts implied probability to decimal odds with a margin.
  function probToOdds(p, margin = 0.06) {
    const pm = p * (1 + margin);
    return clamp(1 / clamp(pm, 0.05, 0.95), 1.02, 25);
  }

  // Soft odds movement: random drift around current odds.
  function moveOdds(odd, volatility = 0.03) {
    const r = (Math.random() - 0.5) * 2; // -1..1
    const factor = 1 + r * volatility;
    return clamp(odd * factor, 1.02, 25);
  }

  // -----------------------------
  // Data Model (Fictional)
  // -----------------------------
  const SPORTS = [
    { key: "football", name: "Football" },
    { key: "basketball", name: "Basketball" },
    { key: "tennis", name: "Tennis" },
    { key: "esports", name: "Esports" },
  ];

  const LEAGUES = {
    football: ["Aurelian League", "Northshore Cup", "Continental XI"],
    basketball: ["Metro Series", "Atlantic Circuit", "Prime Arena"],
    tennis: ["Silver Court", "Grand Indoor", "Coastal Open"],
    esports: ["Neon Division", "Hyperlink League", "Circuit Masters"],
  };

  const TEAMS = {
    football: ["Vale United", "Orion FC", "Sable Town", "Crestford", "Helios SC", "Ravenholm", "Nova Rangers", "Ironbridge"],
    basketball: ["Cobalt Kings", "Harbor Sparks", "Violet Comets", "Axis Giants", "North Alloy", "Summit Rush", "City Forge", "Quartz Lions"],
    tennis: ["M. Kova", "S. Rinaldi", "A. Voss", "T. Han", "J. Sato", "D. Mercer", "L. Neri", "P. Alvarez"],
    esports: ["Team Prism", "Voidwalkers", "ArcNova", "Kinetic", "Night Circuit", "ByteRush", "Sable Syndicate", "GlitchGarden"],
  };

  // Create a set of fictional events with start times over the next ~2 hours.
  function generateEvents(baseTime) {
    const events = [];
    let idCounter = 1;

    for (const s of SPORTS) {
      const leagueList = LEAGUES[s.key];
      const teamList = TEAMS[s.key];

      for (let i = 0; i < 6; i++) {
        const a = teamList[(i * 2) % teamList.length];
        const b = teamList[(i * 2 + 3) % teamList.length];
        const league = leagueList[i % leagueList.length];

        // start time staggered per sport, within next 120 minutes
        const startOffsetMin = 8 + (i * 12) + (s.key.charCodeAt(0) % 7);
        const startAt = new Date(baseTime.getTime() + startOffsetMin * 60_000);

        // event length
        const durationMin =
          s.key === "football" ? 40 :
          s.key === "basketball" ? 28 :
          s.key === "tennis" ? 22 :
          26;

        const endAt = new Date(startAt.getTime() + durationMin * 60_000);

        // odds: three-way for football; two-way for others
        const baseProbA = clamp(0.46 + (Math.random() - 0.5) * 0.18, 0.20, 0.72);
        const baseProbB = clamp(1 - baseProbA, 0.20, 0.80);

        const market =
          s.key === "football"
            ? makeThreeWayMarket(baseProbA)
            : makeTwoWayMarket(baseProbA, baseProbB);

        events.push({
          id: `EV${idCounter++}`,
          sport: s.key,
          league,
          home: a,
          away: b,
          startAt,
          endAt,
          status: "upcoming", // upcoming | live | finished
          score: { a: 0, b: 0 },
          popularity: Math.floor(40 + Math.random() * 60), // 40..100
          mover: 0, // abs change since last tick, used for sorting and feed
          market,
          outcome: null, // resolved when finished
        });
      }
    }
    return events;
  }

  function makeTwoWayMarket(pA, pB) {
    // Normalize probabilities
    const sum = pA + pB;
    pA /= sum; pB /= sum;

    const a = probToOdds(pA, 0.06);
    const b = probToOdds(pB, 0.06);
    return {
      type: "two",
      selections: [
        { key: "A", label: "Win", odds: round2(a) },
        { key: "B", label: "Win", odds: round2(b) },
      ],
    };
  }

  function makeThreeWayMarket(pHomeWin) {
    // Create a draw probability and normalize
    let pDraw = clamp(0.26 + (Math.random() - 0.5) * 0.08, 0.18, 0.34);
    let pAwayWin = 1 - pHomeWin - pDraw;
    if (pAwayWin < 0.18) {
      // adjust slightly
      pAwayWin = 0.18;
      pDraw = clamp(1 - pHomeWin - pAwayWin, 0.18, 0.34);
    }
    const sum = pHomeWin + pDraw + pAwayWin;
    pHomeWin /= sum; pDraw /= sum; pAwayWin /= sum;

    return {
      type: "three",
      selections: [
        { key: "H", label: "1", odds: round2(probToOdds(pHomeWin, 0.08)) },
        { key: "D", label: "X", odds: round2(probToOdds(pDraw, 0.08)) },
        { key: "A", label: "2", odds: round2(probToOdds(pAwayWin, 0.08)) },
      ],
    };
  }

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    view: "markets",
    sport: "all",
    q: "",
    statusFilter: "all",
    sort: "startAsc",
    playing: true,
    speed: 1,

    // Virtual clock starts "now" but is independent of real time.
    virtualNow: new Date(),

    balance: 1000,
    events: [],
    picks: [], // {pickId, eventId, label, selKey, oddsLocked, atTime}
    tickets: [], // {ticketId, placedAt, stake, legs: [...], totalOddsLocked, status, resolvedAt, payout}
    pulse: "",
  };

  // -----------------------------
  // DOM refs
  // -----------------------------
  const el = {
    year: $("#year"),
    virtualTime: $("#virtualTime"),
    balance: $("#balance"),
    grid: $("#eventsGrid"),
    empty: $("#emptyState"),
    pulse: $("#pulse"),

    q: $("#q"),
    status: $("#status"),
    sort: $("#sort"),

    slip: $("#slip"),
    slipHint: $("#slipHint"),
    stake: $("#stake"),
    totalOdds: $("#totalOdds"),
    potential: $("#potential"),
    btnClear: $("#btnClear"),
    btnPlace: $("#btnPlace"),

    btnPlayPause: $("#btnPlayPause"),
    playIcon: $("#playIcon"),
    btnJump: $("#btnJump"),

    viewTitle: $("#viewTitle"),
    viewSubtitle: $("#viewSubtitle"),

    liveList: $("#liveList"),
    moveFeed: $("#moveFeed"),
    history: $("#history"),

    countAll: $("#countAll"),
    countFootball: $("#countFootball"),
    countBasketball: $("#countBasketball"),
    countTennis: $("#countTennis"),
    countEsports: $("#countEsports"),
  };

  // -----------------------------
  // Rendering
  // -----------------------------
  function renderTop() {
    el.year.textContent = new Date().getFullYear();
    el.virtualTime.textContent = fmtTime(state.virtualNow);
    el.balance.textContent = fmtMoneyEUR(state.balance);
  }

  function statusBadge(evt) {
    if (evt.status === "live") return `<span class="badge live">Live</span>`;
    if (evt.status === "finished") return `<span class="badge finished">Finished</span>`;
    return `<span class="badge">Upcoming</span>`;
  }

  function scoreLine(evt) {
    if (evt.status === "upcoming") return `Starts ${fmtTime(evt.startAt)}`;
    if (evt.status === "live") return `Score ${evt.score.a}–${evt.score.b}`;
    return `Final ${evt.score.a}–${evt.score.b}`;
  }

  function selectionText(evt, selKey) {
    if (evt.market.type === "three") {
      if (selKey === "H") return `${evt.home} to win`;
      if (selKey === "D") return `Draw`;
      if (selKey === "A") return `${evt.away} to win`;
    } else {
      if (selKey === "A") return `${evt.home} win`;
      if (selKey === "B") return `${evt.away} win`;
    }
    return "Selection";
  }

  function renderEvents() {
    const list = filteredSortedEvents();
    el.grid.innerHTML = "";

    if (!list.length) {
      el.empty.style.display = "block";
      return;
    }
    el.empty.style.display = "none";

    for (const evt of list) {
      const moverClass = evt.mover >= 0 ? (evt.mover > 0 ? "up" : "") : "down";
      const moverSign = evt.mover === 0 ? "±0.00" : (evt.mover > 0 ? `+${evt.mover.toFixed(2)}` : evt.mover.toFixed(2));

      // Spark bar width derived from popularity
      const sparkWidth = clamp(evt.popularity, 40, 100);

      const oddsButtons = evt.market.selections.map((s) => {
        const isSelected = state.picks.some(p => p.eventId === evt.id && p.selKey === s.key);
        const label = evt.market.type === "three" ? s.label : (s.key === "A" ? "Home" : "Away");
        return `
          <button class="odd ${isSelected ? "is-selected" : ""}"
                  data-event="${evt.id}"
                  data-sel="${s.key}"
                  ${evt.status === "finished" ? "disabled" : ""}>
            <span class="odd__label">${label}</span>
            <span class="odd__value">${s.odds.toFixed(2)}</span>
          </button>
        `;
      }).join("");

      el.grid.insertAdjacentHTML("beforeend", `
        <article class="card">
          <div class="mover ${moverClass}">${moverSign}</div>
          <div class="card__top">
            <div class="meta">
              <div class="league">${evt.league} • ${prettySport(evt.sport)}</div>
              <div class="teams">${evt.home} <span class="muted">vs</span> ${evt.away}</div>
              <div class="time">${scoreLine(evt)}</div>
            </div>
            <div class="badges">
              ${statusBadge(evt)}
              <span class="badge">${evt.market.type === "three" ? "1X2" : "H2H"}</span>
            </div>
          </div>

          <div class="card__mid">
            <div class="score">${evt.status === "live" ? `LIVE ${evt.score.a}–${evt.score.b}` : (evt.status === "finished" ? `FINAL ${evt.score.a}–${evt.score.b}` : "PRE-MATCH")}</div>
            <div class="pop">
              <span>Popularity</span>
              <span class="spark"><i style="width:${sparkWidth}%"></i></span>
              <span class="muted">${evt.popularity}</span>
            </div>
          </div>

          <div class="odds">${oddsButtons}</div>
        </article>
      `);
    }
  }

  function renderCounts() {
    const all = state.events.length;
    const by = (k) => state.events.filter(e => e.sport === k).length;
    el.countAll.textContent = all;
    el.countFootball.textContent = by("football");
    el.countBasketball.textContent = by("basketball");
    el.countTennis.textContent = by("tennis");
    el.countEsports.textContent = by("esports");
  }

  function renderSlip() {
    if (!state.picks.length) {
      el.slipHint.textContent = "Select odds to add picks";
      el.slip.innerHTML = `
        <div class="note" style="margin:0;">
          <div class="note__title">Empty Slip</div>
          <div class="note__text">Choose any odds on the left to build a demo ticket. Odds lock when you place a bet.</div>
        </div>
      `;
      el.totalOdds.textContent = "—";
      el.potential.textContent = "—";
      return;
    }

    el.slipHint.textContent = `${state.picks.length} pick${state.picks.length === 1 ? "" : "s"} selected`;

    el.slip.innerHTML = state.picks.map(p => {
      const evt = state.events.find(e => e.id === p.eventId);
      return `
        <div class="pick">
          <div class="pick__top">
            <div>
              <div class="pick__title">${evt.home} vs ${evt.away}</div>
              <div class="pick__meta">${prettySport(evt.sport)} • ${evt.league}</div>
              <div class="pick__meta">${selectionText(evt, p.selKey)}</div>
            </div>
            <button class="pick__remove" data-remove="${p.pickId}" aria-label="Remove pick">×</button>
          </div>
          <div class="pick__bottom">
            <div class="pick__meta">${evt.status === "live" ? "Live market" : "Pre-match market"}</div>
            <div class="pick__odd">${p.oddsLocked.toFixed(2)}</div>
          </div>
        </div>
      `;
    }).join("");

    const totalOdds = computeSlipOdds();
    el.totalOdds.textContent = totalOdds.toFixed(2);

    const stake = clamp(Number(el.stake.value || 0), 0, 1_000_000);
    const potential = stake * totalOdds;
    el.potential.textContent = fmtMoneyEUR(potential);
  }

  function renderLive() {
    const live = state.events.filter(e => e.status === "live")
      .sort((a,b) => (b.popularity - a.popularity));

    el.liveList.innerHTML = live.length
      ? live.map(e => `
          <div class="live-item">
            <div class="live-item__left">
              <div class="live-item__title">${e.home} vs ${e.away}</div>
              <div class="live-item__meta">${prettySport(e.sport)} • ${e.league}</div>
            </div>
            <div class="live-item__right">
              <div class="live-item__score">${e.score.a}–${e.score.b}</div>
              <div class="live-item__meta">${fmtTime(state.virtualNow)}</div>
            </div>
          </div>
        `).join("")
      : `<div class="note" style="margin:0;">
          <div class="note__title">No live events</div>
          <div class="note__text">Increase time speed or jump +15m to push events into “Live”.</div>
         </div>`;

    const movers = [...state.events]
      .sort((a,b) => Math.abs(b.mover) - Math.abs(a.mover))
      .slice(0, 8);

    el.moveFeed.innerHTML = movers.map(e => {
      const cls = e.mover > 0 ? "up" : (e.mover < 0 ? "down" : "");
      const sign = e.mover > 0 ? `+${e.mover.toFixed(2)}` : e.mover.toFixed(2);
      return `
        <div class="feed-item">
          <div>
            <div class="feed-item__title">${e.home} vs ${e.away}</div>
            <div class="feed-item__meta">${prettySport(e.sport)} • ${e.status.toUpperCase()}</div>
          </div>
          <div class="feed-item__delta ${cls}">${e.mover === 0 ? "±0.00" : sign}</div>
        </div>
      `;
    }).join("");
  }

  function renderHistory() {
    if (!state.tickets.length) {
      el.history.innerHTML = `
        <div class="note" style="margin:0;">
          <div class="note__title">No tickets yet</div>
          <div class="note__text">Build a slip and place a demo bet to see resolution and payout.</div>
        </div>
      `;
      return;
    }

    const sorted = [...state.tickets].sort((a,b) => b.placedAt - a.placedAt);

    el.history.innerHTML = sorted.map(t => {
      const statusClass =
        t.status === "win" ? "win" :
        t.status === "lose" ? "lose" : "pending";

      const legsText = t.legs.map(l => {
        const evt = state.events.find(e => e.id === l.eventId);
        return `${evt.home} vs ${evt.away} — ${l.selectionLabel} @ ${l.oddsLocked.toFixed(2)}`;
      }).join("<br>");

      return `
        <div class="hist-item">
          <div>
            <div class="hist-item__title">${fmtMoneyEUR(t.stake)} • Total ${t.totalOddsLocked.toFixed(2)}</div>
            <div class="hist-item__meta">
              Placed ${fmtTime(new Date(t.placedAt))} • Legs: ${t.legs.length}<br>
              <span style="font-family:var(--mono)">${legsText}</span>
            </div>
          </div>
          <div class="hist-item__right">
            <div class="pill2 ${statusClass}">${t.status.toUpperCase()}</div>
            <div class="mono">${t.status === "win" ? fmtMoneyEUR(t.payout) : (t.status === "lose" ? "€ 0.00" : "—")}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderPulse() {
    el.pulse.textContent = state.pulse || "Markets stable • Low volatility";
  }

  function renderAll() {
    renderTop();
    renderCounts();
    renderEvents();
    renderSlip();
    renderPulse();
    renderLive();
    renderHistory();
  }

  // -----------------------------
  // Filtering & Sorting
  // -----------------------------
  function prettySport(k) {
    const s = SPORTS.find(x => x.key === k);
    return s ? s.name : k;
  }

  function filteredSortedEvents() {
    let list = [...state.events];

    if (state.sport !== "all") list = list.filter(e => e.sport === state.sport);

    const q = state.q.trim().toLowerCase();
    if (q) {
      list = list.filter(e =>
        (e.home + " " + e.away + " " + e.league).toLowerCase().includes(q)
      );
    }

    if (state.statusFilter !== "all") list = list.filter(e => e.status === state.statusFilter);

    if (state.view === "live") list = list.filter(e => e.status === "live");
    if (state.view === "history") list = []; // main grid unused in history

    if (state.sort === "startAsc") list.sort((a,b) => a.startAt - b.startAt);
    if (state.sort === "volDesc") list.sort((a,b) => b.popularity - a.popularity);
    if (state.sort === "moverDesc") list.sort((a,b) => Math.abs(b.mover) - Math.abs(a.mover));

    return list;
  }

  // -----------------------------
  // Slip & Tickets
  // -----------------------------
  function computeSlipOdds() {
    // Multiply locked odds
    let total = 1;
    for (const p of state.picks) total *= p.oddsLocked;
    return round2(total);
  }

  function addOrReplacePick(eventId, selKey) {
    const evt = state.events.find(e => e.id === eventId);
    if (!evt || evt.status === "finished") return;

    const sel = evt.market.selections.find(s => s.key === selKey);
    if (!sel) return;

    // One pick per event, replace if exists
    const existingIndex = state.picks.findIndex(p => p.eventId === eventId);
    const pick = {
      pickId: existingIndex >= 0 ? state.picks[existingIndex].pickId : uid(),
      eventId,
      selKey,
      label: selectionText(evt, selKey),
      oddsLocked: sel.odds, // locks at selection moment (UI behavior)
      atTime: new Date(state.virtualNow.getTime())
    };

    if (existingIndex >= 0) state.picks.splice(existingIndex, 1, pick);
    else state.picks.push(pick);

    // Update pulse message
    state.pulse = `Slip updated • ${state.picks.length} pick${state.picks.length === 1 ? "" : "s"} • Total odds ${computeSlipOdds().toFixed(2)}`;
  }

  function removePick(pickId) {
    state.picks = state.picks.filter(p => p.pickId !== pickId);
    state.pulse = state.picks.length ? `Pick removed • ${state.picks.length} remaining` : "Slip cleared • Markets stable";
  }

  function clearSlip() {
    state.picks = [];
    state.pulse = "Slip cleared • Markets stable";
  }

  function placeTicket() {
    if (!state.picks.length) return;

    const stake = clamp(Number(el.stake.value || 0), 1, 1_000_000);
    if (stake > state.balance) {
      state.pulse = "Insufficient demo balance • Reduce stake";
      return;
    }

    const legs = state.picks.map(p => {
      const evt = state.events.find(e => e.id === p.eventId);
      return {
        eventId: p.eventId,
        selKey: p.selKey,
        selectionLabel: selectionText(evt, p.selKey),
        oddsLocked: p.oddsLocked
      };
    });

    const total = computeSlipOdds();

    const ticket = {
      ticketId: uid(),
      placedAt: Date.now(),
      stake,
      legs,
      totalOddsLocked: total,
      status: "pending", // pending | win | lose
      resolvedAt: null,
      payout: 0
    };

    state.balance = round2(state.balance - stake);
    state.tickets.push(ticket);
    clearSlip();

    state.pulse = `Demo ticket placed • Stake ${fmtMoneyEUR(stake)} • Watching outcomes as events finish`;
  }

  // -----------------------------
  // Virtual Time Engine
  // -----------------------------
  function updateEventStatuses() {
    for (const evt of state.events) {
      const now = state.virtualNow.getTime();
      const start = evt.startAt.getTime();
      const end = evt.endAt.getTime();

      const prevStatus = evt.status;

      if (now < start) evt.status = "upcoming";
      else if (now >= start && now < end) evt.status = "live";
      else evt.status = "finished";

      // Resolve outcome once when event transitions to finished
      if (prevStatus !== "finished" && evt.status === "finished") {
        resolveEventOutcome(evt);
        resolveTicketsForEvent(evt.id);
      }
    }
  }

  function resolveEventOutcome(evt) {
    // Simple outcome logic:
    // - For two-way markets: winner based on final score
    // - For three-way: home/draw/away based on final score
    let outcome;
    if (evt.score.a > evt.score.b) outcome = (evt.market.type === "three") ? "H" : "A";
    else if (evt.score.a < evt.score.b) outcome = (evt.market.type === "three") ? "A" : "B";
    else outcome = (evt.market.type === "three") ? "D" : (Math.random() < 0.5 ? "A" : "B"); // two-way cannot draw; random tie-breaker
    evt.outcome = outcome;
  }

  function resolveTicketsForEvent(eventId) {
    // Any pending ticket where all legs are finished can resolve.
    for (const t of state.tickets) {
      if (t.status !== "pending") continue;

      const allFinished = t.legs.every(l => {
        const evt = state.events.find(e => e.id === l.eventId);
        return evt && evt.status === "finished";
      });

      if (!allFinished) continue;

      const won = t.legs.every(l => {
        const evt = state.events.find(e => e.id === l.eventId);
        return evt && evt.outcome === l.selKey;
      });

      t.status = won ? "win" : "lose";
      t.resolvedAt = Date.now();
      if (won) {
        t.payout = round2(t.stake * t.totalOddsLocked);
        state.balance = round2(state.balance + t.payout);
        state.pulse = `Ticket settled • WIN • Payout ${fmtMoneyEUR(t.payout)}`;
      } else {
        t.payout = 0;
        state.pulse = `Ticket settled • LOSS • Better luck next simulation`;
      }
    }
  }

  function simulateLiveScores() {
    // When live, occasionally increment a score.
    for (const evt of state.events) {
      if (evt.status !== "live") continue;

      const p = 0.22; // chance each tick to change score
      if (Math.random() < p) {
        const side = Math.random() < 0.5 ? "a" : "b";
        evt.score[side] += 1;
      }
    }
  }

  function simulateOddsMovement() {
    // Update odds a bit for upcoming + live; track movement magnitude.
    for (const evt of state.events) {
      evt.mover = 0;

      if (evt.status === "finished") continue;

      const vol =
        evt.status === "live" ? 0.055 :
        evt.sport === "tennis" ? 0.045 :
        0.035;

      let biggest = 0;

      for (const sel of evt.market.selections) {
        const before = sel.odds;
        sel.odds = round2(moveOdds(sel.odds, vol));
        biggest = Math.max(biggest, Math.abs(sel.odds - before));
      }

      // Re-normalize odds lightly (keeps it feeling realistic)
      if (evt.market.type === "three") {
        // bring them back toward a reasonable band
        evt.market.selections.forEach(s => s.odds = clamp(s.odds, 1.45, 9.5));
      } else {
        evt.market.selections.forEach(s => s.odds = clamp(s.odds, 1.10, 7.5));
      }

      evt.mover = round2(biggest);
    }
  }

  function updatePulseMessage() {
    const liveCount = state.events.filter(e => e.status === "live").length;
    const maxMover = Math.max(...state.events.map(e => Math.abs(e.mover)), 0);
    const mood =
      maxMover > 0.2 ? "High volatility" :
      maxMover > 0.12 ? "Active movement" :
      "Low volatility";

    state.pulse = `${mood} • Live: ${liveCount} • Largest mover: ${maxMover.toFixed(2)}`;
  }

  // Main tick: advances virtual time by deltaMs * speed
  let lastReal = performance.now();

  function tick(realNow) {
    const dt = realNow - lastReal;
    lastReal = realNow;

    if (state.playing) {
      // 1 real second => 1 virtual minute at 1× (feels dynamic)
      const virtualAdvanceMs = dt * state.speed * 60; // 1000ms * 60 = 60,000ms = 1 min
      state.virtualNow = new Date(state.virtualNow.getTime() + virtualAdvanceMs);

      updateEventStatuses();
      simulateLiveScores();
      simulateOddsMovement();
      updatePulseMessage();
    }

    // Update only needed views; simplest is renderAll (still fast for this scale)
    renderAll();

    requestAnimationFrame(tick);
  }

  function jump15() {
    state.virtualNow = new Date(state.virtualNow.getTime() + 15 * 60_000);
    updateEventStatuses();
    simulateOddsMovement();
    updatePulseMessage();
    state.pulse = "Jumped +15m • Simulation advanced";
  }

  // -----------------------------
  // View switching
  // -----------------------------
  function setView(viewKey) {
    state.view = viewKey;

    $$(".tab").forEach(b => b.classList.toggle("is-active", b.dataset.view === viewKey));
    $$(".view").forEach(v => v.classList.remove("is-active"));
    $(`#view-${viewKey}`).classList.add("is-active");

    if (viewKey === "markets") {
      el.viewTitle.textContent = "Markets";
      el.viewSubtitle.textContent = "Curated events with simulated market movement.";
    } else if (viewKey === "live") {
      el.viewTitle.textContent = "Live";
      el.viewSubtitle.textContent = "In-play simulation: scores and odds update with virtual time.";
    } else {
      el.viewTitle.textContent = "History";
      el.viewSubtitle.textContent = "Demo tickets resolve automatically when events finish.";
    }
  }

  // -----------------------------
  // Events / Listeners
  // -----------------------------
  function bindUI() {
    // Tabs
    $$(".tab").forEach(btn => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });

    // Sport filters
    $$(".sport").forEach(btn => {
      btn.addEventListener("click", () => {
        $$(".sport").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.sport = btn.dataset.sport;
        state.pulse = `Filter • ${btn.querySelector(".sport__name").textContent}`;
        renderAll();
      });
    });

    // Filters
    el.q.addEventListener("input", () => {
      state.q = el.q.value;
      renderEvents();
    });
    el.status.addEventListener("change", () => {
      state.statusFilter = el.status.value;
      renderEvents();
    });
    el.sort.addEventListener("change", () => {
      state.sort = el.sort.value;
      renderEvents();
    });

    // Grid odds click (event delegation)
    el.grid.addEventListener("click", (e) => {
      const btn = e.target.closest(".odd");
      if (!btn || btn.disabled) return;
      const eventId = btn.dataset.event;
      const selKey = btn.dataset.sel;
      addOrReplacePick(eventId, selKey);
      renderEvents();
      renderSlip();
      renderPulse();
    });

    // Slip remove (event delegation)
    el.slip.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-remove]");
      if (!rm) return;
      removePick(rm.dataset.remove);
      renderEvents();
      renderSlip();
      renderPulse();
    });

    // Stake change
    el.stake.addEventListener("input", () => renderSlip());

    // Clear / Place
    el.btnClear.addEventListener("click", () => {
      clearSlip();
      renderEvents();
      renderSlip();
      renderPulse();
    });
    el.btnPlace.addEventListener("click", () => {
      placeTicket();
      renderAll();
    });

    // Time controls
    el.btnPlayPause.addEventListener("click", () => {
      state.playing = !state.playing;
      el.playIcon.textContent = state.playing ? "⏸" : "▶";
      state.pulse = state.playing ? "Simulation running" : "Simulation paused";
      renderPulse();
    });

    el.btnJump.addEventListener("click", () => {
      jump15();
      renderAll();
    });

    $$(".seg").forEach(seg => {
      seg.addEventListener("click", () => {
        $$(".seg").forEach(s => s.classList.remove("is-active"));
        seg.classList.add("is-active");
        state.speed = Number(seg.dataset.speed);
        state.pulse = `Speed set to ${state.speed}×`;
        renderPulse();
      });
    });

    // Keyboard shortcuts
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        el.btnPlayPause.click();
      }
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        jump15();
        renderAll();
      }
    });
  }

  // -----------------------------
  // Init
  // -----------------------------
  function init() {
    // Start virtual time "now", but aligned to the minute for nicer display.
    const now = new Date();
    now.setSeconds(0, 0);
    state.virtualNow = now;

    state.events = generateEvents(state.virtualNow);
    renderCounts();

    // Set initial pulse and play icon
    el.playIcon.textContent = "⏸";
    state.pulse = "Markets initialized • Simulation running";

    bindUI();
    setView("markets");
    renderAll();

    requestAnimationFrame((t) => {
      lastReal = t;
      requestAnimationFrame(tick);
    });
  }

  init();
})();
