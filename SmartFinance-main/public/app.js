const state = {
    currentTab: 'dashboard',
    currentMonth: getCurrentMonth(),
    transactionsPage: 1,
    transactionsLimit: 10,
    categories: [],
    metrics: {},
    transactions: [],
    recentTransactions: [],
    budgets: [],
    expenseByCategory: [],
    trend: [],
    alerts: [],
    selectedExpenseCategory: null,
    supportRequests: [],
    transactionType: 'expense',
    editingTransactionId: null,
    selectedCategoryFilter: null,
    searchQuery: '',
    predictions: [],
    categoryHistory: [],
    user: { name: 'Irfan', email: 'irfan@example.com' },
    settings: null,
    notifications: []
};

let budgetMonth = getCurrentMonth();
let lastSummary = null;
let refreshAbortController = null;
const roastCache = {};
window.__SF_DEBUG__ = true;

function debugLog(...args) {
    if (!window.__SF_DEBUG__) return;
    console.log('[SmartFinance]', ...args);
}

function debounce(fn, wait = 120) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), wait);
    };
}

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(Number(year), Number(month) - 1, 1));
}

function formatDate(dateStr, long = false) {
    const date = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateStr || '';
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: long ? 'long' : 'short', year: long ? 'numeric' : undefined }).format(date);
}

function formatCurrency(amount) {
    return `Rs. ${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="material-symbols-outlined">${type === 'error' ? 'error' : 'check_circle'}</span><span>${escapeHtml(message)}</span><button class="toast-close" type="button" aria-label="Dismiss">×</button>`;
    toast.querySelector('button').addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
}

async function apiCall(endpoint, options = {}) {
    const response = await fetch(`/api${endpoint}`, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        throw new Error(`Expected JSON from ${endpoint}`);
    }
    const result = await response.json();
    if (!response.ok || result.success === false) throw new Error(result.error || 'Request failed');
    return result.data ?? result;
}

const fetchCategories = () => apiCall('/categories');
const fetchSummary = month => apiCall(`/summary?month=${month}`);
const fetchRecentTransactions = (limit = 5) => apiCall(`/recent-transactions?limit=${limit}`);
const fetchExpenseByCategory = month => apiCall(`/expense-by-category?month=${month}`);
const fetchBudgetHealth = month => apiCall(`/budget-health?month=${month}`);
const fetchTrendData = (months = 6) => apiCall(`/trend?months=${months}`);
const createTransaction = data => apiCall('/transactions', { method: 'POST', body: JSON.stringify(data) });
const updateTransaction = (id, data) => apiCall(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
const deleteTransaction = id => apiCall(`/transactions/${id}`, { method: 'DELETE' });
const createBudget = data => apiCall('/budgets', { method: 'POST', body: JSON.stringify(data) });
const fetchSettings = () => apiCall('/settings');
const updateSettingsApi = data => apiCall('/settings', { method: 'PUT', body: JSON.stringify(data) });
const updateUserApi = data => apiCall('/user', { method: 'PUT', body: JSON.stringify(data) });
const fetchCategoryHistory = (months = 6) => apiCall(`/category-history?months=${months}`);
const fetchNotifications = () => apiCall(`/notifications?month=${state.currentMonth}`);
const markNotificationsRead = () => apiCall('/notifications/read', { method: 'POST', body: '{}' });
const fetchSupportRequests = () => apiCall('/support');
const createSupportRequest = data => apiCall('/support', { method: 'POST', body: JSON.stringify(data) });

async function fetchTransactions(month, page = 1, categoryId = null, limit = state.transactionsLimit) {
    let url = `/transactions?month=${month}&page=${page}&limit=${limit}`;
    if (categoryId) url += `&category_id=${categoryId}`;
    return apiCall(url);
}

async function fetchPredictiveAlerts(force = false) {
    const cacheKey = `sf-predictions-${getCurrentMonth()}`;
    if (!force) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const { date, data } = JSON.parse(cached);
            if (date === new Date().toDateString()) return data;
        }
    }
    try {
        const data = await apiCall('/predict-alerts');
        localStorage.setItem(cacheKey, JSON.stringify({ date: new Date().toDateString(), data }));
        return data;
    } catch (error) {
        return [];
    }
}

