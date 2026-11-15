const PAGE=100, SPAN_MAX=1000000, PLAYER_MAX=30, STORE="dpn-players", STORE_SCORES="dpn-scores", STORE_WHEEL="dpn-wheel-scores";
const WHEEL_COLORS=["#2563eb","#dc2626","#16a34a","#d97706","#7c3aed","#db2777","#0891b2","#65a30d","#ea580c","#4f46e5","#be123c","#0d9488"];
const BAND_A="#9f1239", BAND_B="#111827", DEAD_SLICE="#475569";
let gameMin=1, gameMax=99, secrets=[], secretAll=[], secretTotal=1, winTarget=3, pointAll=true, lo, hi, picked, pageFrom=1, useCustom=false, pickMin=1, pickMax=99;
let players=[], scores={}, order=[], alive=[], roundOrder=[], turn=0, nextOrder=[], spinning=false, rot=0, spinTimer=0;
let gameCat="secret", wheelMin=1, wheelMax=99, wheelOrder=[], picks={}, pickEach=1, pickCursor=0, pickFrom=1;
let wheelAlive=[], wheelLog=[], wheelRot=0, wheelSpinning=false, wheelAnim=0, wheelEndTimer=0, wheelGen=0;
const $=id=>document.getElementById(id);
const POP_SOUND="pop-sound-effect_AsEdnw2.mp3";
const SPIN_SOUND="spinner-sound.mp3";
const BOMB_SOUND="roblox-death-sound_1.mp3";
const spinAudio=new Audio(SPIN_SOUND);
spinAudio.volume=0.3;
const bgAudio=new Audio(encodeURI("Copyright Free Background Music Mix for Content Creators Royalty Free - (original Kbps).mp3"));
bgAudio.loop=true;
bgAudio.volume=0.1;
function startBackground(){
  if(!bgAudio.paused) return;
  bgAudio.play().catch(()=>{});
}
function playClip(src){
  const audio=new Audio(src);
  audio.play().catch(()=>{});
}
function playSpinSound(){
  spinAudio.currentTime=0;
  spinAudio.play().catch(()=>{});
}
function stopSpinSound(){
  spinAudio.pause();
  spinAudio.currentTime=0;
}
let onlineMode=true, myId="", hostId="", myTurn=false, playerMeta=[], roomCode="", applying=false, netPhase="gate";
let animId="", animGen=0, pendingSnap=null, sock=null, connTimer=0, wantRoom=false;
function show(n){
  ["gate","start","play","pick","wheelGame","over"].forEach(s=>$(s).classList.toggle("hidden",s!==n));
  const inRoom=n!=="gate";
  const side=document.querySelector(".side");
  if(side) side.classList.toggle("hidden",!inRoom);
  $("roombar").classList.toggle("hidden",!inRoom);
  $("roomNote").classList.toggle("hidden",!inRoom);
}
function isHost(){ return !!(myId&&myId===hostId); }
function myName(){
  const p=playerMeta.find(x=>x.id===myId);
  return p?p.name:"";
}
function playerByName(name){ return playerMeta.find(p=>p.name===name)||null; }
function screenOpen(id){
  const el=$(id);
  return !!el&&!el.classList.contains("hidden");
}
function roundLive(){
  return screenOpen("play")||screenOpen("pick")||screenOpen("wheelGame");
}
function motionOff(){
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function scoreKey(){
  return gameCat==="wheel"?STORE_WHEEL:STORE_SCORES;
}
const FONT='system-ui,-apple-system,"Segoe UI","Noto Sans Thai",Tahoma,sans-serif';

function parseIntStrict(v){
  v=String(v??"").trim();
  if(!/^-?\d+$/.test(v)) return null;
  const n=Number(v);
  return Number.isSafeInteger(n)?n:null;
}
function choice(){
  if(useCustom) return {min:parseIntStrict($("cmin").value), max:parseIntStrict($("cmax").value)};
  return {min:pickMin, max:pickMax};
}
function check(min,max){
  if(min==null||max==null) return "กรอกจำนวนเต็มเท่านั้น";
  if(min>=max) return "เลขต่ำสุดต้องน้อยกว่าเลขสูงสุด";
  if(max-min+1>SPAN_MAX) return "ช่วงตัวเลขต้องไม่เกิน 1,000,000 จำนวน";
  return "";
}
function readSecretCount(){
  return parseIntStrict($("secretCount").value);
}
function checkCount(min,max,count){
  if(count==null||count<1) return "จำนวนเลขลับต้องเป็นจำนวนเต็มตั้งแต่ 1";
  if(count>max-min+1) return "จำนวนเลขลับต้องไม่เกินจำนวนตัวเลขในช่วง";
  return "";
}
function readWinTarget(){
  return parseIntStrict($("winScore").value);
}
function checkWin(target){
  if(target==null||target<1) return "แต้มที่ชนะต้องเป็นจำนวนเต็มตั้งแต่ 1";
  if(target>999) return "แต้มที่ชนะต้องไม่เกิน 999";
  return "";
}
function drawSecrets(min,max,count){
  const span=max-min+1;
  if(count>=span){
    const all=[];
    for(let n=min;n<=max;n++) all.push(n);
    return all;
  }
  const pick=count>span/2?span-count:count;
  const bag=new Set();
  while(bag.size<pick) bag.add(Math.floor(Math.random()*span)+min);
  if(count<=span/2) return [...bag].sort((a,b)=>a-b);
  const secrets=[];
  for(let n=min;n<=max;n++) if(!bag.has(n)) secrets.push(n);
  return secrets;
}
function refreshLabel(){
  const c=choice();
  $("rangeLabel").textContent=(c.min==null||c.max==null)?"—":c.min+"–"+c.max;
  $("err").textContent="";
}
function orderReady(){
  if(players.length<2) return true;
  if(order.length!==players.length) return false;
  const seen=Object.create(null);
  for(const name of order){
    if(!players.includes(name)||seen[name]) return false;
    seen[name]=1;
  }
  return true;
}
function currentPlayer(){
  return alive.length?alive[((turn%alive.length)+alive.length)%alive.length]:"";
}
function begin(min,max,count){
  if(!orderReady()){
    show("start");
    $("err").textContent="กดสุ่มลำดับก่อนเริ่มเกม";
    return;
  }
  if(players.length===1) order=players.slice();
  const target=readWinTarget();
  const winErr=checkWin(target);
  if(winErr){
    show("start");
    $("err").textContent=winErr;
    return;
  }
  winTarget=target;
  pointAll=!!$("restModes").querySelector("[data-rest='all'].on");
  if(count==null) count=secretTotal;
  gameMin=min; gameMax=max; secretTotal=count;
  secretAll=drawSecrets(min,max,count);
  secrets=secretAll.slice();
  alive=order.slice();
  roundOrder=order.slice();
  lo=min; hi=max; picked=[]; pageFrom=min;
  turn=0;
  $("modeLabel").textContent="ช่วง "+min+"–"+max+" · เลขลับ "+count+" ตัว · ถึง "+winTarget+" แต้มชนะ · "+(pointAll?"เหลือหลายคนได้แต้ม ยกเว้นคนที่โดน":"เหลือหลายคนได้แต้มคนสุดท้าย");
  $("msg").textContent="";
  $("again").textContent="เล่นอีกครั้ง";
  $("again").dataset.reset="";
  show("play");
  render();
}
function renderRange(){
  const box=$("rangeText");
  box.textContent="";
  const loEl=document.createElement("b");
  const hiEl=document.createElement("b");
  loEl.textContent=lo;
  hiEl.textContent=hi;
  if(secrets.length<=1){
    box.append("ตอนนี้เลขลับอยู่ระหว่าง ",loEl," – ",hiEl);
    return;
  }
  const countEl=document.createElement("b");
  countEl.textContent=secrets.length;
  box.append("เลขลับ ",countEl," ตัว อยู่ในช่วง ",loEl," – ",hiEl);
}
function render(){
  renderRange();
  const paged=gameMax-gameMin+1>PAGE;
  $("pager").classList.toggle("hidden",!paged);
  $("jump").classList.toggle("hidden",!paged);
  if(onlineMode&&$("guess")){
    $("guess").disabled=!myTurn;
    const go=$("jump").querySelector("button");
    if(go) go.disabled=!myTurn;
  }
  let from=gameMin, to=gameMax;
  if(paged){
    const end=Math.min(gameMax,pageFrom+PAGE-1);
    if(end<lo||pageFrom>hi) pageFrom=gameMin+Math.floor((lo-gameMin)/PAGE)*PAGE;
    from=pageFrom;
    to=Math.min(gameMax,pageFrom+PAGE-1);
    $("pageLabel").textContent="เลข "+from+"–"+to;
    const prevStart=pageFrom-PAGE, nextStart=pageFrom+PAGE;
    $("prev").disabled=prevStart<gameMin||prevStart+PAGE-1<lo;
    $("next").disabled=nextStart>gameMax||nextStart>hi;
  }
  const g=$("grid");
  const sample=Math.max(Math.abs(from),Math.abs(to));
  const digits=String(sample).length+(from<0||to<0?1:0);
  g.className="grid"+(digits>=4?" d4":digits===3?" d3":"");
  g.innerHTML="";
  for(let n=from;n<=to;n++){
    const b=document.createElement("button");
    b.type="button";
    b.textContent=n;
    const used=picked.some(p=>p.n===n);
    const bomb=used&&(picked.some(p=>p.n===n&&p.hit)||secretAll.includes(n));
    if(bomb) b.classList.add("bomb");
    else if(used) b.classList.add("used");
    const wait=onlineMode&&!myTurn;
    b.disabled=used||n<lo||n>hi||wait;
    if(wait&&!used&&n>=lo&&n<=hi) b.classList.add("wait");
    b.onclick=()=>chooseNumber(n);
    g.appendChild(b);
  }
  const h=$("hist");
  h.textContent="";
  if(!picked.length) h.textContent="ยังไม่มี";
  else picked.forEach(p=>{
    const s=document.createElement("span");
    s.textContent=p.who?p.who+" "+p.n:String(p.n);
    if(secretAll.includes(p.n)) s.classList.add("hit");
    h.appendChild(s);
  });
  renderTurn();
  renderPlayers();
}
function renderTurn(){
  const name=currentPlayer();
  const playing=!$("play").classList.contains("hidden");
  $("turnbar").classList.toggle("hidden",!name||!playing);
  $("turnbar").classList.toggle("you",!!(name&&name===myName()));
  $("turnName").textContent=name&&name===myName()?name+" (คุณ)":name;
  const slot=alive.length?((turn%alive.length)+alive.length)%alive.length:-1;
  const rank=slot<0?0:roundOrder.indexOf(alive[slot])+1;
  $("turnRank").textContent=name?"อันดับ "+rank+" · เหลือ "+alive.length+" คน":"";
}
function renderScores(el){
  el.textContent="";
  if(!players.length){ el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const ranked=players.slice().sort((a,b)=>(scores[b]||0)-(scores[a]||0));
  const best=scores[ranked[0]]||0;
  ranked.forEach((name,i)=>{
    const li=document.createElement("li");
    if((scores[name]||0)===best&&best>0) li.classList.add("top");
    const label=document.createElement("span");
    label.textContent=(i+1)+". "+name;
    const pts=document.createElement("b");
    pts.textContent=(scores[name]||0)+" แต้ม";
    li.append(label,pts);
    el.appendChild(li);
  });
}
function pick(raw){
  const n=typeof raw==="number"?raw:parseIntStrict(raw);
  if(n==null){ $("msg").textContent="ใส่เป็นจำนวนเต็ม"; return; }
  if(n<lo||n>hi){ $("msg").textContent="เลือกเลขระหว่าง "+lo+" ถึง "+hi; return; }
  if(picked.some(p=>p.n===n)){ $("msg").textContent="เลขนี้ถูกเลือกแล้ว"; return; }
  const who=currentPlayer();
  picked.push({n,who});
  if(secrets.includes(n)){
    playClip(BOMB_SOUND);
    secrets=secrets.filter(s=>s!==n);
    if(who){
      const idx=alive.indexOf(who);
      if(idx>=0) alive.splice(idx,1);
      turn=alive.length?idx%alive.length:0;
    }
    if(!who||alive.length<=1||!secrets.length){
      finishRound();
      return;
    }
    $("msg").textContent=who+" โดนเลขลับ หลุดจากเทิร์น";
  }else{
    $("msg").textContent="";
    if(alive.length) turn=(turn+1)%alive.length;
  }
  const below=secrets.some(s=>s<n);
  const above=secrets.some(s=>s>n);
  if(!below) lo=n+1;
  if(!above) hi=n-1;
  if($("guess")) $("guess").value="";
  render();
}
function finishRound(){
  const left=roundOrder.filter(name=>alive.includes(name));
  const gained=!left.length?[]:pointAll?left:[left[left.length-1]];
  gained.forEach(name=>{ scores[name]=(scores[name]||0)+1; });
  saveScores();
  const champs=gained.filter(name=>(scores[name]||0)>=winTarget);
  const won=champs.length>0;
  const champText=champs.length<=1?champs[0]||"":champs.length===2?champs.join(" กับ "):champs.slice(0,-1).join(", ")+" และ "+champs[champs.length-1];
  if(!roundOrder.length){
    $("overTitle").textContent="คุณเลือกโดนเลขลับ!";
    $("overNote").textContent="";
  }else if(won){
    $("overTitle").textContent=champText+" ชนะแล้ว!";
    $("overNote").textContent="ถึง "+winTarget+" แต้ม";
  }else if(alive.length===1){
    $("overTitle").textContent=alive[0]+" เป็นคนสุดท้าย";
    $("overNote").textContent="ได้ 1 แต้ม";
  }else if(!alive.length&&roundOrder.length>1){
    $("overTitle").textContent="ทุกคนโดนเลขลับ";
    $("overNote").textContent="";
  }else if(!alive.length){
    $("overTitle").textContent=(roundOrder[0]||"คุณ")+" เลือกโดนเลขลับ!";
    $("overNote").textContent="";
  }else if(pointAll){
    $("overTitle").textContent="เลขลับหมดแล้ว";
    $("overNote").textContent="ทุกคนได้คนละ 1 แต้ม ยกเว้นคนที่โดนเลขลับ";
  }else{
    $("overTitle").textContent=gained[0]+" เป็นคนสุดท้าย";
    $("overNote").textContent="ได้ 1 แต้ม";
  }
  $("again").textContent=won?"เริ่มแมตช์ใหม่":"เล่นอีกครั้ง";
  $("again").dataset.reset=won?"1":"";
  $("again").dataset.mode="";
  $("secretLabel").textContent="เลขลับคือ";
  renderOverHist(null);
  const shown=$("secret");
  shown.textContent=secretAll.join(", ");
  shown.classList.toggle("many",secretAll.length>3);
  renderScores($("finalScores"));
  show("over");
  renderPlayers();
}
function loadPlayers(){
  if(onlineMode) return;
  try{
    const raw=JSON.parse(localStorage.getItem(STORE));
    if(Array.isArray(raw)) players=raw.filter(n=>typeof n==="string"&&n.trim()).map(n=>n.trim()).slice(0,PLAYER_MAX);
  }catch(e){ players=[]; }
}
function savePlayers(){
  if(onlineMode) return;
  try{ localStorage.setItem(STORE, JSON.stringify(players)); }catch(e){}
}
function loadScores(){
  if(onlineMode) return;
  scores={};
  try{
    const raw=JSON.parse(localStorage.getItem(scoreKey()));
    if(raw&&typeof raw==="object"){
      for(const name of players){
        const n=Number(raw[name]);
        scores[name]=Number.isFinite(n)&&n>0?Math.floor(n):0;
      }
    }
  }catch(e){}
  players.forEach(name=>{ if(scores[name]==null) scores[name]=0; });
}
function saveScores(){
  if(onlineMode) return;
  try{ localStorage.setItem(scoreKey(), JSON.stringify(scores)); }catch(e){}
}
function forgetScore(name){
  [STORE_SCORES,STORE_WHEEL].forEach(key=>{
    if(key===scoreKey()) return;
    try{
      const raw=JSON.parse(localStorage.getItem(key));
      if(!raw||typeof raw!=="object") return;
      delete raw[name];
      localStorage.setItem(key, JSON.stringify(raw));
    }catch(e){}
  });
}
function wheelMessage(){
  if(!players.length) return onlineMode?"รอผู้เล่นเข้าห้อง":"เพิ่มชื่อแล้วกดสุ่มลำดับ";
  if(players.length<2) return onlineMode?"รอผู้เล่นอีกอย่างน้อย 1 คน":"เพิ่มผู้เล่นอีกอย่างน้อย 1 คน";
  if(order.length===players.length&&order[0]) return "เริ่มที่ "+order[0];
  return onlineMode&&!isHost()?"รอโฮสต์สุ่มลำดับ":"กดสุ่มลำดับ";
}
function cssColor(name, fallback){
  const v=getComputedStyle(document.body).getPropertyValue(name).trim();
  return v||fallback;
}
function fitLabel(ctx, name, maxW){
  let label=name;
  if(ctx.measureText(label).width<=maxW) return label;
  while(label.length>1&&ctx.measureText(label+"…").width>maxW) label=label.slice(0,-1);
  return label+"…";
}
function drawWheel(){
  const canvas=$("wheel");
  const size=280;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=size*dpr;
  canvas.height=size*dpr;
  const ctx=canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const cx=size/2, cy=size/2, r=size/2-8;
  ctx.clearRect(0,0,size,size);
  const list=players;
  const n=list.length;
  if(!n){
    ctx.beginPath();
    ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.fillStyle=cssColor("--chip","#f3f6fc");
    ctx.fill();
    ctx.lineWidth=8;
    ctx.strokeStyle=cssColor("--line","#d9e1f0");
    ctx.stroke();
    ctx.fillStyle=cssColor("--muted","#64708a");
    ctx.font="700 16px "+FONT;
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillText("เพิ่มชื่อผู้เล่น",cx,cy);
    return;
  }
  const slice=(Math.PI*2)/n;
  const start=-Math.PI/2;
  const fontSize=n>16?12:n>10?13:n>6?15:17;
  for(let i=0;i<n;i++){
    const a0=start+i*slice;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,a0,a0+slice);
    ctx.closePath();
    ctx.fillStyle=WHEEL_COLORS[i%WHEEL_COLORS.length];
    ctx.fill();
  }
  ctx.font="700 "+fontSize+"px "+FONT;
  ctx.fillStyle="#fff";
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  const maxW=Math.max(36, Math.min(r*0.9, 2*Math.sin(slice/2)*r*0.7));
  for(let i=0;i<n;i++){
    const mid=start+(i+0.5)*slice;
    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(mid+Math.PI/2);
    ctx.fillText(fitLabel(ctx,list[i],maxW), 0, -r*0.66);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.lineWidth=8;
  ctx.strokeStyle="rgba(255,255,255,.9)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx,cy,22,0,Math.PI*2);
  ctx.fillStyle="#fff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx,cy,8,0,Math.PI*2);
  ctx.fillStyle="#2563eb";
  ctx.fill();
}
function renderPlayers(){
  const box=$("board");
  box.textContent="";
  const playing=screenOpen("play");
  const picking=screenOpen("pick");
  const wheeling=screenOpen("wheelGame");
  const locked=playing||picking||wheeling;
  const ranked=order.length===players.length&&players.length>0;
  const source=(playing&&roundOrder.length)?roundOrder:((picking||wheeling)&&wheelOrder.length)?wheelOrder:(ranked?order:players);
  const pickTotal=wheelOrder.length*Math.max(pickEach,1);
  const cur=playing?currentPlayer():picking&&pickCursor<pickTotal?wheelOrder[Math.floor(pickCursor/Math.max(pickEach,1))]:"";
  source.forEach((name,i)=>{
    const out=(playing&&roundOrder.length>0&&!alive.includes(name))||(wheeling&&wheelAlive.length>0&&!wheelAlive.includes(name));
    const row=document.createElement("li");
    row.className="prow"+(name===cur&&!out?" on":"")+(out?" out":"");
    const rank=document.createElement("span");
    rank.className="prank";
    const showRank=(playing&&roundOrder.length>0)||((picking||wheeling)&&wheelOrder.length>0)||ranked;
    rank.textContent=showRank?String(i+1):"•";
    const meta=onlineMode?playerByName(name):null;
    const nm=document.createElement("span");
    nm.className="pname";
    nm.textContent=name;
    if(meta){
      const tags=[];
      if(meta.id===myId) tags.push("คุณ");
      if(meta.host) tags.push("โฮสต์");
      if(!meta.connected) tags.push("หลุด");
      if(tags.length) nm.textContent=name+" · "+tags.join(" · ");
      if(!meta.connected) row.classList.add("off");
    }
    const sc=document.createElement("span");
    sc.className="pscore";
    const list=(picking||wheeling)&&Array.isArray(picks[name])?picks[name]:[];
    if(out) sc.textContent=wheeling&&list.length?"ออก · "+list.join(", "):"ออก";
    else if(list.length) sc.textContent=list.join(", ")+" · "+(scores[name]||0)+" แต้ม";
    else sc.textContent=(scores[name]||0)+" แต้ม";
    const rm=document.createElement("button");
    rm.type="button";
    rm.textContent="×";
    rm.disabled=onlineMode?(!isHost()||!meta||meta.id===myId||netPhase!=="lobby"||spinning):(spinning||wheelSpinning||locked);
    if(onlineMode&&(!isHost()||(meta&&meta.id===myId))) rm.classList.add("hidden");
    rm.setAttribute("aria-label","เอา "+name+" ออก");
    rm.onclick=()=>{
      if(onlineMode){
        if(meta&&isHost()&&meta.id!==myId) send({t:"kick",id:meta.id});
        return;
      }
      removePlayer(players.indexOf(name));
    };
    row.append(rank,nm,sc,rm);
    box.appendChild(row);
  });
  $("spin").textContent="สุ่มลำดับ";
  $("spin").disabled=spinning||wheelSpinning||players.length<2||locked||(onlineMode&&!isHost());
  $("clearScores").disabled=spinning||wheelSpinning||picking||wheeling||players.length===0||(onlineMode&&!isHost());
  $("pname").disabled=spinning||wheelSpinning||locked;
  $("addForm").querySelector("button").disabled=spinning||wheelSpinning||locked;
}
function rosterChanged(){
  clearTimeout(spinTimer);
  stopSpinSound();
  spinning=false;
  order=[];
  turn=0;
  rot=0;
  const canvas=$("wheel");
  canvas.style.transition="none";
  canvas.style.transform="rotate(0deg)";
  savePlayers();
  saveScores();
  drawWheel();
  renderPlayers();
  renderTurn();
  $("winner").textContent=wheelMessage();
}
function addPlayers(raw){
  if(roundLive()||spinning||wheelSpinning) return;
  const parts=String(raw||"").split(/[,，\n]/).map(s=>s.trim()).filter(Boolean);
  if(!parts.length){ $("perr").textContent="พิมพ์ชื่อก่อน"; return; }
  let added=0, skipped=0;
  for(const name of parts){
    const clipped=name.slice(0,24);
    if(players.some(p=>p.toLowerCase()===clipped.toLowerCase())){ skipped++; continue; }
    if(players.length>=PLAYER_MAX){ skipped++; continue; }
    players.push(clipped);
    scores[clipped]=0;
    added++;
  }
  if(!added){
    $("perr").textContent=players.length>=PLAYER_MAX?"ใส่ได้สูงสุด "+PLAYER_MAX+" คน":"มีชื่อนี้แล้ว";
    return;
  }
  $("perr").textContent=skipped?"ข้ามชื่อที่ซ้ำหรือเกินจำนวน":"";
  $("pname").value="";
  rosterChanged();
}
function removePlayer(i){
  if(spinning||wheelSpinning||roundLive()||i<0) return;
  const name=players[i];
  players.splice(i,1);
  delete scores[name];
  forgetScore(name);
  rosterChanged();
}
function finishSpin(){
  stopSpinSound();
  spinning=false;
  order=nextOrder.slice();
  turn=0;
  renderPlayers();
  renderTurn();
  $("winner").textContent=order.length?"เริ่มที่ "+order[0]:"กดสุ่มลำดับ";
}
function spinWheel(){
  if(spinning||wheelSpinning||players.length<2||roundLive()) return;
  spinning=true;
  playSpinSound();
  renderPlayers();
  $("winner").textContent="กำลังสุ่มลำดับ…";
  $("perr").textContent="";
  nextOrder=players.slice();
  for(let i=nextOrder.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    const swap=nextOrder[i];
    nextOrder[i]=nextOrder[j];
    nextOrder[j]=swap;
  }
  const index=players.indexOf(nextOrder[0]);
  const n=players.length;
  const slice=360/n;
  const margin=Math.min(slice*0.12,8);
  const jitter=margin+Math.random()*Math.max(slice-margin*2,0);
  const fromTop=index*slice+jitter;
  const current=((rot%360)+360)%360;
  let target=(360-fromTop)%360;
  let delta=target-current;
  if(delta<0) delta+=360;
  const extra=5+Math.floor(Math.random()*3);
  rot+=extra*360+delta;
  const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ms=reduce?0:4300;
  const canvas=$("wheel");
  canvas.style.transition=ms?`transform ${ms}ms cubic-bezier(.15,.85,.1,1)`:"none";
  canvas.style.transform=`rotate(${rot}deg)`;
  clearTimeout(spinTimer);
  spinTimer=setTimeout(finishSpin, ms+60);
}

function playerColor(name){
  const i=players.indexOf(name);
  return WHEEL_COLORS[(i<0?0:i)%WHEEL_COLORS.length];
}
function wheelSpan(){
  return wheelMax-wheelMin+1;
}
function numberAt(deg){
  const span=wheelSpan();
  const slice=360/span;
  const norm=((-deg%360)+360)%360;
  let index=Math.round(norm/slice);
  if(index===span) index=0;
  index=((index%span)+span)%span;
  return wheelMin+index;
}
function applyWheelRot(){
  const canvas=$("numWheel");
  canvas.style.transition="none";
  canvas.style.transform="rotate("+wheelRot+"deg)";
}
function invalidateWheel(){
  wheelGen++;
  clearTimeout(wheelEndTimer);
  cancelAnimationFrame(wheelAnim);
  if(wheelSpinning) stopSpinSound();
  wheelSpinning=false;
}
function leaveGame(){
  invalidateWheel();
  show("start");
  renderPlayers();
}
function renderOverHist(items){
  const wrap=$("overHistWrap");
  const h=$("overHist");
  if(!items||!items.length){
    wrap.classList.add("hidden");
    h.textContent="";
    return;
  }
  wrap.classList.remove("hidden");
  h.textContent="";
  items.forEach(item=>{
    const s=document.createElement("span");
    s.textContent=item.who?item.who+" "+item.n:String(item.n);
    if(item.who) s.classList.add("hit");
    h.appendChild(s);
  });
}
function renderNameHist(el, rows){
  el.textContent="";
  if(!rows.length){ el.textContent="ยังไม่มี"; return; }
  rows.forEach(item=>{
    const s=document.createElement("span");
    s.textContent=item.who?item.who+" "+item.n:String(item.n);
    if(item.who) s.classList.add("hit");
    el.appendChild(s);
  });
}
function pickList(name){
  const list=picks[name];
  return Array.isArray(list)?list:[];
}
function pickTotal(){
  return wheelOrder.length*Math.max(pickEach,1);
}
function takenNumbers(){
  const taken=new Set();
  wheelOrder.forEach(name=>pickList(name).forEach(n=>taken.add(n)));
  return taken;
}
function ownerOfNumber(n){
  for(const name of wheelOrder) if(pickList(name).includes(n)) return name;
  return "";
}
function renderPick(){
  const span=wheelSpan();
  const total=pickTotal();
  const done=pickCursor>=total;
  const name=done?"":wheelOrder[Math.floor(pickCursor/Math.max(pickEach,1))]||"";
  const slot=pickEach?pickCursor%pickEach:0;
  $("pickName").textContent=done?"เลือกครบแล้ว":"ตาของ "+name;
  $("pickProgress").textContent=done?"กดเริ่มหมุน":"เลขที่ "+(slot+1)+"/"+pickEach+" · รวม "+pickCursor+"/"+total;
  $("pickLo").textContent=wheelMin;
  $("pickHi").textContent=wheelMax;
  $("pickGrid").classList.toggle("hidden", done);
  $("pickJump").classList.toggle("hidden", done);
  if(onlineMode){
    $("pickGuess").disabled=done||!myTurn;
    const go=$("pickJump").querySelector("button");
    if(go) go.disabled=done||!myTurn;
  }
  $("pickGo").classList.toggle("hidden", !done);
  $("pickUndo").disabled=pickCursor<=0;
  const paged=!done&&span>PAGE;
  $("pickPager").classList.toggle("hidden", !paged);
  if(!done){
    let from=wheelMin, to=wheelMax;
    if(paged){
      const origin=wheelMin;
      const maxStart=origin+Math.floor((wheelMax-origin)/PAGE)*PAGE;
      if(pickFrom<origin||pickFrom>maxStart) pickFrom=origin;
      pickFrom=origin+Math.floor((pickFrom-origin)/PAGE)*PAGE;
      from=pickFrom;
      to=Math.min(wheelMax, pickFrom+PAGE-1);
      $("pickPageLabel").textContent="เลข "+from+"–"+to;
      $("pickPrev").disabled=pickFrom<=origin;
      $("pickNext").disabled=pickFrom+PAGE>wheelMax;
    }
    const g=$("pickGrid");
    const sample=Math.max(Math.abs(from), Math.abs(to));
    const digits=String(sample).length+(from<0||to<0?1:0);
    g.className="grid"+(digits>=4?" d4":digits===3?" d3":"");
    g.textContent="";
    const taken=takenNumbers();
    const mine=new Set(pickList(name));
    for(let n=from;n<=to;n++){
      const b=document.createElement("button");
      b.type="button";
      b.textContent=String(n);
      if(mine.has(n)) b.classList.add("mine");
      else if(taken.has(n)) b.classList.add("used");
      const wait=onlineMode&&name!==myName();
      b.disabled=taken.has(n)||wait;
      if(wait&&!taken.has(n)) b.classList.add("wait");
      b.onclick=()=>choosePick(n);
      g.appendChild(b);
    }
  }
  const rows=[];
  wheelOrder.forEach(nm=>pickList(nm).forEach(n=>rows.push({who:nm,n:n})));
  renderNameHist($("pickHist"), rows);
}
function pickNumber(raw){
  if(pickCursor>=pickTotal()) return;
  const n=typeof raw==="number"?raw:parseIntStrict(raw);
  const name=wheelOrder[Math.floor(pickCursor/Math.max(pickEach,1))];
  if(!name) return;
  if(n==null){ $("pickMsg").textContent="ใส่เป็นจำนวนเต็ม"; return; }
  if(n<wheelMin||n>wheelMax){ $("pickMsg").textContent="เลือกเลขระหว่าง "+wheelMin+" ถึง "+wheelMax; return; }
  if(takenNumbers().has(n)){ $("pickMsg").textContent="เลขนี้มีคนเลือกแล้ว"; return; }
  if(!picks[name]) picks[name]=[];
  picks[name].push(n);
  pickCursor++;
  $("pickMsg").textContent="";
  $("pickGuess").value="";
  renderPick();
  renderPlayers();
}
function undoPick(){
  if(wheelSpinning||pickCursor<=0) return;
  pickCursor--;
  const name=wheelOrder[Math.floor(pickCursor/Math.max(pickEach,1))];
  const list=pickList(name);
  list.pop();
  if(!list.length) delete picks[name];
  $("pickMsg").textContent="";
  renderPick();
  renderPlayers();
}
function startPick(min, max){
  invalidateWheel();
  wheelMin=min;
  wheelMax=max;
  wheelOrder=order.slice();
  picks={};
  pickCursor=0;
  pickFrom=min;
  wheelAlive=[];
  wheelLog=[];
  show("pick");
  $("pickMode").textContent="ช่วง "+min+"–"+max+" · คนละ "+pickEach+" เลข · ถึง "+winTarget+" แต้มชนะ · เลขที่ไม่มีคนเลือกคือรอด";
  $("pickMsg").textContent="";
  renderPick();
  renderPlayers();
}
function drawRimText(ctx, cx, cy, text, mid, radius, fill, size){
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(mid+Math.PI/2);
  ctx.font="700 "+size+"px "+FONT;
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.lineWidth=3;
  ctx.strokeStyle="rgba(0,0,0,.45)";
  ctx.strokeText(text, 0, -radius);
  ctx.fillStyle=fill;
  ctx.fillText(text, 0, -radius);
  ctx.restore();
}
function drawNumWheel(){
  const canvas=$("numWheel");
  if(!canvas||!(wheelMax>=wheelMin)) return;
  const size=320;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=size*dpr;
  canvas.height=size*dpr;
  const ctx=canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const cx=size/2, cy=size/2, r=size/2-8;
  const span=wheelSpan();
  const slice=(Math.PI*2)/span;
  const start=-Math.PI/2-slice/2;
  const ownerOf=Object.create(null);
  wheelOrder.forEach(name=>pickList(name).forEach(n=>{ ownerOf[n]=name; }));
  ctx.clearRect(0,0,size,size);
  if(span<=200){
    for(let i=0;i<span;i++){
      const num=wheelMin+i;
      const owner=ownerOf[num]||"";
      const living=owner&&wheelAlive.includes(owner);
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,start+i*slice,start+(i+1)*slice);
      ctx.closePath();
      if(living) ctx.fillStyle=playerColor(owner);
      else if(owner) ctx.fillStyle=DEAD_SLICE;
      else ctx.fillStyle=i%2?BAND_B:BAND_A;
      ctx.fill();
      if(living){
        ctx.lineWidth=2;
        ctx.strokeStyle="#fde68a";
        ctx.stroke();
      }
    }
  }else{
    const bands=90;
    const band=Math.PI*2/bands;
    for(let i=0;i<bands;i++){
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,-Math.PI/2-band/2+i*band,-Math.PI/2-band/2+(i+1)*band);
      ctx.closePath();
      ctx.fillStyle=i%2?BAND_B:BAND_A;
      ctx.fill();
    }
    wheelOrder.forEach(name=>{
      const living=wheelAlive.includes(name);
      pickList(name).forEach(num=>{
        const i=num-wheelMin;
        const mid=-Math.PI/2+i*slice;
        ctx.beginPath();
        ctx.arc(cx+Math.cos(mid)*r*0.78, cy+Math.sin(mid)*r*0.78, span>800?4:7, 0, Math.PI*2);
        ctx.fillStyle=living?playerColor(name):DEAD_SLICE;
        ctx.fill();
        if(living){
          ctx.lineWidth=2;
          ctx.strokeStyle="#fde68a";
          ctx.stroke();
        }
      });
    });
  }
  if(span<=100){
    const step=span<=30?1:span<=60?5:10;
    if(step===1){
      for(let i=0;i<span;i++){
        const num=wheelMin+i;
        if(ownerOf[num]) continue;
        drawRimText(ctx,cx,cy,String(num),start+(i+0.5)*slice,r*0.78,"rgba(255,255,255,.82)",span>20?10:13);
      }
    }else{
      const first=Math.ceil(wheelMin/step)*step;
      for(let num=first;num<=wheelMax;num+=step){
        if(ownerOf[num]) continue;
        const i=num-wheelMin;
        drawRimText(ctx,cx,cy,String(num),start+(i+0.5)*slice,r*0.84,"rgba(255,255,255,.8)",11);
      }
    }
  }
  const labeled=[];
  const minGap=span>40?Math.ceil(span/16):1;
  wheelOrder.forEach(name=>{
    const living=wheelAlive.includes(name);
    pickList(name).forEach(num=>{
      const close=labeled.some(n=>{
        const d=Math.abs(n-num);
        return Math.min(d, span-d)<minGap;
      });
      if(close) return;
      labeled.push(num);
      const i=num-wheelMin;
      drawRimText(ctx,cx,cy,String(num),start+(i+0.5)*slice,r*(span<=30?0.58:0.66),living?"#fff":"rgba(255,255,255,.7)",span<=40?16:13);
    });
  });
  ctx.beginPath();
  ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.lineWidth=8;
  ctx.strokeStyle="rgba(255,255,255,.92)";
  ctx.stroke();
  applyWheelRot();
}
function renderWheelInfo(){
  $("wheelMode").textContent="ช่วง "+wheelMin+"–"+wheelMax+" · เหลือ "+wheelAlive.length+" คน · ถึง "+winTarget+" แต้มชนะ";
  const box=$("wheelChips");
  box.textContent="";
  wheelOrder.forEach(name=>{
    const el=document.createElement("span");
    el.className="chip"+(!wheelAlive.includes(name)?" out":"");
    el.style.borderColor=playerColor(name);
    el.textContent=name+" · "+(pickList(name).join(", ")||"—");
    box.appendChild(el);
  });
  renderNameHist($("wheelHist"), wheelLog);
}
function openWheel(){
  if(!wheelOrder.length||pickCursor<pickTotal()) return;
  invalidateWheel();
  wheelAlive=wheelOrder.slice();
  wheelLog=[];
  show("wheelGame");
  $("numRead").classList.remove("hit");
  $("numRead").textContent="—";
  $("wheelResult").classList.remove("bad");
  $("wheelResult").textContent="กดหมุนวงล้อ";
  $("doSpin").disabled=false;
  $("doSpin").textContent="หมุนวงล้อ";
  $("wheelRepick").disabled=false;
  drawNumWheel();
  renderWheelInfo();
  renderPlayers();
}
function repickNumbers(){
  if(wheelSpinning||wheelLog.length) return;
  picks={};
  pickCursor=0;
  pickFrom=wheelMin;
  show("pick");
  renderPick();
  renderPlayers();
}
function finishWheel(){
  const winner=wheelAlive[0]||"";
  if(winner) scores[winner]=(scores[winner]||0)+1;
  saveScores();
  const won=!!(winner&&(scores[winner]||0)>=winTarget);
  if(won){
    $("overTitle").textContent=winner+" ชนะแล้ว!";
    $("overNote").textContent="ถึง "+winTarget+" แต้ม";
  }else if(winner){
    $("overTitle").textContent=winner+" เป็นคนสุดท้าย";
    $("overNote").textContent="ได้ 1 แต้ม";
  }else{
    $("overTitle").textContent="ไม่มีผู้ชนะ";
    $("overNote").textContent="";
  }
  $("secretLabel").textContent=winner?"เลขที่เลือก":"";
  const shown=$("secret");
  const num=winner?pickList(winner).join(", "):"";
  shown.textContent=num;
  shown.classList.toggle("many", pickList(winner).length>1||num.length>4);
  renderOverHist(wheelLog);
  $("again").textContent=won?"เริ่มแมตช์ใหม่":"รอบถัดไป";
  $("again").dataset.reset=won?"1":"";
  $("again").dataset.mode="wheel";
  renderScores($("finalScores"));
  show("over");
  renderPlayers();
}
function finishLand(n, gen){
  if(gen!==wheelGen) return;
  wheelSpinning=false;
  stopSpinSound();
  $("numRead").textContent=String(n);
  const owner=ownerOfNumber(n);
  const hit=!!(owner&&wheelAlive.includes(owner));
  if(hit){
    playClip(BOMB_SOUND);
    const idx=wheelAlive.indexOf(owner);
    if(idx>=0) wheelAlive.splice(idx,1);
    $("wheelResult").textContent=owner+" โดนเลข "+n+" ออกจากเกม";
    $("wheelResult").classList.add("bad");
    $("numRead").classList.add("hit");
    wheelLog.push({n:n, who:owner});
  }else{
    $("numRead").classList.remove("hit");
    $("wheelResult").classList.remove("bad");
    $("wheelResult").textContent=owner?"เลข "+n+" ของ "+owner+" ออกไปแล้ว":"เลข "+n+" ไม่มีใครโดน";
  }
  drawNumWheel();
  renderWheelInfo();
  renderPlayers();
  const delay=motionOff()?40:!hit?450:wheelAlive.length<=1?1100:1400;
  $("doSpin").disabled=true;
  $("doSpin").textContent=wheelAlive.length<=1?"จบรอบ":"กำลังจะหมุนต่อ…";
  wheelEndTimer=setTimeout(()=>{
    if(gen!==wheelGen) return;
    if(wheelAlive.length<=1) finishWheel();
    else spinNumber();
  }, delay);
}
function spinNumber(){
  if(wheelSpinning||wheelAlive.length<2) return;
  const span=wheelSpan();
  if(span<1) return;
  const gen=wheelGen;
  const n=wheelMin+Math.floor(Math.random()*span);
  const owner=ownerOfNumber(n);
  const hit=!!(owner&&wheelAlive.includes(owner));
  const slice=360/span;
  const index=n-wheelMin;
  const margin=slice*0.18;
  const room=Math.max(slice/2-margin, 0);
  const jitter=(Math.random()*2-1)*room;
  const base=((wheelRot%360)+360)%360;
  wheelRot=base;
  applyWheelRot();
  const desiredMod=((((-index*slice+jitter)%360)+360)%360);
  let delta=desiredMod-base;
  if(delta<=0) delta+=360;
  const extra=hit?4+Math.floor(Math.random()*2):2;
  const from=wheelRot;
  const target=from+extra*360+delta;
  const dur=motionOff()?0:hit?7200:3400;
  wheelSpinning=true;
  clearTimeout(wheelEndTimer);
  $("doSpin").disabled=true;
  $("doSpin").textContent="กำลังหมุน…";
  $("wheelRepick").disabled=true;
  $("numRead").classList.remove("hit");
  $("wheelResult").classList.remove("bad");
  $("wheelResult").textContent="กำลังหมุน…";
  renderPlayers();
  if(dur) playSpinSound();
  const t0=performance.now();
  function frame(now){
    if(gen!==wheelGen) return;
    const t=dur?Math.min(1,(now-t0)/dur):1;
    const e=1-Math.pow(1-t,2);
    wheelRot=from+(target-from)*e;
    applyWheelRot();
    const showN=numberAt(wheelRot);
    if($("numRead").textContent!==String(showN)) $("numRead").textContent=String(showN);
    if(t<1) wheelAnim=requestAnimationFrame(frame);
    else finishLand(n, gen);
  }
  wheelAnim=requestAnimationFrame(frame);
}
function applyCat(next){
  const cat=next==="wheel"?"wheel":"secret";
  if(cat===gameCat) return;
  saveScores();
  gameCat=cat;
  const wheel=cat==="wheel";
  $("secretOnly").classList.toggle("hidden", wheel);
  $("wheelOnly").classList.toggle("hidden", !wheel);
  $("startSub").textContent=wheel?"เลือกได้หลายเลข แล้วอย่าให้วงล้อลงเลขนั้น":"ทายเลข… แต่ห้ามโดนเลขนั้น!";
  $("sideHint").textContent=wheel
    ?"แต่ละคนเลือกได้หลายเลข · วงล้อสุ่มทั้งช่วง เลขที่ไม่มีคนเลือกคือรอด · โดนเลขตัวไหนคนนั้นออก · คนสุดท้ายได้ 1 แต้ม"
    :"โดนเลขลับแล้วหลุดจากเทิร์น · เหลือหลายคนเลือกได้ว่าให้ทุกคนยกเว้นคนที่โดน หรือให้คนสุดท้ายที่เหลือ";
  loadScores();
  renderPlayers();
}

