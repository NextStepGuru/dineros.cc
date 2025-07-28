-- Populate RegisterEntryType table with all entry types
INSERT INTO register_entry_type (id, name, updated_at) VALUES
(1, 'Balance Entry', NOW()),
(2, 'Interest Charge', NOW()),
(3, 'Interest Earned', NOW()),
(4, 'Loan Payment', NOW()),
(5, 'Credit Card Payment', NOW()),
(6, 'Transfer', NOW()),
(7, 'Manual Entry', NOW()),
(8, 'Plaid Transaction', NOW()),
(9, 'Reoccurrence Entry', NOW()),
(10, 'Initial Balance', NOW());
