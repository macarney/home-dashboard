// Home Maintenance Dashboard - Main Application

// ============================================
// Data Storage Functions
// ============================================

function getTasks() {
    const tasks = localStorage.getItem('homeDashboardTasks');
    return tasks ? JSON.parse(tasks) : [];
}

function saveTasks(tasks) {
    localStorage.setItem('homeDashboardTasks', JSON.stringify(tasks));
}

function getTrashTimes() {
    const times = localStorage.getItem('homeDashboardTrashTimes');
    return times ? JSON.parse(times) : [];
}

function saveTrashTimes(times) {
    localStorage.setItem('homeDashboardTrashTimes', JSON.stringify(times));
}

function exportData() {
    const now = new Date();
    const data = {
        tasks: getTasks(),
        trashTimes: getTrashTimes(),
        exportDate: now.toISOString()
    };

    // Format: dashboard-data-2024-01-15-14-30.json
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

    // Save last export date
    localStorage.setItem('homeDashboardLastExport', now.toISOString());
    hideBackupReminder();
}

function checkBackupReminder() {
    const lastExport = localStorage.getItem('homeDashboardLastExport');
    const reminder = document.getElementById('backupReminder');

    if (!lastExport) {
        // Never exported - show reminder if there's data
        if (getTasks().length > 0 || getTrashTimes().length > 0) {
            reminder.classList.remove('hidden');
        }
        return;
    }

    const lastExportDate = new Date(lastExport);
    const now = new Date();
    const daysSinceExport = Math.floor((now - lastExportDate) / (1000 * 60 * 60 * 24));

    if (daysSinceExport >= 7) {
        reminder.classList.remove('hidden');
    }
}

function hideBackupReminder() {
    document.getElementById('backupReminder').classList.add('hidden');
}

function importData(file) {
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);

            if (data.tasks) {
                saveTasks(data.tasks);
            }
            if (data.trashTimes) {
                saveTrashTimes(data.trashTimes);
            }

            renderTasks();
            renderTrashPrediction();

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
        case 'weeks':
            return value * 7;
        case 'months':
            return value * 30;
        default:
            return value;
    }
}

// Calculate average interval from completion history
function calculatePredictedInterval(completionHistory) {
    if (!completionHistory || completionHistory.length < 2) {
        return null;
    }

    // Sort by date
    const sorted = [...completionHistory].sort((a, b) => new Date(a) - new Date(b));

    // Calculate intervals between completions
    let totalDays = 0;
    for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1]);
        const curr = new Date(sorted[i]);
        const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        totalDays += diffDays;
    }

    return Math.round(totalDays / (sorted.length - 1));
}

// Get effective lifespan for a task (fixed or predicted)
function getEffectiveLifespan(task) {
    if (task.scheduleType === 'predicted') {
        const predicted = calculatePredictedInterval(task.completionHistory);
        if (predicted) {
            return predicted;
        }
        // Fall back to expected interval if not enough data
        return convertToDays(task.expectedInterval || 7, task.expectedIntervalUnit || 'days');
    }
    return convertToDays(task.lifespanValue, task.lifespanUnit);
}

// Get last completion date for a task
function getLastCompletion(task) {
    if (task.scheduleType === 'predicted' && task.completionHistory && task.completionHistory.length > 0) {
        const sorted = [...task.completionHistory].sort((a, b) => new Date(b) - new Date(a));
        return sorted[0];
    }
    return task.lastServiced;
}

function calculateDaysRemaining(lastServiced, lifespanDays) {
    const lastDate = new Date(lastServiced);
    const dueDate = new Date(lastDate);
    dueDate.setDate(dueDate.getDate() + lifespanDays);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);

    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
}

function getStatus(daysRemaining, lifespanDays) {
    if (daysRemaining < 0) {
        return 'red';
    }
    const percentRemaining = (daysRemaining / lifespanDays) * 100;
    if (percentRemaining <= 25) {
        return 'yellow';
    }
    return 'green';
}

function formatDaysRemaining(days) {
    if (days < 0) {
        const overdue = Math.abs(days);
        return `OVERDUE by ${overdue} day${overdue !== 1 ? 's' : ''}`;
    } else if (days === 0) {
        return 'Due today';
    } else if (days === 1) {
        return 'Tomorrow';
    } else {
        return `${days} days remaining`;
    }
}

// ============================================
// Task Rendering
// ============================================

