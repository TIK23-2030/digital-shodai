const $ = id => document.getElementById(id);
const STORAGE_KEY = "tokyoIkedaKayokaiDaimokuV1";
const defaultState = { goalMinutes:1800, dailyGoalMinutes:30, wishes:"", recordSeconds:{}, entries:{}, records:{}, memos:{}, themeMode:"auto", timerState:{ status:"stopped", running:false, startedAt:null, accumulatedSeconds:0 } };
let state = loadState();
let seconds = 0;
let timer = null;
let calendarCursor = new Date();
let selectedDateKey = null;
let deferredPrompt = null;
let memoSaveTimer = null;

function dateKey(date = new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function loadState(){
  try{return {...defaultState,...JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")}}
  catch{return structuredClone(defaultState)}
}
function saveState(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
function allRecordKeys(){
  return new Set([
    ...Object.keys(state.records||{}),
    ...Object.keys(state.recordSeconds||{}),
    ...Object.keys(state.entries||{})
  ]);
}
function monthTotalSeconds(date=new Date()){
  const prefix=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
  return [...allRecordKeys()].filter(key=>key.startsWith(prefix)).reduce((sum,key)=>sum+getTotalSecondsForDay(key),0);
}
function allTotalSeconds(){
  return [...allRecordKeys()].reduce((sum,key)=>sum+getTotalSecondsForDay(key),0);
}
function formatGoalTime(totalMinutes){
  const h=Math.floor(totalMinutes/60),m=totalMinutes%60;
  if(h>0&&m>0)return `${h}時間${m}分`;
  if(h>0)return `${h}時間`;
  return `${m}分`;
}
function getTotalSecondsForDay(key){
  // entries が存在する日は秒単位の明細を正とする。
  // 旧バージョンのデータは records / recordSeconds から読み取る。
  if(Object.prototype.hasOwnProperty.call(state.entries||{},key)){
    return (state.entries[key]||[]).reduce((sum,item)=>sum+(Number(item.seconds)||0),0);
  }
  return (Number(state.records?.[key])||0)*60+(Number(state.recordSeconds?.[key])||0);
}
function setTotalSecondsForDay(key,totalSeconds){
  totalSeconds=Math.max(0,Math.round(totalSeconds||0));
  const wholeMinutes=Math.floor(totalSeconds/60);
  const seconds=totalSeconds%60;
  if(wholeMinutes===0&&seconds===0){
    delete state.records[key];
    if(state.recordSeconds)delete state.recordSeconds[key];
  }else{
    state.records[key]=wholeMinutes;
    state.recordSeconds=state.recordSeconds||{};
    if(seconds)state.recordSeconds[key]=seconds;
    else delete state.recordSeconds[key];
  }
}

function ensureEntries(){
  state.entries=state.entries||{};
}
function formatSeconds(totalSeconds){
  totalSeconds=Math.max(0,Math.round(totalSeconds||0));
  const h=Math.floor(totalSeconds/3600);
  const m=Math.floor((totalSeconds%3600)/60);
  const s=totalSeconds%60;
  const parts=[];
  if(h)parts.push(`${h}時間`);
  if(m)parts.push(`${m}分`);
  if(s||parts.length===0)parts.push(`${s}秒`);
  return parts.join("");
}
function addHistoryEntry(key,totalSeconds,type="manual"){
  ensureEntries();
  state.entries[key]=state.entries[key]||[];
  state.entries[key].push({
    id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    seconds:Math.max(0,Math.round(totalSeconds)),
    type,
    createdAt:new Date().toISOString()
  });
}
function rebuildDayFromEntries(key){
  ensureEntries();
  const list=state.entries[key]||[];
  const total=list.reduce((sum,item)=>sum+(Number(item.seconds)||0),0);
  setTotalSecondsForDay(key,total);
}

function streak(){
  let n=0,d=new Date();
  if(getTotalSecondsForDay(dateKey(d))<=0)d.setDate(d.getDate()-1);
  while(getTotalSecondsForDay(dateKey(d))>0){n++;d.setDate(d.getDate()-1)}
  return n;
}
function ensureTimerState(){
  const accumulatedSeconds=Math.max(0,Number(state.timerState?.accumulatedSeconds)||0);
  const running=Boolean(state.timerState?.running);
  let status=state.timerState?.status;
  if(!["stopped","running","paused"].includes(status)){
    status=running?"running":(accumulatedSeconds>0?"paused":"stopped");
  }
  state.timerState={
    status,
    running:status==="running",
    startedAt:status==="running"?(state.timerState?.startedAt||Date.now()):null,
    accumulatedSeconds
  };
}
function currentTimerSeconds(){
  ensureTimerState();
  const base=state.timerState.accumulatedSeconds;
  if(!state.timerState.running||!state.timerState.startedAt)return Math.floor(base);
  const elapsed=Math.max(0,(Date.now()-Number(state.timerState.startedAt))/1000);
  return Math.floor(base+elapsed);
}
function updateTimerControls(){
  ensureTimerState();
  const status=state.timerState.status;
  const startLabel=$("startBtn")?.querySelector(".timer-circle-label");
  if(startLabel)startLabel.textContent=status==="paused"?"再開":"開始";
  if($("startBtn"))$("startBtn").disabled=status==="running";
  if($("pauseBtn"))$("pauseBtn").disabled=status!=="running";
  if($("stopBtn"))$("stopBtn").disabled=status==="stopped"&&currentTimerSeconds()===0;
  $("timerDisplay")?.setAttribute("data-timer-status",status);
}
function updateTimer(){
  seconds=currentTimerSeconds();
  const h=String(Math.floor(seconds/3600)).padStart(2,"0");
  const m=String(Math.floor((seconds%3600)/60)).padStart(2,"0");
  const s=String(seconds%60).padStart(2,"0");
  $("timerDisplay").textContent=`${h}:${m}:${s}`;
  updateTimerControls();
}
function startTimerTicker(){
  clearInterval(timer);
  timer=setInterval(updateTimer,1000);
  updateTimer();
}
function clearSavedTimer(){
  ensureTimerState();
  state.timerState={status:"stopped",running:false,startedAt:null,accumulatedSeconds:0};
  seconds=0;
}
async function addMinutes(minutes,key=dateKey()){
  minutes=Math.round(Number(minutes)||0);
  if(minutes===0)return;
  if(minutes>0){
    addHistoryEntry(key,minutes*60,"manual");
    rebuildDayFromEntries(key);
    saveState();renderAll();toast(`${minutes}分を記録しました`);
  }
}

function addManualTime(hours,minutes,seconds,key=dateKey()){
  const addSeconds=Math.max(0,(Number(hours)||0)*3600+(Number(minutes)||0)*60+(Number(seconds)||0));
  if(addSeconds<=0){
    toast("時間を入力してください");
    return;
  }
  addHistoryEntry(key,addSeconds,"manual");
  rebuildDayFromEntries(key);
  saveState();
  renderAll();
  toast(`${formatSeconds(addSeconds)}を記録しました`);
}

function renderSummary(){
  const monthlySeconds=monthTotalSeconds();
  const monthlyMinutes=Math.floor(monthlySeconds/60);
  const goalSeconds=state.goalMinutes*60;
  const progress=Math.min(monthlySeconds/goalSeconds*100,100);
  const todaySeconds=getTotalSecondsForDay(dateKey());
  $("todayMinutes").textContent=Math.floor(todaySeconds/60);
  $("monthTotalHours").textContent=Math.floor(monthlySeconds/3600);
  $("monthTotalMinutes").textContent=Math.floor((monthlySeconds%3600)/60);
  $("streakDays").textContent=streak();
  $("goalMinutesLabel").textContent=formatGoalTime(state.goalMinutes);
  $("goalPercent").textContent=`${Math.round(progress)}%`;
  $("remainingMinutes").textContent=Math.ceil(Math.max(goalSeconds-monthlySeconds,0)/60);
  $("progressBar").style.width=`${progress}%`;
  const lifetimeSeconds=allTotalSeconds();
  $("allTimeHours").textContent=Math.floor(lifetimeSeconds/3600);
  $("allTimeMinutes").textContent=Math.floor((lifetimeSeconds%3600)/60);
  const allKeys=allRecordKeys();
  $("activeDays").textContent=[...allKeys].filter(key=>getTotalSecondsForDay(key)>0).length;
  $("goalHoursInput").value=Math.floor(state.goalMinutes/60);
  $("goalMinutesInput").value=state.goalMinutes%60;
  $("dailyGoalHoursInput").value=Math.floor(state.dailyGoalMinutes/60);
  $("dailyGoalMinutesInput").value=state.dailyGoalMinutes%60;
  $("dailyGoalLabel").textContent=formatGoalTime(state.dailyGoalMinutes);
  const dailyGoalSeconds=state.dailyGoalMinutes*60;
  const dailyProgress=Math.min(todaySeconds/dailyGoalSeconds*100,100);
  $("dailyProgressBar").style.width=`${dailyProgress}%`;
  if(todaySeconds>=dailyGoalSeconds){
    $("dailyGoalStatus").textContent="達成 ✓";
  }else{
    $("dailyGoalStatus").textContent=`あと${Math.ceil((dailyGoalSeconds-todaySeconds)/60)}分`;
  }
}
function renderMemo(){
  const key=dateKey();
  if(document.activeElement!==$("memo")) $("memo").value=state.memos[key]||"";
}
function renderCalendar(){
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
  $("calendarTitle").textContent=`${y}年 ${m+1}月`;
  const first=new Date(y,m,1),last=new Date(y,m+1,0).getDate(),cells=[];
  for(let i=0;i<first.getDay();i++)cells.push('<div class="calendar-day is-empty"></div>');
  for(let day=1;day<=last;day++){
    const key=dateKey(new Date(y,m,day)),totalSeconds=getTotalSecondsForDay(key),memo=state.memos[key]||"";
    const achieved=totalSeconds>=state.dailyGoalMinutes*60;
    const visibleMinutes=Math.floor(totalSeconds/60);
    const timeLabel=visibleMinutes>0?`${visibleMinutes}分`:"";
    const hasVisibleRecord=visibleMinutes>0||Boolean(memo);
    cells.push(`<button class="calendar-day${key===dateKey()?" is-today":""}${hasVisibleRecord?" has-record":""}${achieved?" is-achieved":""}" data-date="${key}">
      <strong>${day}</strong>${timeLabel?`<span class="minutes">${timeLabel}</span>`:""}
    </button>`);
  }
  $("calendarGrid").innerHTML=cells.join("");
  document.querySelectorAll(".calendar-day[data-date]").forEach(b=>b.onclick=()=>openDay(b.dataset.date));
}
function openDay(key){
  selectedDateKey=key;
  const [y,m,d]=key.split("-");
  $("dialogDateTitle").textContent=`${Number(m)}月${Number(d)}日`;
  const totalSeconds=getTotalSecondsForDay(key);
  $("dialogMinutes").value=Math.floor(totalSeconds/60);
  $("dialogMemo").value=state.memos[key]||"";
  $("dayDialog").showModal();
}
function renderChart(){
  const c=$("weeklyChart"),ctx=c.getContext("2d"),ratio=devicePixelRatio||1;
  const w=c.clientWidth||700,h=Math.max(250,w*.48);c.width=w*ratio;c.height=h*ratio;c.style.height=`${h}px`;ctx.scale(ratio,ratio);
  const days=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push({label:`${d.getMonth()+1}/${d.getDate()}`,value:getTotalSecondsForDay(dateKey(d))/60})}
  const p={l:42,r:16,t:18,b:38},cw=w-p.l-p.r,ch=h-p.t-p.b,max=Math.max(30,...days.map(x=>x.value)),sx=cw/days.length,bw=Math.min(42,sx*.58);
  ctx.clearRect(0,0,w,h);ctx.font="12px sans-serif";ctx.strokeStyle="rgba(39,77,86,.14)";ctx.fillStyle="#6e8589";
  for(let i=0;i<=4;i++){const y=p.t+ch/4*i;ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(w-p.r,y);ctx.stroke();ctx.fillText(String(Math.round(max-max/4*i)),6,y+4)}
  days.forEach((day,i)=>{const x=p.l+sx*i+(sx-bw)/2,bh=day.value/max*ch,y=p.t+ch-bh;
    ctx.fillStyle="#c99536";roundRect(ctx,x,y,bw,bh,8);ctx.fill();
    ctx.textAlign="center";ctx.fillStyle="#6e8589";ctx.fillText(day.label,x+bw/2,h-12);
    if(day.value){ctx.fillStyle="#274d56";ctx.fillText(day.value,x+bw/2,Math.max(13,y-6))}
  });ctx.textAlign="start";
}
function roundRect(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}

function greeting(){
  const greetingEl=$("greeting");
  if(greetingEl)greetingEl.textContent="";
}



function renderWishes(){
  const text=(state.wishes||"").trim();
  $("wishesDisplay").textContent=text||"タップして目標や叶えたいことを記入できます。";
  $("wishesDisplay").classList.toggle("is-empty",!text);
  if(!$("wishesInput").matches(":focus"))$("wishesInput").value=state.wishes||"";
}

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
}
function formatEntryDate(key){
  const [y,m,d]=key.split("-").map(Number);
  const date=new Date(y,m-1,d);
  const weekday=["日","月","火","水","木","金","土"][date.getDay()];
  return `${y}年${m}月${d}日（${weekday}）`;
}
function formatEntryTime(totalSeconds){
  totalSeconds=Math.max(0,Math.round(Number(totalSeconds)||0));
  const hours=Math.floor(totalSeconds/3600);
  const minutes=Math.floor((totalSeconds%3600)/60);
  const seconds=totalSeconds%60;
  const parts=[];
  if(hours)parts.push(`<span>${hours}</span><span class="entry-time-unit">時間</span>`);
  if(minutes||hours)parts.push(`<span>${minutes}</span><span class="entry-time-unit">分</span>`);
  if(seconds&&!hours)parts.push(`<span>${seconds}</span><span class="entry-time-unit">秒</span>`);
  return parts.join("")||'<span>0</span><span class="entry-time-unit">分</span>';
}
function getEntryListItems(){
  const keys=new Set([...Object.keys(state.records||{}),...Object.keys(state.recordSeconds||{}),...Object.keys(state.memos||{})]);
  return [...keys].filter(key=>getTotalSecondsForDay(key)>0||String(state.memos?.[key]||"").trim());
}
function renderEntryList(){
  const order=$("entryListOrder")?.value||"newest";
  const keys=getEntryListItems().sort((a,b)=>order==="oldest"?a.localeCompare(b):b.localeCompare(a));
  if(!keys.length){
    $("entryList").innerHTML='<div class="entry-list-empty">まだ記録がありません。<br>唱題時間やメモを入力すると、ここに日記のように並びます。</div>';
    return;
  }
  $("entryList").innerHTML=keys.map(key=>{
    const memo=String(state.memos?.[key]||"").trim();
    const totalSeconds=getTotalSecondsForDay(key);
    return `<button class="entry-list-item" type="button" data-entry-date="${key}">
      <span class="entry-list-item-head">
        <span class="entry-list-date">${formatEntryDate(key)}</span>
        <span class="entry-list-time">${formatEntryTime(totalSeconds)}</span>
      </span>
      <p class="entry-list-memo${memo?"":" entry-list-no-memo"}">${memo?escapeHtml(memo):"メモはありません"}</p>
    </button>`;
  }).join("");
  document.querySelectorAll("[data-entry-date]").forEach(item=>item.onclick=()=>{
    $("entryListDialog").close();
    openDay(item.dataset.entryDate);
  });
}

function renderAll(){renderSummary();renderMemo();renderCalendar();renderChart();renderWishes();applyTheme();greeting()}
function toast(text){const t=$("toast");t.textContent=text;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),1800)}




