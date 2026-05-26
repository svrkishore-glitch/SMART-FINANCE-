const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;

// Railway recommends using /data for persistent volumes
const isProd = process.env.NODE_ENV === 'production';
const dbFolder = isProd ? '/data' : __dirname;
const dbPath = path.join(dbFolder, 'smartfinance.db');

// Ensure data directory exists in production if using volume
if (isProd && !fs.existsSync(dbFolder)) {
    try {
        fs.mkdirSync(dbFolder, { recursive: true });
    } catch (err) {
        console.warn(`[Database] Could not create ${dbFolder}, falling back to local`, err.message);
    }
}

// ============================================
// Database Initialization
// ============================================

async function initializeDatabase() {
    const SQL = await initSqlJs();
    const dbExists = fs.existsSync(dbPath);

    // Load existing database or create new one
    if (dbExists) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
        console.log(`[Database] Loaded existing DB from ${dbPath}`);
    } else {
        db = new SQL.Database();
        console.log('[Database] Created new in-memory DB');
    }

    // Always run schema (should be idempotent with IF NOT EXISTS)
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schema);
        console.log('[Database] Schema applied');
    }

    // Run seed data ONLY if this is a fresh database
    if (!dbExists) {
        const seedPath = path.join(__dirname, 'seed.sql');
        if (fs.existsSync(seedPath)) {
            const seed = fs.readFileSync(seedPath, 'utf8');
            db.exec(seed);
            console.log('[Database] Initial seed data applied');
        }
    }

    // Save to disk immediately after init
    saveDatabase();
    return db;
}

function saveDatabase() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
}

function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDatabase() first.');
    }
    return db;
}

// ============================================
// Helper Functions
// ============================================