document.addEventListener("pointerdown",startBackground);
document.addEventListener("keydown",startBackground);
document.addEventListener("click",e=>{
  startBackground();
  if(e.target.closest("button")) playClip(POP_SOUND);
});
$("restModes").onclick=e=>{
  if(onlineMode&&!isHost()) return;
  const b=e.target.closest("button");
  if(!b) return;
  for(const x of $("restModes").children){
    const on=x===b;
    x.classList.toggle("on",on);
    x.setAttribute("aria-pressed",on?"true":"false");
  }
  if(onlineMode&&!applying&&isHost()) send({t:"setup",patch:{pointAll:!!$("restModes").querySelector("[data-rest='all'].on")}});
};
$("modes").onclick=e=>{
  if(onlineMode&&!isHost()) return;
  const b=e.target.closest("button");
  if(!b) return;
  for(const x of $("modes").children){
    const on=x===b;
    x.classList.toggle("on",on);
    x.setAttribute("aria-pressed",on?"true":"false");
  }
  useCustom=b.dataset.custom==="1";
  $("custom").classList.toggle("hidden",!useCustom);
  if(!useCustom){ pickMin=Number(b.dataset.min); pickMax=Number(b.dataset.max); }
  refreshLabel();
  if(onlineMode&&!applying&&isHost()){
    const patch=useCustom?{rangeMode:"custom"}:{rangeMode:pickMax>=9999?"9999":pickMax>=999?"999":"99"};
    send({t:"setup",patch});
  }
};
$("cmin").oninput=()=>{ if(onlineMode&&!isHost()) return; refreshLabel(); };
$("cmax").oninput=()=>{ if(onlineMode&&!isHost()) return; refreshLabel(); };
$("cats").onclick=e=>{
  if(onlineMode&&!isHost()) return;
  const b=e.target.closest("button");
  if(!b) return;
  for(const x of $("cats").children){
    const on=x===b;
    x.classList.toggle("on",on);
    x.setAttribute("aria-pressed",on?"true":"false");
  }
  applyCat(b.dataset.cat||"secret");
  if(onlineMode&&!applying&&isHost()) send({t:"setup",patch:{cat:b.dataset.cat==="wheel"?"wheel":"secret"}});
};
$("setup").onsubmit=e=>{
  e.preventDefault();
  if(onlineMode){
    if(!isHost()){ $("err").textContent="เฉพาะโฮสต์ที่เริ่มเกมได้"; return; }
    send({t:"start"});
    return;
  }
  const c=choice();
  const rangeErr=check(c.min,c.max);
  const winErr=checkWin(readWinTarget());
  if(gameCat==="wheel"){
    const each=parseIntStrict($("pickEach").value);
    const eachErr=each==null||each<1?"จำนวนเลขต่อคนต้องเป็นจำนวนเต็มตั้งแต่ 1":each>99?"จำนวนเลขต่อคนต้องไม่เกิน 99":"";
    $("err").textContent=rangeErr||winErr||eachErr;
    if(rangeErr||winErr||eachErr) return;
    if(players.length<2){ $("err").textContent="ต้องมีผู้เล่นอย่างน้อย 2 คน"; return; }
    if(!orderReady()){ $("err").textContent="กดสุ่มลำดับก่อนเริ่มเกม"; return; }
    if(players.length*each>c.max-c.min+1){ $("err").textContent="เลขในช่วงไม่พอให้ทุกคนเลือก"; return; }
    winTarget=readWinTarget();
    pickEach=each;
    startPick(c.min,c.max);
    return;
  }
  const count=readSecretCount();
  const err=rangeErr||checkCount(c.min,c.max,count)||winErr;
  $("err").textContent=err;
  if(err) return;
  if(!orderReady()){ $("err").textContent="กดสุ่มลำดับก่อนเริ่มเกม"; return; }
  begin(c.min,c.max,count);
};
$("jump").onsubmit=e=>{ e.preventDefault(); pick($("guess").value); };
$("prev").onclick=()=>{ pageFrom-=PAGE; render(); };
$("next").onclick=()=>{ pageFrom+=PAGE; render(); };
$("pickJump").onsubmit=e=>{ e.preventDefault(); pickNumber($("pickGuess").value); };
$("pickPrev").onclick=()=>{ pickFrom-=PAGE; renderPick(); };
$("pickNext").onclick=()=>{ pickFrom+=PAGE; renderPick(); };
$("pickGo").onclick=openWheel;
$("pickUndo").onclick=undoPick;
$("pickLeave").onclick=leaveGame;
$("doSpin").onclick=spinNumber;
$("wheelRepick").onclick=repickNumbers;
$("wheelLeave").onclick=leaveGame;
$("again").onclick=()=>{
  if($("again").dataset.reset==="1"){
    players.forEach(name=>{ scores[name]=0; });
    saveScores();
  }
  if($("again").dataset.mode==="wheel") startPick(wheelMin, wheelMax);
  else begin(gameMin, gameMax, secretTotal);
};
$("back").onclick=leaveGame;
$("leave").onclick=leaveGame;
$("addForm").onsubmit=e=>{ e.preventDefault(); addPlayers($("pname").value); };
$("spin").onclick=spinWheel;
$("clearScores").onclick=()=>{
  players.forEach(name=>{ scores[name]=0; });
  saveScores();
  renderPlayers();
  if(!$("over").classList.contains("hidden")) renderScores($("finalScores"));
};
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", ()=>{ if(netPhase!=="gate") drawWheel(); });
bootOnline();

