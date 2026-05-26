let expenseChartInstance = null;
let analyticsChartInstance = null;
let trendChartInstance = null;
let dashboardTrendChartInstance = null;
let budgetChartInstance = null;
let selectedExpenseCategory = null;

const latestChartData = {
    dashboardExpense: [],
    analyticsTrend: [],
    analyticsCategory: [],
    budgetCategories: [],
    budgetData: []
};

const chartPalette = ['#FF6B35', '#10B981', '#3B82F6', '#F59E0B', '#2D2D3F', '#06B6D4', '#F97316', '#FF8C5A'];
let centerTextRegistered = false;

function chartDebug(...args) {
    if (window.__SF_DEBUG__) console.log('[SmartFinance][Charts]', ...args);
}

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getThemeColors() {
    return {
        bg: cssVar('--sf-bg-void') || '#060610',
        surface: cssVar('--sf-bg-panel') || '#11112A',
        panel: cssVar('--sf-bg-panel') || '#11112A',
        text: cssVar('--sf-text') || '#F1F5F9',
        muted: cssVar('--sf-muted') || '#64748B',
        outline: cssVar('--sf-border') || 'rgba(139,92,246,0.18)',
        accent: cssVar('--sf-accent') || '#FF6B35',
        success: cssVar('--sf-income') || '#10B981',
        danger: cssVar('--sf-expense') || '#FF6B35',
        warning: cssVar('--sf-warning') || '#F59E0B',
        savings: cssVar('--sf-savings') || '#3B82F6'
    };
}

