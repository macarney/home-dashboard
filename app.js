// Home Maintenance Dashboard - Firebase Edition with Google Auth

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyA_e-s-GJoFlLNzZALrT8yYNVjoxDinuLk",
    authDomain: "home-dashboard-6471e.firebaseapp.com",
    projectId: "home-dashboard-6471e",
    storageBucket: "home-dashboard-6471e.firebasestorage.app",
    messagingSenderId: "984823429724",
    appId: "1:984823429724:web:d8f434fd26e816b863c499",
    measurementId: "G-LCDBRNE4W9"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();

let _tasks = null;
let _trashTimes = null;
let _currentUser = null;

async function signIn() {
    try { await signInWithPopup(auth, provider); }
    catch (e) { console.error("Sign in error:", e); alert("Sign in failed. Please try again."); }
}

async function signOutUser() {
    try { await signOut(auth); }
    catch (e) { console.error("Sign out error:", e); }
}

function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
}

function getUserDocRef(docName) {
    return doc(db, "users", _currentUser.uid, "dashboard", docName);
}

async function getTasks() {
    if (_tasks !== null) return _tasks;
    try { const snap = await getDoc(getUserDocRef("tasks")); _tasks = snap.exists() ? (snap.data().list || []) : []; }
    catch (e) { _tasks = []; }
    return _tasks;
}

async function saveTasks(tasks) {
    _tasks = tasks;
    await setDoc(getUserDocRef("tasks"), { list: tasks });
}

async function getTrashTimes() {
    if (_trashTimes !== null) return _trashTimes;
    try { const snap = await getDoc(getUserDocRef("trashTimes")); _trashTimes = snap.exists() ? (snap.data().list || []) : []; }
    catch (e) { _trashTimes = []; }
    return _trashTimes;
}

async function saveTrashTimes(times) {
    _trashTimes = times;
    await setDoc(getUserDocRef("trashTimes"), { list: times });
}

