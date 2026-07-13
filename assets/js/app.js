const $ = id => document.getElementById(id);
const STORAGE_KEY = "tokyoIkedaKayokaiDaimokuV1";
const defaultState = { goalMinutes:1800, dailyGoalMinutes:30, wishes:"", recordSeconds:{}, entries:{}, records:{}, memos:{}, themeMode:"auto" };
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
function monthTotal(date=new Date()){
  const prefix=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
  return Object.entries(state.records).filter(([k])=>k.startsWith(prefix)).reduce((a,[,v])=>a+v,0);
}
function allTotal(){ return Object.values(state.records).reduce((a,v)=>a+v,0); }
function formatGoalTime(totalMinutes){
  const h=Math.floor(totalMinutes/60),m=totalMinutes%60;
  if(h>0&&m>0)return `${h}時間${m}分`;
  if(h>0)return `${h}時間`;
  return `${m}分`;
}
function getTotalSecondsForDay(key){
  return (state.records[key]||0)*60+(state.recordSeconds?.[key]||0);
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
  if(!(state.records[dateKey(d)]>0)) d.setDate(d.getDate()-1);
  while(state.records[dateKey(d)]>0){n++;d.setDate(d.getDate()-1)}
  return n;
}
function updateTimer(){
  const h=String(Math.floor(seconds/3600)).padStart(2,"0");
  const m=String(Math.floor((seconds%3600)/60)).padStart(2,"0");
  const s=String(seconds%60).padStart(2,"0");
  $("timerDisplay").textContent=`${h}:${m}:${s}`;
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
  const monthly=monthTotal(),progress=Math.min(monthly/state.goalMinutes*100,100);
  $("todayMinutes").textContent=state.records[dateKey()]||0;
  $("monthTotal").textContent=monthly;
  $("streakDays").textContent=streak();
  $("goalMinutesLabel").textContent=formatGoalTime(state.goalMinutes);
  $("goalPercent").textContent=`${Math.round(progress)}%`;
  $("remainingMinutes").textContent=Math.max(state.goalMinutes-monthly,0);
  $("progressBar").style.width=`${progress}%`;
  $("allTimeTotal").textContent=allTotal();
  $("activeDays").textContent=Object.values(state.records).filter(v=>v>0).length;
  $("goalHoursInput").value=Math.floor(state.goalMinutes/60);
  $("goalMinutesInput").value=state.goalMinutes%60;
  $("dailyGoalHoursInput").value=Math.floor(state.dailyGoalMinutes/60);
  $("dailyGoalMinutesInput").value=state.dailyGoalMinutes%60;
  $("dailyGoalLabel").textContent=formatGoalTime(state.dailyGoalMinutes);
  const today=state.records[dateKey()]||0;
  const dailyProgress=Math.min(today/state.dailyGoalMinutes*100,100);
  $("dailyProgressBar").style.width=`${dailyProgress}%`;
  if(today>=state.dailyGoalMinutes){
    $("dailyGoalStatus").textContent="達成 ✓";
  }else{
    $("dailyGoalStatus").textContent=`あと${state.dailyGoalMinutes-today}分`;
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
    const key=dateKey(new Date(y,m,day)),minutes=state.records[key]||0,memo=state.memos[key]||"";
    const achieved=minutes>=state.dailyGoalMinutes;
    cells.push(`<button class="calendar-day${key===dateKey()?" is-today":""}${minutes||memo?" has-record":""}${achieved?" is-achieved":""}" data-date="${key}">
      <strong>${day}</strong>${minutes?`<span class="minutes">${minutes}分</span>`:""}
    </button>`);
  }
  $("calendarGrid").innerHTML=cells.join("");
  document.querySelectorAll(".calendar-day[data-date]").forEach(b=>b.onclick=()=>openDay(b.dataset.date));
}
function openDay(key){
  selectedDateKey=key;
  const [y,m,d]=key.split("-");
  $("dialogDateTitle").textContent=`${Number(m)}月${Number(d)}日`;
  $("dialogMinutes").value=state.records[key]||0;
  $("dialogMemo").value=state.memos[key]||"";
  $("dayDialog").showModal();
}
function renderChart(){
  const c=$("weeklyChart"),ctx=c.getContext("2d"),ratio=devicePixelRatio||1;
  const w=c.clientWidth||700,h=Math.max(250,w*.48);c.width=w*ratio;c.height=h*ratio;c.style.height=`${h}px`;ctx.scale(ratio,ratio);
  const days=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push({label:`${d.getMonth()+1}/${d.getDate()}`,value:state.records[dateKey(d)]||0})}
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
function renderAll(){renderSummary();renderMemo();renderCalendar();renderChart();renderWishes();applyTheme();greeting()}
function toast(text){const t=$("toast");t.textContent=text;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),1800)}




$("startBtn").onclick=()=>{if(timer)return;timer=setInterval(()=>{seconds++;updateTimer()},1000)};
$("pauseBtn").onclick=()=>{clearInterval(timer);timer=null;toast("一時停止しました")};
$("stopBtn").onclick=async()=>{
  clearInterval(timer);
  timer=null;
  if(seconds>0){
    addHistoryEntry(dateKey(),seconds,"timer");
    rebuildDayFromEntries(dateKey());
    saveState();
    renderAll();
    toast(`${formatSeconds(seconds)}を記録しました`);
  }else{
    toast("時間が記録されていません");
  }
  seconds=0;
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
$("prevMonth").onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()-1);renderCalendar()};
$("nextMonth").onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()+1);renderCalendar()};
$("saveDayBtn").onclick=()=>{
  if(!selectedDateKey)return;
  const minutes=Math.max(0,Math.round(Number($("dialogMinutes").value)||0));
  ensureEntries();
  state.entries[selectedDateKey]=[];
  if(minutes>0)addHistoryEntry(selectedDateKey,minutes*60,"edited");
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
$("resetBtn").onclick=()=>{if(!confirm("すべての記録とメモを削除しますか？"))return;state=structuredClone(defaultState);saveState();renderAll();toast("記録をリセットしました")};
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("installBtn").hidden=false});
$("installBtn").onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$("installBtn").hidden=true};
window.addEventListener("resize",()=>{if($("recordsView").classList.contains("is-active"))renderChart()});
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js"));

function migrateExistingRecordsToEntries(){
  ensureEntries();
  Object.keys(state.records||{}).forEach(key=>{
    if(!state.entries[key]||state.entries[key].length===0){
      const seconds=(state.records[key]||0)*60+(state.recordSeconds?.[key]||0);
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
updateTimer();renderAll();



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