async function streamChatMessage(message, onDelta) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, month: state.currentMonth, stream: true }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const result = await response.json().catch(() => null);
            throw new Error(result?.error || `Server error ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;
            if (typeof onDelta === 'function') onDelta(chunk);
        }
        return fullText;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') throw new Error('Request timed out.');
        throw err;
    }
}

function applyTheme(theme, persist = true) {
    const resolved = theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0b1220' : '#F8FAFC');
    const label = document.getElementById('themeToggleLabel');
    if (label) label.textContent = resolved === 'dark' ? 'Light mode' : 'Dark mode';
    if (persist) localStorage.setItem('sf-theme', resolved);
    window.updateChartTheme?.();
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-tab, .mobile-nav-tab').forEach(btn => {
        btn.classList.remove('active');
        btn.style.color = '';
    });
    document.querySelectorAll(`[data-tab="${tabId}"]`).forEach(btn => {
        btn.classList.add('active');
    });
    document.querySelectorAll('.screen').forEach(panel => {
        panel.classList.remove('active');
        panel.style.opacity = '';
        panel.style.transform = '';
        panel.style.transition = '';
    });
    const panel = document.getElementById(`${tabId}-panel`);
    if (panel) panel.classList.add('active');

    document.getElementById('profileMenu')?.classList.add('hidden');
    document.getElementById('profileToggle')?.setAttribute('aria-expanded', 'false');
    state.currentTab = tabId;
    debugLog('switch tab', tabId);
    showTabSkeletons(tabId);
    loadTabData(tabId);
    seedAnimateTargets();
    runScreenAnimations();
    window.resizeChartsForTab?.(tabId);
}

function showTabSkeletons(tabId) {
    if (tabId === 'transactions') setSkeleton('transactionsList', 4);
    if (tabId === 'budgets') setSkeleton('budgetCards', 3);
    if (tabId === 'dashboard') setSkeleton('recentTransactions', 3);
    if (tabId === 'notifications') setSkeleton('notificationsList', 4);
    if (tabId === 'support') setSkeleton('supportRequests', 3);
}

async function loadTabData(tabName) {
    try {
        if (tabName === 'dashboard') await loadDashboard();
        if (tabName === 'transactions') await loadTransactions();
        if (tabName === 'budgets') await loadBudgets();
        if (tabName === 'analytics') await loadAnalytics();
        if (tabName === 'support') await loadSupport();
        if (tabName === 'notifications') await loadNotifications();
        if (tabName === 'settings') await loadSettingsScreen();
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Something went wrong', 'error');
    }
}

function normalizeTransaction(tx) {
    const type = tx.category_type || tx.type || 'expense';
    return {
        ...tx,
        type,
        category: tx.category_name || tx.category || 'Uncategorised',
        amount: Number(tx.amount || 0)
    };
}

function normalizeBudget(budget) {
    return {
        ...budget,
        category: budget.category_name || budget.category || 'Budget',
        limit: Number(budget.budget_amount ?? budget.limit ?? 0),
        spent: Number(budget.spent_amount ?? budget.spent ?? 0)
    };
}

async function refreshFinancialState({ reason = 'manual', month = state.currentMonth, includeSupport = false, includeSettings = false } = {}) {
    if (refreshAbortController) refreshAbortController.abort();
    refreshAbortController = new AbortController();
    const signal = refreshAbortController.signal;

    debugLog('refresh pipeline start', { reason, month });
    const [summary, fullTxResult, recentTx, expenseData, trendData, budgets, notifications, catHistory, settings, supportRequests] = await Promise.all([
        fetchSummary(month).catch(() => state.metrics),
        fetchTransactions(month, 1, null, 50).catch(() => ({ transactions: [], total: 0, page: 1, limit: 50 })),
        fetchRecentTransactions(5).catch(() => []),
        fetchExpenseByCategory(month).catch(() => []),
        fetchTrendData(6).catch(() => []),
        fetchBudgetHealth(month).catch(() => []),
        fetchNotifications().catch(() => state.notifications),
        fetchCategoryHistory(6).catch(() => []),
        includeSettings ? fetchSettings().catch(() => state.settings) : Promise.resolve(state.settings),
        includeSupport ? fetchSupportRequests().catch(() => state.supportRequests) : Promise.resolve(state.supportRequests)
    ]);

    if (signal.aborted) return;

    state.metrics = summary || {};
    state.transactions = (fullTxResult.transactions || []).map(normalizeTransaction);
    state.recentTransactions = (recentTx || []).map(normalizeTransaction);
    state.expenseByCategory = Array.isArray(expenseData) ? expenseData : [];
    state.trend = Array.isArray(trendData) ? trendData : [];
    state.budgets = (budgets || []).map(normalizeBudget);
    state.categoryHistory = Array.isArray(catHistory) ? catHistory : [];
    state.notifications = Array.isArray(notifications) ? notifications : [];
    state.settings = settings;
    state.supportRequests = Array.isArray(supportRequests) ? supportRequests : state.supportRequests;
    lastSummary = state.metrics;

    if (signal.aborted) return;

    refreshMetrics();
    renderWatchlist(state.expenseByCategory);
    renderBudgetSpark(state.budgets);
    renderRecentTransactions(state.recentTransactions);
    renderNotifications(state.notifications);
    document.getElementById('notificationDot')?.classList.toggle('is-empty', !state.notifications.some(n => !n.is_read));
    if (includeSupport || state.currentTab === 'support') renderSupportRequests(state.supportRequests);
    if (includeSettings || state.currentTab === 'settings') fillSettingsForm(state.settings || {});
    refreshBudgets();
    refreshAlerts();
    refreshAnalytics();
    refreshCharts();
    if (state.currentTab === 'transactions') renderTransactionsPage();

    window.updateExpenseBreakdown?.(state.selectedExpenseCategory);
    debugLog('refresh pipeline complete', {
        reason,
        transactions: state.transactions.length,
        budgets: state.budgets.length,
        alerts: state.alerts.length
    });
}

const debouncedRefreshFinancialState = debounce(refreshFinancialState, 120);

function refreshMetrics() {
    renderSummary(state.metrics);
}

function refreshCharts() {
    debugLog('chart refresh requested');
    try {
        window.updateDashboardCharts?.(state.expenseByCategory, state.trend);
        window.updateAnalyticsCharts?.(state.trend, state.expenseByCategory);
    } catch (error) {
        console.error('Chart refresh failed:', error);
    }
}

function refreshBudgets() {
    renderBudgetHero(state.budgets);
    if (state.currentTab === 'budgets') {
        window.updateBudgetChart?.(state.expenseByCategory, state.budgets);
        renderBudgetCards(state.budgets);
    }
}

function refreshAnalytics() {
    const total = state.expenseByCategory.reduce((sum, item) => sum + Number(item.total || 0), 0);
    setText('analyticsTotalSpend', formatCurrency(total));
    renderTopCategories(state.expenseByCategory.slice(0, 5));
    renderAnalyticsInsight(state.expenseByCategory, state.trend);
}

async function loadDashboard() {
    setSkeleton('recentTransactions', 4);
    await refreshFinancialState({ reason: 'dashboard load' });
    loadPredictiveAlerts();
}

function renderSummary(summary = {}) {
    const totalIncome = Number(summary.total_income || 0);
    const totalExpense = Number(summary.total_expense || 0);
    const savings = Number(summary.savings || (totalIncome - totalExpense));
    const savingsRate = totalIncome ? Math.round((savings / totalIncome) * 100) : 0;
    const expenseRatio = totalIncome ? Math.min(100, Math.round((totalExpense / totalIncome) * 100)) : 0;
    const health = Math.max(0, Math.min(100, 100 - expenseRatio + Math.max(0, savingsRate)));

    setText('totalIncome', formatCurrency(totalIncome));
    setText('totalExpense', formatCurrency(totalExpense));
    setText('netSavings', formatCurrency(savings));
    setText('savingsRate', `Savings rate ${savingsRate}%`);
    setText('healthScore', Math.round(health));
    setText('healthLabel', health >= 75 ? 'Excellent' : health >= 50 ? 'Stable' : 'Needs attention');
    const fill = document.getElementById('healthFill');
    if (fill) fill.style.width = `${Math.round(health)}%`;
}

function renderWatchlist(expenseData = []) {
    const container = document.getElementById('watchlistCards');
    if (!container) return;
    const top = expenseData.slice(0, 3);
    if (top.length === 0) {
        container.innerHTML = '<div class="empty-state">No expense watchlist yet.</div>';
        return;
    }

    const months = [...new Set(state.categoryHistory.map(h => h.month))].sort();
    const perCategoryHistory = {};
    for (const entry of state.categoryHistory) {
        if (!perCategoryHistory[entry.category_name]) {
            perCategoryHistory[entry.category_name] = {};
        }
        perCategoryHistory[entry.category_name][entry.month] = Number(entry.total_amount || 0);
    }

    container.innerHTML = top.map((item, idx) => {
        const hist = perCategoryHistory[item.name] || {};
        const values = months.map(m => hist[m] || 0);
        const maxVal = Math.max(...values, 1);
        const color = item.color || '#fe6b00';
        return `
        <article class="watch-card">
            <div class="flexish">
                <div class="avatar" style="color:${color}">${item.icon || '₹'}</div>
                <div><span>${escapeHtml(item.name)}</span><strong>${formatCurrency(item.total)}</strong></div>
            </div>
            <canvas class="watch-sparkline" data-values="${escapeHtml(values.join(','))}" data-max="${maxVal}" data-color="${color}" width="80" height="36"></canvas>
        </article>`;
    }).join('');

    requestAnimationFrame(() => {
        container.querySelectorAll('.watch-sparkline').forEach(canvas => {
            const raw = canvas.dataset.values.split(',').map(Number);
            const max = Number(canvas.dataset.max) || 1;
            const color = canvas.dataset.color || '#fe6b00';
            drawMiniAreaChart(canvas, raw, max, color);
        });
    });
}

function drawMiniAreaChart(canvas, values, maxVal, color) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const pad = 2;
    const drawW = w - pad * 2;
    const drawH = h - pad * 2;

    ctx.clearRect(0, 0, w, h);

    if (values.length < 2 || values.every(v => v === 0)) {
        ctx.fillStyle = 'rgba(128,128,128,0.3)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('—', w / 2, h / 2 + 3);
        return;
    }

    const points = [];
    const stepX = drawW / (values.length - 1);
    for (let i = 0; i < values.length; i++) {
        const x = pad + i * stepX;
        const y = pad + drawH - (values[i] / maxVal) * drawH;
        points.push({ x, y, v: values[i] });
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.lineTo(points[points.length - 1].x, pad + drawH);
    ctx.lineTo(points[0].x, pad + drawH);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, pad, 0, pad + drawH);
    gradient.addColorStop(0, hexToRGBA(color, 0.35));
    gradient.addColorStop(1, hexToRGBA(color, 0.02));
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

function renderBudgetSpark(budgets = []) {
    const container = document.getElementById('budgetSpark');
    if (!container) return;
    const items = budgets.slice(0, 6);
    container.innerHTML = items.length ? items.map(item => {
        const pct = item.budget_amount ? Math.min(100, Math.round((item.spent_amount / item.budget_amount) * 100)) : 0;
        const remainingPct = Math.max(0, 100 - pct);
        const spent = formatCurrency(item.spent_amount);
        const limit = formatCurrency(item.budget_amount);
        const tooltipText = `${escapeHtml(item.category_name)}: ${pct}% (${spent}/${limit})`;
        return `<div class="bar-container"><span class="bar-tooltip">${tooltipText}</span><span class="bar-top" style="flex-grow: ${remainingPct}"></span><span class="bar-bottom" style="flex-grow: ${pct}"></span></div>`;
    }).join('') : '<div class="empty-state">No budgets yet.</div>';
}

async function loadPredictiveAlerts(force = false) {
    const alerts = await fetchPredictiveAlerts(force);
    state.predictions = alerts;
    refreshAlerts();
    if (force) showToast('Alerts refreshed');
}

function calculateBudgetPressure() {
    if (!state.budgets || !state.transactions) return [];
    const alerts = [];
    for (const budget of state.budgets) {
        const spent = state.transactions
            .filter(t => t.type === 'expense' && t.category === budget.category)
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const limit = Number(budget.limit || 0);
        const usage = limit > 0 ? (spent / limit) * 100 : 0;
        let risk = 'low';
        if (usage >= 100) risk = 'critical';
        else if (usage >= 85) risk = 'high';
        else if (usage >= 70) risk = 'medium';
        if (usage >= 70) alerts.push({ category: budget.category, spent, limit, usage, risk });
    }
    debugLog('[Budget Alerts]', alerts.map(a => ({ category: a.category, usage: Number(a.usage.toFixed(1)), risk: a.risk })));
    return alerts;
}

function refreshAlerts() {
    const localAlerts = calculateBudgetPressure();
    const supplemental = (state.predictions || []).map(alert => ({
        category: alert.category,
        predicted_total: Number(alert.predicted_total || 0),
        reason: alert.reason,
        risk: alert.risk || 'medium',
        isAi: true
    }));
    state.alerts = [...localAlerts, ...supplemental];
    renderAlertList(state.alerts);
}

function renderAlertList(alerts) {
    const container = document.getElementById('predictiveAlerts');
    if (!container) return;
    if (!alerts || alerts.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = alerts.map((alert, idx) => {
        const risk = alert.risk === 'critical' ? 'high' : alert.risk;
        const message = alert.isAi
            ? `${escapeHtml(alert.reason || 'AI risk signal detected.')} Predicted: ${formatCurrency(alert.predicted_total)}`
            : `${Math.round(alert.usage)}% used · ${formatCurrency(alert.spent)} of ${formatCurrency(alert.limit)}`;
        return `
        <div class="alert-banner alert-banner--${escapeHtml(risk)}" data-alert-idx="${idx}">
            <span class="material-symbols-outlined">${risk === 'high' ? 'warning' : 'info'}</span>
            <div><strong>${alert.isAi ? 'AI Budget Signal' : 'Budget Pressure'}: ${escapeHtml(alert.category)}</strong><p>${message}</p></div>
        </div>
    `;
    }).join('');
    setTimeout(() => {
        const banners = container.querySelectorAll('.alert-banner');
        banners.forEach((banner, i) => {
            setTimeout(() => {
                banner.classList.add('fade-out');
                setTimeout(() => banner.remove(), 400);
            }, i * 150);
        });
    }, 12000);
}

function renderRecentTransactions(transactions) {
    const container = document.getElementById('recentTransactions');
    if (!container) return;
    if (!transactions || transactions.length === 0) {
        container.innerHTML = emptyState(`No transactions in ${formatMonth(state.currentMonth)}`);
        return;
    }
    container.innerHTML = transactions.map(tx => transactionListRow(tx)).join('');
}

async function loadTransactions() {
    try {
        setText('currentMonth', formatMonth(state.currentMonth));
        await loadCategoryFilters();
        const result = await fetchTransactions(state.currentMonth, state.transactionsPage, state.selectedCategoryFilter);
        let transactions = result.transactions || [];
        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            transactions = transactions.filter(tx =>
                String(tx.description || '').toLowerCase().includes(q) ||
                String(tx.category_name || '').toLowerCase().includes(q)
            );
        }
        renderTransactions(transactions);
        renderPagination(result);
    } catch (error) {
        console.error('Failed to load transactions:', error);
        renderTransactions([]);
        showToast('Failed to load transactions', 'error');
    }
}

function renderTransactionsPage() {
    setText('currentMonth', formatMonth(state.currentMonth));
    let transactions = [...state.transactions];
    if (state.selectedCategoryFilter) {
        transactions = transactions.filter(t => t.category_id === state.selectedCategoryFilter);
    }
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        transactions = transactions.filter(tx =>
            String(tx.description || '').toLowerCase().includes(q) ||
            String(tx.category_name || '').toLowerCase().includes(q)
        );
    }
    const start = (state.transactionsPage - 1) * state.transactionsLimit;
    const page = transactions.slice(start, start + state.transactionsLimit);
    renderTransactions(page);
    renderPagination({ total: transactions.length, page: state.transactionsPage, limit: state.transactionsLimit });
}

async function loadCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    if (!container) return;
    if (state.categories.length === 0) state.categories = await fetchCategories();
    const expenseCategories = state.categories.filter(c => c.type === 'expense');
    container.innerHTML = `<button class="category-pill ${!state.selectedCategoryFilter ? 'active' : ''}" type="button" data-category="">All</button>` +
        expenseCategories.map(cat => `<button class="category-pill ${state.selectedCategoryFilter === cat.id ? 'active' : ''}" type="button" data-category="${cat.id}">${cat.icon || ''} ${escapeHtml(cat.name)}</button>`).join('');
    const transactionsList = document.getElementById('transactionsList');
    container.querySelectorAll('.category-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const newFilter = pill.dataset.category ? Number(pill.dataset.category) : null;
            if (state.selectedCategoryFilter === newFilter) return;
            if (transactionsList) {
                transactionsList.style.transition = 'opacity 0.3s ease';
                transactionsList.style.opacity = '0';
                setTimeout(() => {
                    state.selectedCategoryFilter = newFilter;
                    state.transactionsPage = 1;
                    loadTransactions().then(() => {
                        if (transactionsList) transactionsList.style.opacity = '1';
                    });
                }, 300);
            } else {
                state.selectedCategoryFilter = newFilter;
                state.transactionsPage = 1;
                loadTransactions();
            }
        });
        pill.addEventListener('dblclick', () => {
            if (transactionsList) {
                transactionsList.style.transition = 'opacity 0.3s ease';
                transactionsList.style.opacity = '0';
                setTimeout(() => {
                    state.selectedCategoryFilter = null;
                    state.transactionsPage = 1;
                    loadCategoryFilters();
                    loadTransactions().then(() => {
                        if (transactionsList) transactionsList.style.opacity = '1';
                    });
                }, 300);
            } else {
                state.selectedCategoryFilter = null;
                state.transactionsPage = 1;
                loadCategoryFilters();
                loadTransactions();
            }
        });
    });
}

function renderTransactions(transactions) {
    const container = document.getElementById('transactionsList');
    if (!container) return;
    if (!transactions || transactions.length === 0) {
        container.innerHTML = `<tr><td colspan="5">${emptyState('No transactions match this view.')}</td></tr>`;
    } else {
        container.innerHTML = transactions.map(tx => {
            const type = tx.category_type === 'income' ? 'income' : 'expense';
            return `
                <tr>
                    <td><div class="category-avatar" style="color:${tx.category_color || '#fe6b00'}">${tx.category_icon || '₹'}</div></td>
                    <td><div class="transaction-title">${escapeHtml(tx.description || tx.category_name || 'Transaction')}</div><div class="transaction-date">${escapeHtml(tx.category_name || '')} · ${formatDate(tx.date, true)}</div></td>
                    <td><span class="tag">${escapeHtml(type)}</span></td>
                    <td class="amount-cell"><strong class="${type}">${type === 'income' ? '+' : '-'}${formatCurrency(tx.amount)}</strong></td>
                    <td><div class="row-actions"><button class="mini-icon" type="button" onclick="openEditModal(${tx.id})" aria-label="Edit"><span class="material-symbols-outlined">edit</span></button><button class="mini-icon" type="button" onclick="deleteTx(${tx.id})" aria-label="Delete"><span class="material-symbols-outlined">delete</span></button></div></td>
                </tr>
            `;
        }).join('');
    }
    container.style.transition = 'opacity 0.2s ease';
    container.style.opacity = '1';
}

function transactionListRow(tx) {
    const type = tx.category_type === 'income' ? 'income' : 'expense';
    return `
        <div class="recent-row">
            <div class="category-avatar" style="color:${tx.category_color || '#fe6b00'}">${tx.category_icon || '₹'}</div>
            <div class="transaction-copy"><strong>${escapeHtml(tx.category_name || 'Uncategorised')}</strong><div class="transaction-date">${escapeHtml(tx.description || 'No description')} · ${formatDate(tx.date)}</div></div>
            <strong class="${type}">${type === 'income' ? '+' : '-'}${formatCurrency(tx.amount)}</strong>
        </div>
    `;
}

function renderPagination(result) {
    const totalPages = Math.max(1, Math.ceil((result.total || 0) / (result.limit || state.transactionsLimit)));
    setText('pageInfo', `Page ${result.page || 1} of ${totalPages}`);
    setDisabled('prevPage', (result.page || 1) <= 1);
    setDisabled('nextPage', (result.page || 1) >= totalPages);
}

function changeMonth(direction) {
    const [year, month] = state.currentMonth.split('-').map(Number);
    const next = new Date(year, month - 1 + direction, 1);
    state.currentMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    budgetMonth = state.currentMonth;
    state.transactionsPage = 1;
    state.selectedCategoryFilter = null;
    state.searchQuery = '';
    const searchInput = document.getElementById('transactionSearch');
    if (searchInput) searchInput.value = '';
    debugLog('month changed', state.currentMonth);

    setText('currentMonth', formatMonth(state.currentMonth));
    setText('budgetMonth', formatMonth(state.currentMonth));

    const list = document.getElementById('transactionsList');
    if (list) {
        list.style.transition = 'opacity 0.2s ease';
        list.style.opacity = '0';
    }
    setSkeleton('transactionsList', 4);
    debouncedRefreshFinancialState({ reason: 'month switch', month: state.currentMonth });
}

async function loadBudgets() {
    try {
        setText('budgetMonth', formatMonth(budgetMonth));
        if (budgetMonth !== state.currentMonth) {
            state.currentMonth = budgetMonth;
            state.transactionsPage = 1;
        }
        await refreshFinancialState({ reason: 'budget load', month: budgetMonth });
        renderBudgetCards(state.budgets);
        setTimeout(() => window.resizeBudgetChart?.(), 100);
    } catch (error) {
        console.error('Failed to load budgets:', error);
        showToast('Failed to load budget data', 'error');
    }
}

function renderBudgetHero(budgets = []) {
    const spent = budgets.reduce((sum, item) => sum + Number(item.spent_amount || 0), 0);
    const limit = budgets.reduce((sum, item) => sum + Number(item.budget_amount || 0), 0);
    const pct = limit ? Math.round((spent / limit) * 100) : 0;
    setText('budgetSpentTotal', formatCurrency(spent));
    setText('budgetLimitTotal', `/ ${formatCurrency(limit)} limit`);
    setText('budgetUtilized', `${pct}% utilized`);
    setText('budgetTrendLabel', pct >= 100 ? 'Over budget' : pct >= 80 ? 'Trending high' : 'On track');
    const fill = document.getElementById('budgetTotalFill');
    if (fill) fill.style.width = `${Math.min(100, pct)}%`;
    const risky = state.predictions?.[0];
    setText('budgetProjectionText', risky ? `${risky.category} may reach ${formatCurrency(risky.predicted_total)} this month.` : 'No high-risk category detected from current data.');
}

function renderBudgetCards(budgets) {
    const container = document.getElementById('budgetCards');
    if (!container) return;
    if (!budgets || budgets.length === 0) {
        container.innerHTML = emptyState(`No budgets set for ${formatMonth(budgetMonth)}.`);
        return;
    }
    container.innerHTML = budgets.map(budget => {
        const spent = Number(budget.spent_amount || 0);
        const cap = Number(budget.budget_amount || 0);
        const pct = cap ? Math.round((spent / cap) * 100) : 0;
        const status = pct >= 100 ? 'Exceeded' : pct >= 80 ? 'Warning' : 'On Track';
        const statusClass = pct >= 100 ? 'status-danger' : pct >= 80 ? 'status-warning' : 'status-good';
        const prediction = state.predictions.find(p => p.category === budget.category_name);
        return `
            <article class="card budget-card">
                <div class="budget-card-top">
                    <div class="category-avatar" style="color:${budget.category_color || '#fe6b00'}">${budget.category_icon || '₹'}</div>
                    <div><h2>${escapeHtml(budget.category_name || 'Budget')}</h2><span class="status-badge ${statusClass}">${status}</span></div>
                </div>
                <div class="budget-total-line"><strong>${formatCurrency(spent)}</strong><span>/ ${formatCurrency(cap)}</span></div>
                <div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, pct)}%; background:${pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--success)'}"></div></div>
                ${spent > cap ? `<p class="overspent">Overspent by ${formatCurrency(spent - cap)}</p>` : ''}
                ${prediction ? `<p class="muted">Predicted end: ${formatCurrency(prediction.predicted_total)}</p>` : ''}
            </article>
        `;
    }).join('');
}

function changeBudgetMonth(direction) {
    const [year, month] = budgetMonth.split('-').map(Number);
    const next = new Date(year, month - 1 + direction, 1);
    budgetMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    state.currentMonth = budgetMonth;
    state.transactionsPage = 1;
    state.selectedCategoryFilter = null;
    state.searchQuery = '';
    const searchInput = document.getElementById('transactionSearch');
    if (searchInput) searchInput.value = '';
    debugLog('budget month changed', budgetMonth);

    setText('currentMonth', formatMonth(state.currentMonth));
    setText('budgetMonth', formatMonth(state.currentMonth));

    debouncedRefreshFinancialState({ reason: 'budget month switch', month: budgetMonth });
}

async function loadAnalytics() {
    await refreshFinancialState({ reason: 'analytics load' });
}

function renderTopCategories(categories) {
    const container = document.getElementById('topCategories');
    const insight = document.getElementById('insightChip');
    if (!container) return;
    if (!categories || categories.length === 0) {
        container.innerHTML = emptyState('No spending pattern yet.');
        setText('insightChip', 'No category signal for this month yet');
        return;
    }
    const total = categories.reduce((sum, cat) => sum + Number(cat.total || 0), 0);
    const top = categories[0];
    const topPct = total ? Math.round((Number(top.total || 0) / total) * 100) : 0;
    if (insight) insight.textContent = `${top.icon || ''} ${top.name} is ${topPct}% of tracked spend`;
    container.innerHTML = categories.map((cat, index) => {
        const pct = total ? Math.round((Number(cat.total || 0) / total) * 100) : 0;
        return `<div class="top-category-row"><div class="rank-pill">${index + 1}</div><div class="category-avatar" style="color:${cat.color || '#fe6b00'}">${cat.icon || '₹'}</div><div class="top-copy"><strong>${escapeHtml(cat.name)}</strong><span class="muted">${pct}% of tracked spend</span><div class="inline-bar"><span style="width:${pct}%; background:${cat.color || 'var(--accent)'}"></span></div></div><strong>${formatCurrency(cat.total)}</strong></div>`;
    }).join('');
}

function renderAnalyticsInsight(categories, trendData) {
    const top = categories?.[0];
    if (!top) {
        setText('analyticsInsight', 'Add more expenses to receive a useful AI-style savings recommendation.');
        return;
    }
    const reduction = Math.max(50, Math.round(Number(top.total || 0) * 0.12));
    setText('analyticsInsight', `Reducing ${top.name} by ${formatCurrency(reduction)} this month would improve your savings buffer without changing fixed expenses.`);
}

async function loadNotifications(showErrors = true) {
    try {
        state.notifications = await fetchNotifications();
        renderNotifications(state.notifications);
        document.getElementById('notificationDot')?.classList.toggle('is-empty', !state.notifications.some(n => !n.is_read));
    } catch (error) {
        if (showErrors) throw error;
    }
}

function renderNotifications(notifications) {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    if (!notifications || notifications.length === 0) {
        container.innerHTML = emptyState('No activity notifications yet.');
        return;
    }
    container.innerHTML = notifications.map(item => `
        <article class="notification-item ${escapeHtml(item.type)}">
            <span class="material-symbols-outlined">${notificationIcon(item.type)}</span>
            <div><div class="muted">${escapeHtml(item.type)} · ${formatNotificationDate(item.created_at)}</div><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.message)}</p></div>
        </article>
    `).join('');
}

function notificationIcon(type) {
    return { danger: 'warning', warning: 'warning', transaction: 'receipt_long', income: 'payments', expense: 'shopping_bag', support: 'support_agent', settings: 'settings', profile: 'person' }[type] || 'notifications';
}

function formatNotificationDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || '';
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

async function loadSupport() {
    const requests = await fetchSupportRequests();
    state.supportRequests = requests;
    renderSupportRequests(requests);
}

function renderSupportRequests(requests) {
    const container = document.getElementById('supportRequests');
    if (!container) return;
    if (!requests || requests.length === 0) {
        container.innerHTML = emptyState('No support requests yet.');
        return;
    }
    container.innerHTML = requests.map(req => `<div class="notification-item"><span class="material-symbols-outlined">confirmation_number</span><div><h2>#${req.id} ${escapeHtml(req.subject)}</h2><p>${escapeHtml(req.category)} · ${escapeHtml(req.status)} · ${formatNotificationDate(req.created_at)}</p></div></div>`).join('');
}

