import { CROP_CONFIGS } from './Seed.js';

export const DEFAULT_STATE = {
    farmName: 'Happy Farm',
    coins: 12450,
    gems: 35,
    energy: 120,
    maxEnergy: 120,
    level: 15,
    xp: 1250,
    xpNeeded: 2000,
    inventory: {
        seeds: { carrot: 10, corn: 10, tomato: 10, pumpkin: 10 },
        crops: { carrot: 5, corn: 5, tomato: 5, pumpkin: 5 },
        fertilizers: { mid: 5, high: 2 }
    },
    plots: Array.from({ length: 28 }, (_, i) => ({
        id: i,
        state: 'empty', // empty, digging, sprouting, growing, mature
        cropType: null,
        plantTime: null,
        growthDuration: 0 // in ms
    })),
    quests: [
        { id: 1, title: 'Người gieo mầm', desc: 'Trồng 5 hạt giống Cà rốt', target: 5, current: 0, rewardCoins: 150, rewardXp: 50, claimed: false, action: 'plant', type: 'carrot' },
        { id: 2, title: 'Mùa vụ đầu tiên', desc: 'Thu hoạch 5 Bắp ngô', target: 5, current: 0, rewardCoins: 300, rewardXp: 100, claimed: false, action: 'harvest', type: 'corn' },
        { id: 3, title: 'Nhà buôn nông sản', desc: 'Bán 5 Cà chua trong Cửa hàng', target: 5, current: 0, rewardCoins: 500, rewardXp: 150, claimed: false, action: 'sell', type: 'tomato' }
    ],
    achievements: [
        { id: 1, title: 'Nông dân tập sự', desc: 'Trồng tổng cộng 10 cây trồng', key: 'plantedTotal', target: 10, unlocked: false, rewardGems: 5 },
        { id: 2, title: 'Bàn tay vàng', desc: 'Thu hoạch tổng cộng 20 lần', key: 'harvestedTotal', target: 20, unlocked: false, rewardGems: 10 },
        { id: 3, title: 'Triệu phú nông thôn', desc: 'Kiếm được tổng cộng 20,000 vàng', key: 'coinsEarnedTotal', target: 20000, unlocked: false, rewardGems: 20 }
    ],
    stats: {
        plantedTotal: 0,
        harvestedTotal: 0,
        coinsEarnedTotal: 12450,
        coinsSpentTotal: 0,
        timePlayed: 0 // seconds
    },
    settings: {
        sfx: true,
        bgm: false
    },
    pets: {
        shiba: { name: 'Cún Shiba', active: true, unlocked: true },
        cat: { name: 'Mèo Tam Thể', active: false, unlocked: false, cost: 50 }
    },
    layout: {
        farmhouse: { left: 21.5, top: -4 },
        barn: { left: 60.5, top: -9.5 },
        farmGrid: { left: 48, top: 54 },
        shopBuilding: { left: 10, top: 35 },
        petBuilding: { left: 48, top: 15 },
        questBuilding: { left: 80, top: 30 },
        achieveBuilding: { left: 85, top: 50 },
        signpost: { left: 36, top: 12 },
        chickenCoop: { left: 10, top: 56 },
        cowPen: { left: 70, top: 18 },
        decorations: [
            { id: 'decor-0', left: 10, top: 15, emoji: '🌳', size: '2.8rem' },
            { id: 'decor-1', left: 18, top: 22, emoji: '🌲', size: '2.2rem' },
            { id: 'decor-2', left: 12, top: 78, emoji: '🌳', size: '2.5rem' },
            { id: 'decor-3', left: 22, top: 82, emoji: '🌸', size: '1.8rem' },
            { id: 'decor-4', left: 88, top: 12, emoji: '🌲', size: '2.5rem' },
            { id: 'decor-5', left: 92, top: 20, emoji: '🌳', size: '2.8rem' },
            { id: 'decor-6', left: 85, top: 75, emoji: '🌲', size: '2.4rem' },
            { id: 'decor-7', left: 78, top: 80, emoji: '🌸', size: '1.8rem' },
            { id: 'decor-8', left: 5, top: 45, emoji: '🌳', size: '2.6rem' },
            { id: 'decor-9', left: 94, top: 48, emoji: '🌲', size: '2.2rem' }
        ],
        pavedPaths: []
    }
};

export class Inventory {
    constructor(game) {
        this.game = game;
        this.state = null;
        this.saveTimer = null;
    }