$("startBtn").onclick=()=>{
  ensureTimerState();
  if(state.timerState.running)return;
  state.timerState.status="running";
  state.timerState.running=true;
  state.timerState.startedAt=Date.now();
  saveState();
  startTimerTicker();
};
$("pauseBtn").onclick=()=>{
  ensureTimerState();
  if(!state.timerState.running){toast("タイマーは一時停止中です");return;}
  // Calculate before changing/replacing timerState. currentTimerSeconds() normalizes
  // timerState internally, so assigning directly to a previously evaluated object
  // reference could lose the calculated value.
  const pausedAtSeconds=currentTimerSeconds();
  state.timerState.accumulatedSeconds=pausedAtSeconds;
  state.timerState.status="paused";
  state.timerState.running=false;
  state.timerState.startedAt=null;
  clearInterval(timer);
  timer=null;
  saveState();
  updateTimer();
  toast("一時停止しました");
};
$("stopBtn").onclick=async()=>{
  const totalSeconds=currentTimerSeconds();
  clearInterval(timer);
  timer=null;
  clearSavedTimer();
  if(totalSeconds>0){
    addHistoryEntry(dateKey(),totalSeconds,"timer");
    rebuildDayFromEntries(dateKey());
    saveState();
    renderAll();
    toast(`${formatSeconds(totalSeconds)}を記録しました`);
  }else{
    saveState();
    toast("時間が記録されていません");
  }
  updateTimer();
};