async function loadSettingsScreen() {
    const [settings, cacheStatus] = await Promise.all([fetchSettings(), fetch('/api/cache/status').then(r => r.json()).catch(() => null)]);
    state.settings = settings;
    fillSettingsForm(settings);
    if (cacheStatus) {
        setText('cacheStatus', `Valkey connected: ${cacheStatus.connected ? 'yes' : 'no'} · Keys: ${cacheStatus.keyCount ?? 0} · Memory: ${cacheStatus.memoryUsed ?? 'unknown'}`);
    }
}

function fillSettingsForm(settings) {
    settings = settings || {};
    setValue('profileNameInput', state.user.name);
    setValue('profileEmailInput', state.user.email);
    setText('settingsProfileName', state.user.name);
    setText('settingsProfileEmail', state.user.email);
    setValue('settingTheme', settings.theme || document.documentElement.dataset.theme || 'light');
    setValue('settingGoal', settings.monthly_goal || 1000);
    setValue('settingThreshold', settings.alert_threshold || 80);
    setChecked('settingAI', Boolean(settings.ai_advisor_enabled));
    setChecked('settingOCR', Boolean(settings.receipt_scan_enabled));
}

function openTransactionModal(editId = null) {
    const modal = document.getElementById('transactionModal');
    if (!modal) return;
    if (editId) {
        state.editingTransactionId = editId;
        setText('modalTitle', 'Edit Transaction');
        loadTransactionForEdit(editId);
    } else {
        state.editingTransactionId = null;
        setText('modalTitle', 'Add Transaction');
        resetTransactionForm();
    }
    modal.classList.remove('hidden');
}