function exportData() {
    const now = new Date();
    const data = { tasks: _tasks || [], trashTimes: _trashTimes || [], exportDate: now.toISOString() };
    const dateStr = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '-');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `dashboard-data-${dateStr}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    localStorage.setItem('homeDashboardLastExport', now.toISOString());
    hideBackupReminder();
}

function checkBackupReminder() {
    const lastExport = localStorage.getItem('homeDashboardLastExport');
    const reminder = document.getElementById('backupReminder');
    if (!lastExport) {
        if ((_tasks || []).length > 0 || (_trashTimes || []).length > 0) reminder.classList.remove('hidden');
        return;
    }
    if (Math.floor((new Date() - new Date(lastExport)) / 86400000) >= 7) reminder.classList.remove('hidden');
}

function hideBackupReminder() { document.getElementById('backupReminder').classList.add('hidden'); }

async function importData(file) {
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.tasks) { _tasks = data.tasks; await saveTasks(data.tasks); }
            if (data.trashTimes) { _trashTimes = data.trashTimes; await saveTrashTimes(data.trashTimes); }
            await renderTasks(); await renderTrashPrediction();
            alert('Data imported successfully!');
        } catch (err) { alert('Error importing data. Please check the file format.'); }
    };
    reader.readAsText(file);
}

function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

function convertToDays(value, unit) {
    if (unit === 'weeks') return value * 7;
    if (unit === 'months') return value * 30;
    return value;
}

function calculatePredictedInterval(h) {
    if (!h || h.length < 2) return null;
    const s = [...h].sort((a, b) => new Date(a) - new Date(b));
    let t = 0;
    for (let i = 1; i < s.length; i++) t += Math.round((new Date(s[i]) - new Date(s[i-1])) / 86400000);
    return Math.round(t / (s.length - 1));
}

function getEffectiveLifespan(task) {
    if (task.scheduleType === 'predicted') {
        const p = calculatePredictedInterval(task.completionHistory);
        return p || convertToDays(task.expectedInterval || 7, task.expectedIntervalUnit || 'days');
    }
    return convertToDays(task.lifespanValue, task.lifespanUnit);
}

function getLastCompletion(task) {
    if (task.scheduleType === 'predicted' && task.completionHistory && task.completionHistory.length > 0)
        return [...task.completionHistory].sort((a, b) => new Date(b) - new Date(a))[0];
    return task.lastServiced;
}

function calculateDaysRemaining(lastServiced, lifespanDays) {
    const due = new Date(lastServiced);
    due.setDate(due.getDate() + lifespanDays);
    const today = new Date(); today.setHours(0,0,0,0); due.setHours(0,0,0,0);
    return Math.ceil((due - today) / 86400000);
}

function getStatus(days, lifespan) {
    if (days < 0) return 'red';
    return (days / lifespan) * 100 <= 25 ? 'yellow' : 'green';
}

function formatDaysRemaining(days) {
    if (days < 0) { const o = Math.abs(days); return `OVERDUE by ${o} day${o !== 1 ? 's' : ''}`; }
    if (days === 0) return 'Due today';
    if (days === 1) return 'Tomorrow';
    return `${days} days remaining`;
}

function escapeHtml(text) {
    const div = document.createElement('div'); div.textContent = text; return div.innerHTML;
}

function formatTime(hours, minutes) {
    const period = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function getDayOfYear(date) {
    return Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
}

async function renderTasks() {
    const taskList = document.getElementById('taskList');
    const tasks = await getTasks();
    if (tasks.length === 0) {
        taskList.innerHTML = `<div class="empty-state"><h3>No tasks yet</h3><p>Click "Add Task" to start tracking your home maintenance items.</p></div>`;
        return;
    }
    const sorted = tasks.map(task => {
        const lifespanDays = getEffectiveLifespan(task);
        const lastCompletion = getLastCompletion(task);
        const daysRemaining = lastCompletion ? calculateDaysRemaining(lastCompletion, lifespanDays) : 0;
        return { ...task, daysRemaining, lifespanDays };
    }).sort((a, b) => a.daysRemaining - b.daysRemaining);

    taskList.innerHTML = sorted.map(task => {
        const status = getStatus(task.daysRemaining, task.lifespanDays);
        const statusText = formatDaysRemaining(task.daysRemaining);
        const alertIcon = status === 'yellow' ? '<span class="alert-icon">&#9888;</span>' : status === 'red' ? '<span class="alert-icon">!</span>' : '';
        const pct = Math.max(0, Math.min(100, (task.daysRemaining / task.lifespanDays) * 100));
        const isPredicted = task.scheduleType === 'predicted';
        const actionBtn = isPredicted
            ? `<button class="btn btn-done btn-small" onclick="window.recordTaskCompletion('${task.id}')">Record</button>`
            : `<button class="btn btn-done btn-small" onclick="window.markTaskDone('${task.id}')">Done</button>`;
        const predBadge = isPredicted && task.completionHistory && task.completionHistory.length >= 2
            ? `<span class="prediction-badge">~${task.lifespanDays}d avg</span>` : '';
        const nameDisplay = isPredicted ? `${escapeHtml(task.name)} *` : escapeHtml(task.name);
        const tickCount = Math.min(task.lifespanDays, 30);
        const ticks = tickCount > 1 ? Array.from({length: tickCount - 1}, (_, i) =>
            `<div class="timeline-tick" style="left: ${((i + 1) / tickCount) * 100}%"></div>`).join('') : '';
        return `
            <div class="task-item" data-id="${task.id}">
                <div class="status-indicator status-${status}"></div>
                <div class="task-info">
                    <div class="task-name">${nameDisplay}${predBadge}</div>
                    <div class="task-category">${escapeHtml(task.category)}</div>
                    <div class="timeline-bar"><div class="timeline-fill ${status}" style="width: ${pct}%"></div>${ticks}</div>
                </div>
                <div class="task-status"><span class="days-remaining ${status}">${statusText}${alertIcon}</span></div>
                <div class="task-actions">
                    ${actionBtn}
                    <button class="btn btn-edit btn-small" onclick="window.editTask('${task.id}')">Edit</button>
                    <button class="btn btn-delete btn-small" onclick="window.confirmDeleteTask('${task.id}')">Delete</button>
                </div>
            </div>`;
    }).join('');
}

async function addTask(taskData) {
    const tasks = await getTasks();
    tasks.push({ id: generateId(), ...taskData, createdAt: new Date().toISOString() });
    await saveTasks(tasks); await renderTasks();
}

async function updateTask(taskId, taskData) {
    const tasks = await getTasks();
    const i = tasks.findIndex(t => t.id === taskId);
    if (i !== -1) { tasks[i] = { ...tasks[i], ...taskData }; await saveTasks(tasks); await renderTasks(); }
}

async function deleteTask(taskId) {
    const tasks = await getTasks();
    await saveTasks(tasks.filter(t => t.id !== taskId)); await renderTasks();
}

window.markTaskDone = async (taskId) => updateTask(taskId, { lastServiced: new Date().toISOString().split('T')[0] });

window.recordTaskCompletion = async function(taskId) {
    const tasks = await getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const now = new Date();
    showConfirm(`Record ${task.name} completed at ${formatTime(now.getHours(), now.getMinutes())}?`, async () => {
        const h = task.completionHistory || [];
        h.push(now.toISOString());
        if (h.length > 20) h.shift();
        await updateTask(taskId, { completionHistory: h });
    }, 'Record');
};

window.editTask = async function(taskId) {
    const tasks = await getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    document.getElementById('modalTitle').textContent = 'Edit Task';
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskName').value = task.name;
    document.getElementById('taskCategory').value = task.category;
    const st = task.scheduleType || 'fixed';
    document.getElementById('scheduleType').value = st;
    updateScheduleFields(st, task.id);
    if (st === 'fixed') {
        document.getElementById('lifespanValue').value = task.lifespanValue || '';
        document.getElementById('lifespanUnit').value = task.lifespanUnit || 'days';
        document.getElementById('lastServiced').value = task.lastServiced || '';
    } else {
        document.getElementById('expectedInterval').value = task.expectedInterval || '';
        document.getElementById('expectedIntervalUnit').value = task.expectedIntervalUnit || 'days';
        renderCompletionHistory(task.completionHistory || []);
    }
    showModal('taskModal');
};

window.confirmDeleteTask = function(taskId) {
    pendingDeleteId = taskId;
    showConfirm('Are you sure you want to delete this task?', async () => { await deleteTask(pendingDeleteId); pendingDeleteId = null; }, 'Delete');
};

function updateScheduleFields(scheduleType, taskId = null) {
    document.getElementById('fixedFields').classList.toggle('hidden', scheduleType !== 'fixed');
    document.getElementById('predictedFields').classList.toggle('hidden', scheduleType === 'fixed');
    document.getElementById('scheduleHint').textContent = scheduleType === 'fixed'
        ? 'Task will be due after a set number of days.'
        : 'System learns from your usage patterns and predicts when needed.';
    document.getElementById('historySection').classList.toggle('hidden', scheduleType === 'fixed' || !taskId);
}

function renderCompletionHistory(history) {
    const el = document.getElementById('historyList');
    if (!history || history.length === 0) { el.innerHTML = '<p class="history-empty">No completions recorded yet.</p>'; return; }
    el.innerHTML = [...history].sort((a, b) => new Date(b) - new Date(a)).map(ts => {
        const d = new Date(ts);
        return `<div class="history-item">
            <span class="history-item-date">${d.toLocaleDateString('en-US', {weekday:'short',month:'short',day:'numeric',year:'numeric'})} at ${formatTime(d.getHours(), d.getMinutes())}</span>
            <button type="button" class="history-item-delete" onclick="window.deleteHistoryEntry('${ts}')">&times;</button>
        </div>`;
    }).join('');
}

window.deleteHistoryEntry = async function(ts) {
    const taskId = document.getElementById('taskId').value;
    if (!taskId) return;
    const tasks = await getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.completionHistory) return;
    task.completionHistory = task.completionHistory.filter(t => t !== ts);
    tasks[tasks.findIndex(t => t.id === taskId)] = task;
    await saveTasks(tasks); renderCompletionHistory(task.completionHistory); await renderTasks();
};

async function clearCompletionHistory() {
    const taskId = document.getElementById('taskId').value;
    if (!taskId) return;
    showConfirm('Clear all completion history for this task?', async () => {
        const tasks = await getTasks();
        const i = tasks.findIndex(t => t.id === taskId);
        if (i !== -1) { tasks[i].completionHistory = []; await saveTasks(tasks); renderCompletionHistory([]); await renderTasks(); }
    }, 'Clear');
}

let pendingDeleteId = null;
let pendingConfirmAction = null;

function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

function showConfirm(message, onConfirm, buttonText = 'Confirm') {
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmYes').textContent = buttonText;
    pendingConfirmAction = onConfirm;
    showModal('confirmModal');
}

function resetForm() {
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    document.getElementById('modalTitle').textContent = 'Add New Task';
    document.getElementById('lastServiced').value = new Date().toISOString().split('T')[0];
    document.getElementById('scheduleType').value = 'fixed';
    updateScheduleFields('fixed', null);
    document.getElementById('historyList').innerHTML = '<p class="history-empty">No completions recorded yet.</p>';
}

async function recordTrashArrival() {
    const now = new Date();
    showConfirm(`Record truck arrival at ${formatTime(now.getHours(), now.getMinutes())}?`, async () => {
        const times = await getTrashTimes();
        times.push({ date: now.toISOString().split('T')[0], time: now.toTimeString().split(' ')[0].substring(0,5), timestamp: now.toISOString() });
        if (times.length > 52) times.shift();
        await saveTrashTimes(times); await renderTrashPrediction();
    }, 'Record');
}

function calculateAverageTime(times) {
    if (!times.length) return null;
    let total = 0;
    times.forEach(r => { const [h, m] = r.time.split(':').map(Number); total += h * 60 + m; });
    const avg = Math.round(total / times.length);
    return { hours: Math.floor(avg / 60), minutes: avg % 60, formatted: formatTime(Math.floor(avg / 60), avg % 60) };
}

function getNextFriday(avgTime) {
    const now = new Date();
    let d = (5 - now.getDay() + 7) % 7;
    if (d === 0 && avgTime && now.getHours() * 60 + now.getMinutes() > avgTime.hours * 60 + avgTime.minutes) d = 7;
    if (d === 0 && now.getDay() !== 5) d = 7;
    const next = new Date(now); next.setDate(now.getDate() + d); return next;
}

function formatDate(date) {
    return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()]}, ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getMonth()]} ${date.getDate()}`;
}