$("openManualEntryBtn").onclick=()=>{
  $("manualHours").value=0;
  $("manualMinutes").value=0;
  $("manualSeconds").value=0;
  $("manualEntryDialog").showModal();
};
$("saveManualEntryBtn").onclick=()=>{
  addManualTime($("manualHours").value,$("manualMinutes").value,$("manualSeconds").value);
  $("manualEntryDialog").close();
};
$("memo").addEventListener("input",()=>{
  clearTimeout(memoSaveTimer);
  memoSaveTimer=setTimeout(()=>{state.memos[dateKey()]=$("memo").value;saveState();renderCalendar()},350);
});
document.querySelectorAll(".tab").forEach(tab=>tab.onclick=()=>{
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("is-active"));
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("is-active"));
  tab.classList.add("is-active");$(`${tab.dataset.view}View`).classList.add("is-active");
  window.scrollTo({top:0,behavior:"smooth"});
  if(tab.dataset.view==="records")renderChart();
});

$("openEntryListBtn").onclick=()=>{
  renderEntryList();
  $("entryListDialog").showModal();
};
$("closeEntryListBtn").onclick=()=>$("entryListDialog").close();
$("entryListOrder").onchange=renderEntryList;

$("prevMonth").onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()-1);renderCalendar()};
$("nextMonth").onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()+1);renderCalendar()};
$("saveDayBtn").onclick=()=>{
  if(!selectedDateKey)return;
  const minutes=Math.max(0,Math.round(Number($("dialogMinutes").value)||0));
  // 秒欄は表示しないが、既存の端数秒は分数を編集しても保持する。
  const remainderSeconds=getTotalSecondsForDay(selectedDateKey)%60;
  const totalSeconds=minutes>0?minutes*60+remainderSeconds:0;
  ensureEntries();
  state.entries[selectedDateKey]=[];
  if(totalSeconds>0)addHistoryEntry(selectedDateKey,totalSeconds,"edited");
  rebuildDayFromEntries(selectedDateKey);
  state.memos[selectedDateKey]=$("dialogMemo").value;
  saveState();
  $("dayDialog").close();
  renderAll();
  toast("日別記録を保存しました");
};
$("saveDailyGoalBtn").onclick=()=>{
  const hours=Math.max(0,Math.round(Number($("dailyGoalHoursInput").value)||0));
  const minutes=Math.max(0,Math.min(59,Math.round(Number($("dailyGoalMinutesInput").value)||0)));
  const total=hours*60+minutes;
  if(total<=0){toast("毎日の目標を入力してください");return;}
  state.dailyGoalMinutes=total;
  saveState();renderAll();toast("毎日の目標を保存しました");
};
$("saveGoalBtn").onclick=()=>{
  const hours=Math.max(0,Math.round(Number($("goalHoursInput").value)||0));
  const minutes=Math.max(0,Math.min(59,Math.round(Number($("goalMinutesInput").value)||0)));
  const total=hours*60+minutes;
  if(total<=0){toast("月間目標を入力してください");return;}
  state.goalMinutes=total;
  saveState();renderAll();toast("月間目標を保存しました");
};
$("editWishesBtn").onclick=()=>{
  document.querySelector(".wishes-card").classList.add("is-editing");
  $("wishesInput").value=state.wishes||"";
  $("wishesInput").focus();
};
$("wishesDisplay").onclick=()=>$("editWishesBtn").click();
$("saveWishesBtn").onclick=()=>{
  state.wishes=$("wishesInput").value;
  saveState();
  document.querySelector(".wishes-card").classList.remove("is-editing");
  renderWishes();
  toast("目標・叶えたいことを保存しました");
};
$("cancelWishesBtn").onclick=()=>{
  document.querySelector(".wishes-card").classList.remove("is-editing");
  $("wishesInput").value=state.wishes||"";
};
$("themeBtn").onclick=()=>{const a=["auto","day","evening","night"];state.themeMode=a[(a.indexOf(state.themeMode)+1)%a.length];saveState();applyTheme()};
$("exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`daimoku-backup-${dateKey()}.json`;a.click();URL.revokeObjectURL(url)};
$("importInput").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{state={...defaultState,...JSON.parse(await f.text())};saveState();renderAll();toast("バックアップを読み込みました")}catch{alert("読み込めませんでした")}e.target.value=""};
$("resetBtn").onclick=()=>{if(!confirm("すべての記録とメモを削除しますか？"))return;clearInterval(timer);timer=null;state=structuredClone(defaultState);saveState();updateTimer();renderAll();toast("記録をリセットしました")};
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("installBtn").hidden=false});
$("installBtn").onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$("installBtn").hidden=true};
window.addEventListener("resize",()=>{if($("recordsView").classList.contains("is-active"))renderChart()});
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js"));