function formatRupees(value) {
    return `Rs. ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function hexToRGBA(hex, alpha) {
    const clean = String(hex || '').replace('#', '').trim();
    if (!/^[0-9a-f]{6}$/i.test(clean)) return `rgba(255, 107, 53, ${alpha})`;
    const bigint = parseInt(clean, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function registerCenterTextPlugin() {
    if (!window.Chart || centerTextRegistered) return;
    Chart.register({
        id: 'centerText',
        afterDraw(chart) {
            const opt = chart.options.plugins?.centerText;
            const isDisplayEnabled = opt && (opt.display === true || opt.display === undefined);
            if (!isDisplayEnabled) return;
            if (!chart.chartArea) return;
            const { ctx, chartArea: { left, right, top, bottom } } = chart;
            const cx = (left + right) / 2;
            const cy = (top + bottom) / 2;
            const textConfig = typeof opt.text === 'function' ? opt.text(chart) : opt.text;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = getThemeColors().text || '#E8E8ED';
            if (typeof textConfig === 'object' && textConfig.top && textConfig.bottom) {
                ctx.font = "600 0.85rem 'Inter', sans-serif";
                ctx.fillText(textConfig.top, cx, cy - 10);
                ctx.font = "700 1.1rem 'Inter', sans-serif";
                ctx.fillText(textConfig.bottom, cx, cy + 10);
            } else {
                ctx.font = "700 1.1rem 'Inter', sans-serif";
                ctx.fillText(textConfig || '', cx, cy);
            }
            ctx.restore();
        }
    });
    centerTextRegistered = true;
}

function applyChartDefaults() {
    if (!window.Chart) return;
    registerCenterTextPlugin();
    const theme = getThemeColors();
    Chart.defaults.color = theme.muted;
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
}

function tooltipOptions() {
    const theme = getThemeColors();
    return {
        backgroundColor: theme.panel,
        titleColor: theme.text,
        bodyColor: theme.text,
        borderColor: theme.outline,
        borderWidth: 1,
        cornerRadius: 12,
        padding: 12,
        callbacks: {
            label(context) {
                const label = context.dataset.label ? `${context.dataset.label}: ` : '';
                const value = context.parsed?.y ?? context.raw ?? 0;
                if (context.chart.config.type === 'doughnut') {
                    const total = context.dataset.data.reduce((sum, item) => sum + Number(item || 0), 0);
                    const pct = total ? Math.round((Number(value) / total) * 100) : 0;
                    return `${label}${formatRupees(value)} (${pct}%)`;
                }
                return `${label}${formatRupees(value)}`;
            }
        }
    };
}

function destroyChart(chart) {
    if (chart) chart.destroy();
}

function colorForCategory(item, index) {
    const base = item.color || chartPalette[index % chartPalette.length];
    const isDimmed = selectedExpenseCategory && selectedExpenseCategory !== item.name;
    return isDimmed ? hexToRGBA(base, 0.25) : base;
}

function buildLegend(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state">No category spend yet.</div>';
        return;
    }

    const total = data.reduce((sum, item) => sum + Number(item.total || 0), 0);
    container.innerHTML = data.map((item, index) => {
        const color = colorForCategory(item, index);
        const pct = total ? Math.round((Number(item.total || 0) / total) * 100) : 0;
        const active = selectedExpenseCategory === item.name ? ' aria-current="true"' : '';
        return `
            <button class="legend-row" type="button" data-expense-category="${encodeURIComponent(item.name)}"${active}>
                <span class="legend-label">
                    <span class="legend-dot" style="background:${color}"></span>
                    <span>${item.icon || ''} ${item.name}</span>
                </span>
                <strong>${formatRupees(item.total)} · ${pct}%</strong>
            </button>
        `;
    }).join('');
    container.querySelectorAll('[data-expense-category]').forEach(button => {
        button.addEventListener('click', () => {
            setSelectedExpenseCategory(decodeURIComponent(button.dataset.expenseCategory || ''));
        });
    });
}

function initExpenseChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return null;

    const theme = getThemeColors();
    return new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [],
                borderColor: theme.panel,
                borderWidth: 4,
                hoverOffset: 10,
                offset: ctx => {
                    const name = ctx.chart.$sfCategories?.[ctx.dataIndex];
                    return selectedExpenseCategory === name ? 22 : 0;
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            onClick(event, elements, chart) {
                chartDebug('expense chart click', { elements: elements.length, chart: canvasId });
                if (!elements.length) {
                    setSelectedExpenseCategory(null);
                    return;
                }
                const index = elements[0].index;
                const category = chart.$sfCategories?.[index] || chart.data.labels[index];
                setSelectedExpenseCategory(category);
            },
            plugins: {
                legend: { display: false },
                tooltip: tooltipOptions(),
                centerText: {
                    display: true,
                    text: chart => {
                        const data = chart.data?.datasets?.[0]?.data || [];
                        const labels = chart.data?.labels || [];
                        if (!data.length) return '\u2014';
                        const total = data.reduce((sum, item) => sum + Number(item || 0), 0);
                        if (total === 0) return '\u2014';
                        let maxIndex = 0, maxValue = 0;
                        data.forEach((value, index) => {
                            if (Number(value || 0) > maxValue) { maxValue = Number(value || 0); maxIndex = index; }
                        });
                        const topCategory = labels[maxIndex] || '';
                        const pct = Math.round((maxValue / total) * 100);
                        return { top: topCategory.length > 10 ? topCategory.substring(0, 8) + '...' : topCategory, bottom: pct + '%' };
                    }
                }
            },
            animation: { duration: 650 }
        }
    });
}

function updateExpenseChart(chartInstance, data, legendId = null) {
    if (!chartInstance) return;
    const chartData = Array.isArray(data) ? data : [];
    chartInstance.$sfRawData = chartData;
    chartInstance.$sfLegendId = legendId;
    chartInstance.$sfCategories = chartData.map(item => item.name);
    chartInstance.data.labels = chartData.map(item => item.name);
    chartInstance.data.datasets[0].data = chartData.map(item => Number(item.total || 0));
    chartInstance.data.datasets[0].backgroundColor = chartData.map(colorForCategory);
    chartInstance.data.datasets[0].borderColor = getThemeColors().panel;
    chartInstance.options.plugins.tooltip = tooltipOptions();
    chartDebug('expense chart redraw', { legendId, items: chartData.length, selectedExpenseCategory });
    chartInstance.update();
    if (legendId) buildLegend(legendId, chartData);
}

function setSelectedExpenseCategory(category) {
    selectedExpenseCategory = selectedExpenseCategory === category ? null : category;
    window.updateExpenseBreakdown?.(selectedExpenseCategory);
    updateExpenseChart(expenseChartInstance, latestChartData.dashboardExpense, 'expenseLegend');
    updateExpenseChart(analyticsChartInstance, latestChartData.analyticsCategory, 'analyticsLegend');
}

function initTrendChart(canvasId = 'trendChart') {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return null;

    const theme = getThemeColors();
    return new Chart(canvas, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Income', data: [], borderColor: theme.success, backgroundColor: hexToRGBA('#10B981', .12), fill: true, tension: .42, pointRadius: 4 },
                { label: 'Expense', data: [], borderColor: theme.danger, backgroundColor: hexToRGBA('#FF6B35', .10), fill: true, tension: .42, pointRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: { legend: { position: 'top', align: 'end' }, tooltip: tooltipOptions() },
            scales: {
                x: { grid: { display: false }, border: { display: false } },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(124, 58, 237, .14)' },
                    border: { display: false },
                    ticks: { callback: value => `Rs. ${Number(value).toLocaleString('en-IN')}` }
                }
            }
        }
    });
}

function updateTrendChart(chartInstance, data) {
    if (!chartInstance) return;
    const trendData = Array.isArray(data) ? data : [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const theme = getThemeColors();
    chartInstance.data.labels = trendData.map(item => {
        const [year, month] = String(item.month || '').split('-');
        return `${monthNames[Number(month) - 1] || item.month} ${String(year || '').slice(-2)}`;
    });
    chartInstance.data.datasets[0].data = trendData.map(item => Number(item.total_income || 0));
    chartInstance.data.datasets[1].data = trendData.map(item => Number(item.total_expense || 0));
    chartInstance.data.datasets[0].borderColor = theme.success;
    chartInstance.data.datasets[1].borderColor = theme.danger;
    chartInstance.options.plugins.tooltip = tooltipOptions();
    chartDebug('trend chart redraw', { points: trendData.length });
    chartInstance.update();
}

let budgetSelectedCategory = null;

function initBudgetChart(canvasId = 'budgetChart') {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return null;
    const theme = getThemeColors();
    canvas.width = 130;
    canvas.height = 130;
    return new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [],
                borderColor: theme.panel,
                borderWidth: 3,
                hoverOffset: 10,
                offset: ctx => {
                    const name = ctx.chart.$budgetCategories?.[ctx.dataIndex];
                    return budgetSelectedCategory === name ? 16 : 0;
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            onClick(event, elements, chart) {
                if (!elements.length) {
                    budgetSelectedCategory = null;
                } else {
                    const idx = elements[0].index;
                    const name = chart.$budgetCategories?.[idx] || chart.data.labels[idx];
                    budgetSelectedCategory = budgetSelectedCategory === name ? null : name;
                }
                chart.update();
                highlightBudgetComparison(budgetSelectedCategory);
            },
            onHover(event, elements) {
                const canvas = event.chart.canvas;
                canvas.style.cursor = elements.length ? 'pointer' : 'default';
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: theme.panel,
                    titleColor: theme.text,
                    bodyColor: theme.text,
                    borderColor: theme.outline,
                    borderWidth: 1,
                    cornerRadius: 10,
                    padding: 10,
                    callbacks: {
                        label(ctx) {
                            const total = ctx.dataset.data.reduce((s, v) => s + Number(v || 0), 0);
                            const pct = total ? Math.round((Number(ctx.raw || 0) / total) * 100) : 0;
                            return `${ctx.label}: ${formatRupees(ctx.raw)} (${pct}%)`;
                        }
                    }
                },
                centerText: {
                    display: true,
                    text: chart => {
                        const data = chart.data.datasets[0]?.data || [];
                        const labels = chart.data?.labels || [];
                        if (!data.length) return { top: 'No data', bottom: '—' };
                        const total = data.reduce((s, v) => s + Number(v || 0), 0);
                        if (total === 0) return { top: 'No spend', bottom: '—' };
                        if (budgetSelectedCategory) {
                            const idx = labels.indexOf(budgetSelectedCategory);
                            const val = idx >= 0 ? Number(data[idx] || 0) : 0;
                            const pct = Math.round((val / total) * 100);
                            return { top: budgetSelectedCategory.length > 8 ? budgetSelectedCategory.substring(0, 7) + '...' : budgetSelectedCategory, bottom: pct + '%' };
                        }
                        return { top: formatRupees(total), bottom: 'total' };
                    }
                }
            },
            animation: { duration: 400 }
        }
    });
}

function updateBudgetChart(categories, budgets) {
    latestChartData.budgetCategories = Array.isArray(categories) ? categories : [];
    latestChartData.budgetData = Array.isArray(budgets) ? budgets : [];
    if (!budgetChartInstance) budgetChartInstance = initBudgetChart();
    if (!budgetChartInstance) return;
    const data = Array.isArray(categories) ? categories : [];
    const theme = getThemeColors();
    const palette = ['#FF6B35', '#10B981', '#3B82F6', '#F59E0B', '#A371F7', '#06B6D4', '#F97316', '#FF8C5A'];
    budgetChartInstance.$budgetCategories = data.map(item => item.name);
    budgetChartInstance.data.labels = data.map(item => item.name);
    budgetChartInstance.data.datasets[0].data = data.map(item => Number(item.total || 0));
    budgetChartInstance.data.datasets[0].backgroundColor = data.map((item, idx) => item.color || palette[idx % palette.length]);
    budgetChartInstance.data.datasets[0].borderColor = theme.panel;
    budgetChartInstance.options.plugins.tooltip = tooltipOptions();
    budgetChartInstance.update();
    budgetChartInstance.resize();
    renderBudgetComparison(budgets);
}

function highlightBudgetComparison(selectedName) {
    const container = document.getElementById('budgetComparison');
    if (!container) return;
    container.querySelectorAll('.budget-compare-row').forEach(row => {
        const label = row.querySelector('.compare-label')?.textContent?.trim() || '';
        row.style.opacity = !selectedName || label.includes(selectedName) ? '1' : '0.4';
    });
}

function renderBudgetComparison(budgets) {
    const container = document.getElementById('budgetComparison');
    if (!container) return;
    const items = Array.isArray(budgets) ? budgets : [];
    if (!items.length) {
        container.innerHTML = '';
        return;
    }
    const palette = ['#FF6B35', '#10B981', '#3B82F6', '#F59E0B', '#A371F7', '#06B6D4', '#F97316', '#FF8C5A'];
    container.innerHTML = items.map((b, idx) => {
        const spent = Number(b.spent_amount || 0);
        const limit = Number(b.budget_amount || 0);
        const pct = limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
        const color = b.category_color || palette[idx % palette.length];
        const over = spent > limit;
        return `
            <div class="budget-compare-row">
                <span class="compare-label">${b.category_icon || ''} ${b.category_name || 'Budget'}</span>
                <div class="compare-track">
                    <div class="compare-fill" style="width:${pct}%; background:${over ? 'var(--danger)' : color}"></div>
                </div>
                <span class="compare-value" style="color:${over ? 'var(--danger)' : 'inherit'}">${formatRupees(spent)}${over ? '!' : ''}</span>
            </div>`;
    }).join('');
}

function initializeCharts() {
    if (!window.Chart) return;
    applyChartDefaults();
    destroyChart(expenseChartInstance);
    destroyChart(analyticsChartInstance);
    destroyChart(trendChartInstance);
    destroyChart(dashboardTrendChartInstance);
    destroyChart(budgetChartInstance);
    expenseChartInstance = initExpenseChart('expenseChart');
    analyticsChartInstance = initExpenseChart('analyticsChart');
    trendChartInstance = initTrendChart('trendChart');
    dashboardTrendChartInstance = initTrendChart('dashboardTrendChart');
    budgetChartInstance = initBudgetChart('budgetChart');
}

function updateDashboardCharts(expenseData, trendData = latestChartData.analyticsTrend) {
    latestChartData.dashboardExpense = Array.isArray(expenseData) ? expenseData : [];
    if (!expenseChartInstance) expenseChartInstance = initExpenseChart('expenseChart');
    if (!dashboardTrendChartInstance) dashboardTrendChartInstance = initTrendChart('dashboardTrendChart');
    updateExpenseChart(expenseChartInstance, latestChartData.dashboardExpense, 'expenseLegend');
    updateTrendChart(dashboardTrendChartInstance, trendData);
}

function updateAnalyticsCharts(trendData, categoryData) {
    latestChartData.analyticsTrend = Array.isArray(trendData) ? trendData : [];
    latestChartData.analyticsCategory = Array.isArray(categoryData) ? categoryData : [];
    if (!trendChartInstance) trendChartInstance = initTrendChart('trendChart');
    if (!analyticsChartInstance) analyticsChartInstance = initExpenseChart('analyticsChart');
    updateTrendChart(trendChartInstance, latestChartData.analyticsTrend);
    updateExpenseChart(analyticsChartInstance, latestChartData.analyticsCategory, 'analyticsLegend');
    if (!dashboardTrendChartInstance) dashboardTrendChartInstance = initTrendChart('dashboardTrendChart');
    updateTrendChart(dashboardTrendChartInstance, latestChartData.analyticsTrend);
}

function refreshChartsForTab() {
    applyChartDefaults();
}

function updateChartTheme() {
    applyChartDefaults();
    const theme = getThemeColors();
    [expenseChartInstance, analyticsChartInstance].forEach(chart => {
        if (!chart) return;
        chart.data.datasets[0].borderColor = theme.panel;
        chart.options.plugins.tooltip = tooltipOptions();
        chart.update('none');
    });
    [trendChartInstance, dashboardTrendChartInstance].forEach(chart => {
        if (!chart) return;
        chart.data.datasets[0].borderColor = theme.success;
        chart.data.datasets[1].borderColor = theme.danger;
        chart.options.plugins.tooltip = tooltipOptions();
        chart.update('none');
    });
    if (budgetChartInstance) {
        budgetChartInstance.data.datasets[0].borderColor = theme.panel;
        budgetChartInstance.options.plugins.tooltip = tooltipOptions();
        budgetChartInstance.update('none');
    }
    window.updateExpenseBreakdown?.(selectedExpenseCategory);
}

function resizeBudgetChart() {
    if (budgetChartInstance) budgetChartInstance.resize();
}

window.initializeCharts = initializeCharts;
window.updateDashboardCharts = updateDashboardCharts;
window.updateAnalyticsCharts = updateAnalyticsCharts;
window.updateExpenseChart = updateExpenseChart;
window.updateTrendChart = updateTrendChart;
window.updateChartTheme = updateChartTheme;
window.refreshChartsForTab = refreshChartsForTab;
window.updateBudgetChart = updateBudgetChart;
window.resizeBudgetChart = resizeBudgetChart;
window.highlightBudgetComparison = highlightBudgetComparison;
window.hexToRGBA = hexToRGBA;
window.__SF_CHART_STATE__ = () => ({
    selectedExpenseCategory,
    instances: {
        dashboardExpense: Boolean(expenseChartInstance),
        analyticsExpense: Boolean(analyticsChartInstance),
        trend: Boolean(trendChartInstance),
        dashboardTrend: Boolean(dashboardTrendChartInstance)
    }
});

function resizeChartsForTab(tabId) {
    if (tabId === 'analytics') {
        if (trendChartInstance) trendChartInstance.resize();
        if (analyticsChartInstance) analyticsChartInstance.resize();
    }
    if (tabId === 'budgets') {
        if (budgetChartInstance) budgetChartInstance.resize();
    }
    if (tabId === 'dashboard') {
        if (expenseChartInstance) expenseChartInstance.resize();
        if (dashboardTrendChartInstance) dashboardTrendChartInstance.resize();
    }
}
window.resizeChartsForTab = resizeChartsForTab;

document.documentElement.dataset.sfChartsReady = 'true';