    async loadGame() {
        try {
            const payload = await this.game.api.getState();
            let serverState = payload.state || {};

            const savedData = localStorage.getItem('happy_farm_state');
            if (savedData && !payload.importedLocalSave) {
                const shouldImport = window.confirm('Tìm thấy save cũ trên trình duyệt. Bạn muốn nhập tiến trình này vào tài khoản online không?');
                if (shouldImport) {
                    const imported = await this.game.api.importLocalSave(JSON.parse(savedData));
                    serverState = imported.state || serverState;
                    localStorage.removeItem('happy_farm_state');
                }
            }

            this.state = this.mergeDeep({}, DEFAULT_STATE, serverState);
            this.game.currentUser = payload.profile || this.game.api.profile;
            this.game.importedLocalSave = Boolean(payload.importedLocalSave);

            // Migrate older saves to include farmName and signpost layout coordinate
            if (this.state) {
                if (!this.state.farmName) {
                    this.state.farmName = 'Happy Farm';
                }
                if (!this.state.layout) {
                    this.state.layout = {};
                }
                if (!this.state.layout.signpost) {
                    this.state.layout.signpost = { left: 36, top: 12 };
                }
                if (!this.state.layout.chickenCoop) {
                    this.state.layout.chickenCoop = { left: 10, top: 56 };
                }
                if (!this.state.layout.cowPen) {
                    this.state.layout.cowPen = { left: 70, top: 18 };
                }
                if (!this.state.pavedPaths) {
                    this.state.pavedPaths = [];
                }
                if (!this.state.inventory) {
                    this.state.inventory = {};
                }
                if (!this.state.inventory.fertilizers) {
                    this.state.inventory.fertilizers = { mid: 5, high: 2 };
                }
            }

            // Migrate plots array if length is not 28
            if (this.state && this.state.plots && this.state.plots.length !== 28) {
                const oldPlots = this.state.plots;
                this.state.plots = Array.from({ length: 28 }, (_, i) => {
                    if (oldPlots[i]) {
                        oldPlots[i].id = i;
                        return oldPlots[i];
                    }
                    return {
                        id: i,
                        state: 'empty',
                        cropType: null,
                        plantTime: null,
                        growthDuration: 0
                    };
                });
            }

            // Fix stuck digging states
            if (this.state && this.state.plots) {
                this.state.plots.forEach(p => {
                    if (p.state === 'digging') {
                        p.state = 'empty';
                        p.cropType = null;
                        p.plantTime = null;
                        p.growthDuration = 0;
                    }
                });
            }

            // For testing convenience, ensure seeds and crops are always populated
            if (this.state && this.state.inventory) {
                if (!this.state.inventory.crops || Object.values(this.state.inventory.crops).reduce((a, b) => a + b, 0) === 0) {
                    this.state.inventory.crops = { carrot: 5, corn: 5, tomato: 5, pumpkin: 5 };
                }
                if (!this.state.inventory.seeds || Object.values(this.state.inventory.seeds).reduce((a, b) => a + b, 0) === 0) {
                    this.state.inventory.seeds = { carrot: 10, corn: 10, tomato: 10, pumpkin: 10 };
                }
            }
        } catch (e) {
            console.error('Error loading game state:', e);
            throw e;
        }
    }