function queryAll(sql, params = []) {
    const stmt = getDb().prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function queryOne(sql, params = []) {
    const results = queryAll(sql, params);
    return results[0] || null;
}

function runQuery(sql, params = []) {
    getDb().run(sql, params);
    saveDatabase();
    return { lastID: getDb().getRowsModified() };
}

// ============================================
// User Functions - MODULE I: Entity-Relationship
// ============================================

function getUserById(userId) {
    // MODULE I: Entity extraction from Users table
    return queryOne('SELECT id, name, email, created_at FROM users WHERE id = ?', [userId]);
}

function updateUser(userId, user) {
    const { name, email } = user;
    runQuery(`
        UPDATE users
        SET name = ?, email = ?
        WHERE id = ?
    `, [name, email, userId]);
    return getUserById(userId);
}

function getAllUsers() {
    return queryAll('SELECT id, name, email, created_at FROM users');
}

// ============================================
// Category Functions - MODULE II: Relational Model
// ============================================

function getAllCategories() {
    // MODULE II: Simple SELECT from categories table
    return queryAll('SELECT * FROM categories ORDER BY type, name');
}

function getCategoriesByType(type) {
    return queryAll('SELECT * FROM categories WHERE type = ? ORDER BY name', [type]);
}

function getCategoryById(categoryId) {
    return queryOne('SELECT * FROM categories WHERE id = ?', [categoryId]);
}

// ============================================
// Transaction Functions - MODULE IV, V, VI: SQL Operations
// ============================================

function getTransactions(params) {
    // MODULE IV: Relational algebra - SELECT with filters
    // MODULE V: Aggregation with pagination
    const { month, category_id, page = 1, limit = 10 } = params;
    const offset = (page - 1) * limit;

    let query = `
        SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, c.type as category_type
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = 1
    `;
    const queryParams = [];

    if (month) {
        query += ' AND strftime("%Y-%m", t.date) = ?';
        queryParams.push(month);
    }
    if (category_id) {
        query += ' AND t.category_id = ?';
        queryParams.push(category_id);
    }

    query += ' ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);

    const transactions = queryAll(query, queryParams);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM transactions WHERE user_id = 1';
    const countParams = [];
    if (month) {
        countQuery += ' AND strftime("%Y-%m", date) = ?';
        countParams.push(month);
    }
    if (category_id) {
        countQuery += ' AND category_id = ?';
        countParams.push(category_id);
    }

    const total = queryOne(countQuery, countParams)?.total || 0;

    return { transactions, total, page, limit };
}

function createTransaction(transaction) {
    // MODULE II: INSERT - create new transaction
    const { user_id, category_id, amount, description, date } = transaction;
    runQuery(`
        INSERT INTO transactions (user_id, category_id, amount, description, date)
        VALUES (?, ?, ?, ?, ?)
    `, [user_id, category_id, amount, description, date]);

    return queryOne(`
        SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, c.type as category_type
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ?
        ORDER BY t.id DESC
        LIMIT 1
    `, [user_id]);
}

function updateTransaction(id, transaction) {
    // MODULE II: UPDATE - modify existing transaction
    const { category_id, amount, description, date } = transaction;
    runQuery(`
        UPDATE transactions
        SET category_id = ?, amount = ?, description = ?, date = ?
        WHERE id = ? AND user_id = 1
    `, [category_id, amount, description, date, id]);

    return true;
}

function deleteTransaction(id) {
    // MODULE II: DELETE - remove transaction
    runQuery('DELETE FROM transactions WHERE id = ? AND user_id = 1', [id]);
    return true;
}

function getRecentTransactions(limit = 5) {
    // MODULE V: Aggregation with LIMIT
    return queryAll(`
        SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, c.type as category_type
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = 1
        ORDER BY t.date DESC, t.id DESC
        LIMIT ?
    `, [limit]);
}

// ============================================
// Summary Functions - MODULE V, VI: Aggregation Views
// ============================================

function getMonthlySummary(month) {
    // MODULE V: Uses VIEW with GROUP BY and CASE for conditional aggregation
    return queryOne('SELECT * FROM monthly_summary WHERE month = ?', [month]);
}

function getBudgetHealth(month) {
    // MODULE V, VI: Uses VIEW but allows filtering by month
    const query = month
        ? 'SELECT * FROM budget_health WHERE month = ?'
        : 'SELECT * FROM budget_health';
    return month ? queryAll(query, [month]) : queryAll(query);
}

// ============================================
// Budget Functions - MODULE II, III: CRUD Operations
// ============================================

function getBudgets(month) {
    // MODULE II: SELECT with optional filter
    if (month) {
        return queryAll(`
            SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
            FROM budgets b
            JOIN categories c ON b.category_id = c.id
            WHERE b.user_id = 1 AND b.month = ?
            ORDER BY c.name
        `, [month]);
    }
    return queryAll(`
        SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
        FROM budgets b
        JOIN categories c ON b.category_id = c.id
        WHERE b.user_id = 1
        ORDER BY b.month DESC, c.name
    `);
}

function upsertBudget(budget) {
    // MODULE II: INSERT OR REPLACE - upsert operation
    const { user_id, category_id, amount, month } = budget;
    runQuery(`
        INSERT OR REPLACE INTO budgets (user_id, category_id, amount, month)
        VALUES (?, ?, ?, ?)
    `, [user_id, category_id, amount, month]);
    return { user_id, category_id, amount, month };
}

function deleteBudget(id) {
    runQuery('DELETE FROM budgets WHERE id = ? AND user_id = 1', [id]);
    return true;
}

// ============================================
// Analytics Functions - MODULE V, VI: Advanced Queries
// ============================================

function getTrendData(months = 6) {
    // MODULE V: Aggregation across multiple months
    return queryAll(`
        SELECT * FROM monthly_summary
        ORDER BY month DESC
        LIMIT ?
    `, [months]);
}

function getCategoryBreakdown(month) {
    // MODULE V: Direct aggregation instead of hardcoded view to support month filtering
    return queryAll(`
        SELECT
            c.id as category_id,
            c.name as category_name,
            c.icon as category_icon,
            c.color as category_color,
            c.type as category_type,
            SUM(t.amount) as total_amount,
            COUNT(*) as transaction_count
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = 1
            AND c.type = 'expense'
            AND strftime('%Y-%m', t.date) = ?
        GROUP BY c.id, c.name, c.icon, c.color, c.type
        ORDER BY total_amount DESC
        LIMIT 5
    `, [month]);
}

function getExpenseByCategory(month) {
    // MODULE V: GROUP BY category with conditional sum
    return queryAll(`
        SELECT c.id, c.name, c.icon, c.color,
               SUM(t.amount) as total, COUNT(*) as count
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = 1
            AND c.type = 'expense'
            AND strftime('%Y-%m', t.date) = ?
        GROUP BY c.id, c.name, c.icon, c.color
        ORDER BY total DESC
    `, [month]);
}

function getCategoryHistory(months = 6) {
    const numMonths = Number(months) || 6;
    const result = queryAll(`
        SELECT c.id as category_id, c.name as category_name, c.icon as category_icon,
               c.color as category_color, strftime('%Y-%m', t.date) as month,
               SUM(t.amount) as total_amount
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = 1 AND c.type = 'expense'
        GROUP BY c.id, c.name, c.icon, c.color, month
        ORDER BY month ASC, total_amount DESC
    `);
    const uniqueMonths = [...new Set(result.map(r => r.month))].sort().slice(-numMonths);
    return result.filter(r => uniqueMonths.includes(r.month));
}

function getCurrentMonthDay() {
    return new Date().getDate();
}

// ============================================
// Recurring Transactions - MODULE II: Additional Entity
// ============================================

function getRecurringTransactions() {
    return queryAll(`
        SELECT r.*, c.name as category_name, c.icon as category_icon, c.color as category_color
        FROM recurring_transactions r
        JOIN categories c ON r.category_id = c.id
        WHERE r.user_id = 1
        ORDER BY r.next_due_date
    `);
}

function createRecurringTransaction(transaction) {
    const { user_id, category_id, amount, description, frequency, next_due_date } = transaction;
    runQuery(`
        INSERT INTO recurring_transactions (user_id, category_id, amount, description, frequency, next_due_date)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [user_id, category_id, amount, description, frequency, next_due_date]);

    return queryOne(`
        SELECT r.*, c.name as category_name, c.icon as category_icon, c.color as category_color
        FROM recurring_transactions r
        JOIN categories c ON r.category_id = c.id
        WHERE r.user_id = ?
        ORDER BY r.id DESC
        LIMIT 1
    `, [user_id]);
}

function deleteRecurringTransaction(id) {
    runQuery('DELETE FROM recurring_transactions WHERE id = ? AND user_id = 1', [id]);
    return true;
}

// ============================================
// Settings, Notifications, and Support
// ============================================

function getSettings(userId = 1) {
    let settings = queryOne('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
    if (!settings) {
        runQuery(`
            INSERT INTO user_settings (user_id, theme, currency, monthly_goal, alert_threshold, ai_advisor_enabled, receipt_scan_enabled)
            VALUES (?, 'dark', 'INR', 1000, 80, 1, 1)
        `, [userId]);
        settings = queryOne('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
    }
    return settings;
}

function updateSettings(userId = 1, settings = {}) {
    const current = getSettings(userId);
    const next = {
        theme: settings.theme || current.theme || 'dark',
        currency: settings.currency || current.currency || 'INR',
        monthly_goal: Number(settings.monthly_goal ?? current.monthly_goal ?? 1000),
        alert_threshold: Number(settings.alert_threshold ?? current.alert_threshold ?? 80),
        ai_advisor_enabled: settings.ai_advisor_enabled === undefined ? current.ai_advisor_enabled : Number(Boolean(settings.ai_advisor_enabled)),
        receipt_scan_enabled: settings.receipt_scan_enabled === undefined ? current.receipt_scan_enabled : Number(Boolean(settings.receipt_scan_enabled))
    };

    runQuery(`
        INSERT OR REPLACE INTO user_settings
            (user_id, theme, currency, monthly_goal, alert_threshold, ai_advisor_enabled, receipt_scan_enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
        userId,
        next.theme,
        next.currency,
        next.monthly_goal,
        next.alert_threshold,
        next.ai_advisor_enabled,
        next.receipt_scan_enabled
    ]);

    return getSettings(userId);
}

function createNotification(notification) {
    const { user_id = 1, type, title, message } = notification;
    runQuery(`
        INSERT INTO notifications (user_id, type, title, message)
        VALUES (?, ?, ?, ?)
    `, [user_id, type, title, message]);
    return queryOne(`
        SELECT * FROM notifications
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
    `, [user_id]);
}

function getStoredNotifications(userId = 1, limit = 20) {
    return queryAll(`
        SELECT * FROM notifications
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
    `, [userId, limit]);
}

function markNotificationsRead(userId = 1) {
    runQuery('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
    return true;
}

function createSupportRequest(request) {
    const { user_id = 1, subject, category = 'General', message } = request;
    runQuery(`
        INSERT INTO support_requests (user_id, subject, category, message)
        VALUES (?, ?, ?, ?)
    `, [user_id, subject, category, message]);
    return queryOne(`
        SELECT * FROM support_requests
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
    `, [user_id]);
}

function getSupportRequests(userId = 1) {
    return queryAll(`
        SELECT * FROM support_requests
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
    `, [userId]);
}

// ============================================
// Export all functions
// ============================================

module.exports = {
    initializeDatabase,
    getDb,
    getUserById,
    updateUser,
    getAllUsers,
    getAllCategories,
    getCategoriesByType,
    getCategoryById,
    getTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    getRecentTransactions,
    getMonthlySummary,
    getBudgetHealth,
    getBudgets,
    upsertBudget,
    deleteBudget,
    getTrendData,
    getCategoryBreakdown,
    getExpenseByCategory,
    getCategoryHistory,
    getCurrentMonthDay,
    getRecurringTransactions,
    createRecurringTransaction,
    deleteRecurringTransaction,
    getSettings,
    updateSettings,
    createNotification,
    getStoredNotifications,
    markNotificationsRead,
    createSupportRequest,
    getSupportRequests
};