function renderTasks() {
    const taskList = document.getElementById('taskList');
    const tasks = getTasks();

    if (tasks.length === 0) {
        taskList.innerHTML = `
            <div class="empty-state">
                <h3>No tasks yet</h3>
                <p>Click "Add Task" to start tracking your home maintenance items.</p>
            </div>
        `;
        return;
    }

    // Sort tasks by urgency (most urgent first)
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

        // Calculate percentage remaining for timeline bar
        const percentRemaining = Math.max(0, Math.min(100, (task.daysRemaining / task.lifespanDays) * 100));

        // Different button for predicted vs fixed tasks
        const isPredicted = task.scheduleType === 'predicted';
        const actionButton = isPredicted
            ? `<button class="btn btn-done btn-small" onclick="recordTaskCompletion('${task.id}')">Record</button>`
            : `<button class="btn btn-done btn-small" onclick="markTaskDone('${task.id}')">Done</button>`;

        // Show prediction info for predicted tasks
        const predictionInfo = isPredicted && task.completionHistory && task.completionHistory.length >= 2
            ? `<span class="prediction-badge">~${task.lifespanDays}d avg</span>`
            : '';

        // Add asterisk for predicted tasks
        const taskNameDisplay = isPredicted ? `${escapeHtml(task.name)} *` : escapeHtml(task.name);

        // Generate day tick marks (limit to 30 for readability)
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
                    <button class="btn btn-edit btn-small" onclick="editTask('${task.id}')">Edit</button>
                    <button class="btn btn-delete btn-small" onclick="confirmDeleteTask('${task.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Task CRUD Operations
// ============================================

function addTask(taskData) {
    const tasks = getTasks();
    const newTask = {
        id: generateId(),
        ...taskData,
        createdAt: new Date().toISOString()
    };
    tasks.push(newTask);
    saveTasks(tasks);
    renderTasks();
}

function updateTask(taskId, taskData) {
    const tasks = getTasks();
    const index = tasks.findIndex(t => t.id === taskId);
    if (index !== -1) {
        tasks[index] = { ...tasks[index], ...taskData };
        saveTasks(tasks);
        renderTasks();
    }
}

function deleteTask(taskId) {
    const tasks = getTasks();
    const filtered = tasks.filter(t => t.id !== taskId);
    saveTasks(filtered);
    renderTasks();
}

function markTaskDone(taskId) {
    const today = new Date().toISOString().split('T')[0];
    updateTask(taskId, { lastServiced: today });
}

function recordTaskCompletion(taskId) {
    const tasks = getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const now = new Date();
    const timeStr = formatTime(now.getHours(), now.getMinutes());
    const dateStr = now.toISOString().split('T')[0];

    showConfirm(`Record ${task.name} completed at ${timeStr}?`, () => {
        const completionHistory = task.completionHistory || [];
        completionHistory.push(now.toISOString());

        // Keep only last 20 completions
        if (completionHistory.length > 20) {
            completionHistory.shift();
        }

        updateTask(taskId, { completionHistory });
    }, 'Record');
}

function editTask(taskId) {
    const tasks = getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        document.getElementById('modalTitle').textContent = 'Edit Task';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskName').value = task.name;
        document.getElementById('taskCategory').value = task.category;

        // Handle schedule type
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
}

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

        // Show history section only when editing an existing task
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

    // Sort by date, most recent first
    const sorted = [...history].sort((a, b) => new Date(b) - new Date(a));

    historyList.innerHTML = sorted.map((timestamp, index) => {
        const date = new Date(timestamp);
        const dateStr = date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const timeStr = formatTime(date.getHours(), date.getMinutes());

        return `
            <div class="history-item" data-timestamp="${timestamp}">
                <span class="history-item-date">${dateStr} at ${timeStr}</span>
                <button type="button" class="history-item-delete" onclick="deleteHistoryEntry('${timestamp}')" title="Delete">&times;</button>
            </div>
        `;
    }).join('');
}

function deleteHistoryEntry(timestamp) {
    const taskId = document.getElementById('taskId').value;
    if (!taskId) return;

    const tasks = getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.completionHistory) return;

    // Remove the entry
    task.completionHistory = task.completionHistory.filter(t => t !== timestamp);

    // Save and re-render
    const index = tasks.findIndex(t => t.id === taskId);
    tasks[index] = task;
    saveTasks(tasks);

    renderCompletionHistory(task.completionHistory);
    renderTasks();
}