function closeTransactionModal() {
    document.getElementById('transactionModal')?.classList.add('hidden');
    state.editingTransactionId = null;
}

function resetTransactionForm() {
    document.getElementById('transactionForm')?.reset();
    state.transactionType = 'expense';
    setValue('date', new Date().toISOString().slice(0, 10));
    updateTypeButtons();
    populateCategorySelect('category');
    updateDescriptionCount();
    document.getElementById('receiptPreviewContainer')?.classList.add('hidden');
}

function updateTypeButtons() {
    document.querySelectorAll('.type-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === state.transactionType));
}

function populateCategorySelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const type = selectId === 'budgetCategory' ? 'expense' : state.transactionType;
    select.innerHTML = '<option value="">Select category</option>' + state.categories.filter(cat => cat.type === type).map(cat => `<option value="${cat.id}">${cat.icon || ''} ${escapeHtml(cat.name)}</option>`).join('');
}

async function loadTransactionForEdit(id) {
    const result = await fetchTransactions(state.currentMonth, 1, null);
    const tx = result.transactions.find(item => item.id === id);
    if (!tx) {
        showToast('Open the transaction month before editing this item', 'error');
        return;
    }
    state.transactionType = tx.category_type;
    updateTypeButtons();
    populateCategorySelect('category');
    setValue('transactionId', tx.id);
    setValue('category', tx.category_id);
    setValue('amount', tx.amount);
    setValue('description', tx.description || '');
    setValue('date', tx.date);
    updateDescriptionCount();
}

