-- SmartFinance Seed Data
-- 6 months of realistic average Indian college student transactions
-- Adjusted for a student with a tighter ~6k-7k monthly budget

-- Full Cleanup
DELETE FROM transactions;
DELETE FROM budgets;
DELETE FROM recurring_transactions;
DELETE FROM categories;
DELETE FROM users;

INSERT OR IGNORE INTO users (id, name, email) VALUES (1, 'Irfan', 'irfan@example.com');

-- categories (type = 'income')
INSERT OR IGNORE INTO categories (id, name, type, icon, color) VALUES
(1, 'Pocket Money', 'income', '💰', '#3FB950'),
(2, 'Freelance', 'income', '💻', '#58A6FF'),
(3, 'Stipend', 'income', '🎓', '#A371F7'),
(4, 'Part-Time', 'income', '⚡', '#F0883E'),
(5, 'Internship', 'income', '💼', '#58A6FF'),
(19, 'Other Income', 'income', '✨', '#3FB950');

-- categories (type = 'expense')
INSERT OR IGNORE INTO categories (id, name, type, icon, color) VALUES
(6, 'UPI Payment', 'expense', '📱', '#58A6FF'),
(7, 'Mess/Food', 'expense', '🍱', '#F0883E'),
(8, 'Tea & Snacks', 'expense', '☕', '#E3B341'),
(9, 'Transport', 'expense', '🛺', '#58A6FF'),
(10, 'Mobile Recharge', 'expense', '📶', '#A371F7'),
(11, 'Entertainment', 'expense', '🎬', '#F85149'),
(12, 'Shopping', 'expense', '🛍️', '#E3B341'),
(13, 'Subscription', 'expense', '📺', '#A371F7'),
(14, 'Rent/Hostel', 'expense', '🏠', '#F85149'),
(15, 'Medical', 'expense', '💊', '#3FB950'),
(16, 'Books & Stationery', 'expense', '📚', '#E3B341'),
(17, 'Tuition Fees', 'expense', '🎓', '#F85149'),
(18, 'Other', 'expense', '📦', '#8B949E');

-- December 2025 (Income: 6000, Expense: 5150, Savings: 850)
INSERT INTO transactions (user_id, category_id, amount, description, date) VALUES
(1, 1, 5000, 'Monthly pocket money', '2025-12-01'),
(1, 4, 1000, 'Tutoring before exams', '2025-12-05'),
(1, 14, 2500, 'Hostel/Shared Rent', '2025-12-02'),
(1, 7, 1800, 'Mess Monthly Bill', '2025-12-02'),
(1, 10, 239, 'Monthly mobile recharge', '2025-12-03'),
(1, 9, 25, 'Bus to exam center', '2025-12-04'),
(1, 8, 15, 'Cutting chai at stall', '2025-12-06'),
(1, 16, 180, 'Exam guide books', '2025-12-10'),
(1, 8, 20, 'Vada pav after exam', '2025-12-15'),
(1, 11, 120, 'Movie night with friends', '2025-12-20'),
(1, 6, 150, 'UPI - Cold coffee treat', '2025-12-22'),
(1, 18, 50, 'Printouts for project', '2025-12-28');

-- January 2026 (Income: 6800, Expense: 5900, Savings: 900)
INSERT INTO transactions (user_id, category_id, amount, description, date) VALUES
(1, 1, 5500, 'New year pocket money', '2026-01-02'),
(1, 2, 800, 'Canva design gig payment', '2026-01-12'),
(1, 3, 500, 'Semester stipend', '2026-01-20'),
(1, 14, 2500, 'Hostel/Shared Rent', '2026-01-02'),
(1, 7, 1800, 'Mess Monthly Bill', '2026-01-02'),
(1, 10, 239, 'Monthly mobile recharge', '2026-01-03'),
(1, 9, 30, 'Auto to railway station', '2026-01-05'),
(1, 8, 25, 'Samosa and tea break', '2026-01-08'),
(1, 12, 500, 'New year clothes from market', '2026-01-14'),
(1, 11, 200, 'New year party contribution', '2026-01-15'),
(1, 6, 300, 'UPI - Zomato order with roomies', '2026-01-22'),
(1, 18, 80, 'College ID card renewal', '2026-01-28'),
(1, 15, 40, 'Band-aid and ointment', '2026-01-30');

-- February 2026 (Income: 6200, Expense: 5350, Savings: 850)
INSERT INTO transactions (user_id, category_id, amount, description, date) VALUES
(1, 1, 5000, 'Monthly pocket money', '2026-02-01'),
(1, 4, 700, 'Tutoring 8th grade student', '2026-02-08'),
(1, 5, 500, 'Internship travel allowance', '2026-02-20'),
(1, 14, 2500, 'Hostel/Shared Rent', '2026-02-02'),
(1, 7, 1800, 'Mess Monthly Bill', '2026-02-02'),
(1, 10, 239, 'Monthly mobile recharge', '2026-02-03'),
(1, 9, 35, 'Bus and auto combined fare', '2026-02-05'),
(1, 8, 15, 'Morning chai at canteen', '2026-02-07'),
(1, 16, 100, 'Graph notebook and pens', '2026-02-10'),
(1, 11, 80, 'Weekend OTT streaming split', '2026-02-15'),
(1, 6, 180, 'UPI - Momos and pepsi', '2026-02-22'),
(1, 18, 60, 'Passport size photos', '2026-02-27');

