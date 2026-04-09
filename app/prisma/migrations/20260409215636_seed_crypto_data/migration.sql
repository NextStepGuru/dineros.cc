-- Seed reference data (upserts only; DDL lives in crypto_wallet_support migration).

INSERT INTO `account_type` (`id`, `type`, `name`, `class`, `is_credit`, `accrues_balance_growth`, `updated_at`)
VALUES (23, 'crypto-wallet', 'Crypto Wallet', 'crypto', 0, 0, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `type` = VALUES(`type`),
  `name` = VALUES(`name`),
  `class` = VALUES(`class`),
  `is_credit` = VALUES(`is_credit`),
  `accrues_balance_growth` = VALUES(`accrues_balance_growth`),
  `updated_at` = VALUES(`updated_at`);

INSERT INTO `evm_chain` (`id`, `name`, `network_id`, `symbol`, `explorer`, `is_default`, `updated_at`) VALUES
(1,  'Ethereum',          'eth-mainnet',      'ETH',  'https://etherscan.io',        1, CURRENT_TIMESTAMP(3)),
(2,  'Polygon',           'polygon-mainnet',  'POL',  'https://polygonscan.com',     0, CURRENT_TIMESTAMP(3)),
(3,  'Arbitrum One',      'arb-mainnet',      'ETH',  'https://arbiscan.io',         0, CURRENT_TIMESTAMP(3)),
(4,  'Optimism',          'opt-mainnet',      'ETH',  'https://optimistic.etherscan.io', 0, CURRENT_TIMESTAMP(3)),
(5,  'Base',              'base-mainnet',     'ETH',  'https://basescan.org',        0, CURRENT_TIMESTAMP(3)),
(6,  'Avalanche C-Chain', 'avax-mainnet',     'AVAX', 'https://snowscan.xyz',        0, CURRENT_TIMESTAMP(3)),
(7,  'BNB Smart Chain',   'bnb-mainnet',      'BNB',  'https://bscscan.com',         0, CURRENT_TIMESTAMP(3)),
(8,  'zkSync Era',        'zksync-mainnet',   'ETH',  'https://explorer.zksync.io',  0, CURRENT_TIMESTAMP(3)),
(9,  'Linea',             'linea-mainnet',    'ETH',  'https://lineascan.build',     0, CURRENT_TIMESTAMP(3)),
(10, 'Scroll',            'scroll-mainnet',   'ETH',  'https://scrollscan.com',      0, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `network_id` = VALUES(`network_id`),
  `symbol` = VALUES(`symbol`),
  `explorer` = VALUES(`explorer`),
  `is_default` = VALUES(`is_default`),
  `updated_at` = VALUES(`updated_at`);
