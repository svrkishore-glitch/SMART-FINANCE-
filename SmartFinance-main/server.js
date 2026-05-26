const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const database = require('./database');
const valkey = require('./valkey');


const app = express();
const PORT = process.env.PORT || 3000;
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer setup for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Health check endpoint
app.get('/health', async (req, res) => {
    const dbStatus = database.getDb() ? 'connected' : 'disconnected';
    const valkeyStatus = valkey.isValkeyConnected() ? 'connected' : 'disconnected';
    
    const isHealthy = dbStatus === 'connected'; // Valkey is optional
    
    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        database: dbStatus,
        cache: valkeyStatus,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Database & Cache Initialization
database.initializeDatabase().then(() => {
    console.log('[Database] Ready');
    valkey.deleteCachePattern('sf:*').then(count => {
        console.log(`[Cache] Flushed ${count} stale keys on startup`);
    }).catch(() => {});
}).catch(err => {
    console.error('[Database] Initialization failed:', err);
});

// Helper function for API responses
function apiResponse(res, success, data = null, error = null) {
    if (success) {
        res.json({ success: true, data });
    } else {
        res.status(400).json({ success: false, error });
    }
}

async function safeSetCache(cacheKey, value, ttlSeconds) {
    await valkey.setCache(cacheKey, value, ttlSeconds).catch(error => {
        console.warn('[Cache set skipped]', cacheKey, error.message);
    });
}

async function safeFlushTag(tag) {
    await valkey.flushTag(tag).catch(error => {
        console.warn('[Cache invalidation skipped]', tag, error.message);
    });
}

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function buildFinanceAdvisorPrompt({ month, summary, trend, breakdown, userName }) {
    return `You are a personal finance advisor for an Indian college student named ${userName}.
Their financial data this month (${month}): ${JSON.stringify(summary)}
Category breakdown: ${JSON.stringify(breakdown)}
Six-month trend: ${JSON.stringify(trend)}
Answer concisely. Use Rs. for amounts. Be practical.
Always refer to the user as ${userName}, but you MUST also use creative, finance-themed nicknames occasionally (like "Budget Boss ${userName}" or "Chai-Expert ${userName}").
If the user asks about a category, use the category names and totals from the JSON.
Do not invent transactions or amounts that are not present in the data.`;
}

function createActivityNotification(type, title, message) {
    try {
        return database.createNotification({ user_id: 1, type, title, message });
    } catch (error) {
        console.error('Notification create error:', error);
        return null;
    }
}

// ============================================
// User API - MODULE I: Read operations
// ============================================

app.get('/api/user', async (req, res) => {
    try {
        const user = database.getUserById(1);
        if (user) {
            apiResponse(res, true, user);
        } else {
            apiResponse(res, false, null, 'User not found');
        }
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

app.put('/api/user', async (req, res) => {
    try {
        const { name, email } = req.body;
        if (!name || !email) {
            return apiResponse(res, false, null, 'name and email are required');
        }

        const user = database.updateUser(1, { name: name.trim(), email: email.trim() });
        createActivityNotification('profile', 'Profile updated', `${user.name}'s profile details were saved.`);
        apiResponse(res, true, user);
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        apiResponse(res, true, database.getSettings(1));
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const { theme, currency, monthly_goal, alert_threshold, ai_advisor_enabled, receipt_scan_enabled } = req.body;
        if (theme && !['light', 'dark', 'system'].includes(theme)) {
            return apiResponse(res, false, null, 'theme must be light, dark, or system');
        }

        const settings = database.updateSettings(1, {
            theme,
            currency,
            monthly_goal,
            alert_threshold,
            ai_advisor_enabled,
            receipt_scan_enabled
        });

        createActivityNotification('settings', 'Settings saved', 'System settings were updated successfully.');
        apiResponse(res, true, settings);
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

app.get('/api/notifications', async (req, res) => {
    try {
        const month = req.query.month || getCurrentMonth();
        const stored = database.getStoredNotifications(1, 30).map(item => ({
            id: `stored-${item.id}`,
            source_id: item.id,
            type: item.type,
            title: item.title,
            message: item.message,
            is_read: Boolean(item.is_read),
            created_at: item.created_at
        }));

        const budgetAlerts = database.getBudgetHealth(month)
            .filter(item => ['critical', 'exceeded'].includes(item.status))
            .map(item => ({
                id: `budget-${item.budget_id}`,
                type: item.status === 'exceeded' ? 'danger' : 'warning',
                title: item.status === 'exceeded' ? `${item.category_name} is over budget` : `${item.category_name} is near the limit`,
                message: `${item.category_name}: Rs. ${Math.round(item.spent_amount)} spent of Rs. ${Math.round(item.budget_amount)} for ${month}.`,
                is_read: false,
                created_at: new Date().toISOString()
            }));

        const recent = database.getRecentTransactions(5).map(item => ({
            id: `transaction-${item.id}`,
            type: item.category_type === 'income' ? 'income' : 'expense',
            title: item.category_type === 'income' ? 'Income recorded' : 'Expense recorded',
            message: `${item.category_name}: Rs. ${Math.round(item.amount)}${item.description ? ` for ${item.description}` : ''}.`,
            is_read: true,
            created_at: item.created_at || item.date
        }));

        apiResponse(res, true, [...budgetAlerts, ...stored, ...recent]);
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

app.post('/api/notifications/read', async (req, res) => {
    try {
        database.markNotificationsRead(1);
        apiResponse(res, true, { read: true });
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

app.get('/api/support', async (req, res) => {
    try {
        apiResponse(res, true, database.getSupportRequests(1));
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

app.post('/api/support', async (req, res) => {
    try {
        const { subject, category, message } = req.body;
        if (!subject || !message) {
            return apiResponse(res, false, null, 'subject and message are required');
        }

        const request = database.createSupportRequest({
            user_id: 1,
            subject: subject.trim(),
            category: category || 'General',
            message: message.trim()
        });
        createActivityNotification('support', 'Support request submitted', `Ticket #${request.id} was created for ${request.category}.`);
        apiResponse(res, true, request);
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

// ============================================
// Cache Status API - Monitoring
// ============================================

app.get('/api/cache/status', async (req, res) => {
    try {
        const connected = valkey.isValkeyConnected();
        let keyCount = 0;
        let memoryUsed = 'unknown';

        if (connected) {
            keyCount = await valkey.getKeyCount();
            memoryUsed = await valkey.getMemoryInfo();
        }

        res.json({ connected, keyCount, memoryUsed });
    } catch (error) {
        console.error('Cache status error:', error);
        res.json({ connected: false, keyCount: 0, memoryUsed: 'error' });
    }
});

// ============================================
// Cache Flush API - Administration
// ============================================

app.post('/api/cache/flush', async (req, res) => {
    try {
        const isDev = process.env.NODE_ENV !== 'production';
        const secret = req.headers['x-cache-flush-secret'];

        if (!isDev && secret !== process.env.CACHE_FLUSH_SECRET) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const deletedCount = await valkey.deleteCachePattern('sf:*');
        res.json({ success: true, deletedCount });
    } catch (error) {
        console.error('Cache flush error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Categories API - MODULE II: Read operations
// ============================================

app.get('/api/categories', async (req, res) => {
    try {
        const cacheKey = 'sf:categories';
        const cached = await valkey.getCache(cacheKey);
        if (cached) {
            return apiResponse(res, true, cached);
        }

        const categories = database.getAllCategories();
        await safeSetCache(cacheKey, categories, 3600);
        apiResponse(res, true, categories);
    } catch (error) {
        const categories = database.getAllCategories();
        apiResponse(res, true, categories);
    }
});

app.post('/api/suggest-category', async (req, res) => {
    try {
        const { description, type } = req.body;
        if (!description || typeof description !== 'string' || !description.trim()) {
            return apiResponse(res, false, null, 'description is required');
        }

        if (!genAI) {
            return apiResponse(res, false, null, 'GEMINI_API_KEY is not configured.');
        }

        let categories = database.getAllCategories();
        if (type) {
            categories = categories.filter(c => c.type === type);
        }

        const categoryNames = categories.map(c => c.name).join(', ');

        const prompt = `Given this transaction description: "${description}"
And these available categories: ${categoryNames}
Return ONLY the most likely category name. No explanation.`;

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Standard model, should be valid. Using latest alias if available.
        const result = await model.generateContent(prompt);
        const suggestedName = result.response.text().trim();

        const suggestedCategory = categories.find(c => c.name.toLowerCase() === suggestedName.toLowerCase());

        apiResponse(res, true, {
            category_id: suggestedCategory ? suggestedCategory.id : null,
            category_name: suggestedName
        });
    } catch (error) {
        console.error('Category suggestion error:', error);
        apiResponse(res, false, null, error.message);
    }
});

// ============================================
// Transactions API - MODULE IV, V: Query Operations
// ============================================

app.get('/api/transactions', async (req, res) => {
    try {
        const { month, category_id, page, limit } = req.query;
        const cacheKey = `sf:transactions:${month || 'all'}:${page || 1}:${limit || 10}:${category_id || 'all'}`;

        const cached = await valkey.getCache(cacheKey);
        if (cached) {
            return apiResponse(res, true, cached);
        }

        const result = database.getTransactions({
            month,
            category_id: category_id ? parseInt(category_id) : undefined,
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 10
        });

        await safeSetCache(cacheKey, result, 120);
        apiResponse(res, true, result);
    } catch (error) {
        try {
            const result = database.getTransactions({
                month: req.query.month,
                category_id: req.query.category_id ? parseInt(req.query.category_id) : undefined,
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 10
            });
            apiResponse(res, true, result);
        } catch (dbError) {
            console.error('Transactions fallback error:', dbError);
            apiResponse(res, true, { transactions: [], total: 0, page: 1, limit: 10 });
        }
    }
});

app.post('/api/transactions', async (req, res) => {
    try {
        const { category_id, amount, description, date } = req.body;

        // Validation
        if (!category_id || !amount || !date) {
            return apiResponse(res, false, null, 'category_id, amount, and date are required');
        }
        if (amount <= 0) {
            return apiResponse(res, false, null, 'amount must be greater than 0');
        }

        const transaction = database.createTransaction({
            user_id: 1,
            category_id,
            amount,
            description: description || '',
            date
        });

        // Invalidate related caches
        await safeFlushTag('transactions');
        await safeFlushTag('summary');
        await safeFlushTag('recent');
        await safeFlushTag('breakdown');
        await safeFlushTag('expense-cat');
        await safeFlushTag('trend');
        await safeFlushTag('budget-health');
        await safeFlushTag('ai');

        createActivityNotification(
            'transaction',
            'Transaction added',
            `Rs. ${Math.round(amount)} was recorded for ${date}.`
        );
        apiResponse(res, true, transaction);
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

app.put('/api/transactions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { category_id, amount, description, date } = req.body;

        if (!category_id || !amount || !date) {
            return apiResponse(res, false, null, 'category_id, amount, and date are required');
        }

        const updated = database.updateTransaction(parseInt(id), {
            category_id,
            amount,
            description: description || '',
            date
        });

        if (updated) {
            // Invalidate related caches
            await safeFlushTag('transactions');
            await safeFlushTag('summary');
            await safeFlushTag('recent');
            await safeFlushTag('breakdown');
            await safeFlushTag('expense-cat');
            await safeFlushTag('trend');
            await safeFlushTag('budget-health');
            await safeFlushTag('ai');

            createActivityNotification(
                'transaction',
                'Transaction updated',
                `Transaction #${id} was updated.`
            );
            apiResponse(res, true, { id: parseInt(id) });
        } else {
            apiResponse(res, false, null, 'Transaction not found');
        }
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

app.delete('/api/transactions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = database.deleteTransaction(parseInt(id));

        if (deleted) {
            // Invalidate related caches
            await safeFlushTag('transactions');
            await safeFlushTag('summary');
            await safeFlushTag('recent');
            await safeFlushTag('breakdown');
            await safeFlushTag('expense-cat');
            await safeFlushTag('trend');
            await safeFlushTag('budget-health');
            await safeFlushTag('ai');

            createActivityNotification(
                'transaction',
                'Transaction deleted',
                `Transaction #${id} was removed.`
            );
            apiResponse(res, true, { id: parseInt(id) });
        } else {
            apiResponse(res, false, null, 'Transaction not found');
        }
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

// ============================================
// Summary API - MODULE V: Aggregation View
// ============================================

app.get('/api/summary', async (req, res) => {
    try {
        const { month } = req.query;
        if (!month) {
            return apiResponse(res, false, null, 'month parameter is required (YYYY-MM)');
        }

        const cacheKey = `sf:summary:${month}`;
        const cached = await valkey.getCache(cacheKey);
        if (cached) {
            return apiResponse(res, true, cached);
        }

        const summary = database.getMonthlySummary(month);
        const result = summary || { month, total_income: 0, total_expense: 0, savings: 0 };

        await safeSetCache(cacheKey, result, 300);
        apiResponse(res, true, result);
    } catch (error) {
        try {
            const { month } = req.query;
            const summary = database.getMonthlySummary(month);
            apiResponse(res, true, summary || { month, total_income: 0, total_expense: 0, savings: 0 });
        } catch (dbError) {
            console.error('Summary fallback error:', dbError);
            apiResponse(res, true, { month: req.query.month, total_income: 0, total_expense: 0, savings: 0 });
        }
    }
});

app.get('/api/recent-transactions', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        const cacheKey = `sf:recent:${limit}`;

        const cached = await valkey.getCache(cacheKey);
        if (cached) {
            return apiResponse(res, true, cached);
        }

        const transactions = database.getRecentTransactions(limit);
        await safeSetCache(cacheKey, transactions, 60);
        apiResponse(res, true, transactions);
    } catch (error) {
        const limit = parseInt(req.query.limit) || 5;
        const transactions = database.getRecentTransactions(limit);
        apiResponse(res, true, transactions);
    }
});

// ============================================
// Budgets API - MODULE II: CRUD Operations
// ============================================

app.get('/api/budgets', async (req, res) => {
    try {
        const { month } = req.query;
        const cacheKey = `sf:budgets:${month || 'all'}`;

        const cached = await valkey.getCache(cacheKey);
        if (cached) {
            return apiResponse(res, true, cached);
        }

        const budgets = database.getBudgets(month);
        await safeSetCache(cacheKey, budgets, 300);
        apiResponse(res, true, budgets);
    } catch (error) {
        try {
            const budgets = database.getBudgets(req.query.month);
            apiResponse(res, true, budgets);
        } catch (dbError) {
            console.error('Budgets fallback error:', dbError);
            apiResponse(res, true, []);
        }
    }
});

app.post('/api/budgets', async (req, res) => {
    try {
        const { category_id, amount, month } = req.body;

        if (!category_id || !amount || !month) {
            return apiResponse(res, false, null, 'category_id, amount, and month are required');
        }

        const budget = database.upsertBudget({
            user_id: 1,
            category_id,
            amount,
            month
        });

        // Invalidate related caches
        await safeFlushTag('budgets');
        await safeFlushTag('budget-health');

        createActivityNotification(
            'budget',
            'Budget saved',
            `Budget of Rs. ${Math.round(amount)} was saved for ${month}.`
        );
        apiResponse(res, true, budget);
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

app.delete('/api/budgets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = database.deleteBudget(parseInt(id));

        if (deleted) {
            // Invalidate related caches
            await safeFlushTag('budgets');
            await safeFlushTag('budget-health');

            createActivityNotification(
                'budget',
                'Budget deleted',
                `Budget #${id} was removed.`
            );
            apiResponse(res, true, { id: parseInt(id) });
        } else {
            apiResponse(res, false, null, 'Budget not found');
        }
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

// ============================================
// Budget Health API - MODULE V: View Query
// ============================================

app.get('/api/budget-health', async (req, res) => {
    try {
        const { month } = req.query;
        const cacheKey = `sf:budget-health:${month || 'current'}`;

        const cached = await valkey.getCache(cacheKey);
        if (cached) {
            return apiResponse(res, true, cached);
        }

        const health = database.getBudgetHealth(month);
        await safeSetCache(cacheKey, health, 180);
        apiResponse(res, true, health);
    } catch (error) {
        try {
            const health = database.getBudgetHealth(req.query.month);
            apiResponse(res, true, health);
        } catch (dbError) {
            console.error('Budget health fallback error:', dbError);
            apiResponse(res, true, []);
        }
    }
});

// ============================================
// Analytics API - MODULE V, VI: Advanced Queries
// ============================================

app.get('/api/trend', async (req, res) => {
    try {
        const { months } = req.query;
        const cacheKey = `sf:trend:${months || 6}`;

        const cached = await valkey.getCache(cacheKey);
        if (cached) {
            return apiResponse(res, true, cached.reverse());
        }

        const trend = database.getTrendData(parseInt(months) || 6);
        const result = trend.reverse();

        await safeSetCache(cacheKey, result, 600);
        apiResponse(res, true, result);
    } catch (error) {
        try {
            const trend = database.getTrendData(parseInt(req.query.months) || 6);
            apiResponse(res, true, trend.reverse());
        } catch (dbError) {
            console.error('Trend fallback error:', dbError);
            apiResponse(res, true, []);
        }
    }
});

app.get('/api/category-breakdown', async (req, res) => {
    try {
        const { month } = req.query;
        if (!month) {
            return apiResponse(res, false, null, 'month parameter is required (YYYY-MM)');
        }

        const cacheKey = `sf:breakdown:${month}`;
        const cached = await valkey.getCache(cacheKey);
        if (cached) {
            return apiResponse(res, true, cached);
        }

        const breakdown = database.getCategoryBreakdown(month);
        await safeSetCache(cacheKey, breakdown, 300);
        apiResponse(res, true, breakdown);
    } catch (error) {
        try {
            const breakdown = database.getCategoryBreakdown(req.query.month);
            apiResponse(res, true, breakdown);
        } catch (dbError) {
            console.error('Category breakdown fallback error:', dbError);
            apiResponse(res, true, []);
        }
    }
});

app.get('/api/expense-by-category', async (req, res) => {
    try {
        const { month } = req.query;
        if (!month) {
            return apiResponse(res, false, null, 'month parameter is required (YYYY-MM)');
        }

        const cacheKey = `sf:expense-cat:${month}`;
        const cached = await valkey.getCache(cacheKey);
        if (cached) {
            return apiResponse(res, true, cached);
        }

        const expenses = database.getExpenseByCategory(month);
        await safeSetCache(cacheKey, expenses, 300);
        apiResponse(res, true, expenses);
    } catch (error) {
        try {
            const expenses = database.getExpenseByCategory(req.query.month);
            apiResponse(res, true, expenses);
        } catch (dbError) {
            console.error('Expense by category fallback error:', dbError);
            apiResponse(res, true, []);
        }
    }
});

app.get('/api/category-history', async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 6;
        const cacheKey = `sf:cat-hist:${months}`;
        const cached = await valkey.getCache(cacheKey);
        if (cached) return apiResponse(res, true, cached);

        const history = database.getCategoryHistory(months);
        await safeSetCache(cacheKey, history, 600);
        apiResponse(res, true, history);
    } catch (error) {
        try {
            const history = database.getCategoryHistory(parseInt(req.query.months) || 6);
            apiResponse(res, true, history);
        } catch (dbError) {
            console.error('Category history fallback error:', dbError);
            apiResponse(res, true, []);
        }
    }
});

// ============================================
// AI Roast API - MODULE V: Aggregation View
// ============================================

app.get('/api/roast', async (req, res) => {
    try {
        const { month } = req.query;
        if (!month) {
            return apiResponse(res, false, null, 'month parameter is required (YYYY-MM)');
        }

        const cacheKey = `sf:ai:roast:${month}`;
        const cached = await valkey.getCache(cacheKey);
        if (cached) {
            return apiResponse(res, true, cached);
        }

        if (!groq) {
            return apiResponse(res, false, null, 'GROQ_API_KEY is not configured.');
        }

        const breakdown = database.getCategoryBreakdown(month);
        const health = database.getBudgetHealth(month);

        const user = database.getUserById(1);
        const userName = user ? user.name : 'Irfan';

        const prompt = `You are a brutally honest but funny financial advisor. 
The user's real name is ${userName}.
Roast ${userName}'s spending for ${month}:
${JSON.stringify(breakdown)}
Budget status: ${JSON.stringify(health)}
Rules for the roast:
1. Always refer to the user by their real name, ${userName}, when mentioning them.
2. YOU MUST ALSO give them a funny, slightly insulting nickname based on their name or their spending habits (e.g., "${userName} the Wallet-Burner", "Broke-Irfan"). Use this nickname in the message.
3. Write 3–4 punchy sentences. Use ₹. Be specific, funny, and actionable. Keep it concise.`;

        const completion = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.85,
            max_tokens: 500
        });

        const roast = completion.choices[0].message.content.trim();
        const result = { roast, month };

        await safeSetCache(cacheKey, result, 86400);
        apiResponse(res, true, result);
    } catch (error) {
        console.error('Roast error:', error);
        apiResponse(res, false, null, error.message);
    }
});

// ============================================
// AI Predictive Alerts API
// ============================================

app.get('/api/predict-alerts', async (req, res) => {
    console.log('GET /api/predict-alerts hit');
    try {
        const month = getCurrentMonth();
        const cacheKey = `sf:ai:predict:${month}`;

        const cached = await valkey.getCache(cacheKey);
        if (cached) {
            return apiResponse(res, true, cached);
        }

        if (!groq) {
            return apiResponse(res, false, null, 'GROQ_API_KEY is not configured.');
        }

        const health = database.getBudgetHealth(month);
        const history = database.getCategoryHistory(3);
        const dayOfMonth = database.getCurrentMonthDay();
        const totalDays = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

        if (health.length === 0) {
            return apiResponse(res, true, []);
        }

        const prompt = `You are a financial predictor. Given 3 months of spending history and current month's partial data, predict which categories will exceed budget.

Current Date: Day ${dayOfMonth} of ${totalDays}
Budgets & Current Spend: ${JSON.stringify(health)}
Historical Spend (last 3 months): ${JSON.stringify(history)}

Rules:
1. Predict the total spend for the end of the month based on current pace (linear extrapolation) and historical patterns.
2. If predicted spend > budget, it's a "high" or "medium" risk.
3. Return ONLY a JSON array of objects: [{ "category": "name", "predicted_total": 123, "budget": 100, "risk": "high"|"medium", "reason": "short explanation" }]
4. If no risks, return an empty array [].
5. Use ₹ for currency in "reason" but numbers for predicted_total and budget.
6. Be concise.`;

        const completion = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        let resultText = completion.choices[0].message.content.trim();
        let prediction = JSON.parse(resultText);

        let alerts = [];
        if (Array.isArray(prediction)) {
            alerts = prediction;
        } else if (prediction && typeof prediction === 'object') {
            alerts = prediction.alerts || prediction.risks || prediction.data ||
                     Object.values(prediction).find(val => Array.isArray(val)) || [];
        }

        await safeSetCache(cacheKey, alerts, 86400);
        apiResponse(res, true, alerts);
    } catch (error) {
        console.error('Prediction error:', error);
        apiResponse(res, false, null, error.message);
    }
});

// ============================================
// AI Finance Advisor Chat
// ============================================

app.post('/api/chat', async (req, res) => {
    try {
        const { message, month, stream } = req.body;
        const chatMonth = month || getCurrentMonth();

        if (!message || typeof message !== 'string' || !message.trim()) {
            return apiResponse(res, false, null, 'message is required');
        }

        if (!groq) {
            return res.status(503).json({
                success: false,
                error: 'GROQ_API_KEY is not configured. Add it to .env to enable the AI advisor.'
            });
        }

        const summary = database.getMonthlySummary(chatMonth) || {
            month: chatMonth,
            total_income: 0,
            total_expense: 0,
            savings: 0
        };
        const trend = database.getTrendData(6).reverse();
        const breakdown = database.getCategoryBreakdown(chatMonth);
        const monthlyExpenseByCategory = database.getExpenseByCategory(chatMonth);

        const user = database.getUserById(1);
        const userName = user ? user.name : 'Irfan';

        const systemPrompt = buildFinanceAdvisorPrompt({
            month: chatMonth,
            summary,
            trend,
            breakdown: {
                top_categories: breakdown,
                this_month_by_category: monthlyExpenseByCategory
            },
            userName
        });

        // ============================================
        // CHAT MEMORY IMPLEMENTATION (VALKEY)
        // ============================================
        const historyKey = 'sf:ai:chat:history';
        const history = await valkey.getCache(historyKey) || [];

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message.trim() }
        ];

        const completionParams = {
            model: 'llama-3.3-70b-versatile',
            messages,
            temperature: stream ? 1 : 0.35,
            top_p: 1,
            max_completion_tokens: stream ? 1024 : 450,
            stream: Boolean(stream)
        };

        if (stream) {
            const completionStream = await groq.chat.completions.create(completionParams);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('X-Accel-Buffering', 'no');

            let fullAnswer = '';
            for await (const chunk of completionStream) {
                const token = chunk.choices?.[0]?.delta?.content || '';
                if (token) {
                    fullAnswer += token;
                    res.write(token);
                }
            }

            // Save history after stream completes
            const newHistory = [...history, 
                { role: 'user', content: message.trim() }, 
                { role: 'assistant', content: fullAnswer }
            ].slice(-10); // Keep last 10 messages for memory
            await safeSetCache(historyKey, newHistory, 1800); // 30 min TTL

            return res.end();
        }

        const completion = await groq.chat.completions.create(completionParams);
        const answer = completion.choices?.[0]?.message?.content?.trim();

        // Save history for non-streaming response
        const newHistory = [...history, 
            { role: 'user', content: message.trim() }, 
            { role: 'assistant', content: answer }
        ].slice(-10);
        await safeSetCache(historyKey, newHistory, 1800);

        apiResponse(res, true, {
            answer: answer || 'I could not generate an answer from the current financial data.',
            month: chatMonth,
            model: 'llama-3.3-70b-versatile'
        });
    } catch (error) {
        console.error('Chat advisor error:', error);
        const isAuthError = error.status === 401 || error.code === 'invalid_api_key' || error.error?.code === 'invalid_api_key';
        res.status(isAuthError ? 503 : 500).json({
            success: false,
            error: isAuthError
                ? 'Groq rejected the API key. Update GROQ_API_KEY in .env to enable the AI advisor.'
                : 'The AI advisor is unavailable right now. Please try again in a moment.'
        });
    }
});

// ============================================
// AI Receipt OCR API
// ============================================

app.post('/api/ocr-receipt', upload.single('receipt'), async (req, res) => {
    try {
        if (!req.file) {
            return apiResponse(res, false, null, 'No file uploaded');
        }

        if (!genAI) {
            return apiResponse(res, false, null, 'GEMINI_API_KEY is not configured.');
        }

        const categories = database.getAllCategories();
        const categoryList = categories.map(c => `${c.name} (${c.type})`).join(', ');

        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Extract transaction details from this UPI payment screenshot (like GPay, PhonePe, Paytm).
        Return a JSON object with:
        {
            "amount": number,
            "merchant_name": "string",
            "date": "YYYY-MM-DD",
            "suggested_category_id": number | null
        }

        Rules:
        1. "amount": The numeric value of the payment.
        2. "merchant_name": The name of the person or shop paid.
        3. "date": The date of transaction in YYYY-MM-DD format. If not found, use today's date: ${new Date().toISOString().split('T')[0]}.
        4. "suggested_category_id": Match the merchant to the most likely category ID from this list:
        ${JSON.stringify(categories.map(c => ({ id: c.id, name: c.name, type: c.type })))}

        If the image is not a payment receipt or is unreadable, return {"error": "Could not read receipt"}.`;

        const imagePart = {
            inlineData: {
                data: req.file.buffer.toString('base64'),
                mimeType: req.file.mimetype
            }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text().trim();

        const extractedData = JSON.parse(text);

        if (extractedData.error) {
            return apiResponse(res, false, null, extractedData.error);
        }

        apiResponse(res, true, extractedData);
    } catch (error) {
        console.error('OCR Error:', error);
        apiResponse(res, false, null, 'Failed to process receipt. Please ensure it is a clear screenshot of a UPI payment.');
    }
});

// ============================================
// Recurring Transactions API
// ============================================

app.get('/api/recurring', async (req, res) => {
    try {
        const cacheKey = 'sf:recurring';
        const cached = await valkey.getCache(cacheKey);
        if (cached) {
            return apiResponse(res, true, cached);
        }

        const recurring = database.getRecurringTransactions();
        await safeSetCache(cacheKey, recurring, 300);
        apiResponse(res, true, recurring);
    } catch (error) {
        const recurring = database.getRecurringTransactions();
        apiResponse(res, true, recurring);
    }
});

app.post('/api/recurring', async (req, res) => {
    try {
        const { category_id, amount, description, frequency, next_due_date } = req.body;

        if (!category_id || !amount || !frequency || !next_due_date) {
            return apiResponse(res, false, null, 'All fields are required');
        }

        const recurring = database.createRecurringTransaction({
            user_id: 1,
            category_id,
            amount,
            description: description || '',
            frequency,
            next_due_date
        });

        // Invalidate related caches
        await safeFlushTag('recurring');

        apiResponse(res, true, recurring);
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

app.delete('/api/recurring/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = database.deleteRecurringTransaction(parseInt(id));

        if (deleted) {
            // Invalidate related caches
            await safeFlushTag('recurring');

            apiResponse(res, true, { id: parseInt(id) });
        } else {
            apiResponse(res, false, null, 'Recurring transaction not found');
        }
    } catch (error) {
        apiResponse(res, false, null, error.message);
    }
});

// Serve index.html for all other routes (SPA), but exclude API routes
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (req.path.startsWith('/api')) {
        return res.status(err.status || 500).json({
            success: false,
            error: err.message || 'Internal server error'
        });
    }
    next(err);
});

// Start server
app.listen(PORT, () => {
    console.log(`SmartFinance running at http://localhost:${PORT}`);
});