async function handleTransactionSubmit(event) {
    event.preventDefault();
    const data = {
        category_id: Number(document.getElementById('category').value),
        amount: Number(document.getElementById('amount').value),
        description: document.getElementById('description').value,
        date: document.getElementById('date').value
    };
    if (state.editingTransactionId) {
        await updateTransaction(state.editingTransactionId, data);
        debugLog('transaction mutation', { action: 'update', id: state.editingTransactionId });
        showToast('Transaction updated');
    } else {
        await createTransaction(data);
        debugLog('transaction mutation', { action: 'create' });
        showToast('Transaction added');
    }
    closeTransactionModal();
    debouncedRefreshFinancialState({ reason: 'transaction saved' });
}

async function deleteTx(id) {
    if (!confirm('Delete this transaction?')) return;
    await deleteTransaction(id);
    debugLog('transaction mutation', { action: 'delete', id });
    showToast('Transaction deleted');
    debouncedRefreshFinancialState({ reason: 'transaction deleted' });
}

window.openEditModal = openTransactionModal;
window.deleteTx = deleteTx;

function openBudgetModal() {
    populateCategorySelect('budgetCategory');
    setValue('budgetMonthInput', budgetMonth);
    document.getElementById('budgetModal')?.classList.remove('hidden');
}

function closeBudgetModal() {
    document.getElementById('budgetModal')?.classList.add('hidden');
    document.getElementById('budgetForm')?.reset();
}

