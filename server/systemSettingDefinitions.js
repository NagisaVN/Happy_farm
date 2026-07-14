const DEFAULT_INVENTORY = {
    seeds: { carrot: 10, corn: 0, tomato: 0, pumpkin: 0 },
    crops: { carrot: 0, corn: 0, tomato: 0, pumpkin: 0 },
    fertilizers: { mid: 5, high: 2 },
    feeds: { chicken_feed: 3, cow_feed: 2, pig_feed: 2 },
    animalProducts: { egg: 0, milk: 0, bacon: 0 },
    buildings: { feed_mill: 0 }
};

const GROUPS = {
    economy: 'Kinh tế game', gameplay: 'Gameplay', player: 'Người chơi', shop: 'Cửa hàng',
    leaderboard: 'Bảng xếp hạng', mission: 'Nhiệm vụ', event: 'Sự kiện', security: 'Bảo mật',
    upload: 'Upload', maintenance: 'Bảo trì'
};

function setting(group, key, name, value, type, description, validation = {}) {
    return { group, key, name, value, type, description, validation };
}

const SYSTEM_SETTING_DEFINITIONS = [
    setting('economy', 'START_GOLD', 'Vàng khởi tạo', 12450, 'number', 'Số vàng của tài khoản tạo mới.', { integer: true, min: 0, max: 2147483647 }),
    setting('economy', 'START_LEVEL', 'Cấp khởi tạo', 1, 'number', 'Cấp của tài khoản tạo mới.', { integer: true, min: 1, max: 1000 }),
    setting('economy', 'SELL_RATE', 'Tỷ lệ giá bán', 1, 'number', 'Hệ số áp dụng cho giá bán nông sản.', { min: 0, max: 100 }),
    setting('economy', 'BUY_RATE', 'Tỷ lệ giá mua', 1, 'number', 'Hệ số áp dụng cho giá mua trong cửa hàng.', { min: 0, max: 100 }),
    setting('economy', 'DEFAULT_EXP', 'EXP cần cho cấp đầu', 100, 'number', 'EXP cần để lên cấp từ cấp khởi tạo.', { integer: true, min: 1, max: 100000000 }),
    setting('economy', 'MAX_GOLD', 'Vàng tối đa', 2147483647, 'number', 'Giới hạn số vàng của một tài khoản.', { integer: true, min: 0, max: 2147483647 }),

    setting('gameplay', 'ENABLE_WATERING', 'Bật tưới nước', false, 'boolean', 'Cho phép tính năng tưới nước khi gameplay hỗ trợ.'),
    setting('gameplay', 'ENABLE_AUTO_HARVEST', 'Bật thu hoạch tất cả', true, 'boolean', 'Cho phép dùng chức năng thu hoạch tất cả.'),
    setting('gameplay', 'ENABLE_DELIVERY', 'Bật giao hàng', true, 'boolean', 'Hiển thị và cho phép giao đơn hàng.'),
    setting('gameplay', 'ENABLE_ANIMAL', 'Bật vật nuôi', true, 'boolean', 'Hiển thị và cho phép tương tác vật nuôi.'),
    setting('gameplay', 'ENABLE_EXPANSION', 'Bật mở rộng đất', true, 'boolean', 'Cho phép mua thêm ô đất.'),

    setting('player', 'DEFAULT_INVENTORY', 'Kho đồ khởi tạo', DEFAULT_INVENTORY, 'json', 'Kho đồ của tài khoản tạo mới.', { object: true }),
    setting('player', 'DEFAULT_LAND_SIZE', 'Số ô đất khởi tạo', 8, 'number', 'Số ô đất mở cho tài khoản tạo mới.', { integer: true, min: 8, max: 28 }),
    setting('player', 'MAX_FRIEND', 'Bạn bè tối đa', 100, 'number', 'Giới hạn bạn bè khi tính năng bạn bè được triển khai.', { integer: true, min: 0, max: 10000 }),
    setting('player', 'MAX_STORAGE', 'Sức chứa kho tối đa', 999999, 'number', 'Tổng số vật phẩm tối đa trong kho.', { integer: true, min: 1, max: 2147483647 }),

    setting('shop', 'SHOP_REFRESH_TIME', 'Thời gian làm mới cửa hàng', 0, 'number', 'Chu kỳ tự làm mới tính bằng giây; 0 là thủ công.', { integer: true, min: 0, max: 604800 }),
    setting('shop', 'ENABLE_DISCOUNT', 'Bật giảm giá', true, 'boolean', 'Cho phép áp dụng giảm giá cửa hàng.'),
    setting('shop', 'MAX_ITEM_PER_DAY', 'Giới hạn mua mỗi ngày', 0, 'number', 'Số vật phẩm tối đa mỗi ngày; 0 là không giới hạn.', { integer: true, min: 0, max: 1000000 }),

    setting('leaderboard', 'LEADERBOARD_SIZE', 'Kích thước bảng xếp hạng', 20, 'number', 'Số người chơi hiển thị trên bảng xếp hạng.', { integer: true, min: 1, max: 500 }),
    setting('leaderboard', 'LEADERBOARD_RESET_DAY', 'Ngày reset bảng xếp hạng', 1, 'number', 'Ngày trong tuần theo ISO: 1 là Thứ Hai, 7 là Chủ Nhật.', { integer: true, min: 1, max: 7 }),

    setting('mission', 'DAILY_MISSION_RESET', 'Giờ reset nhiệm vụ ngày', '00:00', 'string', 'Giờ reset theo múi giờ Asia/Saigon.', { pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', maxLength: 5 }),
    setting('mission', 'MAX_DAILY_MISSION', 'Số nhiệm vụ ngày tối đa', 6, 'number', 'Số ô đơn hàng/nhiệm vụ được hiển thị.', { integer: true, min: 1, max: 20 }),

    setting('event', 'ENABLE_EVENT', 'Bật sự kiện', true, 'boolean', 'Cho phép trả các sự kiện đang hoạt động cho gameplay.'),
    setting('event', 'EVENT_BANNER', 'Banner sự kiện mặc định', '', 'string', 'URL banner mặc định của sự kiện.', { maxLength: 512 }),
    setting('event', 'EVENT_POPUP', 'Hiện popup sự kiện', false, 'boolean', 'Tự động hiện thông tin sự kiện khi vào game.'),

    setting('security', 'MAX_LOGIN_FAIL', 'Số lần đăng nhập sai tối đa', 5, 'number', 'Khóa tài khoản người chơi sau số lần sai liên tiếp.', { integer: true, min: 1, max: 100 }),
    setting('security', 'SESSION_TIMEOUT', 'Thời hạn phiên đăng nhập', 10080, 'number', 'Thời hạn token tính bằng phút.', { integer: true, min: 5, max: 525600 }),
    setting('security', 'PASSWORD_MIN_LENGTH', 'Độ dài mật khẩu tối thiểu', 6, 'number', 'Độ dài mật khẩu tối thiểu cho đăng ký và đổi mật khẩu.', { integer: true, min: 6, max: 128 }),

    setting('upload', 'MAX_IMAGE_SIZE', 'Dung lượng ảnh tối đa', 8, 'number', 'Dung lượng ảnh tối đa tính bằng MB.', { min: 0.1, max: 12 }),
    setting('upload', 'ALLOWED_IMAGE_TYPE', 'Định dạng ảnh được phép', 'image/png,image/jpeg,image/webp', 'string', 'Danh sách MIME type, phân cách bằng dấu phẩy.', { pattern: '^image\\/[a-z0-9.+-]+(,image\\/[a-z0-9.+-]+)*$', maxLength: 255 }),

    setting('maintenance', 'MAINTENANCE_MODE', 'Chế độ bảo trì', false, 'boolean', 'Chặn API người chơi trong thời gian bảo trì.'),
    setting('maintenance', 'MAINTENANCE_MESSAGE', 'Thông báo bảo trì', 'Hệ thống đang bảo trì. Vui lòng quay lại sau.', 'string', 'Nội dung hiển thị cho người chơi.', { maxLength: 500 })
];

module.exports = { DEFAULT_INVENTORY, GROUPS, SYSTEM_SETTING_DEFINITIONS };
