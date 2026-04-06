// Home Maintenance Dashboard - Firebase Edition

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================
// Firebase Configuration
// ============================================

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

// In-memory cache (avoids redundant reads)
let _tasks = null;
let _trashTimes = null;

// ============================================
// Data Storage Functions (Firestore)
// ============================================

async function getTasks() {
    if (_tasks !== null) return _tasks;
    try {
        const snap = await getDoc(doc(db, "dashboard", "tasks"));
        _tasks = snap.exists() ? (snap.data().list || []) : [];
    } catch (e) {
        console.error("Error loading tasks:", e);
        _tasks = [];
    }
    return _tasks;
}

async function saveTasks(tasks) {
    _tasks = tasks;
    await setDoc(doc(db, "dashboard", "tasks"), { list: tasks });
}

async function getTrashTimes() {
    if (_trashTimes !== null) return _trashTimes;
    try {
        const snap = await getDoc(doc(db, "dashboard", "trashTimes"));
        _trashTimes = snap.exists() ? (snap.data().list || []) : [];
    } catch (e) {
        console.error("Error loading trash times:", e);
        _trashTimes = [];
    }
    return _trashTimes;
}

async function saveTrashTimes(times) {
    _trashTimes = times;
    await setDoc(doc(db, "dashboard", "trashTimes"), { list: times });
}

function exportData() {
    const now = new Date();
    const data = {
        tasks: _tasks || [],
        trashTimes: _trashTimes || [],
        exportDate: now.toISOString()
    };

    const dateStr = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '-');
    const filename = `dashboard-data-${dateStr}.json`;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    localStorage.setItem('homeDashboardLastExport', now.toISOString());
    hideBackupReminder();
}

function checkBackupReminder() {
    const lastExport = localStorage.getItem('homeDashboardLastExport');
    const reminder = document.getElementById('backupReminder');

    if (!lastExport) {
        if ((_tasks || []).length > 0 || (_trashTimes || []).length > 0) {
            reminder.classList.remove('hidden');
        }
        return;
    }

    const daysSinceExport = Math.floor((new Date() - new Date(lastExport)) / (1000 * 60 * 60 * 24));
    if (daysSinceExport >= 7) {
        reminder.classList.remove('hidden');
    }
}

function hideBackupReminder() {
    document.getElementById('backupReminder').classList.add('hidden');
}

async function importData(file) {
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.tasks) {
                _tasks = data.tasks;
                await saveTasks(data.tasks);
            }
            if (data.trashTimes) {
                _trashTimes = data.trashTimes;
                await saveTrashTimes(data.trashTimes);
            }
            await renderTasks();
            await renderTrashPrediction();
            alert('Data imported successfully!');
        } catch (err) {
            alert('Error importing data. Please check the file format.');
        }
    };
    reader.readAsText(file);
}

// ============================================
// Utility Functions
// ============================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function convertToDays(value, unit) {
    switch (unit) {
        case 'weeks': return value * 7;
        case 'months': return value * 30;
        default: return value;
    }
}

function calculatePredictedInterval(completionHistory) {
    if (!completionHistory || completionHistory.length < 2) return null;
    const sorted = [...completionHistory].sort((a, b) => new Date(a) - new Date(b));
    let totalDays = 0;
    for (let i = 1; i < sorted.length; i++) {
        const diffDays = Math.round((new Date(sorted[i]) - new Date(sorted[i - 1])) / (1000 * 60 * 60 * 24));
        totalDays += diffDays;
    }
    return Math.round(totalDays / (sorted.length - 1));
}

function getEffectiveLifespan(task) {
    if (task.scheduleType === 'predicted') {
        const predicted = calculatePredictedInterval(task.completionHistory);
        if (predicted) return predicted;
        return convertToDays(task.expectedInterval || 7, task.expectedIntervalUnit || 'days');
    }
    return convertToDays(task.lifespanValue, task.lifespanUnit);
}

function getLastCompletion(task) {
    if (task.scheduleType === 'predicted' && task.completionHistory && task.completionHistory.length > 0) {
        return [...task.completionHistory].sort((a, b) => new Date(b) - new Date(a))[0];
    }
    return task.lastServiced;
}

