const LS_KEY = 'meditrack_config_v1';
const LS_LOCAL_HISTORY = 'meditrack_local_history_v1';
const LS_LOCAL_SCHEDULE = 'meditrack_local_schedule_v1';
const DEFAULT_RANGE_SCHEDULE = 'Schedule!A2:G1000';
const DEFAULT_RANGE_HISTORY  = 'History!A2:E1000';


const ui = {
  spreadsheetId: document.getElementById('spreadsheetId'),
  apiKey: document.getElementById('apiKey'),
  saveBtn: document.getElementById('saveBtn'),
  clearSavedBtn: document.getElementById('clearSavedBtn'),
  reloadBtn: document.getElementById('reloadBtn'),
  testAlarmBtn: document.getElementById('testAlarmBtn'),
  scheduleWrap: document.getElementById('scheduleWrap'),
  historyWrap: document.getElementById('historyWrap'),
  statsWrap: document.getElementById('statsWrap'),
  message: document.getElementById('message'),
  clock: document.getElementById('clock'),
  alarmSound: document.getElementById('alarmSound'),


  modal: document.getElementById('alarmModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalMed: document.getElementById('modalMed'),
  modalDose: document.getElementById('modalDose'),
  modalNotes: document.getElementById('modalNotes'),
  modalWhen: document.getElementById('modalWhen'),
  modalCountdown: document.getElementById('modalCountdown'),
  confirmBtn: document.getElementById('confirmIntakeBtn'),
  snoozeBtn: document.getElementById('snoozeBtn'),
  modalCloseBtn: document.getElementById('modalCloseBtn'),


  addForm: document.getElementById('addForm'),
  add_medicine: document.getElementById('add_medicine'),
  add_dose: document.getElementById('add_dose'),
  add_date: document.getElementById('add_date'),
  add_time: document.getElementById('add_time'),
  add_interval: document.getElementById('add_interval'),
  add_days: document.getElementById('add_days'),
  add_notes: document.getElementById('add_notes'),
  addBtn: document.getElementById('addBtn'),
  clearLocalScheduleBtn: document.getElementById('clearLocalScheduleBtn'),


  historyToggleBtn: document.getElementById('historyToggleBtn')
};


let state = {
  config: { apiKey: '', spreadsheetId: '' },
  schedule: [],
  history: [],
  localHistory: [],
  localSchedule: []
};


const activeAlarms = new Map();


function setMessage(msg){ ui.message.textContent = msg; }
function saveConfigToLocalStorage(){ localStorage.setItem(LS_KEY, JSON.stringify(state.config)); setMessage('Settings saved.'); }
function loadConfigFromLocalStorage(){
  const raw = localStorage.getItem(LS_KEY);
  if(raw) Object.assign(state.config, JSON.parse(raw));
  ui.apiKey.value = state.config.apiKey || '';
  ui.spreadsheetId.value = state.config.spreadsheetId || '';
}
function clearSaved(){ localStorage.removeItem(LS_KEY); state.config = { apiKey:'', spreadsheetId:'' }; ui.apiKey.value=''; ui.spreadsheetId.value=''; setMessage('Saved settings cleared.'); }


function loadLocalHistory(){ try { const r = localStorage.getItem(LS_LOCAL_HISTORY); if(r) state.localHistory = JSON.parse(r); } catch(e){} }
function saveLocalHistory(){ localStorage.setItem(LS_LOCAL_HISTORY, JSON.stringify(state.localHistory)); }


function loadLocalSchedule(){ try { const r = localStorage.getItem(LS_LOCAL_SCHEDULE); if(r) state.localSchedule = JSON.parse(r); } catch(e){} }
function saveLocalSchedule(){ localStorage.setItem(LS_LOCAL_SCHEDULE, JSON.stringify(state.localSchedule)); }


function fmtDateYMD(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function fmtTimeHM(d){ return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function nowIso(){ return (new Date()).toISOString(); }


function normalizeTimeToHHMM(raw){
  if(!raw) return '00:00';
  raw = String(raw).trim();
  const ampmMatch = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if(ampmMatch){
    let hh = parseInt(ampmMatch[1],10);
    const mm = (ampmMatch[2] ? String(ampmMatch[2]).padStart(2,'0') : '00');
    const ap = ampmMatch[3].toLowerCase();
    if(ap === 'pm' && hh !== 12) hh += 12;
    if(ap === 'am' && hh === 12) hh = 0;
    return `${String(hh).padStart(2,'0')}:${mm}`;
  }
  const m = raw.match(/(\d{1,2})(?::(\d{1,2}))?/);
  if(m){
    const hh = String(parseInt(m[1],10)).padStart(2,'0');
    const mm = m[2] ? String(parseInt(m[2],10)).padStart(2,'0') : '00';
    return `${hh}:${mm}`;
  }
  return '00:00';
}


function dateTimeFromDateAndTime(dateStr, timeStr){
  const hhmm = normalizeTimeToHHMM(timeStr);
  return new Date(`${dateStr}T${hhmm}:00`);
}


function sheetsValuesUrl(spreadsheetId, range, apiKey){
  const base = 'https://sheets.googleapis.com/v4/spreadsheets';
  return `${base}/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;
}


function rowsToObjects(rows, headers){
  return rows.map(r => {
    const o = {};
    for(let i=0;i<headers.length;i++) o[headers[i]] = r[i] ?? '';
    return o;
  });
}


async function fetchRange(range){
  const { apiKey, spreadsheetId } = state.config;
  if(!apiKey || !spreadsheetId) throw new Error('API key and Spreadsheet ID required.');
  const url = sheetsValuesUrl(spreadsheetId, range, apiKey);
  const res = await fetch(url);
  if(!res.ok){ const text = await res.text(); throw new Error(`Sheets API error ${res.status}: ${text}`); }
  const json = await res.json();
  return json.values || [];
}


async function loadData(){
  setMessage('Loading from sheet...');
  ui.scheduleWrap.innerHTML = 'Loading schedule…';
  ui.historyWrap.innerHTML = 'Loading history…';
  ui.statsWrap.innerHTML = '';


  try {
    let schedRows = [], histRows = [];
    if(state.config.apiKey && state.config.spreadsheetId){
      [schedRows, histRows] = await Promise.all([
        fetchRange(DEFAULT_RANGE_SCHEDULE),
        fetchRange(DEFAULT_RANGE_HISTORY)
      ]);
    }
    const scheduleHeaders = ['id','medicine','dose','date','time','notes','status'];
    const historyHeaders  = ['timestamp','medicine','dose','status','note'];


    const rawSchedule = rowsToObjects(schedRows, scheduleHeaders);
    const sheetSchedule = rawSchedule.map(r => {
      return Object.assign({}, r, { time: normalizeTimeToHHMM(r.time || '' ) });
    });


    state.schedule = sheetSchedule.concat(state.localSchedule || []);


    const sheetHistory = rowsToObjects(histRows, historyHeaders);


    state.history = sheetHistory.concat(state.localHistory);


    renderSchedule();
    renderHistory();
    computeStats();
    setMessage(`Loaded ${state.schedule.length} scheduled items and ${sheetHistory.length} sheet history entries (local logs preserved).`);
  } catch(err){
    console.error(err);
    state.schedule = (state.localSchedule || []).slice();
    state.history = state.localHistory.slice();
    renderSchedule();
    renderHistory();
    computeStats();
    ui.scheduleWrap.innerHTML = ui.scheduleWrap.innerHTML || 'Error loading schedule.';
    ui.historyWrap.innerHTML = ui.historyWrap.innerHTML || 'Error loading history.';
    setMessage('Error (sheet): ' + (err.message || err) + ' — local data loaded.');
  }
}


function renderSchedule(){
  if(!state.schedule.length){ ui.scheduleWrap.innerHTML = '<em>No scheduled intake found.</em>'; return; }
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr><th>When</th><th>Medicine</th><th>Dose</th><th>Notes</th><th>Status</th></tr></thead>`;
  const tbody = document.createElement('tbody');


  const now = new Date();


  const upcoming = state.schedule
    .map(row => {
      const dt = dateTimeFromDateAndTime(row.date, row.time);
      return Object.assign({}, row, { _dt: dt });
    })
    .filter(r => r._dt.toString() !== 'Invalid Date')  
    .filter(r => r._dt >= new Date(now.getTime() - (60*1000)))
    .sort((a,b) => a._dt - b._dt)
    .slice(0, 50);


  if(!upcoming.length){ ui.scheduleWrap.innerHTML = '<em>No upcoming scheduled intake.</em>'; return; }


  upcoming.forEach(row => {
    const tr = document.createElement('tr');
    const key = `${row.id}|${row.date}|${row.time}`;
    tr.dataset.rowId = key;
    tr.innerHTML = `<td>${row.date} ${row.time}</td>
                    <td>${row.medicine||''}</td>
                    <td>${row.dose||''}</td>
                    <td>${row.notes||''}</td>
                    <td></td>`;
    const statusCell = tr.querySelector('td:last-child');
    const st = (row.status||'').toUpperCase();
    const span = document.createElement('span');
    span.className = `tag ${st==='TAKEN'?'taken':st==='MISSED'?'missed':'pending'}`;
    span.textContent = st || 'PENDING';
    statusCell.appendChild(span);
    tbody.appendChild(tr);
  });


  table.appendChild(tbody);
  ui.scheduleWrap.innerHTML = '';
  ui.scheduleWrap.appendChild(table);
}


let historyShowingAll = false;
const HISTORY_PREVIEW_COUNT = 10;


function renderHistory(){
  const allHistory = (state.history || []).slice().sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
  if(!allHistory.length){ ui.historyWrap.innerHTML = '<em>No history rows found.</em>'; return; }


  const preview = historyShowingAll ? allHistory : allHistory.slice(0, HISTORY_PREVIEW_COUNT);


  const table = document.createElement('table');
  table.innerHTML = `<thead><tr><th>When</th><th>Medicine</th><th>Dose</th><th>Status</th><th>Note</th></tr></thead>`;
  const tbody = document.createElement('tbody');


  preview.forEach(r => {
    const tr = document.createElement('tr');
    const s = (r.status||'').toUpperCase();
    const tag = `<span class="tag ${s==='TAKEN'?'taken':s==='MISSED'?'missed':'pending'}">${s||'UNKNOWN'}</span>`;
    tr.innerHTML = `<td>${r.timestamp||''}</td>
                    <td>${r.medicine||''}</td>
                    <td>${r.dose||''}</td>
                    <td>${tag}</td>
                    <td>${r.note||''}</td>`;
    tbody.appendChild(tr);
  });


  table.appendChild(tbody);
  ui.historyWrap.innerHTML = '';
  ui.historyWrap.appendChild(table);


  if(allHistory.length > HISTORY_PREVIEW_COUNT){
    ui.historyToggleBtn.style.display = 'inline-block';
    ui.historyToggleBtn.textContent = historyShowingAll ? 'Show less' : `Show more (${allHistory.length - HISTORY_PREVIEW_COUNT} more)`;
  } else {
    ui.historyToggleBtn.style.display = 'none';
  }
}


function computeStats(){
  const counts = (state.history || []).reduce((acc, r) => {
    const s = (r.status||'').toUpperCase();
    if(s === 'TAKEN') acc.taken++;
    else if(s === 'MISSED') acc.missed++;
    else acc.unknown++;
    return acc;
  }, { taken:0, missed:0, unknown:0 });


  const totalKnown = counts.taken + counts.missed;
  const takenPct = totalKnown ? Math.round((counts.taken / totalKnown) * 100) : 0;
  const missedPct = totalKnown ? Math.round((counts.missed / totalKnown) * 100) : 0;


  ui.statsWrap.innerHTML = '';
  const container = document.createElement('div'); container.className='stats-grid';
  container.innerHTML = `<div class="stat"><h3>${counts.taken}</h3><p>Times TAKEN</p></div>
                         <div class="stat"><h3>${counts.missed}</h3><p>Times MISSED</p></div>
                         <div class="stat"><h3>${takenPct}%</h3><p>Taken %</p></div>
                         <div class="stat missed-pct" id="missedPctBox"><h3>${missedPct}%</h3><p>Missed %</p></div>`;


  ui.statsWrap.appendChild(container);


  const missedBox = document.getElementById('missedPctBox');
  if(missedPct >= 50){
    missedBox.classList.add('critical');
  } else {
    missedBox.classList.remove('critical');
  }
}


function alarmKeyFor(item){ return `${item.id}|${item.date}|${item.time}`; }


function startAlarmFor(item){
  const key = alarmKeyFor(item);
  if((item.status||'').toUpperCase() === 'TAKEN') return;
  if(activeAlarms.has(key)){
    return;
  }
  const alarmState = { attempt: 1, item, timers: {} };
  activeAlarms.set(key, alarmState);
  showModalForAlarm(alarmState);
}


function showModalForAlarm(alarmState){
  const { item, attempt } = alarmState;
  ui.modal.setAttribute('aria-hidden','false');
  ui.modalTitle.textContent = `Time to take medicine (Attempt ${attempt})`;
  ui.modalMed.textContent = item.medicine || '—';
  ui.modalDose.textContent = item.dose || '';
  ui.modalNotes.textContent = item.notes || '';
  ui.modalWhen.textContent = `${item.date} ${item.time}`;
  try { ui.alarmSound.currentTime = 0; ui.alarmSound.play().catch(()=>{}); } catch(e){}


  let remaining = 180;
  ui.modalCountdown.textContent = `Time left: ${formatSec(remaining)}`;


  if(alarmState.timers.countdownInterval) clearInterval(alarmState.timers.countdownInterval);
  if(alarmState.timers.timeoutMarkMissed) clearTimeout(alarmState.timers.timeoutMarkMissed);


  alarmState.timers.countdownInterval = setInterval(()=> {
    remaining--;
    ui.modalCountdown.textContent = `Time left: ${formatSec(remaining)}`;
    if(remaining <= 0) {
      clearInterval(alarmState.timers.countdownInterval);
    }
  }, 1000);


  alarmState.timers.timeoutMarkMissed = setTimeout(()=> {
    clearInterval(alarmState.timers.countdownInterval);
    markMissedAttempt(alarmState);
    closeModal();
  }, 180_000);
}


function formatSec(sec){
  const m = String(Math.floor(sec/60)).padStart(2,'0');
  const s = String(sec%60).padStart(2,'0');
  return `${m}:${s}`;
}


function confirmIntakeForCurrent(){
  const when = ui.modalWhen.textContent.trim();
  const [date, time] = when.split(' ');
  const candidate = state.schedule.find(s => s.date === date && s.time === time && s.medicine === ui.modalMed.textContent);
  if(!candidate){
    const first = activeAlarms.values().next();
    if(first.done) { closeModal(); return; }
    confirmIntakeForAlarm(first.value);
    return;
  }
  const key = alarmKeyFor(candidate);
  const alarmState = activeAlarms.get(key);
  if(alarmState) confirmIntakeForAlarm(alarmState);
  else {
    appendHistory({ timestamp: nowIso(), medicine: candidate.medicine, dose: candidate.dose, status:'TAKEN', note:'Confirmed (UI)' });
    renderHistory(); computeStats();
    closeModal();
  }
}


function confirmIntakeForAlarm(alarmState){
  const { item } = alarmState;
  clearAlarmTimers(alarmState);
  appendHistory({ timestamp: nowIso(), medicine: item.medicine, dose: item.dose, status: 'TAKEN', note: `Confirmed (attempt ${alarmState.attempt})` });
  updateScheduleStatus(item, 'TAKEN');
  activeAlarms.delete(alarmKeyFor(item));
  renderHistory(); computeStats(); setMessage(`${item.medicine} marked TAKEN.`);
  closeModal();
}


function markMissedAttempt(alarmState){
  const { item } = alarmState;
  const attemptNum = alarmState.attempt;
  appendHistory({ timestamp: nowIso(), medicine: item.medicine, dose: item.dose, status: 'MISSED', note: `Auto-missed (attempt ${attemptNum})` });
  updateScheduleStatus(item, 'MISSED');
  renderHistory(); computeStats();
  setMessage(`${item.medicine} was marked MISSED (attempt ${attemptNum}).`);


  if(attemptNum === 1){
    alarmState.attempt = 2;
    alarmState.timers.timeoutRetry = setTimeout(()=> {
      showModalForAlarm(alarmState);
    }, 5 * 60 * 1000);
  } else {
    activeAlarms.delete(alarmKeyFor(item));
    setMessage(`${item.medicine} final MISSED (no response after 2 attempts).`);
  }
}


function clearAlarmTimers(alarmState){
  if(!alarmState || !alarmState.timers) return;
  if(alarmState.timers.countdownInterval) { clearInterval(alarmState.timers.countdownInterval); alarmState.timers.countdownInterval = null; }
  if(alarmState.timers.timeoutMarkMissed) { clearTimeout(alarmState.timers.timeoutMarkMissed); alarmState.timers.timeoutMarkMissed = null; }
  if(alarmState.timers.timeoutRetry) { clearTimeout(alarmState.timers.timeoutRetry); alarmState.timers.timeoutRetry = null; }
}


function appendHistory(entry){
  state.localHistory.unshift(entry);
  if(state.localHistory.length > 500) state.localHistory.length = 500;
  state.history = state.history.concat([entry]);
  saveLocalHistory();
}


function updateScheduleStatus(item, status){
  const s = state.schedule.find(r => r.id === item.id && r.date === item.date && r.time === item.time);
  if(s) s.status = status;
  const ls = state.localSchedule.find(r => r.id === item.id && r.date === item.date && r.time === item.time);
  if(ls) ls.status = status;
  saveLocalSchedule();


  const key = alarmKeyFor(item);
  const tr = ui.scheduleWrap.querySelector(`tr[data-row-id="${key}"]`);
  if(tr){
    const statusCell = tr.querySelector('td:last-child');
    statusCell.innerHTML = '';
    const span = document.createElement('span');
    span.className = `tag ${status==='TAKEN'?'taken':status==='MISSED'?'missed':'pending'}`;
    span.textContent = status;
    statusCell.appendChild(span);
  }
}


function closeModal(){
  ui.modal.setAttribute('aria-hidden','true');
  ui.modalCountdown.textContent = '';
}


function snoozeCurrentAlarm(){
  const when = ui.modalWhen.textContent.trim();
  const [date, time] = when.split(' ');
  const item = state.schedule.find(s => s.date === date && s.time === time && s.medicine === ui.modalMed.textContent);
  if(!item) { closeModal(); return; }
  const key = alarmKeyFor(item);
  let alarmState = activeAlarms.get(key);
  if(!alarmState){
    alarmState = { attempt: 2, item, timers: {} };
    activeAlarms.set(key, alarmState);
  } else {
    clearAlarmTimers(alarmState);
    alarmState.attempt = Math.min(2, alarmState.attempt + 1);
  }
  alarmState.timers.timeoutRetry = setTimeout(()=> {
    showModalForAlarm(alarmState);
  }, 5 * 60 * 1000);
  appendHistory({ timestamp: nowIso(), medicine: item.medicine, dose: item.dose, status: 'MISSED', note: `Snoozed to retry (user snooze)` });
  saveLocalHistory(); renderHistory(); computeStats();
  setMessage(`${item.medicine} snoozed for 5 minutes (attempt ${alarmState.attempt}).`);
  closeModal();
}


function checkAlarmsNow(){
  const now = new Date();
  const curDate = fmtDateYMD(now);
  const curTimeHM = fmtTimeHM(now);


  const matches = state.schedule.filter(s => {
    if((s.status||'').toUpperCase() === 'TAKEN') return false;
    if(!s.date || !s.time) return false;
    return s.date === curDate && s.time === curTimeHM;
  });


  matches.forEach(item => {
    const key = alarmKeyFor(item);
    if(!activeAlarms.has(key)){
      startAlarmFor(item);
      highlightScheduleRow(item);
    }
  });
}


function highlightScheduleRow(item){
  const key = alarmKeyFor(item);
  const tr = ui.scheduleWrap.querySelector(`tr[data-row-id="${key}"]`);
  if(tr){
    tr.classList.add('highlight');
    setTimeout(()=> tr.classList.remove('highlight'), 10_000);
  }
}


function startClockAndAlarmChecker(){
  setInterval(()=> {
    const now = new Date();
    ui.clock.textContent = `${fmtDateYMD(now)} ${fmtTimeHM(now)}:${String(now.getSeconds()).padStart(2,'0')}`;
  }, 1000);


  checkAlarmsNow();


  const now = new Date();
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(()=> {
    checkAlarmsNow();
    setInterval(checkAlarmsNow, 60_000);
  }, msToNextMinute);
}


ui.confirmBtn.addEventListener('click', () => confirmIntakeForCurrent());
ui.snoozeBtn.addEventListener('click', () => snoozeCurrentAlarm());
ui.modalCloseBtn.addEventListener('click', () => closeModal());




ui.testAlarmBtn.addEventListener('click', () => {
  const now = new Date();
  const candidate = state.schedule.find(s => (s.status||'').toUpperCase() !== 'TAKEN' && dateTimeFromDateAndTime(s.date, s.time) >= new Date(now.getTime() - (60*1000)));
  if(candidate){
    const testItem = Object.assign({}, candidate, { date: fmtDateYMD(now), time: fmtTimeHM(now) });
    testItem.id = testItem.id || `test-${Date.now()}`;
    startAlarmFor(testItem);
    setMessage(`Test alarm started for ${testItem.medicine} (using upcoming item).`);
  } else {
    const testItem = { id:`test-${Date.now()}`, medicine:'TEST MED', dose:'1 tab', date: fmtDateYMD(now), time: fmtTimeHM(now), notes:'Manual test' };
    startAlarmFor(testItem);
    setMessage('Test alarm started (synthetic item).');
  }
});


ui.saveBtn.addEventListener('click', () => {
  state.config.apiKey = ui.apiKey.value.trim();
  state.config.spreadsheetId = ui.spreadsheetId.value.trim();
  saveConfigToLocalStorage();
  loadData();
});
ui.clearSavedBtn.addEventListener('click', () => clearSaved());
ui.reloadBtn.addEventListener('click', () => loadData());


function generateScheduleEntriesFromForm(data){
  const entries = [];
  const interval = Number(data.intervalHours) || 0;
  const days = Math.max(1, Number(data.days) || 1);
  const startDate = new Date(`${data.date}T${normalizeTimeToHHMM(data.time)}:00`);
  const endDate = new Date(startDate.getTime() + (days-1) * 24 * 60 * 60 * 1000);
  if(interval <= 0){
    const e = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      medicine: data.medicine,
      dose: data.dose || '',
      date: data.date,
      time: normalizeTimeToHHMM(data.time),
      notes: data.notes || '',
      status: ''
    };
    entries.push(e);
    return entries;
  }
  let cur = new Date(startDate);
  while(cur <= (endDate.getTime() ? endDate : startDate)){
    entries.push({
      id: `local-${cur.getTime()}-${Math.random().toString(36).slice(2,5)}`,
      medicine: data.medicine,
      dose: data.dose || '',
      date: fmtDateYMD(cur),
      time: fmtTimeHM(cur),
      notes: data.notes || '',
      status: ''
    });
    cur = new Date(cur.getTime() + interval * 60 * 60 * 1000);
  }
  return entries;
}


ui.addForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const data = {
    medicine: ui.add_medicine.value.trim(),
    dose: ui.add_dose.value.trim(),
    date: ui.add_date.value,
    time: ui.add_time.value,
    intervalHours: ui.add_interval.value,
    days: ui.add_days.value,
    notes: ui.add_notes.value.trim()
  };
  if(!data.medicine || !data.date || !data.time){
    setMessage('Please fill medicine, date and time.');
    return;
  }
  const newEntries = generateScheduleEntriesFromForm(data);
  state.localSchedule = newEntries.concat(state.localSchedule || []);
  state.schedule = newEntries.concat(state.schedule || []);
  saveLocalSchedule();
  renderSchedule();
  setMessage(`Added ${newEntries.length} scheduled item(s) for ${data.medicine}.`);
  ui.add_medicine.value = '';
  ui.add_dose.value = '';
  ui.add_notes.value = '';
});