function myToken(){
  let token=sessionStorage.getItem("dpn-token");
  if(!token){
    token=crypto.randomUUID();
    sessionStorage.setItem("dpn-token", token);
  }
  return token;
}
function typedName(){
  const name=$("myName").value.trim().replace(/\s+/g," ").slice(0,24);
  if(name) localStorage.setItem("dpn-name", name);
  return name;
}
function send(obj){
  if(sock&&sock.readyState===1) sock.send(JSON.stringify(obj));
}
function showGate(){
  wantRoom=false;
  roomCode="";
  netPhase="gate";
  myId="";
  hostId="";
  myTurn=false;
  document.title="DON’T PICK THE NUMBER";
  show("gate");
}
function showErr(message){
  if(netPhase==="gate") $("gateMsg").textContent=message;
  else if(screenOpen("start")) $("err").textContent=message;
  else if(screenOpen("play")) $("msg").textContent=message;
  else if(screenOpen("pick")) $("pickMsg").textContent=message;
  else $("perr").textContent=message;
}
function chooseNumber(n){
  if(!onlineMode){ pick(n); return; }
  if(!myTurn){ $("msg").textContent="ยังไม่ถึงตาคุณ"; return; }
  send({t:"pick",n:n});
}
function choosePick(n){
  if(!onlineMode){ pickNumber(n); return; }
  if(!myTurn){ $("pickMsg").textContent="ยังไม่ถึงตาคุณ"; return; }
  send({t:"pickNum",n:n});
}
function syncSetup(s){
  if(s.cat!==gameCat) applyCat(s.cat);
  const custom=s.rangeMode==="custom";
  for(const x of $("modes").children){
    const on=custom?x.dataset.custom==="1":x.dataset.max===String(s.max)&&!x.dataset.custom;
    x.classList.toggle("on",!!on);
    x.setAttribute("aria-pressed",on?"true":"false");
  }
  useCustom=custom;
  $("custom").classList.toggle("hidden",!custom);
  pickMin=s.min;
  pickMax=s.max;
  if(document.activeElement!==$("cmin")) $("cmin").value=s.min;
  if(document.activeElement!==$("cmax")) $("cmax").value=s.max;
  if(document.activeElement!==$("winScore")) $("winScore").value=s.winTarget;
  if(document.activeElement!==$("secretCount")) $("secretCount").value=s.secretCount;
  if(document.activeElement!==$("pickEach")) $("pickEach").value=s.pickEach;
  for(const x of $("restModes").children){
    const on=s.pointAll?x.dataset.rest==="all":x.dataset.rest==="last";
    x.classList.toggle("on",on);
    x.setAttribute("aria-pressed",on?"true":"false");
  }
  $("rangeLabel").textContent=s.min+"–"+s.max;
}
function hostLocks(){
  if(!onlineMode){
    $("setup").classList.remove("locked");
    ["winScore","secretCount","pickEach","cmin","cmax"].forEach(id=>{ const el=$(id); if(el) el.disabled=false; });
    ["cats","modes","restModes"].forEach(id=>{
      for(const btn of $(id).querySelectorAll("button")) btn.disabled=false;
    });
    return;
  }
  const host=isHost();
  const lobby=netPhase==="lobby";
  const canSetup=host&&lobby;
  $("setup").classList.toggle("locked",!canSetup);
  $("setup").setAttribute("aria-disabled",canSetup?"false":"true");
  ["winScore","secretCount","pickEach","cmin","cmax"].forEach(id=>{
    const el=$(id);
    if(el) el.disabled=!canSetup;
  });
  ["cats","modes","restModes"].forEach(id=>{
    for(const btn of $(id).querySelectorAll("button")) btn.disabled=!canSetup;
  });
  const startBtn=$("setup").querySelector("button.btn[type='submit']")||$("setup").querySelector("button.btn");
  if(startBtn){
    startBtn.disabled=!host;
    startBtn.textContent=host?"เริ่มเกม →":"รอโฮสต์เริ่มเกม";
  }
  ["leave","back","wheelLeave","pickLeave"].forEach(id=>{
    $(id).classList.toggle("hidden",!host);
    $(id).textContent="กลับห้อง";
  });
}
function paintRoom(s){
  $("roomCode").textContent=s.code||"";
  const priv=s.visibility==="private";
  $("visBadge").textContent=priv?"ส่วนตัว":"สาธารณะ";
  $("visBadge").classList.toggle("private",priv);
  const count=(s.players||[]).filter(p=>p.connected).length;
  $("roomCount").textContent=count+"/"+(s.maxPlayers||12);
  $("roomNote").textContent=priv?"ห้องส่วนตัว ไม่โชว์ในล็อบบี้สาธารณะ แชร์รหัสให้เพื่อน":"ห้องนี้อยู่ในล็อบบี้สาธารณะ";
  document.title=(s.code?s.code+" · ":"")+"DON’T PICK THE NUMBER";
}
function syncOrderWheel(s){
  if(s.activeSpin&&s.activeSpin.kind==="order") return;
  rot=s.orderRot||0;
  const canvas=$("wheel");
  canvas.style.transition="none";
  canvas.style.transform="rotate("+rot+"deg)";
}
function applySnap(s){
  wantRoom=true;
  applying=true;
  myId=s.youId||"";
  hostId=s.hostId||"";
  roomCode=s.code||"";
  netPhase=s.phase||"lobby";
  myTurn=!!s.yourTurn;
  playerMeta=Array.isArray(s.players)?s.players:[];
  players=playerMeta.map(p=>p.name);
  scores={};
  playerMeta.forEach(p=>{ scores[p.name]=p.score||0; });
  order=Array.isArray(s.order)?s.order:[];
  alive=Array.isArray(s.alive)?s.alive:[];
  roundOrder=Array.isArray(s.roundOrder)?s.roundOrder:[];
  turn=s.turn||0;
  if(s.gameMin!==gameMin||s.gameMax!==gameMax) pageFrom=s.gameMin;
  gameMin=s.gameMin;
  gameMax=s.gameMax;
  lo=s.lo;
  hi=s.hi;
  picked=Array.isArray(s.picked)?s.picked:[];
  secrets=Array.from({length:s.secretsLeft||0});
  secretAll=Array.isArray(s.revealed)?s.revealed:[];
  secretTotal=s.secretTotal||1;
  winTarget=s.winTarget;
  pointAll=!!s.pointAll;
  if(s.wheelMin!==wheelMin||s.wheelMax!==wheelMax) pickFrom=s.wheelMin;
  wheelMin=s.wheelMin;
  wheelMax=s.wheelMax;
  wheelOrder=Array.isArray(s.wheelOrder)?s.wheelOrder:[];
  picks=s.picks&&typeof s.picks==="object"?s.picks:{};
  pickEach=s.pickEach||1;
  pickCursor=s.pickCursor||0;
  wheelAlive=Array.isArray(s.wheelAlive)?s.wheelAlive:[];
  wheelLog=Array.isArray(s.wheelLog)?s.wheelLog:[];
  if(!(s.activeSpin&&s.activeSpin.kind==="num")) wheelRot=s.wheelRot||0;
  syncSetup(s);
  paintRoom(s);
  if(s.phase==="lobby"){
    show("start");
    syncOrderWheel(s);
    drawWheel();
    renderPlayers();
    renderTurn();
    $("winner").textContent=s.activeSpin&&s.activeSpin.kind==="order"?"กำลังสุ่มลำดับ…":wheelMessage();
  }else if(s.phase==="play"){
    show("play");
    $("modeLabel").textContent="ช่วง "+gameMin+"–"+gameMax+" · เลขลับ "+secretTotal+" ตัว · ถึง "+winTarget+" แต้มชนะ · "+(pointAll?"เหลือหลายคนได้แต้ม ยกเว้นคนที่โดน":"เหลือหลายคนได้แต้มคนสุดท้าย");
    const last=picked[picked.length-1];
    $("msg").textContent=last&&last.hit?last.who+" โดนเลขลับ หลุดจากเทิร์น":"";
    render();
  }else if(s.phase==="pick"){
    show("pick");
    $("pickMode").textContent="ช่วง "+wheelMin+"–"+wheelMax+" · คนละ "+pickEach+" เลข · ถึง "+winTarget+" แต้มชนะ · เลขที่ไม่มีคนเลือกคือรอด";
    $("pickMsg").textContent="";
    renderPick();
    const each=Math.max(pickEach,1);
    const lastName=pickCursor>0?wheelOrder[Math.floor((pickCursor-1)/each)]:"";
    $("pickUndo").disabled=pickCursor<=0||(lastName!==myName()&&!isHost());
    $("pickGo").disabled=!isHost();
    renderPlayers();
  }else if(s.phase==="wheel"){
    show("wheelGame");
    if(s.activeSpin&&s.activeSpin.kind==="num"){
      wheelRot=s.activeSpin.from||0;
      drawNumWheel();
      $("doSpin").disabled=true;
      $("doSpin").textContent="กำลังหมุน…";
      $("wheelRepick").disabled=true;
      $("wheelResult").classList.remove("bad");
      $("wheelResult").textContent="กำลังหมุน…";
    }else{
      drawNumWheel();
      renderWheelInfo();
      const last=wheelLog[wheelLog.length-1];
      if(last){
        $("wheelResult").textContent=last.who+" โดนเลข "+last.n+" ออกจากเกม";
        $("wheelResult").classList.add("bad");
        $("numRead").textContent=String(last.n);
        $("numRead").classList.add("hit");
      }else{
        $("wheelResult").classList.remove("bad");
        $("wheelResult").textContent=isHost()?"กดหมุนวงล้อ":"รอโฮสต์หมุนวงล้อ";
        $("numRead").textContent="—";
        $("numRead").classList.remove("hit");
      }
      $("doSpin").textContent="หมุนวงล้อ";
      $("doSpin").disabled=!isHost()||wheelAlive.length<2;
      $("wheelRepick").disabled=!isHost()||wheelLog.length>0;
    }
    renderPlayers();
  }else if(s.phase==="over"&&s.over){
    $("overTitle").textContent=s.over.title||"";
    $("overNote").textContent=s.over.note||"";
    $("secretLabel").textContent=s.over.secretLabel||"";
    const shown=$("secret");
    shown.textContent=s.over.secretText||"";
    shown.classList.toggle("many",!!s.over.many);
    renderOverHist(s.over.hist);
    $("again").textContent=s.over.again||"เล่นอีกครั้ง";
    $("again").disabled=!isHost();
    renderScores($("finalScores"));
    show("over");
    renderPlayers();
  }
  hostLocks();
  applying=false;
}
function onSnap(s){
  if(animId){
    if(s.activeSpin&&s.activeSpin.id===animId) return;
    pendingSnap=s;
    return;
  }
  applySnap(s);
  if(!s.activeSpin) return;
  animId=s.activeSpin.id;
  const done=()=>{
    animId="";
    const next=pendingSnap;
    pendingSnap=null;
    if(next) onSnap(next);
  };
  if(s.activeSpin.kind==="order") startOrderAnim(s.activeSpin, done);
  else startNumAnim(s.activeSpin, done);
}
function startOrderAnim(spin, done){
  spinning=true;
  renderPlayers();
  $("winner").textContent="กำลังสุ่มลำดับ…";
  playSpinSound();
  const left=Math.max(0, Number(spin.left)||0);
  const canvas=$("wheel");
  canvas.style.transition=left?"transform "+left+"ms cubic-bezier(.15,.85,.1,1)":"none";
  canvas.style.transform="rotate("+spin.rot+"deg)";
  setTimeout(()=>{
    stopSpinSound();
    spinning=false;
    rot=spin.rot;
    done();
  }, left+60);
}
function startNumAnim(spin, done){
  const gen=++animGen;
  const from=spin.from||0;
  const target=spin.target||0;
  const dur=spin.dur||0;
  const elapsed=Math.min(dur, Math.max(0, dur-(Number(spin.left)||0)));
  wheelSpinning=true;
  $("doSpin").disabled=true;
  $("doSpin").textContent="กำลังหมุน…";
  $("wheelRepick").disabled=true;
  $("numRead").classList.remove("hit");
  $("wheelResult").classList.remove("bad");
  $("wheelResult").textContent="กำลังหมุน…";
  renderPlayers();
  if(dur&&elapsed<400) playSpinSound();
  const t0=performance.now()-elapsed;
  function frame(now){
    if(gen!==animGen) return;
    const t=dur?Math.min(1,(now-t0)/dur):1;
    const eased=1-Math.pow(1-t,2);
    wheelRot=from+(target-from)*eased;
    applyWheelRot();
    const showN=numberAt(wheelRot);
    if($("numRead").textContent!==String(showN)) $("numRead").textContent=String(showN);
    if(t<1){
      wheelAnim=requestAnimationFrame(frame);
      return;
    }
    stopSpinSound();
    wheelSpinning=false;
    wheelRot=target;
    applyWheelRot();
    $("numRead").textContent=spin.n==null?"—":String(spin.n);
    if(spin.hit){
      playClip(BOMB_SOUND);
      $("numRead").classList.add("hit");
      $("wheelResult").textContent=(spin.owner||"")+" โดนเลข "+spin.n+" ออกจากเกม";
      $("wheelResult").classList.add("bad");
    }else{
      $("numRead").classList.remove("hit");
      $("wheelResult").classList.remove("bad");
      $("wheelResult").textContent=spin.owner?"เลข "+spin.n+" ของ "+spin.owner+" ออกไปแล้ว":"เลข "+spin.n+" ไม่มีใครโดน";
    }
    done();
  }
  wheelAnim=requestAnimationFrame(frame);
}
function renderLobby(msg){
  const list=$("roomList");
  list.textContent="";
  const found=Array.isArray(msg.rooms)?msg.rooms:[];
  $("lobbyEmpty").classList.toggle("hidden",found.length>0);
  found.forEach(room=>{
    const li=document.createElement("li");
    li.className="room";
    const meta=document.createElement("div");
    meta.className="meta";
    const title=document.createElement("b");
    title.textContent=room.host?("ห้องของ "+room.host):("ห้อง "+room.code);
    const sub=document.createElement("small");
    const cat=room.cat==="wheel"?"วงล้อสุ่มเลข":"ห้ามโดนเลขลับ";
    const state=room.phase==="lobby"?"รอผู้เล่น":"กำลังเล่น";
    sub.textContent=room.code+" · "+cat+" · "+state+" · "+room.count+"/"+room.max;
    meta.append(title,sub);
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="btn";
    btn.textContent=room.joinable?"เข้า":(room.phase==="lobby"?"เต็ม":"กำลังเล่น");
    btn.disabled=!room.joinable;
    btn.onclick=()=>joinCode(room.code);
    li.append(meta,btn);
    list.appendChild(li);
  });
}
function joinCode(code){
  const name=typedName();
  if(!name){ $("gateMsg").textContent="ใส่ชื่อก่อน"; return; }
  $("gateMsg").textContent="";
  send({t:"join",code:String(code||"").replace(/\D/g,"").slice(0,6),name,token:myToken()});
}
function makeRoom(visibility){
  const name=typedName();
  if(!name){ $("gateMsg").textContent="ใส่ชื่อก่อน"; return; }
  $("gateMsg").textContent="";
  send({t:"create",visibility,name,token:myToken()});
}
function pushNums(){
  if(applying||!isHost()) return;
  const patch={};
  const win=parseIntStrict($("winScore").value);
  const count=parseIntStrict($("secretCount").value);
  const each=parseIntStrict($("pickEach").value);
  if(win!=null) patch.winTarget=win;
  if(count!=null) patch.secretCount=count;
  if(each!=null) patch.pickEach=each;
  if(useCustom){
    patch.rangeMode="custom";
    const min=parseIntStrict($("cmin").value);
    const max=parseIntStrict($("cmax").value);
    if(min!=null) patch.min=min;
    if(max!=null) patch.max=max;
  }
  send({t:"setup",patch});
}
function connect(){
  if(sock&&(sock.readyState===0||sock.readyState===1)) return;
  const proto=location.protocol==="https:"?"wss":"ws";
  let ws;
  try{ ws=new WebSocket(proto+"://"+location.host+"/ws"); }
  catch(e){
    $("connMsg").textContent="เปิดจากเซิร์ฟเวอร์เกม แล้วรัน npm start";
    return;
  }
  sock=ws;
  ws.onopen=()=>{
    $("connMsg").textContent="";
    send({t:"hello",token:myToken(),name:localStorage.getItem("dpn-name")||typedName()});
  };
  ws.onmessage=e=>{
    let msg;
    try{ msg=JSON.parse(e.data); }catch(err){ return; }
    if(!msg||typeof msg!=="object") return;
    if(msg.t==="state") onSnap(msg);
    else if(msg.t==="lobby"){
      if(!wantRoom) showGate();
      renderLobby(msg);
    }else if(msg.t==="left") showGate();
    else if(msg.t==="err") showErr(msg.message||"");
  };
  ws.onclose=()=>{
    if(sock!==ws) return;
    sock=null;
    const note="ขาดการเชื่อมต่อ กำลังเชื่อมใหม่…";
    if(wantRoom) $("roomNote").textContent=note;
    else $("connMsg").textContent=note;
    clearTimeout(connTimer);
    connTimer=setTimeout(connect,800);
  };
}
function bootOnline(){
  const saved=localStorage.getItem("dpn-name");
  if(saved) $("myName").value=saved;
  $("myName").addEventListener("change",typedName);
  ["winScore","secretCount","pickEach","cmin","cmax"].forEach(id=>$(id).addEventListener("input",pushNums));
  $("jump").onsubmit=e=>{
    e.preventDefault();
    const n=parseIntStrict($("guess").value);
    $("guess").value="";
    if(n==null){ $("msg").textContent="ใส่เป็นจำนวนเต็ม"; return; }
    chooseNumber(n);
  };
  $("pickJump").onsubmit=e=>{
    e.preventDefault();
    const n=parseIntStrict($("pickGuess").value);
    $("pickGuess").value="";
    if(n==null){ $("pickMsg").textContent="ใส่เป็นจำนวนเต็ม"; return; }
    choosePick(n);
  };
  $("spin").onclick=()=>{ if(isHost()) send({t:"spinOrder"}); };
  $("clearScores").onclick=()=>{ if(isHost()) send({t:"clear"}); };
  $("again").onclick=()=>{ if(isHost()) send({t:"again"}); };
  ["leave","back","wheelLeave","pickLeave"].forEach(id=>{ $(id).onclick=()=>{ if(isHost()) send({t:"abort"}); }; });
  $("pickGo").onclick=()=>{ if(isHost()) send({t:"openWheel"}); };
  $("pickUndo").onclick=()=>send({t:"undo"});
  $("doSpin").onclick=()=>{ if(isHost()) send({t:"spinNum"}); };
  $("wheelRepick").onclick=()=>{ if(isHost()) send({t:"repick"}); };
  $("leaveRoom").onclick=()=>send({t:"leave"});
  $("copyCode").onclick=async()=>{
    try{
      await navigator.clipboard.writeText(roomCode);
      $("copyCode").textContent="คัดลอกแล้ว";
    }catch(e){
      $("copyCode").textContent="คัดลอกไม่สำเร็จ";
    }
  };
  $("makePublic").onclick=()=>makeRoom("public");
  $("makePrivate").onclick=()=>makeRoom("private");
  $("joinForm").onsubmit=e=>{ e.preventDefault(); joinCode($("joinCode").value); };
  $("joinCode").addEventListener("input",()=>{ $("joinCode").value=$("joinCode").value.replace(/\D/g,"").slice(0,6); });
  show("gate");
  connect();
}