function renderTrashGraph(times, avgTime) {
    const graphDiv = document.getElementById('trashGraph');
    if (!times || times.length < 2) { graphDiv.innerHTML = ''; return; }
    const now = new Date();
    const sorted = [...times].sort((a, b) => new Date(a.date) - new Date(b.date));
    const W = 600, H = 180, pad = { top: 20, right: 20, bottom: 30, left: 50 };
    const gw = W - pad.left - pad.right, gh = H - pad.top - pad.bottom;
    const year = now.getFullYear();
    const pts = sorted.map(t => {
        const [h, m] = t.time.split(':').map(Number);
        const d = new Date(t.date);
        return { date: t.date, day: getDayOfYear(d), min: h * 60 + m, label: formatTime(h, m) };
    });
    const allMin = pts.map(p => p.min);
    const avgMin = avgTime.hours * 60 + avgTime.minutes;
    allMin.push(avgMin);
    const minT = Math.min(...allMin) - 30, maxT = Math.max(...allMin) + 30, range = maxT - minT;
    const xS = d => pad.left + ((d - 1) / 364) * gw;
    const yS = m => pad.top + gh - ((m - minT) / range) * gh;
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xS(p.day)} ${yS(p.min)}`).join(' ');
    const yLabels = Array.from({length: 5}, (_, i) => { const m = minT + (range * i / 4); return { y: yS(m), label: formatTime(Math.floor(m/60), Math.round(m%60)) }; });
    const predY = yS(avgMin);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    graphDiv.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" class="arrival-graph">
        ${yLabels.map(l => `<line x1="${pad.left}" y1="${l.y}" x2="${W-pad.right}" y2="${l.y}" class="grid-line"/>`).join('')}
        <line x1="${pad.left}" y1="${predY}" x2="${W-pad.right}" y2="${predY}" class="predicted-line"/>
        <text x="${W-pad.right+5}" y="${predY+4}" class="predicted-label">avg</text>
        <path d="${path}" class="data-line"/>
        ${pts.map(p => `<circle cx="${xS(p.day)}" cy="${yS(p.min)}" r="3" class="data-point"><title>${p.date}: ${p.label}</title></circle>`).join('')}
        ${yLabels.map(l => `<text x="${pad.left-5}" y="${l.y+4}" class="y-label">${l.label}</text>`).join('')}
        ${months.map((n, mo) => `<text x="${xS(getDayOfYear(new Date(year, mo, 1)))}" y="${H-5}" class="x-label">${n}</text>`).join('')}
    </svg>`;
}