async function handleBudgetSubmit(event) {
    event.preventDefault();
    await createBudget({
        category_id: Number(document.getElementById('budgetCategory').value),
        amount: Number(document.getElementById('budgetAmount').value),
        month: document.getElementById('budgetMonthInput').value
    });
    debugLog('budget mutation', { action: 'save', month: document.getElementById('budgetMonthInput').value });
    showToast('Budget saved');
    closeBudgetModal();
    debouncedRefreshFinancialState({ reason: 'budget saved', month: budgetMonth });
}

async function uploadReceipt(file) {
    const scanBtn = document.getElementById('scanReceiptBtn');
    const original = scanBtn?.innerHTML;
    try {
        if (scanBtn) {
            scanBtn.disabled = true;
            scanBtn.innerHTML = '<span class="material-symbols-outlined">hourglass_top</span>Scanning';
        }
        const formData = new FormData();
        formData.append('receipt', file);
        const response = await fetch('/api/ocr-receipt', { method: 'POST', body: formData });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Receipt scan failed');
        const data = result.data;
        if (data.amount) setValue('amount', data.amount);
        if (data.merchant_name) setValue('description', data.merchant_name);
        if (data.date) setValue('date', data.date);
        if (data.suggested_category_id) {
            const category = state.categories.find(c => c.id == data.suggested_category_id);
            if (category) {
                state.transactionType = category.type;
                updateTypeButtons();
                populateCategorySelect('category');
                setValue('category', data.suggested_category_id);
            }
        }
        const preview = document.getElementById('receiptPreview');
        const previewContainer = document.getElementById('receiptPreviewContainer');
        if (preview && previewContainer) {
            preview.src = URL.createObjectURL(file);
            previewContainer.classList.remove('hidden');
        }
        updateDescriptionCount();
        debugLog('receipt OCR import', {
            amount: data.amount,
            merchant: data.merchant_name,
            suggested_category_id: data.suggested_category_id
        });
        showToast('Receipt scanned');
    } catch (error) {
        showToast(error.message || 'Failed to scan receipt', 'error');
    } finally {
        if (scanBtn && original) {
            scanBtn.disabled = false;
            scanBtn.innerHTML = original;
        }
    }
}

function openRoastModal() {
    document.getElementById('roastModal')?.classList.remove('hidden');
    setText('roastText', 'Loading your financial reality check...');
    fetchRoast();
}

function closeRoastModal() {
    document.getElementById('roastModal')?.classList.add('hidden');
}

async function fetchRoast() {
    try {
        if (roastCache[state.currentMonth]) {
            setText('roastText', roastCache[state.currentMonth]);
            return;
        }
        const data = await apiCall(`/roast?month=${state.currentMonth}`);
        roastCache[state.currentMonth] = data.roast;
        setText('roastText', data.roast);
    } catch (error) {
        setText('roastText', 'The roast engine needs API credentials before it can judge your spending.');
    }
}