function migrateExistingRecordsToEntries(){
  ensureEntries();
  const legacyKeys=new Set([...Object.keys(state.records||{}),...Object.keys(state.recordSeconds||{})]);
  legacyKeys.forEach(key=>{
    if(!Object.prototype.hasOwnProperty.call(state.entries,key)){
      const seconds=(Number(state.records?.[key])||0)*60+(Number(state.recordSeconds?.[key])||0);
      if(seconds>0){
        state.entries[key]=[{
          id:`migrated-${key}`,
          seconds,
          type:"edited",
          createdAt:`${key}T12:00:00`
        }];
      }
    }
  });
  saveState();
}

migrateExistingRecordsToEntries();
ensureTimerState();
if(state.timerState.running)startTimerTicker();
else updateTimer();
renderAll();

function checkpointRunningTimer(){
  ensureTimerState();
  if(!state.timerState.running||!state.timerState.startedAt)return;
  const now=Date.now();
  const elapsed=Math.max(0,Math.floor((now-Number(state.timerState.startedAt))/1000));
  if(elapsed>0){
    state.timerState.accumulatedSeconds=Math.max(0,Number(state.timerState.accumulatedSeconds)||0)+elapsed;
  }
  state.timerState.startedAt=now;
  saveState();
}
function resumeRunningTimer(){
  checkpointRunningTimer();
  if(state.timerState.running)startTimerTicker();
  else updateTimer();
}