-- March 2026 (Income: 6500, Expense: 5700, Savings: 800)
INSERT INTO transactions (user_id, category_id, amount, description, date) VALUES
(1, 1, 5500, 'Pocket money from home', '2026-03-01'),
(1, 4, 1000, 'Tutor work payment', '2026-03-05'),
(1, 14, 2500, 'Hostel/Shared Rent', '2026-03-02'),
(1, 7, 1800, 'Mess Monthly Bill', '2026-03-02'),
(1, 10, 239, 'Monthly mobile recharge', '2026-03-03'),
(1, 9, 20, 'Bus fare to college', '2026-03-04'),
(1, 8, 15, 'Evening chai', '2026-03-05'),
(1, 8, 20, 'Samosa at canteen', '2026-03-07'),
(1, 16, 150, 'Notebooks and basic pens', '2026-03-10'),
(1, 18, 50, 'Assignment photocopies', '2026-03-15'),
(1, 12, 400, 'Thrift store jacket', '2026-03-20'),
(1, 6, 120, 'UPI - Street food dinner', '2026-03-25'),
(1, 15, 30, 'Generic fever meds', '2026-03-28'),
(1, 13, 356, 'Annual basic streaming (split)', '2026-03-29');

-- April 2026 (Income: 7000, Expense: 6100, Savings: 900)
INSERT INTO transactions (user_id, category_id, amount, description, date) VALUES
(1, 1, 6000, 'Increased pocket money', '2026-04-01'),
(1, 2, 1000, 'Poster design gig', '2026-04-10'),
(1, 14, 2500, 'Hostel/Shared Rent', '2026-04-02'),
(1, 7, 1800, 'Mess Monthly Bill', '2026-04-02'),
(1, 10, 239, 'Monthly mobile recharge', '2026-04-03'),
(1, 8, 25, 'Maggi and Tea', '2026-04-05'),
(1, 9, 30, 'Auto to exam center', '2026-04-06'),
(1, 16, 200, 'Used textbook from senior', '2026-04-12'),
(1, 11, 150, 'Student discount movie ticket', '2026-04-15'),
(1, 6, 450, 'UPI - Shared outing (pizza split)', '2026-04-20'),
(1, 18, 100, 'Lab coat dry clean', '2026-04-25'),
(1, 8, 15, 'Chai on rainy day', '2026-04-28'),
(1, 12, 350, 'Basic backpack from local market', '2026-04-30');

-- May 2026 (Income so far: 6300, Expense: 5129)
INSERT INTO transactions (user_id, category_id, amount, description, date) VALUES
(1, 1, 5500, 'Monthly pocket money', '2026-05-01'),
(1, 4, 800, 'Tutoring payment', '2026-05-10'),
(1, 14, 2500, 'Hostel/Shared Rent', '2026-05-02'),
(1, 7, 1800, 'Mess Monthly Bill', '2026-05-02'),
(1, 10, 239, 'Monthly mobile recharge', '2026-05-03'),
(1, 9, 40, 'Shared auto fare', '2026-05-05'),
(1, 8, 20, 'Bread omelette', '2026-05-07'),
(1, 16, 120, 'Exam stationery set', '2026-05-08'),
(1, 18, 60, 'Printouts and Binding', '2026-05-11'),
(1, 6, 250, 'UPI - Birthday gift contribution', '2026-05-13'),
(1, 8, 100, 'Ice cream and snacks', '2026-05-14');

-- Budgets for all months
INSERT OR REPLACE INTO budgets (user_id, category_id, amount, month) VALUES
(1, 7, 1800, '2025-12'),
(1, 9, 300, '2025-12'),
(1, 8, 500, '2025-12'),
(1, 16, 400, '2025-12'),
(1, 11, 200, '2025-12'),
(1, 6, 300, '2025-12'),
(1, 7, 1800, '2026-01'),
(1, 9, 300, '2026-01'),
(1, 8, 500, '2026-01'),
(1, 12, 600, '2026-01'),
(1, 11, 300, '2026-01'),
(1, 6, 400, '2026-01'),
(1, 7, 1800, '2026-02'),
(1, 9, 350, '2026-02'),
(1, 8, 500, '2026-02'),
(1, 16, 400, '2026-02'),
(1, 11, 200, '2026-02'),
(1, 6, 300, '2026-02'),
(1, 7, 1800, '2026-03'),
(1, 9, 300, '2026-03'),
(1, 8, 500, '2026-03'),
(1, 16, 400, '2026-03'),
(1, 12, 500, '2026-03'),
(1, 11, 200, '2026-03'),
(1, 7, 1800, '2026-04'),
(1, 9, 300, '2026-04'),
(1, 8, 500, '2026-04'),
(1, 16, 400, '2026-04'),
(1, 11, 200, '2026-04'),
(1, 6, 500, '2026-04'),
(1, 7, 1800, '2026-05'),
(1, 9, 300, '2026-05'),
(1, 8, 500, '2026-05'),
(1, 16, 400, '2026-05'),
(1, 12, 500, '2026-05'),
(1, 11, 200, '2026-05');