function initChatWidget() {
    const widget = document.getElementById('chatWidget');
    const panel = document.getElementById('chatPanel');
    const input = document.getElementById('chatInput');
    const send = document.getElementById('chatSend');
    document.getElementById('chatToggle')?.addEventListener('click', () => toggleChat());
    document.getElementById('closeChat')?.addEventListener('click', () => toggleChat(false));
    send?.addEventListener('click', handleChatSubmit);
    input?.addEventListener('keydown', event => {
        if (event.key === 'Enter') handleChatSubmit();
    });
    function toggleChat(force) {
        const shouldOpen = force ?? panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !shouldOpen);
        widget.classList.toggle('is-open', shouldOpen);
        if (shouldOpen) setTimeout(() => input?.focus(), 50);
    }
    window.openSmartFinanceChat = () => toggleChat(true);
}

async function handleChatSubmit() {
    const input = document.getElementById('chatInput');
    const send = document.getElementById('chatSend');
    const message = input.value.trim();
    if (!message) return;
    appendChatMessage(message, 'user');
    input.value = '';
    input.disabled = true;
    send.disabled = true;
    const pending = appendChatMessage('', 'assistant');
    const target = pending.querySelector('p');
    try {
        const fullText = await streamChatMessage(message, chunk => {
            target.textContent += chunk;
            scrollChatToBottom();
        });
        if (!fullText.trim()) target.textContent = 'I could not generate an answer from the current data.';
    } catch (error) {
        target.textContent = error.message;
    } finally {
        input.disabled = false;
        send.disabled = false;
        input.focus();
    }
}

function appendChatMessage(content, role) {
    const messages = document.getElementById('chatMessages');
    const message = document.createElement('div');
    message.className = `message ${role}`;
    message.innerHTML = `<p>${escapeHtml(content)}</p>`;
    messages.appendChild(message);
    scrollChatToBottom();
    return message;
}

function scrollChatToBottom() {
    const messages = document.getElementById('chatMessages');
    if (messages) messages.scrollTop = messages.scrollHeight;
}

function updateDescriptionCount() {
    const input = document.getElementById('description');
    setText('descriptionCount', `${input?.value.length || 0}/80`);
}

function setSkeleton(id, rows = 3) {
    const container = document.getElementById(id);
    if (container) container.innerHTML = Array.from({ length: rows }, () => '<div class="skeleton-row"></div>').join('');
}

function emptyState(text) {
    return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}
function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}
function setChecked(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(value);
}
function setDisabled(id, value) {
    const el = document.getElementById(id);
    if (el) el.disabled = Boolean(value);
}

async function fetchUser() {
    try {
        state.user = await apiCall('/user');
        updateUserChrome();
    } catch (error) {
        console.error(error);
    }
}