document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    checkpointRunningTimer();
    clearInterval(timer);
    timer=null;
  }else{
    resumeRunningTimer();
  }
});
window.addEventListener("pagehide",checkpointRunningTimer);
window.addEventListener("pageshow",resumeRunningTimer);
window.addEventListener("focus",resumeRunningTimer);
document.addEventListener("freeze",checkpointRunningTimer);
document.addEventListener("resume",resumeRunningTimer);



function resolveThemeMode(){
  const selected=state.themeMode||"auto";
  if(selected!=="auto")return selected;
  const hour=new Date().getHours();
  if(hour>=19||hour<5)return "night";
  if(hour>=17)return "evening";
  return "day";
}

function applyTheme(){
  const actual=resolveThemeMode();
  document.body.classList.remove("theme-day","theme-evening","theme-night");
  document.body.classList.add(`theme-${actual}`);
}

function setupThemeMode(){
  const select=document.getElementById("themeMode");
  if(!select)return;
  select.innerHTML=`
    <option value="auto">自動（時間に合わせる）</option>
    <option value="day">昼</option>
    <option value="evening">夕方</option>
    <option value="night">夜</option>
  `;
  select.value=state.themeMode||"auto";
  select.onchange=()=>{
    state.themeMode=select.value;
    saveState();
    applyTheme();
  };
}

function hideLaunchScreen(){
  const launch=document.getElementById("launchScreen");
  if(!launch)return;
  setTimeout(()=>launch.classList.add("is-hidden"),350);
  setTimeout(()=>launch.remove(),1000);
}


document.addEventListener("DOMContentLoaded",()=>{
  setupThemeMode();
  applyTheme();
  hideLaunchScreen();
  setInterval(()=>{
    if((state.themeMode||"auto")==="auto")applyTheme();
  },60000);
});