ui.clearLocalScheduleBtn.addEventListener('click', () => {
  if(confirm('Clear all locally added schedule entries? This cannot be undone.')) {
    state.localSchedule = [];
    saveLocalSchedule();
    if(state.config.apiKey && state.config.spreadsheetId) {
      loadData();
    } else {
      state.schedule = [];
      renderSchedule();
    }
    setMessage('Local schedule cleared.');
  }
});


ui.historyToggleBtn.addEventListener('click', () => {
  historyShowingAll = !historyShowingAll;
  renderHistory();
});


function init(){
  loadConfigFromLocalStorage();
  loadLocalHistory();
  loadLocalSchedule();
  state.schedule = (state.localSchedule || []).slice();
  state.history = state.localHistory.slice();


  if(state.config.apiKey && state.config.spreadsheetId){
    loadData();
  } else {
    setMessage('Enter API key and Spreadsheet ID then click Save & Load. Local alarms still work for schedule loaded previously (or use Test Alarm).');
    ui.scheduleWrap.innerHTML = '<em>Set API key & spreadsheet id and click Save & Load</em>';
    ui.historyWrap.innerHTML = '<em>Set API key & spreadsheet id and click Save & Load</em>';
    ui.statsWrap.innerHTML = '';
  }
  startClockAndAlarmChecker();
  renderSchedule();
  renderHistory();
  computeStats();
}
init();


