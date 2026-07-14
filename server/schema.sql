CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('player', 'admin') NOT NULL DEFAULT 'player',
    status ENUM('active', 'locked') NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMP NULL DEFAULT NULL,
    failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
);

CREATE TABLE IF NOT EXISTS game_catalog (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    entity_type VARCHAR(32) NOT NULL,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    image_url VARCHAR(512) NULL,
    buy_price INT NOT NULL DEFAULT 0,
    sell_price INT NOT NULL DEFAULT 0,
    growth_seconds INT NOT NULL DEFAULT 0,
    xp_reward INT NOT NULL DEFAULT 0,
    unlock_level INT NOT NULL DEFAULT 1,
    config_json JSON NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_catalog_type_code (entity_type, code),
    KEY idx_catalog_type_active_sort (entity_type, is_active, sort_order)
);

CREATE TABLE IF NOT EXISTS shop_categories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    catalog_entity_type VARCHAR(32) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_shop_category_code (code),
    UNIQUE KEY uq_shop_category_name (name)
);

CREATE TABLE IF NOT EXISTS shop_products (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    catalog_item_id BIGINT UNSIGNED NOT NULL,
    category_id BIGINT UNSIGNED NOT NULL,
    sale_type ENUM('none', 'percent', 'fixed') NOT NULL DEFAULT 'none',
    sale_value DECIMAL(12,2) NOT NULL DEFAULT 0,
    flash_sale_price INT UNSIGNED NULL,
    flash_sale_start DATETIME NULL,
    flash_sale_end DATETIME NULL,
    flash_stock_limit INT UNSIGNED NULL,
    flash_sold_count INT UNSIGNED NOT NULL DEFAULT 0,
    purchase_limit INT UNSIGNED NOT NULL DEFAULT 0,
    purchase_limit_type ENUM('none', 'daily', 'weekly', 'account') NOT NULL DEFAULT 'none',
    display_order INT NOT NULL DEFAULT 0,
    status ENUM('selling', 'hidden', 'out_of_stock', 'discontinued') NOT NULL DEFAULT 'selling',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_shop_product_catalog (catalog_item_id),
    KEY idx_shop_product_listing (status, is_active, display_order),
    KEY idx_shop_product_category (category_id),
    CONSTRAINT fk_shop_product_catalog FOREIGN KEY (catalog_item_id) REFERENCES game_catalog(id) ON DELETE CASCADE,
    CONSTRAINT fk_shop_product_category FOREIGN KEY (category_id) REFERENCES shop_categories(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS game_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    banner_url VARCHAR(512) NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    reward_json JSON NULL,
    condition_json JSON NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_events_active_dates (is_active, starts_at, ends_at)
);

CREATE TABLE IF NOT EXISTS system_settings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    group_name VARCHAR(64) NOT NULL,
    setting_key VARCHAR(128) NOT NULL,
    setting_name VARCHAR(160) NOT NULL,
    setting_value TEXT NOT NULL,
    default_value TEXT NOT NULL,
    value_type ENUM('number', 'boolean', 'string', 'json') NOT NULL,
    description VARCHAR(500) NULL,
    validation_json JSON NULL,
    is_editable TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_system_settings_key (setting_key),
    KEY idx_system_settings_group (group_name)
);

CREATE TABLE IF NOT EXISTS system_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NULL,
    actor_role ENUM('player', 'admin', 'system') NOT NULL DEFAULT 'system',
    action VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NULL,
    entity_id VARCHAR(64) NULL,
    details_json JSON NULL,
    ip_address VARCHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_logs_action_created (action, created_at),
    KEY idx_logs_user_created (user_id, created_at),
    CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS farms (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(64) NOT NULL DEFAULT 'Happy Farm',
    coins INT NOT NULL DEFAULT 0,
    gems INT NOT NULL DEFAULT 0,
    imported_local_save TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_farms_user_id (user_id),
    CONSTRAINT fk_farms_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_state (
    user_id BIGINT UNSIGNED NOT NULL,
    state_json JSON NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_player_state_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_items (
    user_id BIGINT UNSIGNED NOT NULL,
    category VARCHAR(32) NOT NULL,
    item_id VARCHAR(64) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, category, item_id),
    CONSTRAINT fk_inventory_items_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop_purchases (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    shop_product_id BIGINT UNSIGNED NOT NULL,
    period_key VARCHAR(32) NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 0,
    total_spent BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_shop_purchase_period (user_id, shop_product_id, period_key),
    KEY idx_shop_purchase_product (shop_product_id),
    CONSTRAINT fk_shop_purchase_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_shop_purchase_product FOREIGN KEY (shop_product_id) REFERENCES shop_products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS market_listings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    seller_user_id BIGINT UNSIGNED NOT NULL,
    farm_id BIGINT UNSIGNED NOT NULL,
    category VARCHAR(32) NOT NULL,
    item_id VARCHAR(64) NOT NULL,
    quantity INT NOT NULL,
    price_each INT NOT NULL,
    status ENUM('active', 'sold', 'cancelled') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_market_status_category (status, category, item_id),
    KEY idx_market_farm_status (farm_id, status),
    CONSTRAINT fk_market_seller FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_market_farm FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS market_transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    listing_id BIGINT UNSIGNED NOT NULL,
    buyer_user_id BIGINT UNSIGNED NOT NULL,
    seller_user_id BIGINT UNSIGNED NOT NULL,
    category VARCHAR(32) NOT NULL,
    item_id VARCHAR(64) NOT NULL,
    quantity INT NOT NULL,
    total_price INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_market_transactions_buyer (buyer_user_id),
    KEY idx_market_transactions_seller (seller_user_id),
    CONSTRAINT fk_market_tx_listing FOREIGN KEY (listing_id) REFERENCES market_listings(id),
    CONSTRAINT fk_market_tx_buyer FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_market_tx_seller FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS delivery_orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    week_id VARCHAR(16) NOT NULL,
    slot_index TINYINT UNSIGNED NOT NULL,
    status ENUM('active', 'trashed') NOT NULL DEFAULT 'active',
    items_json JSON NOT NULL,
    reward_coins INT NOT NULL DEFAULT 0,
    reward_xp INT NOT NULL DEFAULT 0,
    weekly_points INT NOT NULL DEFAULT 0,
    generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cooldown_until TIMESTAMP NULL DEFAULT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_delivery_user_week_slot (user_id, week_id, slot_index),
    KEY idx_delivery_user_week_status (user_id, week_id, status),
    CONSTRAINT fk_delivery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS weekly_scores (
    user_id BIGINT UNSIGNED NOT NULL,
    week_id VARCHAR(16) NOT NULL,
    points INT NOT NULL DEFAULT 0,
    deliveries INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, week_id),
    KEY idx_weekly_scores_rank (week_id, points, deliveries),
    CONSTRAINT fk_weekly_scores_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS weekly_reward_claims (
    user_id BIGINT UNSIGNED NOT NULL,
    week_id VARCHAR(16) NOT NULL,
    reward_type ENUM('milestone', 'rank') NOT NULL,
    reward_id VARCHAR(32) NOT NULL,
    claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, week_id, reward_type, reward_id),
    CONSTRAINT fk_weekly_reward_claims_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