function updateUserChrome() {
    const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(state.user.name)}&backgroundColor=dde1ff`;
    ['userAvatar', 'profileMenuAvatar', 'settingsAvatar'].forEach(id => {
        const img = document.getElementById(id);
        if (img) img.src = avatar;
    });
    setText('profileMenuName', state.user.name);
    setText('profileMenuEmail', state.user.email);
    setText('settingsProfileName', state.user.name);
    setText('settingsProfileEmail', state.user.email);
}

function updateExpenseBreakdown(categoryName) {
    state.selectedExpenseCategory = categoryName;
    const panels = document.querySelectorAll('#expenseBreakdownPanel, [data-expense-breakdown]');
    if (!panels.length) return;

    const transactions = state.transactions.filter(t => t.type === 'expense' && t.category === categoryName);
    const total = transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);

    if (!categoryName || total === 0) {
        panels.forEach(panel => {
            panel.classList.add('hidden');
            panel.innerHTML = '';
        });
        return;
    }
    const largest = transactions.length ? Math.max(...transactions.map(t => Number(t.amount || 0))) : 0;
    const totalExpense = Number(state.metrics.total_expense ?? state.metrics.totalExpense ?? 0);
    const percent = totalExpense ? ((total / totalExpense) * 100).toFixed(1) : '0.0';
    const html = `
        <h3>${escapeHtml(categoryName)}</h3>
        <div class="analytics-stat-grid">
            <div class="analytics-stat"><label>Total Spent</label><strong>${formatCurrency(total)}</strong></div>
            <div class="analytics-stat"><label>Expense Share</label><strong>${percent}%</strong></div>
            <div class="analytics-stat"><label>Largest Transaction</label><strong>${formatCurrency(largest)}</strong></div>
        </div>
    `;
    panels.forEach(panel => {
        panel.classList.remove('hidden');
        panel.innerHTML = html;
    });
    debugLog('expense breakdown update', { categoryName, count: transactions.length, total });
}

function seedAnimateTargets() {
    document.querySelectorAll('.screen .card, .screen .support-card, .screen .watch-card, .screen .page-heading, .screen .budget-hero, .screen .support-hero').forEach(el => {
        el.setAttribute('data-animate', '');
    });
}

function runScreenAnimations() {
    if (!window.gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const targets = document.querySelectorAll('.screen.active [data-animate]');
    if (!targets.length) return;
    gsap.fromTo(targets, { opacity: 0, y: 12, scale: 0.99 }, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.3,
        ease: 'power3.out',
        stagger: { amount: 0.15, from: 'start' },
        delay: 0.02,
        clearProps: 'transform'
    });
}

window.updateExpenseBreakdown = updateExpenseBreakdown;
window.refreshFinancialState = refreshFinancialState;

function bindEvents() {
    document.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => switchTab(el.dataset.tab)));
    document.getElementById('profileToggle')?.addEventListener('click', () => {
        const menu = document.getElementById('profileMenu');
        menu.classList.toggle('hidden');
        document.getElementById('profileToggle').setAttribute('aria-expanded', String(!menu.classList.contains('hidden')));
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('.profile-trigger') && !event.target.closest('.profile-menu')) {
            document.getElementById('profileMenu')?.classList.add('hidden');
        }
    });
    document.getElementById('themeToggle')?.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    document.getElementById('globalSearchBtn')?.addEventListener('click', () => { switchTab('transactions'); setTimeout(() => document.getElementById('transactionSearch')?.focus(), 80); });
    ['addTransactionBtn', 'addTransactionBtnLedger'].forEach(id => document.getElementById(id)?.addEventListener('click', () => openTransactionModal()));
    document.getElementById('scanFromLedgerBtn')?.addEventListener('click', () => { openTransactionModal(); setTimeout(() => document.getElementById('receiptInput')?.click(), 80); });
    document.getElementById('prevMonth')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonth')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('prevPage')?.addEventListener('click', () => { if (state.transactionsPage > 1) { state.transactionsPage--; loadTransactions(); } });
    document.getElementById('nextPage')?.addEventListener('click', () => { state.transactionsPage++; loadTransactions(); });
    document.getElementById('transactionSearch')?.addEventListener('input', event => { state.searchQuery = event.target.value.trim(); loadTransactions(); });
    document.getElementById('refreshAlertsBtn')?.addEventListener('click', () => loadPredictiveAlerts(true));
    document.getElementById('analyzeBurnBtn')?.addEventListener('click', () => loadPredictiveAlerts(true));
    document.getElementById('prevBudgetMonth')?.addEventListener('click', () => changeBudgetMonth(-1));
    document.getElementById('nextBudgetMonth')?.addEventListener('click', () => changeBudgetMonth(1));
    document.getElementById('addBudgetBtn')?.addEventListener('click', openBudgetModal);
    document.getElementById('closeBudgetModal')?.addEventListener('click', closeBudgetModal);
    document.getElementById('cancelBudgetBtn')?.addEventListener('click', closeBudgetModal);
    document.getElementById('budgetForm')?.addEventListener('submit', handleBudgetSubmit);
    ['roastMeBtn', 'roastMeBtnAlt'].forEach(id => document.getElementById(id)?.addEventListener('click', openRoastModal));
    document.getElementById('closeRoastModal')?.addEventListener('click', closeRoastModal);
    document.getElementById('closeRoastBtn')?.addEventListener('click', closeRoastModal);
    document.getElementById('openChatShortcut')?.addEventListener('click', () => window.openSmartFinanceChat?.());
    document.getElementById('supportChatBtn')?.addEventListener('click', () => window.openSmartFinanceChat?.());
    document.getElementById('closeModal')?.addEventListener('click', closeTransactionModal);
    document.getElementById('cancelBtn')?.addEventListener('click', closeTransactionModal);
    document.getElementById('transactionForm')?.addEventListener('submit', handleTransactionSubmit);
    document.getElementById('scanReceiptBtn')?.addEventListener('click', () => document.getElementById('receiptInput')?.click());
    document.getElementById('receiptInput')?.addEventListener('change', event => { if (event.target.files[0]) uploadReceipt(event.target.files[0]); });
    document.getElementById('removeReceiptBtn')?.addEventListener('click', () => { document.getElementById('receiptPreviewContainer')?.classList.add('hidden'); setValue('receiptInput', ''); });
    document.querySelectorAll('.type-btn').forEach(btn => btn.addEventListener('click', () => { state.transactionType = btn.dataset.type; updateTypeButtons(); populateCategorySelect('category'); }));
    document.getElementById('description')?.addEventListener('input', handleDescriptionInput);
    document.getElementById('markReadBtn')?.addEventListener('click', async () => {
        await markNotificationsRead();
        showToast('Notifications marked as read');
        debouncedRefreshFinancialState({ reason: 'notifications read' });
    });
    document.getElementById('supportForm')?.addEventListener('submit', handleSupportSubmit);
    document.getElementById('profileForm')?.addEventListener('submit', handleProfileSubmit);
    document.getElementById('settingsForm')?.addEventListener('submit', handleSettingsSubmit);
    document.getElementById('flushCacheBtn')?.addEventListener('click', handleFlushCache);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeTransactionModal(); closeBudgetModal(); closeRoastModal(); } });
}

let suggestionTimeout;
function handleDescriptionInput(event) {
    updateDescriptionCount();
    const description = event.target.value.trim();
    if (description.length < 3) return;
    clearTimeout(suggestionTimeout);
    suggestionTimeout = setTimeout(async () => {
        try {
            const result = await apiCall('/suggest-category', { method: 'POST', body: JSON.stringify({ description, type: state.transactionType }) });
            debugLog('AI category suggestion', result);
            if (result.category_id) setValue('category', result.category_id);
        } catch (error) {
            console.info('AI category suggestion unavailable:', error.message);
        }
    }, 500);
}

async function handleSupportSubmit(event) {
    event.preventDefault();
    await createSupportRequest({
        subject: document.getElementById('supportSubject').value,
        category: document.getElementById('supportCategory').value,
        message: document.getElementById('supportMessage').value
    });
    event.target.reset();
    debugLog('support mutation', { action: 'create' });
    showToast('Support request submitted');
    debouncedRefreshFinancialState({ reason: 'support request', includeSupport: true });
}

async function handleProfileSubmit(event) {
    event.preventDefault();
    state.user = await updateUserApi({
        name: document.getElementById('profileNameInput').value,
        email: document.getElementById('profileEmailInput').value
    });
    updateUserChrome();
    debugLog('profile mutation', { action: 'update' });
    showToast('Profile saved');
    debouncedRefreshFinancialState({ reason: 'profile saved', includeSettings: true });
}

async function handleSettingsSubmit(event) {
    event.preventDefault();
    const settings = await updateSettingsApi({
        theme: document.getElementById('settingTheme').value,
        monthly_goal: Number(document.getElementById('settingGoal').value),
        alert_threshold: Number(document.getElementById('settingThreshold').value),
        ai_advisor_enabled: document.getElementById('settingAI').checked,
        receipt_scan_enabled: document.getElementById('settingOCR').checked
    });
    state.settings = settings;
    applyTheme(settings.theme);
    debugLog('settings mutation', { action: 'update', theme: settings.theme });
    showToast('Settings saved');
    debouncedRefreshFinancialState({ reason: 'settings saved', includeSettings: true });
}

async function handleFlushCache() {
    const result = await fetch('/api/cache/flush', { method: 'POST' }).then(r => r.json());
    debugLog('cache invalidation', result);
    showToast(`Cache flushed: ${result.deletedCount || 0} keys`);
    debouncedRefreshFinancialState({ reason: 'cache flush', includeSettings: true, includeSupport: state.currentTab === 'support' });
}

async function bootSmartFinance() {
    try {
        document.documentElement.dataset.sfAppBoot = 'starting';
        seedAnimateTargets();
        bindEvents();
        initChatWidget();
        applyTheme(localStorage.getItem('sf-theme') || 'light', false);
        await fetchUser();
        state.categories = await fetchCategories();
        window.initializeCharts?.();
        state.settings = await fetchSettings().catch(() => null);
        if (state.settings?.theme) applyTheme(state.settings.theme, false);
        await loadDashboard();
        runScreenAnimations();
        document.documentElement.dataset.sfAppBoot = 'ready';
    } catch (error) {
        document.documentElement.dataset.sfAppBoot = 'failed';
        document.documentElement.dataset.sfBootError = error.message || 'unknown error';
        console.error('Initialization error:', error);
        showToast(error.message || 'Failed to initialize app', 'error');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootSmartFinance, { once: true });
} else {
    bootSmartFinance();
}

let mouseRaf = null;
document.addEventListener('mousemove', e => {
    if (mouseRaf) return;
    mouseRaf = requestAnimationFrame(() => {
        const pct = (v, max) => `${((v / max) * 100).toFixed(1)}%`;
        document.body.style.setProperty('--mx', pct(e.clientX, window.innerWidth));
        document.body.style.setProperty('--my', pct(e.clientY, window.innerHeight));
        mouseRaf = null;
    });
});