function clearCompletionHistory() {
    const taskId = document.getElementById('taskId').value;
    if (!taskId) return;

    showConfirm('Clear all completion history for this task?', () => {
        const tasks = getTasks();
        const index = tasks.findIndex(t => t.id === taskId);
        if (index !== -1) {
            tasks[index].completionHistory = [];
            saveTasks(tasks);
            renderCompletionHistory([]);
            renderTasks();
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

function confirmDeleteTask(taskId) {
    pendingDeleteId = taskId;
    showConfirm('Are you sure you want to delete this task?', () => {
        deleteTask(pendingDeleteId);
        pendingDeleteId = null;
    }, 'Delete');
}

function resetForm() {
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    document.getElementById('modalTitle').textContent = 'Add New Task';
    // Set default date to today
    document.getElementById('lastServiced').value = new Date().toISOString().split('T')[0];
    // Reset to fixed schedule view
    document.getElementById('scheduleType').value = 'fixed';
    updateScheduleFields('fixed', null);
    // Clear history display
    document.getElementById('historyList').innerHTML = '<p class="history-empty">No completions recorded yet.</p>';
}

// ============================================
// Trash Truck Prediction
// ============================================

function recordTrashArrival() {
    const now = new Date();
    const timeStr = formatTime(now.getHours(), now.getMinutes());

    showConfirm(`Record truck arrival at ${timeStr}?`, () => {
        const times = getTrashTimes();

        times.push({
            date: now.toISOString().split('T')[0],
            time: now.toTimeString().split(' ')[0].substring(0, 5),
            timestamp: now.toISOString()
        });

        // Keep only last 10 recordings
        if (times.length > 10) {
            times.shift();
        }

        saveTrashTimes(times);
        renderTrashPrediction();
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

    return {
        hours: avgHours,
        minutes: avgMins,
        formatted: formatTime(avgHours, avgMins)
    };
}

function formatTime(hours, minutes) {
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMins = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMins} ${period}`;
}

function getNextFriday(avgTime) {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 5 = Friday
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;

    // If today is Friday, check if we're past the predicted time
    if (daysUntilFriday === 0 && avgTime) {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const predictedMinutes = avgTime.hours * 60 + avgTime.minutes;
        if (currentMinutes > predictedMinutes) {
            daysUntilFriday = 7; // Next Friday
        }
    }

    // If it's Saturday or Sunday, also go to next Friday
    if (daysUntilFriday === 0 && dayOfWeek !== 5) {
        daysUntilFriday = 7;
    }

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

    if (!times || times.length < 2) {
        graphDiv.innerHTML = '';
        return;
    }

    // Sort times
    const now = new Date();
    const recentTimes = [...times].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Graph dimensions
    const width = 600;
    const height = 180;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    // Use calendar year for x-axis (Jan 1 to Dec 31)
    const year = now.getFullYear();

    // Helper to get day of year (1-365)
    const getDayOfYear = (date) => {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    };

    // Convert times to minutes for easier calculation
    const dataPoints = recentTimes.map(t => {
        const [hours, minutes] = t.time.split(':').map(Number);
        const date = new Date(t.date);
        return {
            date: t.date,
            dateObj: date,
            dayOfYear: getDayOfYear(date),
            minutes: hours * 60 + minutes,
            label: formatTime(hours, minutes)
        };
    });

    // Calculate min/max for Y axis (time) with 30 min padding
    const allMinutes = dataPoints.map(d => d.minutes);
    const avgMinutes = avgTime.hours * 60 + avgTime.minutes;
    allMinutes.push(avgMinutes);
    const minTime = Math.min(...allMinutes) - 30;
    const maxTime = Math.max(...allMinutes) + 30;
    const timeRange = maxTime - minTime;

    // Scale functions - x based on day of year (1-365), always Jan to Dec
    const xScale = (dayOfYear) => {
        return padding.left + ((dayOfYear - 1) / 364) * graphWidth;
    };
    const yScale = (minutes) => padding.top + graphHeight - ((minutes - minTime) / timeRange) * graphHeight;

    // Build the line path
    const linePath = dataPoints.map((d, i) => {
        const x = xScale(d.dayOfYear);
        const y = yScale(d.minutes);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    // Y-axis labels (times)
    const yAxisLabels = [];
    const numYLabels = 4;
    for (let i = 0; i <= numYLabels; i++) {
        const minutes = minTime + (timeRange * i / numYLabels);
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        yAxisLabels.push({
            y: yScale(minutes),
            label: formatTime(hours, mins)
        });
    }

    // Predicted time line Y position
    const predictedY = yScale(avgMinutes);

    // Build SVG
    const svg = `
        <svg width="100%" viewBox="0 0 ${width} ${height}" class="arrival-graph">
            <!-- Grid lines -->
            ${yAxisLabels.map(l => `
                <line x1="${padding.left}" y1="${l.y}" x2="${width - padding.right}" y2="${l.y}" class="grid-line" />
            `).join('')}

            <!-- Predicted time dashed line -->
            <line x1="${padding.left}" y1="${predictedY}" x2="${width - padding.right}" y2="${predictedY}" class="predicted-line" />
            <text x="${width - padding.right + 5}" y="${predictedY + 4}" class="predicted-label">avg</text>

            <!-- Data line -->
            <path d="${linePath}" class="data-line" />

            <!-- Data points -->
            ${dataPoints.map((d, i) => `
                <circle cx="${xScale(d.dayOfYear)}" cy="${yScale(d.minutes)}" r="3" class="data-point">
                    <title>${d.date}: ${d.label}</title>
                </circle>
            `).join('')}

            <!-- Y-axis labels -->
            ${yAxisLabels.map(l => `
                <text x="${padding.left - 5}" y="${l.y + 4}" class="y-label">${l.label}</text>
            `).join('')}

            <!-- X-axis labels - always Jan to Dec, positioned by day of year -->
            ${(() => {
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return monthNames.map((name, month) => {
                    const date = new Date(year, month, 1);
                    const dayOfYear = getDayOfYear(date);
                    const x = xScale(dayOfYear);
                    return `<text x="${x}" y="${height - 5}" class="x-label">${name}</text>`;
                }).join('');
            })()}
        </svg>
    `;

    graphDiv.innerHTML = svg;
}

function renderTrashPrediction() {
    const times = getTrashTimes();
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
    const fridayStr = formatDate(nextFriday);

    predictionDiv.innerHTML = `
        <div class="prediction-time">${fridayStr} ~${avgTime.formatted}</div>
        <div class="prediction-note">Based on ${times.length} recorded arrival${times.length !== 1 ? 's' : ''}</div>
    `;

    // Render the arrival time graph
    renderTrashGraph(times, avgTime);

    // Show recent history with edit/delete buttons
    const recentTimes = [...times].reverse().slice(0, 10);
    historyDiv.innerHTML = `
        <h4>Recent Arrivals</h4>
        <div class="trash-history-list">
            ${recentTimes.map((t, i) => {
                // Find the actual index in the original array
                const actualIndex = times.length - 1 - i;
                return `
                    <div class="trash-history-item" data-index="${actualIndex}">
                        <span class="trash-history-date">${t.date}: ${formatTime(...t.time.split(':').map(Number))}</span>
                        <div class="trash-history-actions">
                            <button class="trash-history-edit" onclick="editTrashEntry(${actualIndex})" title="Edit">&#9998;</button>
                            <button class="trash-history-delete" onclick="deleteTrashEntry(${actualIndex})" title="Delete">&times;</button>
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

function openAddTrashEntryModal() {
    document.getElementById('trashModalTitle').textContent = 'Add Arrival';
    document.getElementById('trashArrivalIndex').value = '';
    // Default to today's date and current time
    const now = new Date();
    document.getElementById('trashArrivalDate').value = now.toISOString().split('T')[0];
    document.getElementById('trashArrivalTime').value = now.toTimeString().split(' ')[0].substring(0, 5);
    showModal('trashArrivalModal');
}

function editTrashEntry(index) {
    const times = getTrashTimes();
    if (index < 0 || index >= times.length) return;

    const entry = times[index];
    document.getElementById('trashModalTitle').textContent = 'Edit Arrival';
    document.getElementById('trashArrivalIndex').value = index;
    document.getElementById('trashArrivalDate').value = entry.date;
    document.getElementById('trashArrivalTime').value = entry.time;
    showModal('trashArrivalModal');
}

function deleteTrashEntry(index) {
    showConfirm('Delete this arrival record?', () => {
        const times = getTrashTimes();
        if (index >= 0 && index < times.length) {
            times.splice(index, 1);
            saveTrashTimes(times);
            renderTrashPrediction();
        }
    }, 'Delete');
}

function saveTrashEntry() {
    const indexStr = document.getElementById('trashArrivalIndex').value;
    const date = document.getElementById('trashArrivalDate').value;
    const time = document.getElementById('trashArrivalTime').value;

    if (!date || !time) return;

    const times = getTrashTimes();
    const entry = {
        date: date,
        time: time,
        timestamp: new Date(`${date}T${time}`).toISOString()
    };

    if (indexStr !== '') {
        // Editing existing entry
        const index = parseInt(indexStr);
        if (index >= 0 && index < times.length) {
            times[index] = entry;
        }
    } else {
        // Adding new entry
        times.push(entry);
        // Sort by date
        times.sort((a, b) => new Date(a.date) - new Date(b.date));
        // Keep only last 52 recordings
        while (times.length > 52) {
            times.shift();
        }
    }

    saveTrashTimes(times);
    hideModal('trashArrivalModal');
    renderTrashPrediction();
}

// ============================================
// Event Listeners
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Load saved preferences
    const darkModeToggle = document.getElementById('darkModeToggle');

    if (localStorage.getItem('homeDashboardDarkMode') === 'true') {
        document.body.classList.add('dark-mode');
        darkModeToggle.checked = true;
    }

    // Initial render
    renderTasks();
    renderTrashPrediction();
    checkBackupReminder();

    // Auto-refresh every minute
    setInterval(() => {
        renderTasks();
    }, 60000);

    // Dark mode toggle
    darkModeToggle.addEventListener('change', function() {
        document.body.classList.toggle('dark-mode', this.checked);
        localStorage.setItem('homeDashboardDarkMode', this.checked);
    });

    // Schedule type toggle
    document.getElementById('scheduleType').addEventListener('change', function() {
        const taskId = document.getElementById('taskId').value;
        updateScheduleFields(this.value, taskId || null);
    });

    // Add Task button
    document.getElementById('addTaskBtn').addEventListener('click', function() {
        resetForm();
        showModal('taskModal');
    });

    // Close modal buttons
    document.getElementById('closeModal').addEventListener('click', function() {
        hideModal('taskModal');
    });

    document.getElementById('cancelBtn').addEventListener('click', function() {
        hideModal('taskModal');
    });

    // Clear history button
    document.getElementById('clearHistoryBtn').addEventListener('click', clearCompletionHistory);

    // Task form submission
    document.getElementById('taskForm').addEventListener('submit', function(e) {
        e.preventDefault();

        const scheduleType = document.getElementById('scheduleType').value;
        const taskData = {
            name: document.getElementById('taskName').value.trim(),
            category: document.getElementById('taskCategory').value,
            scheduleType: scheduleType
        };

        if (scheduleType === 'fixed') {
            taskData.lifespanValue = parseInt(document.getElementById('lifespanValue').value);
            taskData.lifespanUnit = document.getElementById('lifespanUnit').value;
            taskData.lastServiced = document.getElementById('lastServiced').value;
        } else {
            taskData.expectedInterval = parseInt(document.getElementById('expectedInterval').value);
            taskData.expectedIntervalUnit = document.getElementById('expectedIntervalUnit').value;
            // Initialize with current time as first completion if new task
            const taskId = document.getElementById('taskId').value;
            if (!taskId) {
                taskData.completionHistory = [new Date().toISOString()];
            }
        }

        const taskId = document.getElementById('taskId').value;

        if (taskId) {
            updateTask(taskId, taskData);
        } else {
            addTask(taskData);
        }

        hideModal('taskModal');
    });

    // Confirmation modal
    document.getElementById('confirmNo').addEventListener('click', function() {
        pendingConfirmAction = null;
        hideModal('confirmModal');
    });

    document.getElementById('confirmYes').addEventListener('click', function() {
        if (pendingConfirmAction) {
            pendingConfirmAction();
            pendingConfirmAction = null;
        }
        hideModal('confirmModal');
    });

    // Record trash arrival
    document.getElementById('recordTrashBtn').addEventListener('click', recordTrashArrival);

    // Add trash entry manually
    document.getElementById('addTrashEntryBtn').addEventListener('click', openAddTrashEntryModal);

    // Trash arrival modal
    document.getElementById('closeTrashModal').addEventListener('click', function() {
        hideModal('trashArrivalModal');
    });

    document.getElementById('cancelTrashArrival').addEventListener('click', function() {
        hideModal('trashArrivalModal');
    });

    document.getElementById('trashArrivalForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveTrashEntry();
    });

    // Export data
    document.getElementById('exportDataBtn').addEventListener('click', function(e) {
        e.preventDefault();
        exportData();
    });

    // Import data
    document.getElementById('importDataBtn').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('importFileInput').click();
    });

    document.getElementById('importFileInput').addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            importData(e.target.files[0]);
            e.target.value = ''; // Reset so same file can be selected again
        }
    });

    // Backup reminder buttons
    document.getElementById('backupNowBtn').addEventListener('click', function(e) {
        e.preventDefault();
        exportData();
    });

    document.getElementById('dismissReminder').addEventListener('click', function() {
        hideBackupReminder();
    });

    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                pendingConfirmAction = null;
                this.classList.add('hidden');
            }
        });
    });

    // Close modals on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            pendingConfirmAction = null;
            document.querySelectorAll('.modal').forEach(modal => {
                modal.classList.add('hidden');
            });
        }
    });
});