    saveGame() {
        if (this.game?.isVisitingFarm) return;
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.flushSave();
        }, 250);
    }

    async flushSave() {
        if (this.game?.isVisitingFarm) return;
        if (!this.state || !this.game.api?.hasToken()) return;
        try {
            await this.game.api.saveState(this.state);
        } catch (e) {
            console.error('Error saving game state:', e);
            if (this.game?.showToast) {
                this.game.showToast('Không lưu được dữ liệu online. Kiểm tra kết nối/server.');
            }
        }
    }

    resetGame() {
        this.game.showCustomConfirm(
            '⚠️ RESET NÔNG TRẠI',
            'Bạn có chắc chắn muốn RESET toàn bộ dữ liệu nông trại? Hành động này không thể hoàn tác!'
        ).then(confirmed => {
            if (confirmed) {
                localStorage.removeItem('happy_farm_state');
                this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
                this.saveGame();
                window.location.reload();
            }
        });
    }

    mergeDeep(target, ...sources) {
        if (!sources.length) return target;
        const source = sources.shift();
        if (this.isObject(target) && this.isObject(source)) {
            for (const key in source) {
                if (this.isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    this.mergeDeep(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }
        return this.mergeDeep(target, ...sources);
    }

    isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }

    addXp(amount) {
        this.state.xp += amount;
        if (this.state.xp >= this.state.xpNeeded) {
            this.state.xp -= this.state.xpNeeded;
            this.state.level++;
            this.state.xpNeeded = Math.floor(this.state.xpNeeded * 1.25);
            this.game.playSFX('levelUp');
            
            // Create level up particles
            const local = this.game.getLocalCoords(window.innerWidth / 2, window.innerHeight / 3);
            this.game.createParticles(local.x, local.y, 50, 'spark');

            this.game.showToast(`✨ CHÚC MỪNG! Bạn đã lên Cấp ${this.state.level}! ✨`);
        }
        this.game.renderHUD();
    }

    buySeed(seedType, qty = 1) {
        qty = parseInt(qty) || 1;
        if (qty < 1) qty = 1;
        const crop = CROP_CONFIGS[seedType];
        const totalCost = crop.seedCost * qty;
        
        if (this.state.coins >= totalCost) {
            this.state.coins -= totalCost;
            this.state.inventory.seeds[seedType] = (this.state.inventory.seeds[seedType] || 0) + qty;
            this.state.stats.coinsSpentTotal += totalCost;
            
            this.game.playSFX('click');
            this.game.showToast(`Đã mua ${qty} Hạt giống ${crop.nameVi}!`);
            
            this.game.renderShop();
            this.game.renderHUD();
            this.saveGame();
        }
    }

    buyFertilizer(type, qty = 1) {
        qty = parseInt(qty) || 1;
        if (qty < 1) qty = 1;
        const price = type === 'mid' ? 50 : 150;
        const nameVi = type === 'mid' ? 'Phân bón Trung cấp' : 'Phân bón Cao cấp';
        const totalCost = price * qty;

        if (this.state.coins >= totalCost) {
            this.state.coins -= totalCost;
            if (!this.state.inventory.fertilizers) {
                this.state.inventory.fertilizers = { mid: 0, high: 0 };
            }
            this.state.inventory.fertilizers[type] = (this.state.inventory.fertilizers[type] || 0) + qty;
            this.state.stats.coinsSpentTotal += totalCost;

            this.game.playSFX('click');
            this.game.showToast(`Đã mua ${qty} ${nameVi}!`);

            this.game.renderShop();
            this.game.renderHUD();
            this.saveGame();
        } else {
            this.game.showToast('Không đủ tiền vàng!');
        }
    }

    sellCrops(cropType) {
        const crop = CROP_CONFIGS[cropType];
        const count = this.state.inventory.crops[cropType] || 0;
        
        if (count > 0) {
            const earn = count * crop.cropValue;
            this.state.coins += earn;
            this.state.inventory.crops[cropType] = 0;
            this.state.stats.coinsEarnedTotal += earn;
            
            this.game.playSFX('harvest');
            this.game.showToast(`Đã bán x${count} ${crop.nameVi} thu về 🪙 ${earn} Vàng!`);

            this.updateQuestProgress('sell', cropType, count);
            this.checkAchievements();

            this.game.renderShop();
            this.game.renderHUD();
            this.saveGame();
        }
    }

    claimQuest(questId) {
        const q = this.state.quests.find(x => x.id === questId);
        if (q && q.current >= q.target && !q.claimed) {
            q.claimed = true;
            this.state.coins += q.rewardCoins;
            this.state.stats.coinsEarnedTotal += q.rewardCoins;
            this.addXp(q.rewardXp);
            
            this.game.playSFX('quest');
            this.game.showToast(`Đã hoàn thành nhiệm vụ "${q.title}"! Nhận 🪙 ${q.rewardCoins} Vàng.`);
            
            this.game.renderQuests();
            this.game.updateQuestBadge();
            this.game.renderHUD();
            this.saveGame();
        }
    }

    updateQuestProgress(action, type, amount) {
        let changed = false;
        this.state.quests.forEach(q => {
            if (!q.claimed && q.action === action && q.type === type) {
                q.current = Math.min(q.target, q.current + amount);
                changed = true;
            }
        });
        if (changed) {
            this.game.updateQuestBadge();
        }
    }

    checkAchievements() {
        let saveNeeded = false;
        this.state.achievements.forEach(a => {
            const currentVal = this.state.stats[a.key] || 0;
            if (currentVal >= a.target && !a.unlocked) {
                a.unlocked = true;
                this.state.gems += a.rewardGems;
                saveNeeded = true;
                setTimeout(() => {
                    this.game.playSFX('levelUp');
                    this.game.showToast(`🏆 Thành Tích: "${a.title}" hoàn thành! (+💎 ${a.rewardGems})`);
                    this.game.renderHUD();
                }, 500);
            }
        });
        if (saveNeeded) this.saveGame();
    }

    unlockCat() {
        const cost = this.state.pets.cat.cost;
        if (this.state.gems >= cost) {
            this.state.gems -= cost;
            this.state.pets.cat.unlocked = true;
            this.state.pets.cat.active = true;
            
            this.game.playSFX('levelUp');
            this.game.showToast('Chúc mừng! Đã mở khóa Mèo Tam Thể (+10% Tốc độ hồi năng lượng).');
            
            this.game.renderPets();
            this.game.renderHUD();
            this.saveGame();
        }
    }
}