function calculateDaysRemaining(lastServiced, lifespanDays) {
    const dueDate = new Date(lastServiced);
    dueDate.setDate(dueDate.getDate() + lifespanDays);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    return Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
}

function getStatus(daysRemaining, lifespanDays) {
    if (daysRemaining < 0) return 'red';
    const percentRemaining = (daysRemaining / lifespanDays) * 100;
    return percentRemaining <= 25 ? 'yellow' : 'green';
}

function formatDaysRemaining(days) {
    if (days < 0) {
        const overdue = Math.abs(days);
        return `OVERDUE by ${overdue} day${overdue !== 1 ? 's' : ''}`;
    } else if (days === 0) return 'Due today';
    else if (days === 1) return 'Tomorrow';
    else return `${days} days remaining`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Task Rendering
// ============================================

async function renderTasks() {
    const taskList = document.getElementById('taskList');
    const tasks = await getTasks();

    if (tasks.length === 0) {
        taskList.innerHTML = `
            <div class="empty-state">
                <h3>No tasks yet</h3>
                <p>Click "Add Task" to start tracking your home maintenance items.</p>
            </div>
        `;
        return;
    }

    const sortedTasks = tasks.map(task => {
        const lifespanDays = getEffectiveLifespan(task);
        const lastCompletion = getLastCompletion(task);
        const daysRemaining = lastCompletion ? calculateDaysRemaining(lastCompletion, lifespanDays) : 0;
        return { ...task, daysRemaining, lifespanDays };
    }).sort((a, b) => a.daysRemaining - b.daysRemaining);

    taskList.innerHTML = sortedTasks.map(task => {
        const status = getStatus(task.daysRemaining, task.lifespanDays);
        const statusText = formatDaysRemaining(task.daysRemaining);
        const alertIcon = status === 'yellow' ? '<span class="alert-icon">&#9888;</span>' :
                         status === 'red' ? '<span class="alert-icon">!</span>' : '';

        const percentRemaining = Math.max(0, Math.min(100, (task.daysRemaining / task.lifespanDays) * 100));
        const isPredicted = task.scheduleType === 'predicted';
        const actionButton = isPredicted
            ? `<button class="btn btn-done btn-small" onclick="window.recordTaskCompletion('${task.id}')">Record</button>`
            : `<button class="btn btn-done btn-small" onclick="window.markTaskDone('${task.id}')">Done</button>`;

        const predictionInfo = isPredicted && task.completionHistory && task.completionHistory.length >= 2
            ? `<span class="prediction-badge">~${task.lifespanDays}d avg</span>` : '';

        const taskNameDisplay = isPredicted ? `${escapeHtml(task.name)} *` : escapeHtml(task.name);

        const tickCount = Math.min(task.lifespanDays, 30);
        const tickMarks = tickCount > 1 ? Array.from({length: tickCount - 1}, (_, i) =>
            `<div class="timeline-tick" style="left: ${((i + 1) / tickCount) * 100}%"></div>`
        ).join('') : '';

        return `
            <div class="task-item" data-id="${task.id}">
                <div class="status-indicator status-${status}"></div>
                <div class="task-info">
                    <div class="task-name">${taskNameDisplay}${predictionInfo}</div>
                    <div class="task-category">${escapeHtml(task.category)}</div>
                    <div class="timeline-bar">
                        <div class="timeline-fill ${status}" style="width: ${percentRemaining}%"></div>
                        ${tickMarks}
                    </div>
                </div>
                <div class="task-status">
                    <span class="days-remaining ${status}">${statusText}${alertIcon}</span>
                </div>
                <div class="task-actions">
                    ${actionButton}
                    <button class="btn btn-edit btn-small" onclick="window.editTask('${task.id}')">Edit</button>
                    <button class="btn btn-delete btn-small" onclick="window.confirmDeleteTask('${task.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// Task CRUD Operations
// ============================================

async function addTask(taskData) {
    const tasks = await getTasks();
    tasks.push({ id: generateId(), ...taskData, createdAt: new Date().toISOString() });
    await saveTasks(tasks);
    await renderTasks();
}

async function updateTask(taskId, taskData) {
    const tasks = await getTasks();
    const index = tasks.findIndex(t => t.id === taskId);
    if (index !== -1) {
        tasks[index] = { ...tasks[index], ...taskData };
        await saveTasks(tasks);
        await renderTasks();
    }
}

async function deleteTask(taskId) {
    const tasks = await getTasks();
    await saveTasks(tasks.filter(t => t.id !== taskId));
    await renderTasks();
}

window.markTaskDone = async function(taskId) {
    const today = new Date().toISOString().split('T')[0];
    await updateTask(taskId, { lastServiced: today });
};

window.recordTaskCompletion = async function(taskId) {
    const tasks = await getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const now = new Date();
    showConfirm(`Record ${task.name} completed at ${formatTime(now.getHours(), now.getMinutes())}?`, async () => {
        const completionHistory = task.completionHistory || [];
        completionHistory.push(now.toISOString());
        if (completionHistory.length > 20) completionHistory.shift();
        await updateTask(taskId, { completionHistory });
    }, 'Record');
};

window.editTask = async function(taskId) {
    const tasks = await getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        document.getElementById('modalTitle').textContent = 'Edit Task';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskName').value = task.name;
        document.getElementById('taskCategory').value = task.category;

        const scheduleType = task.scheduleType || 'fixed';
        document.getElementById('scheduleType').value = scheduleType;
        updateScheduleFields(scheduleType, task.id);

        if (scheduleType === 'fixed') {
            document.getElementById('lifespanValue').value = task.lifespanValue || '';
            document.getElementById('lifespanUnit').value = task.lifespanUnit || 'days';
            document.getElementById('lastServiced').value = task.lastServiced || '';
        } else {
            document.getElementById('expectedInterval').value = task.expectedInterval || '';
            document.getElementById('expectedIntervalUnit').value = task.expectedIntervalUnit || 'days';
            renderCompletionHistory(task.completionHistory || []);
        }

        showModal('taskModal');
    }
};

window.confirmDeleteTask = function(taskId) {
    pendingDeleteId = taskId;
    showConfirm('Are you sure you want to delete this task?', async () => {
        await deleteTask(pendingDeleteId);
        pendingDeleteId = null;
    }, 'Delete');
};

function updateScheduleFields(scheduleType, taskId = null) {
    const fixedFields = document.getElementById('fixedFields');
    const predictedFields = document.getElementById('predictedFields');
    const historySection = document.getElementById('historySection');
    const scheduleHint = document.getElementById('scheduleHint');

    if (scheduleType === 'fixed') {
        fixedFields.classList.remove('hidden');
        predictedFields.classList.add('hidden');
        historySection.classList.add('hidden');
        scheduleHint.textContent = 'Task will be due after a set number of days.';
    } else {
        fixedFields.classList.add('hidden');
        predictedFields.classList.remove('hidden');
        scheduleHint.textContent = 'System learns from your usage patterns and predicts when needed.';
        if (taskId) {
            historySection.classList.remove('hidden');
        } else {
            historySection.classList.add('hidden');
        }
    }
}

function renderCompletionHistory(history) {
    const historyList = document.getElementById('historyList');
    if (!history || history.length === 0) {
        historyList.innerHTML = '<p class="history-empty">No completions recorded yet.</p>';
        return;
    }
    const sorted = [...history].sort((a, b) => new Date(b) - new Date(a));
    historyList.innerHTML = sorted.map((timestamp) => {
        const date = new Date(timestamp);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = formatTime(date.getHours(), date.getMinutes());
        return `
            <div class="history-item" data-timestamp="${timestamp}">
                <span class="history-item-date">${dateStr} at ${timeStr}</span>
                <button type="button" class="history-item-delete" onclick="window.deleteHistoryEntry('${timestamp}')" title="Delete">&times;</button>
            </div>
        `;
    }).join('');
}

window.deleteHistoryEntry = async function(timestamp) {
    const taskId = document.getElementById('taskId').value;
    if (!taskId) return;
    const tasks = await getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.completionHistory) return;
    task.completionHistory = task.completionHistory.filter(t => t !== timestamp);
    const index = tasks.findIndex(t => t.id === taskId);
    tasks[index] = task;
    await saveTasks(tasks);
    renderCompletionHistory(task.completionHistory);
    await renderTasks();
};

async function clearCompletionHistory() {
    const taskId = document.getElementById('taskId').value;
    if (!taskId) return;
    showConfirm('Clear all completion history for this task?', async () => {
        const tasks = await getTasks();
        const index = tasks.findIndex(t => t.id === taskId);
        if (index !== -1) {
            tasks[index].completionHistory = [];
            await saveTasks(tasks);
            renderCompletionHistory([]);
            await renderTasks();
        }
    }, 'Clear');
}

// ============================================
// Modal Functions
// ============================================

let pendingDeleteId = null;
let pendingConfirmAction = null;

function showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

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

// ============================================
// Trash Truck Prediction
// ============================================

async function recordTrashArrival() {
    const now = new Date();
    showConfirm(`Record truck arrival at ${formatTime(now.getHours(), now.getMinutes())}?`, async () => {
        const times = await getTrashTimes();
        times.push({
            date: now.toISOString().split('T')[0],
            time: now.toTimeString().split(' ')[0].substring(0, 5),
            timestamp: now.toISOString()
        });
        if (times.length > 52) times.shift();
        await saveTrashTimes(times);
        await renderTrashPrediction();
    }, 'Record');
}

function calculateAverageTime(times) {
    if (times.length === 0) return null;
    let totalMinutes = 0;
    times.forEach(record => {
        const [hours, minutes] = record.time.split(':').map(Number);
        totalMinutes += hours * 60 + minutes;
    });
    const avgMinutes = Math.round(totalMinutes / times.length);
    const avgHours = Math.floor(avgMinutes / 60);
    const avgMins = avgMinutes % 60;
    return { hours: avgHours, minutes: avgMins, formatted: formatTime(avgHours, avgMins) };
}

function formatTime(hours, minutes) {
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMins = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMins} ${period}`;
}

function getNextFriday(avgTime) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (daysUntilFriday === 0 && avgTime) {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const predictedMinutes = avgTime.hours * 60 + avgTime.minutes;
        if (currentMinutes > predictedMinutes) daysUntilFriday = 7;
    }
    if (daysUntilFriday === 0 && dayOfWeek !== 5) daysUntilFriday = 7;
    const nextFriday = new Date(now);
    nextFriday.setDate(now.getDate() + daysUntilFriday);
    return nextFriday;
}

function formatDate(date) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function renderTrashGraph(times, avgTime) {
    const graphDiv = document.getElementById('trashGraph');
    if (!times || times.length < 2) { graphDiv.innerHTML = ''; return; }

    const now = new Date();
    const recentTimes = [...times].sort((a, b) => new Date(a.date) - new Date(b.date));
    const width = 600, height = 180;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;
    const year = now.getFullYear();

    const getDayOfYear = (date) => {
        const start = new Date(date.getFullYear(), 0, 0);
        return Math.floor((date - start) / (1000 * 60 * 60 * 24));
    };

    const dataPoints = recentTimes.map(t => {
        const [hours, minutes] = t.time.split(':').map(Number);
        const date = new Date(t.date);
        return { date: t.date, dateObj: date, dayOfYear: getDayOfYear(date), minutes: hours * 60 + minutes, label: formatTime(hours, minutes) };
    });

    const allMinutes = dataPoints.map(d => d.minutes);
    const avgMinutes = avgTime.hours * 60 + avgTime.minutes;
    allMinutes.push(avgMinutes);
    const minTime = Math.min(...allMinutes) - 30;
    const maxTime = Math.max(...allMinutes) + 30;
    const timeRange = maxTime - minTime;

    const xScale = (dayOfYear) => padding.left + ((dayOfYear - 1) / 364) * graphWidth;
    const yScale = (minutes) => padding.top + graphHeight - ((minutes - minTime) / timeRange) * graphHeight;

    const linePath = dataPoints.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.dayOfYear)} ${yScale(d.minutes)}`).join(' ');

    const yAxisLabels = [];
    for (let i = 0; i <= 4; i++) {
        const minutes = minTime + (timeRange * i / 4);
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        yAxisLabels.push({ y: yScale(minutes), label: formatTime(hours, mins) });
    }

    const predictedY = yScale(avgMinutes);

    const svg = `
        <svg width="100%" viewBox="0 0 ${width} ${height}" class="arrival-graph">
            ${yAxisLabels.map(l => `<line x1="${padding.left}" y1="${l.y}" x2="${width - padding.right}" y2="${l.y}" class="grid-line" />`).join('')}
            <line x1="${padding.left}" y1="${predictedY}" x2="${width - padding.right}" y2="${predictedY}" class="predicted-line" />
            <text x="${width - padding.right + 5}" y="${predictedY + 4}" class="predicted-label">avg</text>
            <path d="${linePath}" class="data-line" />
            ${dataPoints.map(d => `<circle cx="${xScale(d.dayOfYear)}" cy="${yScale(d.minutes)}" r="3" class="data-point"><title>${d.date}: ${d.label}</title></circle>`).join('')}
            ${yAxisLabels.map(l => `<text x="${padding.left - 5}" y="${l.y + 4}" class="y-label">${l.label}</text>`).join('')}
            ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((name, month) => {
                const date = new Date(year, month, 1);
                const dayOfYear = getDayOfYear(date);
                return `<text x="${xScale(dayOfYear)}" y="${height - 5}" class="x-label">${name}</text>`;
            }).join('')}
        </svg>
    `;

    graphDiv.innerHTML = svg;
}

async function renderTrashPrediction() {
    const times = await getTrashTimes();
    const predictionDiv = document.getElementById('trashPrediction');
    const historyDiv = document.getElementById('trashHistory');
    const graphDiv = document.getElementById('trashGraph');

    if (times.length === 0) {
        predictionDiv.innerHTML = '<p>No arrival times recorded yet. Record when the truck arrives to get predictions!</p>';
        historyDiv.innerHTML = '';
        graphDiv.innerHTML = '';
        return;
    }

    const avgTime = calculateAverageTime(times);
    const nextFriday = getNextFriday(avgTime);

    predictionDiv.innerHTML = `
        <div class="prediction-time">${formatDate(nextFriday)} ~${avgTime.formatted}</div>
        <div class="prediction-note">Based on ${times.length} recorded arrival${times.length !== 1 ? 's' : ''}</div>
    `;

    renderTrashGraph(times, avgTime);

    const recentTimes = [...times].reverse().slice(0, 10);
    historyDiv.innerHTML = `
        <h4>Recent Arrivals</h4>
        <div class="trash-history-list">
            ${recentTimes.map((t, i) => {
                const actualIndex = times.length - 1 - i;
                return `
                    <div class="trash-history-item" data-index="${actualIndex}">
                        <span class="trash-history-date">${t.date}: ${formatTime(...t.time.split(':').map(Number))}</span>
                        <div class="trash-history-actions">
                            <button class="trash-history-edit" onclick="window.editTrashEntry(${actualIndex})" title="Edit">&#9998;</button>
                            <button class="trash-history-delete" onclick="window.deleteTrashEntry(${actualIndex})" title="Delete">&times;</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ============================================
// Trash Entry CRUD Operations
// ============================================

async function openAddTrashEntryModal() {
    document.getElementById('trashModalTitle').textContent = 'Add Arrival';
    document.getElementById('trashArrivalIndex').value = '';
    const now = new Date();
    document.getElementById('trashArrivalDate').value = now.toISOString().split('T')[0];
    document.getElementById('trashArrivalTime').value = now.toTimeString().split(' ')[0].substring(0, 5);
    showModal('trashArrivalModal');
}

window.editTrashEntry = async function(index) {
    const times = await getTrashTimes();
    if (index < 0 || index >= times.length) return;
    const entry = times[index];
    document.getElementById('trashModalTitle').textContent = 'Edit Arrival';
    document.getElementById('trashArrivalIndex').value = index;
    document.getElementById('trashArrivalDate').value = entry.date;
    document.getElementById('trashArrivalTime').value = entry.time;
    showModal('trashArrivalModal');
};

window.deleteTrashEntry = function(index) {
    showConfirm('Delete this arrival record?', async () => {
        const times = await getTrashTimes();
        if (index >= 0 && index < times.length) {
            times.splice(index, 1);
            await saveTrashTimes(times);
            await renderTrashPrediction();
        }
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
        const index = parseInt(indexStr);
        if (index >= 0 && index < times.length) times[index] = entry;
    } else {
        times.push(entry);
        times.sort((a, b) => new Date(a.date) - new Date(b.date));
        while (times.length > 52) times.shift();
    }

    await saveTrashTimes(times);
    hideModal('trashArrivalModal');
    await renderTrashPrediction();
}

// ============================================
// Event Listeners
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    const loadingState = document.getElementById('loadingState');

    // Load dark mode preference (still use localStorage for UI prefs)
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (localStorage.getItem('homeDashboardDarkMode') === 'true') {
        document.body.classList.add('dark-mode');
        darkModeToggle.checked = true;
    }

    // Load data from Firestore
    try {
        await renderTasks();
        await renderTrashPrediction();
        checkBackupReminder();
    } finally {
        loadingState.classList.add('hidden');
    }

    // Auto-refresh every minute
    setInterval(renderTasks, 60000);

    darkModeToggle.addEventListener('change', function() {
        document.body.classList.toggle('dark-mode', this.checked);
        localStorage.setItem('homeDashboardDarkMode', this.checked);
    });

    document.getElementById('scheduleType').addEventListener('change', function() {
        const taskId = document.getElementById('taskId').value;
        updateScheduleFields(this.value, taskId || null);
    });

    document.getElementById('addTaskBtn').addEventListener('click', function() {
        resetForm();
        showModal('taskModal');
    });

    document.getElementById('closeModal').addEventListener('click', () => hideModal('taskModal'));
    document.getElementById('cancelBtn').addEventListener('click', () => hideModal('taskModal'));
    document.getElementById('clearHistoryBtn').addEventListener('click', clearCompletionHistory);

    document.getElementById('taskForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const scheduleType = document.getElementById('scheduleType').value;
        const taskData = {
            name: document.getElementById('taskName').value.trim(),
            category: document.getElementById('taskCategory').value,
            scheduleType
        };

        if (scheduleType === 'fixed') {
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
        if (taskId) {
            await updateTask(taskId, taskData);
        } else {
            await addTask(taskData);
        }

        hideModal('taskModal');
    });

    document.getElementById('confirmNo').addEventListener('click', function() {
        pendingConfirmAction = null;
        hideModal('confirmModal');
    });

    document.getElementById('confirmYes').addEventListener('click', async function() {
        if (pendingConfirmAction) {
            await pendingConfirmAction();
            pendingConfirmAction = null;
        }
        hideModal('confirmModal');
    });

    document.getElementById('recordTrashBtn').addEventListener('click', recordTrashArrival);
    document.getElementById('addTrashEntryBtn').addEventListener('click', openAddTrashEntryModal);
    document.getElementById('closeTrashModal').addEventListener('click', () => hideModal('trashArrivalModal'));
    document.getElementById('cancelTrashArrival').addEventListener('click', () => hideModal('trashArrivalModal'));

    document.getElementById('trashArrivalForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveTrashEntry();
    });

    document.getElementById('exportDataBtn').addEventListener('click', function(e) {
        e.preventDefault();
        exportData();
    });

    document.getElementById('importDataBtn').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('importFileInput').click();
    });

    document.getElementById('importFileInput').addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            importData(e.target.files[0]);
            e.target.value = '';
        }
    });

    document.getElementById('backupNowBtn').addEventListener('click', function(e) {
        e.preventDefault();
        exportData();
    });

    document.getElementById('dismissReminder').addEventListener('click', hideBackupReminder);

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                pendingConfirmAction = null;
                this.classList.add('hidden');
            }
        });
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            pendingConfirmAction = null;
            document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
        }
    });
});