async function renderTrashPrediction() {
    const times = await getTrashTimes();
    const predDiv = document.getElementById('trashPrediction');
    const histDiv = document.getElementById('trashHistory');
    const graphDiv = document.getElementById('trashGraph');
    if (times.length === 0) {
        predDiv.innerHTML = '<p>No arrival times recorded yet. Record when the truck arrives to get predictions!</p>';
        histDiv.innerHTML = ''; graphDiv.innerHTML = ''; return;
    }
    const avg = calculateAverageTime(times);
    predDiv.innerHTML = `<div class="prediction-time">${formatDate(getNextFriday(avg))} ~${avg.formatted}</div>
        <div class="prediction-note">Based on ${times.length} recorded arrival${times.length !== 1 ? 's' : ''}</div>`;
    renderTrashGraph(times, avg);
    histDiv.innerHTML = `<h4>Recent Arrivals</h4><div class="trash-history-list">
        ${[...times].reverse().slice(0, 10).map((t, i) => {
            const idx = times.length - 1 - i;
            return `<div class="trash-history-item">
                <span class="trash-history-date">${t.date}: ${formatTime(...t.time.split(':').map(Number))}</span>
                <div class="trash-history-actions">
                    <button class="trash-history-edit" onclick="window.editTrashEntry(${idx})" title="Edit">&#9998;</button>
                    <button class="trash-history-delete" onclick="window.deleteTrashEntry(${idx})" title="Delete">&times;</button>
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

async function openAddTrashEntryModal() {
    document.getElementById('trashModalTitle').textContent = 'Add Arrival';
    document.getElementById('trashArrivalIndex').value = '';
    const now = new Date();
    document.getElementById('trashArrivalDate').value = now.toISOString().split('T')[0];
    document.getElementById('trashArrivalTime').value = now.toTimeString().split(' ')[0].substring(0,5);
    showModal('trashArrivalModal');
}

window.editTrashEntry = async function(index) {
    const times = await getTrashTimes();
    if (index < 0 || index >= times.length) return;
    const e = times[index];
    document.getElementById('trashModalTitle').textContent = 'Edit Arrival';
    document.getElementById('trashArrivalIndex').value = index;
    document.getElementById('trashArrivalDate').value = e.date;
    document.getElementById('trashArrivalTime').value = e.time;
    showModal('trashArrivalModal');
};

window.deleteTrashEntry = function(index) {
    showConfirm('Delete this arrival record?', async () => {
        const times = await getTrashTimes();
        if (index >= 0 && index < times.length) { times.splice(index, 1); await saveTrashTimes(times); await renderTrashPrediction(); }
    }, 'Delete');
};

async function saveTrashEntry() {
    const indexStr = document.getElementById('trashArrivalIndex').value;
    const date = document.getElementById('trashArrivalDate').value;
    const time = document.getElementById('trashArrivalTime').value;
    if (!date || !time) return;
    const times = await getTrashTimes();
    const entry = { date, time, timestamp: new Date(`${date}T${time}`).toISOString() };
    if (indexStr !== '') {
        const idx = parseInt(indexStr);
        if (idx >= 0 && idx < times.length) times[idx] = entry;
    } else {
        times.push(entry);
        times.sort((a, b) => new Date(a.date) - new Date(b.date));
        while (times.length > 52) times.shift();
    }
    await saveTrashTimes(times); hideModal('trashArrivalModal'); await renderTrashPrediction();
}

document.addEventListener('DOMContentLoaded', function() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (localStorage.getItem('homeDashboardDarkMode') === 'true') {
        document.body.classList.add('dark-mode'); darkModeToggle.checked = true;
    }

    document.getElementById('signInBtn').addEventListener('click', signIn);
    document.getElementById('signOutBtn').addEventListener('click', signOutUser);

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            _currentUser = user; _tasks = null; _trashTimes = null;
            document.getElementById('userDisplayName').textContent = user.displayName || user.email;
            showMainApp();
            await renderTasks(); await renderTrashPrediction(); checkBackupReminder();
            setInterval(renderTasks, 60000);
        } else {
            _currentUser = null; _tasks = null; _trashTimes = null;
            showLoginScreen();
        }
    });

    darkModeToggle.addEventListener('change', function() {
        document.body.classList.toggle('dark-mode', this.checked);
        localStorage.setItem('homeDashboardDarkMode', this.checked);
    });

    document.getElementById('scheduleType').addEventListener('change', function() {
        updateScheduleFields(this.value, document.getElementById('taskId').value || null);
    });

    document.getElementById('addTaskBtn').addEventListener('click', () => { resetForm(); showModal('taskModal'); });
    document.getElementById('closeModal').addEventListener('click', () => hideModal('taskModal'));
    document.getElementById('cancelBtn').addEventListener('click', () => hideModal('taskModal'));
    document.getElementById('clearHistoryBtn').addEventListener('click', clearCompletionHistory);

    document.getElementById('taskForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const st = document.getElementById('scheduleType').value;
        const taskData = { name: document.getElementById('taskName').value.trim(), category: document.getElementById('taskCategory').value, scheduleType: st };
        if (st === 'fixed') {
            taskData.lifespanValue = parseInt(document.getElementById('lifespanValue').value);
            taskData.lifespanUnit = document.getElementById('lifespanUnit').value;
            taskData.lastServiced = document.getElementById('lastServiced').value;
        } else {
            taskData.expectedInterval = parseInt(document.getElementById('expectedInterval').value);
            taskData.expectedIntervalUnit = document.getElementById('expectedIntervalUnit').value;
            const taskId = document.getElementById('taskId').value;
            if (!taskId) taskData.completionHistory = [new Date().toISOString()];
        }
        const taskId = document.getElementById('taskId').value;
        if (taskId) { await updateTask(taskId, taskData); } else { await addTask(taskData); }
        hideModal('taskModal');
    });

    document.getElementById('confirmNo').addEventListener('click', () => { pendingConfirmAction = null; hideModal('confirmModal'); });
    document.getElementById('confirmYes').addEventListener('click', async function() {
        if (pendingConfirmAction) { await pendingConfirmAction(); pendingConfirmAction = null; }
        hideModal('confirmModal');
    });

    document.getElementById('recordTrashBtn').addEventListener('click', recordTrashArrival);
    document.getElementById('addTrashEntryBtn').addEventListener('click', openAddTrashEntryModal);
    document.getElementById('closeTrashModal').addEventListener('click', () => hideModal('trashArrivalModal'));
    document.getElementById('cancelTrashArrival').addEventListener('click', () => hideModal('trashArrivalModal'));
    document.getElementById('trashArrivalForm').addEventListener('submit', (e) => { e.preventDefault(); saveTrashEntry(); });
    document.getElementById('exportDataBtn').addEventListener('click', (e) => { e.preventDefault(); exportData(); });
    document.getElementById('importDataBtn').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('importFileInput').click(); });
    document.getElementById('importFileInput').addEventListener('change', function(e) {
        if (e.target.files.length > 0) { importData(e.target.files[0]); e.target.value = ''; }
    });
    document.getElementById('backupNowBtn').addEventListener('click', (e) => { e.preventDefault(); exportData(); });
    document.getElementById('dismissReminder').addEventListener('click', hideBackupReminder);

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) { pendingConfirmAction = null; this.classList.add('hidden'); }
        });
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { pendingConfirmAction = null; document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); }
    });
});
