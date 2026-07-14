import { CROP_CONFIGS } from './Seed.js';
import { DEFAULT_STATE, FEED_RECIPES, Inventory } from './Inventory.js';
import { Farmer } from './Farmer.js';
import { FarmTile } from './FarmTile.js';
import { Dog } from './Dog.js';
import { Chicken } from './Chicken.js';
import { Cow } from './Cow.js';
import { Pig } from './Pig.js';
import gameApi from './GameApi.js';
import {
    ANIMAL_PRODUCT_CONFIGS,
    BUILDING_CONFIGS,
    FEED_CONFIGS,
    FERTILIZER_CONFIGS,
    getMarketItemMeta,
    getInventoryQuantity,
    listMarketItems,
    MARKET_CATEGORIES
} from './ItemCatalog.js';
import { PhaserFarmWorld } from './src/PhaserFarmWorld.js';
import { MAX_PLOTS } from './LandConfig.js';
import { applyGameConfig, SYSTEM_SETTINGS } from './GameConfig.js';

class Cloud {
    constructor(x, y, scale, speed, opacity, parallaxFactor, type = 'normal') {
        this.x = x;
        this.y = y;
        this.scale = scale;
        this.speed = speed;
        this.opacity = opacity;
        this.parallaxFactor = parallaxFactor;
        this.type = type;

        // Define puffs relative to cloud center
        if (type === 'bg') {
            // Large, simple puffs for background sea texture
            this.puffs = [
                { dx: 0, dy: 0, r: 180 },
                { dx: -100, dy: 30, r: 150 },
                { dx: 100, dy: 30, r: 150 }
            ];
        } else {
            // Detailed fluffy puffs for foreground clouds
            this.puffs = [
                { dx: 0, dy: 0, r: 65 },
                { dx: -45, dy: 10, r: 50 },
                { dx: 45, dy: 10, r: 50 },
                { dx: -25, dy: -25, r: 55 },
                { dx: 25, dy: -25, r: 55 },
                { dx: 0, dy: 20, r: 45 }
            ];
        }
    }

    update(width) {
        this.x += this.speed;
        // Wrap around when the cloud exits the screen
        if (this.x - 200 * this.scale > width) {
            this.x = -200 * this.scale;
            this.y = Math.random() * (window.innerHeight + 200) - 100;
        }
    }

    draw(ctx, offsetX, offsetY) {
        ctx.save();
        const dx = this.x + offsetX * this.parallaxFactor;
        const dy = this.y + offsetY * this.parallaxFactor;

        this.puffs.forEach(p => {
            const px = dx + p.dx * this.scale;
            const py = dy + p.dy * this.scale;
            const pr = p.r * this.scale;

            if (this.type === 'bg') {
                // Background mist: extremely soft single gradient
                const grad = ctx.createRadialGradient(px, py, pr * 0.1, px, py, pr);
                grad.addColorStop(0, `rgba(246, 249, 244, ${this.opacity})`);
                grad.addColorStop(0.5, `rgba(240, 244, 238, ${this.opacity * 0.7})`);
                grad.addColorStop(1, 'rgba(240, 244, 238, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(px, py, pr, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Foreground cloud: volumetric shaded puffs
                // 1. Shadow underneath (tinted misty grey-green)
                const shadowGrad = ctx.createRadialGradient(px, py + pr * 0.1, pr * 0.1, px, py + pr * 0.1, pr);
                shadowGrad.addColorStop(0, `rgba(208, 217, 202, ${this.opacity * 0.75})`);
                shadowGrad.addColorStop(0.6, `rgba(218, 224, 212, ${this.opacity * 0.3})`);
                shadowGrad.addColorStop(1, 'rgba(218, 224, 212, 0)');
                ctx.fillStyle = shadowGrad;
                ctx.beginPath();
                ctx.arc(px, py + pr * 0.1, pr, 0, Math.PI * 2);
                ctx.fill();

                // 2. Main highlight on top (sunlit from top-left)
                const lightGrad = ctx.createRadialGradient(px - pr * 0.15, py - pr * 0.15, pr * 0.1, px, py, pr);
                lightGrad.addColorStop(0, `rgba(255, 255, 255, ${this.opacity * 0.95})`);
                lightGrad.addColorStop(0.6, `rgba(255, 255, 255, ${this.opacity * 0.75})`);
                lightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = lightGrad;
                ctx.beginPath();
                ctx.arc(px, py, pr, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        ctx.restore();
    }
}

class Game {
    constructor() {
        this.inventory = null;
        this.farmer = null;
        this.tiles = [];

        this.activePlotId = null;
        this.farmerIdleTimeout = null;
        this.farmerMoveTimeout = null;
        this.farmerHomePos = { left: 45, top: 40 }; // Home position near farmhouse
        
        this.audioCtx = null;
        this.bgmNode = null;
        this.antigravityActive = false;
        this.isPaveMode = false;
        this.paveStartCoords = null;
        
        // Zoom and Pan states
        this.baseScale = 1.0;
        this.zoomLevel = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isPanning = false;
        this.isDesignMode = false;
        this.hasDragged = false;
        this.api = gameApi;
        this.currentUser = null;
        this.authResolve = null;
        this.isVisitingFarm = false;
        this.homeState = null;
        this.visitedFarm = null;
        this.currentStall = [];
        this.deliveryOrders = [];
        this.weeklyStatus = null;
        this.leaderboardData = null;
        this.orderRefreshTimer = null;
        this.buildingConfigs = BUILDING_CONFIGS;

        // Fog Canvas and Clouds state
        this.clouds = [];
        this.fogCanvas = null;
        this.fogCtx = null;
        this.phaserWorld = null;

        // Start initialization
        this.init();
    }

    async init() {
        this.initAuthOverlay();

        while (true) {
            if (!this.api.hasToken()) {
                this.showAuthOverlay();
                await this.waitForAuth();
            }

            this.inventory = new Inventory(this);
            try {
                try {
                    applyGameConfig(await this.api.getGameConfig());
                    this.systemSettings = SYSTEM_SETTINGS;
                } catch (configError) {
                    console.warn('Using built-in game configuration:', configError);
                }
                await this.inventory.loadGame();
                this.hideAuthOverlay();
                break;
            } catch (err) {
                this.api.logout();
                this.showAuthOverlay(err.message || 'Phiên đăng nhập đã hết hạn.');
                await this.waitForAuth();
            }
        }

        this.initDOM();
        this.applySystemSettings();
        
        // Cache fog canvas context and initialize cloud pool
        this.fogCanvas = this.dom.fogCanvas;
        this.fogCtx = this.fogCanvas ? this.fogCanvas.getContext('2d') : null;
        this.initClouds();

        this.phaserWorld = new PhaserFarmWorld(this);
        await this.phaserWorld.ready;

        // Instantiate tiles
        this.tiles = Array.from({ length: MAX_PLOTS }, (_, i) => new FarmTile(this, i));
        
        // Instantiate farmer
        this.farmer = new Farmer(this);
        
        // Instantiate dog
        this.dog = new Dog(this);

        // Instantiate chickens flock (3 chickens)
        this.chickens = [
            new Chicken(this, 1, '🐓'),
            new Chicken(this, 2, '🐔'),
            new Chicken(this, 3, '🐤')
        ];

        // Instantiate cows (2 cows)
        this.cows = [
            new Cow(this, 1),
            new Cow(this, 2)
        ];

        this.pigs = [
            new Pig(this, 1),
            new Pig(this, 2)
        ];

        this.renderAll();
        this.refreshDeliveryBoard({ silent: true });
        this.resizeGame();

        // Bind global resize
        window.addEventListener('resize', () => this.resizeGame());

        // Start requestAnimationFrame Loop
        this.lastTime = Date.now();
        this.startLoop();
        this.startEnergyStatsTimers();
    }

    initAuthOverlay() {
        this.authDom = {
            overlay: document.getElementById('auth-screen'),
            loginForm: document.getElementById('auth-login-form'),
            registerForm: document.getElementById('auth-register-form'),
            loginTab: document.getElementById('auth-tab-login'),
            registerTab: document.getElementById('auth-tab-register'),
            error: document.getElementById('auth-error')
        };

        if (!this.authDom.overlay || this.authDom.overlay.dataset.bound === 'true') return;
        this.authDom.overlay.dataset.bound = 'true';

        const setMode = (mode) => {
            const isLogin = mode === 'login';
            this.authDom.loginForm.classList.toggle('hide', !isLogin);
            this.authDom.registerForm.classList.toggle('hide', isLogin);
            this.authDom.loginTab.classList.toggle('active', isLogin);
            this.authDom.registerTab.classList.toggle('active', !isLogin);
            this.setAuthError('');
        };

        this.authDom.loginTab.addEventListener('click', () => setMode('login'));
        this.authDom.registerTab.addEventListener('click', () => setMode('register'));

        this.authDom.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.submitAuthForm('login');
        });

        this.authDom.registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.submitAuthForm('register');
        });

        setMode('login');
    }

    waitForAuth() {
        return new Promise(resolve => {
            this.authResolve = resolve;
        });
    }

    showAuthOverlay(message = '') {
        if (!this.authDom?.overlay) return;
        this.authDom.overlay.classList.add('active');
        this.setAuthError(message);
        const loadingText = document.querySelector('#loading-screen .loader-content p');
        if (loadingText) loadingText.textContent = 'Đăng nhập để vào nông trại...';
    }

    hideAuthOverlay() {
        if (this.authDom?.overlay) {
            this.authDom.overlay.classList.remove('active');
        }
    }

    setAuthError(message) {
        if (this.authDom?.error) {
            this.authDom.error.textContent = message || '';
            this.authDom.error.classList.toggle('hide', !message);
        }
    }

    async submitAuthForm(mode) {
        const form = mode === 'login' ? this.authDom.loginForm : this.authDom.registerForm;
        const submit = form.querySelector('button[type="submit"]');
        const formData = new FormData(form);
        submit.disabled = true;
        this.setAuthError('');

        try {
            if (mode === 'login') {
                await this.api.login({
                    email: formData.get('email'),
                    password: formData.get('password')
                });
            } else {
                await this.api.register({
                    email: formData.get('email'),
                    password: formData.get('password'),
                    farmName: formData.get('farmName')
                });
            }

            this.hideAuthOverlay();
            if (this.authResolve) {
                this.authResolve(true);
                this.authResolve = null;
            }
        } catch (err) {
            this.setAuthError(err.message || 'Không đăng nhập được.');
        } finally {
            submit.disabled = false;
        }
    }

    startLoop() {
        const loop = () => {
            this.update();
            this.draw();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    update() {
        const now = Date.now();
        
        // Update farmer movement and frame animation ticks
        if (this.farmer) {
            this.farmer.update();
        }

        // Update dog movement and actions
        if (this.dog) {
            this.dog.update();
        }

        // Update chickens movement
        if (this.chickens) {
            this.chickens.forEach(c => c.update());
        }

        // Update cows movement
        if (this.cows) {
            this.cows.forEach(c => c.update());
        }

        if (this.pigs) {
            this.pigs.forEach(p => p.update());
        }

        // Update plot stages and growth progress
        if (!this.isVisitingFarm) {
            this.tiles.forEach(tile => tile.update(now));
        }

        // Update clouds position using screen width
        if (this.clouds) {
            const w = window.innerWidth || 1280;
            this.clouds.forEach(cloud => cloud.update(w));
        }
    }

    draw() {
        // Redraw canvas frame
        if (this.farmer) {
            this.farmer.draw();
        }

        // Redraw Fog and clouds overlay
        this.drawFog();
    }

    startEnergyStatsTimers() {
        // Handle background systems like energy recovery and simulation time played
        setInterval(() => {
            if (this.isVisitingFarm) return;

            // 1. Slow energy recovery (1 energy per 10 seconds, +10% faster if Cat active)
            const speed = this.inventory.state.pets.cat.active ? 9 : 10;
            if (Math.floor(Date.now() / 1000) % speed === 0) {
                if (this.inventory.state.energy < this.inventory.state.maxEnergy) {
                    this.inventory.state.energy = Math.min(this.inventory.state.maxEnergy, this.inventory.state.energy + 1);
                    this.renderHUD();
                }
            }

            // 2. Stats tick played time
            this.inventory.state.stats.timePlayed++;
            this.refreshProductionUi();
            if (this.inventory.state.stats.timePlayed % 60 === 0) {
                this.inventory.saveGame();
            }
        }, 1000);
    }

    refreshProductionUi() {
        if (!this.inventory?.state) return;
        this.phaserWorld?.syncAnimals();
        const feedMillModal = document.getElementById('modal-feed-mill');
        if (feedMillModal && !feedMillModal.classList.contains('hide')) {
            this.renderFeedMillPanel();
        }
    }

    // --- DOM Initialisation & Binding ---
    initDOM() {
        // Elements Cache
        this.dom = {
            container: document.getElementById('game-container'),
            loadingScreen: document.getElementById('loading-screen'),
            loadingProgress: document.getElementById('loading-progress'),
            farmGrid: document.getElementById('farm-grid'),
            farmer: document.getElementById('farmer'),
            farmerActionBubble: document.querySelector('#farmer .bubble-text'),
            coinsVal: document.getElementById('coin-value'),
            gemsVal: document.getElementById('gem-value'),
            energyVal: document.getElementById('energy-value'),
            energyFill: document.getElementById('energy-bar-fill'),
            levelVal: document.getElementById('level-value'),
            xpVal: document.getElementById('xp-value'),
            xpFill: document.getElementById('xp-bar-fill'),
            btnAddEnergy: document.getElementById('btn-add-energy'),
            
            // Popups & Panels
            seedPopup: document.getElementById('seed-popup'),
            btnCloseSeedPopup: document.getElementById('btn-close-seed-popup'),
            cropDetailPanel: document.getElementById('crop-detail-panel'),
            btnCloseCropDetail: document.getElementById('btn-close-crop-detail'),
            detailCropIcon: document.getElementById('detail-crop-icon'),
            detailCropName: document.getElementById('detail-crop-name'),
            detailCropTimer: document.getElementById('detail-crop-timer'),
            
            // Sidebar buttons
            btnMail: document.getElementById('btn-mail'),
            btnRank: document.getElementById('btn-rank'),
            btnSettings: document.getElementById('btn-settings'),
            btnMarket: document.getElementById('btn-market'),
            btnMap: document.getElementById('btn-map'),
            btnLogout: document.getElementById('btn-logout'),
            
            // Sidebar menu & Modals
            menuButtons: document.querySelectorAll('#hud-left-menu .menu-btn'),
            modals: document.querySelectorAll('.modal'),
            modalCloseBtns: document.querySelectorAll('.modal-close'),
            
            // Toast Notification
            toast: document.getElementById('notification-toast'),
            toastMsg: document.getElementById('toast-message'),
            
            // Specific Modals
            shopBuyList: document.getElementById('shop-buy-list'),
            shopSellList: document.getElementById('shop-sell-list'),
            invSeedsGrid: document.getElementById('inv-seeds-grid'),
            invCropsGrid: document.getElementById('inv-crops-grid'),
            invFeedsGrid: document.getElementById('inv-feeds-grid'),
            invAnimalProductsGrid: document.getElementById('inv-animal-products-grid'),
            questList: document.getElementById('quest-list'),
            questBadge: document.getElementById('quest-badge'),
            weeklyScore: document.getElementById('weekly-score'),
            weeklyReset: document.getElementById('weekly-reset'),
            weeklyMilestones: document.getElementById('weekly-milestones'),
            achievementList: document.getElementById('achievement-list'),
            leaderboardList: document.getElementById('leaderboard-list'),
            leaderboardMyRank: document.getElementById('leaderboard-my-rank'),
            leaderboardReset: document.getElementById('leaderboard-reset'),
            rankRewardPanel: document.getElementById('rank-reward-panel'),
            
            // Settings controls
            toggleSfx: document.getElementById('toggle-sfx'),
            toggleBgm: document.getElementById('toggle-bgm'),
            btnResetGame: document.getElementById('btn-reset-game'),
            profileSettingsForm: document.getElementById('profile-settings-form'),
            profileAccountId: document.getElementById('profile-account-id'),
            profileEmail: document.getElementById('profile-email'),
            profileFarmName: document.getElementById('profile-farm-name'),
            profileSettingsMessage: document.getElementById('profile-settings-message'),
            passwordSettingsForm: document.getElementById('password-settings-form'),
            passwordSettingsMessage: document.getElementById('password-settings-message'),
            
            // Stats controls
            statsPlanted: document.getElementById('stats-planted'),
            statsHarvested: document.getElementById('stats-harvested'),
            statsCoinsEarned: document.getElementById('stats-coins-earned'),
            statsCoinsSpent: document.getElementById('stats-coins-spent'),
            statsTimePlayed: document.getElementById('stats-time-played'),
            btnHarvestAll: document.getElementById('btn-harvest-all'),
            fogCanvas: document.getElementById('fog-canvas'),
            signpostBuilding: document.getElementById('signpost-building'),
            signpostText: document.getElementById('signpost-text'),
            invFertilizersGrid: document.getElementById('inv-fertilizers-grid'),
            midFertilizerCount: document.getElementById('mid-fertilizer-count'),
            highFertilizerCount: document.getElementById('high-fertilizer-count')
        };

        this.ensureMarketModal();
        this.ensureVisitBanner();
        const questTitle = document.querySelector('#modal-quests .modal-header h2');
        if (questTitle) questTitle.textContent = 'BẢNG ĐƠN HÀNG';
        const questMenuText = document.querySelector('#btn-quests-menu .menu-btn-text');
        if (questMenuText) questMenuText.textContent = 'Đơn Hàng';

        // Initialize Audio context trigger
        const initAudio = () => {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (this.inventory.state.settings.bgm) {
                    this.playBGM();
                }
            }
        };
        document.body.addEventListener('click', initAudio, { once: true });
        document.body.addEventListener('touchstart', initAudio, { once: true });

        // HUD Listeners
        this.dom.btnAddEnergy.addEventListener('click', () => {
            if (this.isVisitingFarm) {
                this.showToast('Bạn đang tham quan nông trại khác.');
                return;
            }
            this.playSFX('click');
            if (this.inventory.state.coins >= 200) {
                if (this.inventory.state.energy >= this.inventory.state.maxEnergy) {
                    this.showToast('Năng lượng đã đầy!');
                    return;
                }
                this.inventory.state.coins -= 200;
                this.inventory.state.energy = Math.min(this.inventory.state.maxEnergy, this.inventory.state.energy + 50);
                this.inventory.state.stats.coinsSpentTotal += 200;
                this.inventory.saveGame();
                this.renderHUD();
                this.playSFX('harvest');
                this.showToast('Đã mua +50 Năng lượng bằng 200 Vàng!');
            } else {
                this.showToast('Không đủ tiền vàng! Cần 200 Vàng.');
            }
        });

        // Seed Popup close
        this.dom.btnCloseSeedPopup.addEventListener('click', (e) => {
            e.stopPropagation();
            this.playSFX('click');
            this.hideSeedPopup();
        });

        // Setup Seed Selection
        document.querySelectorAll('.seed-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const seedType = btn.getAttribute('data-seed');
                this.plantSeedOnActivePlot(seedType);
            });
        });

        // Setup Plant All
        document.querySelectorAll('.btn-plant-all').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.playSFX('click');
                const seedType = btn.getAttribute('data-seed');
                this.plantAllSeeds(seedType);
            });
        });

        const btnPaveMode = document.getElementById('btn-pave-mode');
        if (btnPaveMode) {
            btnPaveMode.addEventListener('click', (e) => {
                e.stopPropagation();
                this.togglePaveMode();
            });
        }

        // Setup Modals Toggle
        this.dom.menuButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetModal = btn.getAttribute('data-target');
                this.playSFX('click');
                this.openModal(targetModal);
            });
        });

        this.dom.modalCloseBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-close');
                this.playSFX('click');
                this.closeModal(target);
            });
        });

        // Header Buttons click handlers
        this.dom.btnMail.addEventListener('click', () => {
            this.playSFX('click');
            this.showToast('Hộp thư hiện tại đang trống!');
        });
        this.dom.btnRank.addEventListener('click', () => {
            this.playSFX('click');
            this.openModal('leaderboard');
        });
        this.dom.btnSettings.addEventListener('click', () => {
            this.playSFX('click');
            this.openModal('settings');
        });
        if (this.dom.btnMarket) {
            this.dom.btnMarket.addEventListener('click', () => {
                this.playSFX('click');
                this.activeShopTab = 'market';
                this.openModal('shop');
            });
        }
        if (this.dom.btnMap) {
            this.dom.btnMap.addEventListener('click', () => {
                this.playSFX('click');
                this.openModal('shop');
            });
        }
        if (this.dom.btnLogout) {
            this.dom.btnLogout.addEventListener('click', async () => {
                const confirmed = await this.showCustomConfirm(
                    '🚪 ĐĂNG XUẤT',
                    'Bạn có chắc muốn đăng xuất khỏi tài khoản hiện tại?'
                );
                if (!confirmed) return;
                await this.inventory.flushSave();
                this.api.logout();
                window.location.reload();
            });
        }

        this.dom.btnAntigravity = document.getElementById('btn-antigravity');
        if (this.dom.btnAntigravity) {
            this.dom.btnAntigravity.addEventListener('click', () => {
                this.toggleAntigravity();
            });
        }

        // Settings Toggles
        this.dom.toggleSfx.checked = this.inventory.state.settings.sfx;
        this.dom.toggleSfx.addEventListener('change', (e) => {
            this.inventory.state.settings.sfx = e.target.checked;
            this.inventory.saveGame();
        });

        this.dom.toggleBgm.checked = this.inventory.state.settings.bgm;
        this.dom.toggleBgm.addEventListener('change', (e) => {
            this.inventory.state.settings.bgm = e.target.checked;
            this.inventory.saveGame();
            if (this.inventory.state.settings.bgm) {
                this.playBGM();
            } else {
                this.stopBGM();
            }
        });

        this.dom.btnResetGame.addEventListener('click', () => {
            this.inventory.resetGame();
        });

        this.dom.profileSettingsForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.submitProfileSettings();
        });

        this.dom.passwordSettingsForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.submitPasswordSettings();
        });

        // Design Mode Listeners
        const btnDesign = document.getElementById('btn-design');
        const btnDesignSave = document.getElementById('btn-design-save');
        const btnDesignCancel = document.getElementById('btn-design-cancel');
        
        if (btnDesign) {
            btnDesign.addEventListener('click', () => {
                this.playSFX('click');
                this.enterDesignMode();
            });
        }
        if (btnDesignSave) {
            btnDesignSave.addEventListener('click', () => {
                this.playSFX('harvest');
                this.exitDesignMode(true);
            });
        }
        if (btnDesignCancel) {
            btnDesignCancel.addEventListener('click', () => {
                this.playSFX('click');
                this.exitDesignMode(false);
            });
        }

        // Setup Drag & Drop
        this.setupDragAndDrop();

        // Harvest All Click Handler
        if (this.dom.btnHarvestAll) {
            this.dom.btnHarvestAll.addEventListener('click', (e) => {
                e.stopPropagation();
                this.playSFX('click');
                this.harvestAllCrops();
            });
        }

        // Click handlers for interactive buildings on the map
        const bindBuildingClick = (id, modalName) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('click', (e) => {
                    if (this.isDesignMode || this.hasDragged) return;
                    e.stopPropagation();
                    if (this.isVisitingFarm && modalName !== 'shop') {
                        this.showToast('Bạn đang tham quan, chỉ có thể xem farm và mua ở quầy hàng.');
                        return;
                    }
                    this.playSFX('click');
                    if (this.isVisitingFarm && modalName === 'shop') {
                        this.openVisitedStall();
                    } else {
                        if (modalName === 'shop') this.activeShopTab = 'store';
                        this.openModal(modalName);
                    }
                });
            }
        };

        const bindAnimalBuildingClick = (id, animalType) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('click', (e) => {
                if (this.isDesignMode || this.hasDragged) return;
                e.stopPropagation();
                if (this.isVisitingFarm) {
                    this.showToast('Bạn đang tham quan, không thể chăm vật nuôi ở farm này.');
                    return;
                }
                this.playSFX('click');
                this.handleAnimalBuildingClick(animalType);
            });
        };

        bindBuildingClick('farmhouse-overlay', 'stats');
        bindBuildingClick('barn-overlay', 'inventory');
        bindBuildingClick('shop-building', 'shop');
        bindBuildingClick('pet-building', 'pets');
        bindBuildingClick('quest-building', 'quests');
        bindBuildingClick('achieve-building', 'achievements');
        bindAnimalBuildingClick('chicken-coop', 'chicken');
        bindAnimalBuildingClick('cow-pen', 'cow');
        bindAnimalBuildingClick('pig-pen', 'pig');

        document.getElementById('feed-mill-building')?.addEventListener('click', (e) => {
            if (this.isDesignMode || this.hasDragged) return;
            e.stopPropagation();
            if (!this.canUseFeedMill()) {
                this.showToast('Hãy mua và đặt Máy trộn trong chế độ Thiết kế.');
                return;
            }
            this.playSFX('click');
            this.openModal('feed-mill');
        });

        const signpost = document.getElementById('signpost-building');
        if (signpost) {
            signpost.addEventListener('click', (e) => {
                if (this.isDesignMode || this.hasDragged) return;
                e.stopPropagation();
                if (this.isVisitingFarm) {
                    this.showToast('Bạn đang tham quan nên không thể đổi tên farm này.');
                    return;
                }
                this.playSFX('click');
                this.renameFarm();
            });
        }

        const btnFertMid = document.getElementById('btn-fertilizer-mid');
        if (btnFertMid) {
            btnFertMid.addEventListener('click', (e) => {
                e.stopPropagation();
                this.playSFX('click');
                this.useFertilizer('mid');
            });
        }
        const btnFertHigh = document.getElementById('btn-fertilizer-high');
        if (btnFertHigh) {
            btnFertHigh.addEventListener('click', (e) => {
                e.stopPropagation();
                this.playSFX('click');
                this.useFertilizer('high');
            });
        }

        this.dom.btnCloseCropDetail?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.playSFX('click');
            this.hideCropDetail();
            this.phaserWorld?.clearSelectedTile();
        });

        // Shop tab handlers are bound after the shop modal is rebuilt.

        // Setup Zooming & Panning
        const farmWorld = document.getElementById('farm-world');
        const viewport = document.getElementById('game-viewport');
        
        viewport.addEventListener('wheel', (e) => {
            const isModalOpen = Array.from(document.querySelectorAll('.modal')).some(m => !m.classList.contains('hide'));
            if (isModalOpen) return;

            e.preventDefault();
            const zoomSpeed = 0.05;
            if (e.deltaY < 0) {
                this.zoomLevel = Math.min(2.5, this.zoomLevel + zoomSpeed);
            } else {
                this.zoomLevel = Math.max(0.2, this.zoomLevel - zoomSpeed);
            }
            
            const maxPanX = Math.max(0, (1280 * this.baseScale * this.zoomLevel - window.innerWidth) / 2);
            const maxPanY = Math.max(0, (720 * this.baseScale * this.zoomLevel - window.innerHeight) / 2);
            this.offsetX = Math.max(-maxPanX, Math.min(maxPanX, this.offsetX));
            this.offsetY = Math.max(-maxPanY, Math.min(maxPanY, this.offsetY));
            
            this.updateFarmWorldTransform(farmWorld);
        }, { passive: false });

        let startX = 0;
        let startY = 0;
        
        viewport.addEventListener('mousedown', (e) => {
            const isModalOpen = Array.from(document.querySelectorAll('.modal')).some(m => !m.classList.contains('hide'));
            if (isModalOpen) return;
            if (this.phaserWorld?.mainScene?.feedTray) return;
            if (e.button !== 0) return; 

            if (e.target.closest('button') || e.target.closest('.harvest-basket')) return;

            if (this.isDesignMode && e.target.closest('#farmhouse-overlay, #barn-overlay, #farm-grid-container, #shop-building, #pet-building, #quest-building, #achieve-building, #signpost-building, .decor-outside')) {
                return;
            }

            this.isPanning = true;
            this.hasDragged = false;
            this.dragStartPos = { x: e.clientX, y: e.clientY };
            startX = e.clientX - this.offsetX;
            startY = e.clientY - this.offsetY;
            viewport.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isPanning) return;

            if (this.dragStartPos) {
                const dx = e.clientX - this.dragStartPos.x;
                const dy = e.clientY - this.dragStartPos.y;
                if (Math.sqrt(dx*dx + dy*dy) > 5) {
                    this.hasDragged = true;
                }
            }

            this.offsetX = e.clientX - startX;
            this.offsetY = e.clientY - startY;

            const stageWidth = 1280 * this.baseScale * this.zoomLevel;
            const stageHeight = 720 * this.baseScale * this.zoomLevel;
            let maxPanX, maxPanY;
            
            if (stageWidth < window.innerWidth) {
                maxPanX = (window.innerWidth - stageWidth) / 2 + 200;
            } else {
                maxPanX = (stageWidth - window.innerWidth) / 2;
            }

            if (stageHeight < window.innerHeight) {
                maxPanY = (window.innerHeight - stageHeight) / 2 + 200;
            } else {
                maxPanY = (stageHeight - window.innerHeight) / 2;
            }

            this.offsetX = Math.max(-maxPanX, Math.min(maxPanX, this.offsetX));
            this.offsetY = Math.max(-maxPanY, Math.min(maxPanY, this.offsetY));

            this.updateFarmWorldTransform(farmWorld);
        });

        window.addEventListener('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                viewport.style.cursor = '';
                setTimeout(() => {
                    this.hasDragged = false;
                }, 50);
            }
        });

        const farmStage = document.getElementById('farm-stage');
        if (farmStage) {
            farmStage.addEventListener('click', (e) => {
                if (this.phaserWorld?.consumeSuppressedStageClick()) return;
                if (this.hasDragged || this.isDesignMode) return;

                if (e.target.closest('button') || e.target.closest('.modal') || e.target.closest('.popover') || e.target.closest('.harvest-basket')) {
                    return;
                }

                if (e.target.closest('.clickable-building') || e.target.closest('.plot')) {
                    return;
                }

                const rect = farmStage.getBoundingClientRect();
                let localX = ((e.clientX - rect.left) / rect.width) * 1280;
                let localY = ((e.clientY - rect.top) / rect.height) * 720;

                localX = Math.max(0, Math.min(1280, localX));
                localY = Math.max(0, Math.min(720, localY));

                if (this.isPaveMode) {
                    const gridX = Math.floor(localX / 40) * 40;
                    const gridY = Math.floor(localY / 40) * 40;
                    
                    const pathKey = `${gridX},${gridY}`;
                    const paths = this.inventory.state.pavedPaths || [];
                    const index = paths.indexOf(pathKey);
                    
                    if (index !== -1) {
                        // Erase paved path immediately (free)
                        this.inventory.state.pavedPaths.splice(index, 1);
                        this.playSFX('dig');
                        this.createParticles(gridX + 20, gridY + 20, 5, 'dirt');
                        
                        // If we erased the start tile, clear start coords and marker
                        if (this.paveStartCoords && this.paveStartCoords.x === gridX && this.paveStartCoords.y === gridY) {
                            this.paveStartCoords = null;
                            this.removePaveStartMarker();
                        }
                        
                        this.renderPavedPaths();
                        this.inventory.saveGame();
                    } else {
                        // If no start point is selected, set it
                        if (!this.paveStartCoords) {
                            this.paveStartCoords = { x: gridX, y: gridY };
                            this.renderPaveStartMarker(gridX, gridY);
                            this.showToast('📍 Đã chọn điểm đầu. Hãy click điểm cuối để tự động lót đường!');
                        } else {
                            // If end point is the start point, cancel selection
                            if (this.paveStartCoords.x === gridX && this.paveStartCoords.y === gridY) {
                                this.paveStartCoords = null;
                                this.removePaveStartMarker();
                                this.showToast('Đã hủy chọn điểm đầu.');
                            } else {
                                // Connect start and end with a straight line (horizontal or vertical based on dominant axis)
                                const tilesToPave = [];
                                const startX = this.paveStartCoords.x;
                                const endX = gridX;
                                const startY = this.paveStartCoords.y;
                                const endY = gridY;
                                
                                const dx = Math.abs(endX - startX);
                                const dy = Math.abs(endY - startY);
                                
                                if (dx >= dy) {
                                    // Horizontal path
                                    const stepX = startX <= endX ? 40 : -40;
                                    for (let x = startX; ; x += stepX) {
                                        tilesToPave.push({ x, y: startY });
                                        if (x === endX) break;
                                    }
                                } else {
                                    // Vertical path
                                    const stepY = startY <= endY ? 40 : -40;
                                    for (let y = startY; ; y += stepY) {
                                        tilesToPave.push({ x: startX, y });
                                        if (y === endY) break;
                                    }
                                }
                                
                                let pavedCount = 0;
                                let failedDueToCoins = false;
                                
                                for (const tile of tilesToPave) {
                                    const key = `${tile.x},${tile.y}`;
                                    if (!this.inventory.state.pavedPaths.includes(key)) {
                                        if (this.inventory.state.coins < 2) {
                                            failedDueToCoins = true;
                                            break;
                                        }
                                        this.inventory.state.coins -= 2;
                                        this.inventory.state.stats.coinsSpentTotal += 2;
                                        this.inventory.state.pavedPaths.push(key);
                                        pavedCount++;
                                        this.createParticles(tile.x + 20, tile.y + 20, 3, 'spark');
                                    }
                                }
                                
                                if (pavedCount > 0) {
                                    this.playSFX('plant');
                                    this.renderPavedPaths();
                                    this.renderHUD();
                                    this.inventory.saveGame();
                                }
                                
                                if (failedDueToCoins) {
                                    this.showToast('Không đủ vàng! Dừng lót đường nửa chừng.');
                                } else if (pavedCount > 0) {
                                    this.showToast(`Đã tự động lót ${pavedCount} ô đường đất!`);
                                } else {
                                    this.showToast('Đường đất đã được lót trước đó.');
                                }
                                
                                this.paveStartCoords = null;
                                this.removePaveStartMarker();
                            }
                        }
                    }
                    return;
                }

                if (this.farmer) {
                    this.farmer.setTarget(localX, localY);
                }
            });
        }

        // Simulate game loading progress
        let progress = 0;
        const loadInterval = setInterval(() => {
            progress += 10;
            this.dom.loadingProgress.style.width = progress + '%';
            if (progress >= 100) {
                clearInterval(loadInterval);
                setTimeout(() => {
                    this.dom.loadingScreen.classList.remove('active');
                    this.showToast('Chào mừng bạn đến với Happy Farm!');
                    if (this.farmer) {
                        this.farmer.setState('IDLE');
                    }
                }, 300);
            }
        }, 100);
    }

    ensureLegacyMarketModal() {
        const modal = document.getElementById('modal-shop');
        if (!modal) return;

        const title = modal.querySelector('.modal-header h2');
        const body = modal.querySelector('.modal-body');
        if (!body) return;
        if (title) title.textContent = '🧺 CHỢ NGƯỜI CHƠI';

        if (body.dataset.marketReady !== 'true') {
            body.dataset.marketReady = 'true';
            body.innerHTML = `
                <div class="shop-tabs">
                    <button class="shop-tab active" data-tab="market">Bảng chợ</button>
                    <button class="shop-tab" data-tab="stall">Quầy của tôi</button>
                </div>
                <div id="market-panel">
                    <div class="market-toolbar">
                        <select id="market-category-filter" class="market-control">
                            <option value="">Tất cả vật phẩm</option>
                            <option value="seeds">Hạt giống</option>
                            <option value="crops">Nông sản</option>
                            <option value="fertilizers">Phân bón</option>
                        </select>
                        <input id="market-search" class="market-control" type="search" placeholder="Tìm vật phẩm hoặc farm">
                        <button id="btn-market-refresh" class="btn-buy" type="button">Làm mới</button>
                    </div>
                    <div id="market-list" class="shop-grid market-grid"></div>
                </div>
                <div id="stall-panel" class="hide">
                    <form id="market-listing-form" class="market-listing-form">
                        <select id="listing-category" name="category" class="market-control" required>
                            <option value="seeds">Hạt giống</option>
                            <option value="crops">Nông sản</option>
                            <option value="fertilizers">Phân bón</option>
                        </select>
                        <select id="listing-item" name="itemId" class="market-control" required></select>
                        <input id="listing-quantity" name="quantity" class="market-control" type="number" min="1" value="1" required>
                        <input id="listing-price" name="priceEach" class="market-control" type="number" min="1" value="1" required>
                        <button class="btn-sell" type="submit">Rao bán</button>
                        <span id="listing-price-hint" class="market-hint"></span>
                    </form>
                    <div id="my-stall-list" class="shop-grid market-grid"></div>
                </div>
            `;
        }

        this.dom.marketPanel = document.getElementById('market-panel');
        this.dom.stallPanel = document.getElementById('stall-panel');
        this.dom.marketList = document.getElementById('market-list');
        this.dom.myStallList = document.getElementById('my-stall-list');
        this.dom.marketCategoryFilter = document.getElementById('market-category-filter');
        this.dom.marketSearch = document.getElementById('market-search');
        this.dom.btnMarketRefresh = document.getElementById('btn-market-refresh');
        this.dom.marketListingForm = document.getElementById('market-listing-form');
        this.dom.listingCategory = document.getElementById('listing-category');
        this.dom.listingItem = document.getElementById('listing-item');
        this.dom.listingQuantity = document.getElementById('listing-quantity');
        this.dom.listingPrice = document.getElementById('listing-price');
        this.dom.listingPriceHint = document.getElementById('listing-price-hint');

        if (body.dataset.marketBound !== 'true') {
            body.dataset.marketBound = 'true';
            this.dom.btnMarketRefresh?.addEventListener('click', () => this.renderShop());
            this.dom.marketSearch?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.renderShop();
            });
            this.dom.marketCategoryFilter?.addEventListener('change', () => this.renderShop());
            this.dom.listingCategory?.addEventListener('change', () => this.updateListingItemOptions());
            this.dom.listingItem?.addEventListener('change', () => this.updateListingPriceHint());
            this.dom.marketListingForm?.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createMarketListing();
            });
        }

        this.updateListingItemOptions();
    }

    ensureMarketModal() {
        const modal = document.getElementById('modal-shop');
        if (!modal) return;

        const title = modal.querySelector('.modal-header h2');
        const body = modal.querySelector('.modal-body');
        if (!body) return;
        if (title) title.textContent = '🏪 CỬA HÀNG NÔNG TRẠI';

        if (body.dataset.shopReady !== 'true') {
            body.dataset.shopReady = 'true';
            body.innerHTML = `
                <div class="shop-tabs">
                    <button class="shop-tab active" data-tab="store">Cửa hàng</button>
                    <button class="shop-tab" data-tab="market">Bảng chợ</button>
                    <button class="shop-tab" data-tab="stall">Quầy của tôi</button>
                </div>
                <div id="shop-store-panel" class="shop-panel">
                    <div class="shop-section">
                        <h3>Hạt giống & phân bón</h3>
                        <div id="shop-buy-list" class="shop-grid"></div>
                    </div>
                    <hr class="modal-divider">
                    <div class="shop-section">
                        <h3>Bán nông sản</h3>
                        <div id="shop-sell-list" class="shop-grid"></div>
                    </div>
                </div>
                <div id="market-panel" class="shop-panel hide">
                    <div class="market-toolbar">
                        <select id="market-category-filter" class="market-control">
                            <option value="">Tất cả vật phẩm</option>
                            <option value="seeds">Hạt giống</option>
                            <option value="crops">Nông sản</option>
                            <option value="fertilizers">Phân bón</option>
                            <option value="feeds">Thức ăn</option>
                            <option value="animalProducts">Sản phẩm vật nuôi</option>
                        </select>
                        <input id="market-search" class="market-control" type="search" placeholder="Tìm vật phẩm hoặc farm">
                        <button id="btn-market-refresh" class="btn-buy" type="button">Làm mới</button>
                    </div>
                    <div id="market-list" class="shop-grid market-grid"></div>
                </div>
                <div id="stall-panel" class="shop-panel hide">
                    <form id="market-listing-form" class="market-listing-form">
                        <select id="listing-category" name="category" class="market-control" required>
                            <option value="seeds">Hạt giống</option>
                            <option value="crops">Nông sản</option>
                            <option value="fertilizers">Phân bón</option>
                            <option value="feeds">Thức ăn</option>
                            <option value="animalProducts">Sản phẩm vật nuôi</option>
                        </select>
                        <select id="listing-item" name="itemId" class="market-control" required></select>
                        <input id="listing-quantity" name="quantity" class="market-control" type="number" min="1" value="1" required>
                        <input id="listing-price" name="priceEach" class="market-control" type="number" min="1" value="1" required>
                        <button class="btn-sell" type="submit">Rao bán</button>
                        <span id="listing-price-hint" class="market-hint"></span>
                    </form>
                    <div id="my-stall-list" class="shop-grid market-grid"></div>
                </div>
            `;
        }

        this.dom.storePanel = document.getElementById('shop-store-panel');
        this.dom.feedMillPanel = document.getElementById('feed-mill-panel');
        this.dom.feedMillStatus = document.getElementById('feed-mill-status');
        this.dom.feedRecipeList = document.getElementById('feed-recipe-list');
        this.dom.shopBuyList = document.getElementById('shop-buy-list');
        this.dom.shopSellList = document.getElementById('shop-sell-list');
        this.dom.marketPanel = document.getElementById('market-panel');
        this.dom.stallPanel = document.getElementById('stall-panel');
        this.dom.marketList = document.getElementById('market-list');
        this.dom.myStallList = document.getElementById('my-stall-list');
        this.dom.marketCategoryFilter = document.getElementById('market-category-filter');
        this.dom.marketSearch = document.getElementById('market-search');
        this.dom.btnMarketRefresh = document.getElementById('btn-market-refresh');
        this.dom.marketListingForm = document.getElementById('market-listing-form');
        this.dom.listingCategory = document.getElementById('listing-category');
        this.dom.listingItem = document.getElementById('listing-item');
        this.dom.listingQuantity = document.getElementById('listing-quantity');
        this.dom.listingPrice = document.getElementById('listing-price');
        this.dom.listingPriceHint = document.getElementById('listing-price-hint');

        if (body.dataset.shopBound !== 'true') {
            body.dataset.shopBound = 'true';
            body.querySelectorAll('.shop-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    this.playSFX('click');
                    const tabName = tab.getAttribute('data-tab') || 'store';
                    this.selectShopTab(tabName);
                    if (tabName === 'market' || tabName === 'stall') {
                        this.refreshMarketPanels();
                    }
                });
            });
            this.dom.btnMarketRefresh?.addEventListener('click', () => this.refreshMarketPanels());
            this.dom.marketSearch?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.refreshMarketPanels();
            });
            this.dom.marketCategoryFilter?.addEventListener('change', () => this.refreshMarketPanels());
            this.dom.listingCategory?.addEventListener('change', () => this.updateListingItemOptions());
            this.dom.listingItem?.addEventListener('change', () => this.updateListingPriceHint());
            this.dom.marketListingForm?.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createMarketListing();
            });
        }

        this.updateListingItemOptions();
        this.selectShopTab(this.activeShopTab || 'store');
    }

    selectShopTab(tabName = 'store') {
        const allowedTabs = new Set(['store', 'market', 'stall']);
        const nextTab = allowedTabs.has(tabName) ? tabName : 'store';
        this.activeShopTab = nextTab;

        document.querySelectorAll('#modal-shop .shop-tab').forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-tab') === nextTab);
        });

        const panels = {
            store: this.dom.storePanel,
            market: this.dom.marketPanel,
            stall: this.dom.stallPanel
        };
        Object.entries(panels).forEach(([key, panel]) => {
            panel?.classList.toggle('hide', key !== nextTab);
        });
    }

    ensureVisitBanner() {
        let banner = document.getElementById('visit-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'visit-banner';
            banner.className = 'visit-banner hide';
            banner.innerHTML = `
                <span id="visit-banner-text">Đang tham quan nông trại</span>
                <button id="btn-visit-stall" type="button">Quầy hàng</button>
                <button id="btn-return-home" type="button">Về nhà</button>
            `;
            document.getElementById('game-container')?.appendChild(banner);
        }

        this.dom.visitBanner = banner;
        this.dom.visitBannerText = document.getElementById('visit-banner-text');
        this.dom.btnVisitStall = document.getElementById('btn-visit-stall');
        this.dom.btnReturnHome = document.getElementById('btn-return-home');

        if (banner.dataset.bound !== 'true') {
            banner.dataset.bound = 'true';
            this.dom.btnReturnHome?.addEventListener('click', () => this.returnHomeFarm());
            this.dom.btnVisitStall?.addEventListener('click', () => this.openVisitedStall());
        }
    }

    // --- Layout & Viewport Auto Scaling ---
    resizeGame() {
        const container = this.dom.container;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        this.baseScale = Math.max(windowWidth / 1280, windowHeight / 720);
        
        container.style.transform = 'none';
        container.style.position = 'absolute';
        container.style.left = '0';
        container.style.top = '0';
        container.style.width = '100%';
        container.style.height = '100%';

        this.updateFarmWorldTransform();
    }

    updateFarmWorldTransform(farmWorld) {
        if (!farmWorld) farmWorld = document.getElementById('farm-world');
        if (farmWorld) {
            const finalScale = this.baseScale * this.zoomLevel;
            farmWorld.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${finalScale})`;
        }
    }

    // --- Audio Engine ---
    playSFX(type) {
        if (!this.inventory.state.settings.sfx || !this.audioCtx) return;
        
        const ctx = this.audioCtx;
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;

        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } 
        else if (type === 'dig') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(50, now + 0.25);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(250, now);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            gain2.gain.setValueAtTime(0.2, now);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc2.start(now);
            osc2.stop(now + 0.15);
        } 
        else if (type === 'plant') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.2);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } 
        else if (type === 'harvest') {
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const time = now + idx * 0.08;
                const oscChime = ctx.createOscillator();
                const gainChime = ctx.createGain();
                
                oscChime.type = 'sine';
                oscChime.frequency.setValueAtTime(freq, time);
                oscChime.connect(gainChime);
                gainChime.connect(ctx.destination);
                
                gainChime.gain.setValueAtTime(0.12, time);
                gainChime.gain.exponentialRampToValueAtTime(0.005, time + 0.35);
                
                oscChime.start(time);
                oscChime.stop(time + 0.4);
            });
        }
        else if (type === 'levelUp') {
            const notes = [392.00, 523.25, 659.25, 783.99, 783.99, 1046.50];
            const durations = [0.12, 0.12, 0.12, 0.12, 0.08, 0.4];
            let timeAcc = now;
            notes.forEach((freq, idx) => {
                const oscFanfare = ctx.createOscillator();
                const gainFanfare = ctx.createGain();
                oscFanfare.type = 'triangle';
                oscFanfare.frequency.setValueAtTime(freq, timeAcc);
                oscFanfare.connect(gainFanfare);
                gainFanfare.connect(ctx.destination);
                
                gainFanfare.gain.setValueAtTime(0.18, timeAcc);
                gainFanfare.gain.exponentialRampToValueAtTime(0.01, timeAcc + durations[idx]);
                
                oscFanfare.start(timeAcc);
                oscFanfare.stop(timeAcc + durations[idx] + 0.05);
                timeAcc += durations[idx];
            });
        }
        else if (type === 'quest') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
            
            setTimeout(() => {
                const oscQuest2 = ctx.createOscillator();
                const gainQuest2 = ctx.createGain();
                oscQuest2.type = 'sine';
                oscQuest2.frequency.setValueAtTime(1320, now + 0.15);
                oscQuest2.connect(gainQuest2);
                gainQuest2.connect(ctx.destination);
                gainQuest2.gain.setValueAtTime(0.15, now + 0.15);
                gainQuest2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
                oscQuest2.start(now + 0.15);
                oscQuest2.stop(now + 0.45);
            }, 100);
        }
        else if (type === 'bark') {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            const gain2 = ctx.createGain();
            
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            
            // Triangle oscillator for the main bark body
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(300, now);
            osc1.frequency.exponentialRampToValueAtTime(100, now + 0.15);
            gain1.gain.setValueAtTime(0.25, now);
            gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            
            // Sawtooth oscillator for the bark grit
            osc2.type = 'sawtooth';
            osc2.frequency.setValueAtTime(150, now);
            osc2.frequency.exponentialRampToValueAtTime(50, now + 0.12);
            gain2.gain.setValueAtTime(0.15, now);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
            
            osc1.start(now);
            osc1.stop(now + 0.15);
            osc2.start(now);
            osc2.stop(now + 0.12);
        }
        else if (type === 'spaceWarp') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();
            
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(80, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.8);
            
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(200, now);
            filter.frequency.exponentialRampToValueAtTime(3000, now + 0.8);
            filter.Q.setValueAtTime(8, now);
            
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.2);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
            
            osc.start(now);
            osc.stop(now + 0.8);
        }
        else if (type === 'bounce') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            
            osc.start(now);
            osc.stop(now + 0.15);
        }
    }

    toggleAntigravity() {
        this.antigravityActive = !this.antigravityActive;
        const viewport = document.getElementById('game-viewport');
        const btn = this.dom.btnAntigravity;
        
        this.playSFX('spaceWarp');
        
        if (this.antigravityActive) {
            if (viewport) {
                viewport.classList.add('antigravity-active');
                viewport.classList.add('antigravity-shake');
                setTimeout(() => {
                    viewport.classList.remove('antigravity-shake');
                }, 500);
            }
            if (btn) btn.classList.add('active');
            this.showToast('🚀 Đã kích hoạt Chế độ Kháng trọng lực! 🛸');
        } else {
            if (viewport) {
                viewport.classList.remove('antigravity-active');
            }
            if (btn) btn.classList.remove('active');
            this.showToast('🌍 Trọng lực bình thường đã trở lại.');
        }
        this.phaserWorld?.setAntigravity(this.antigravityActive);
    }

    playBGM() {
        if (!this.inventory.state.settings.bgm || !this.audioCtx) return;
        if (this.bgmNode) return;

        const ctx = this.audioCtx;
        const playBeat = () => {
            if (!this.inventory.state.settings.bgm) return;
            const now = ctx.currentTime;
            
            const progression = [
                [261.63, 329.63, 392.00], // C Maj
                [349.23, 440.00, 523.25], // F Maj
                [392.00, 493.88, 587.33], // G Maj
                [220.00, 261.63, 329.63]  // Am
            ];
            
            const chordIdx = Math.floor(now / 4) % progression.length;
            const chord = progression[chordIdx];
            
            chord.forEach((freq, noteIdx) => {
                const noteTime = now + noteIdx * 0.4;
                const oscNode = ctx.createOscillator();
                const gainNode = ctx.createGain();
                
                oscNode.type = 'sine';
                oscNode.frequency.setValueAtTime(freq, noteTime);
                oscNode.connect(gainNode);
                
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(600, noteTime);
                
                gainNode.connect(filter);
                filter.connect(ctx.destination);
                
                gainNode.gain.setValueAtTime(0, noteTime);
                gainNode.gain.linearRampToValueAtTime(0.04, noteTime + 0.1);
                gainNode.gain.exponentialRampToValueAtTime(0.001, noteTime + 1.2);
                
                oscNode.start(noteTime);
                oscNode.stop(noteTime + 1.5);
            });
            
            this.bgmTimeout = setTimeout(playBeat, 2500);
        };
        
        this.bgmNode = true;
        playBeat();
    }

    stopBGM() {
        if (this.bgmTimeout) {
            clearTimeout(this.bgmTimeout);
            this.bgmTimeout = null;
        }
        this.bgmNode = null;
    }

    // --- Particle Effects Engine ---
    createParticles(x, y, count, type) {
        if (this.phaserWorld?.isReady()) {
            this.phaserWorld.createParticles(x, y, count, type);
            return;
        }

        const parent = document.getElementById('particle-container');
        if (!parent) return;

        const colors = type === 'dirt' 
            ? ['#784212', '#935116', '#b55d14', '#5c330a'] 
            : ['#f1c40f', '#f39c12', '#fcf3cf', '#e67e22', '#ffffff'];

        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            
            const size = Math.random() * 8 + 4;
            particle.style.width = size + 'px';
            particle.style.height = size + 'px';
            particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            
            particle.style.left = x + 'px';
            particle.style.top = y + 'px';

            let tx, ty;
            if (this.antigravityActive) {
                tx = (Math.random() * 40 - 20); // slight drift left/right
                ty = -Math.random() * 150 - 100; // float high up
                particle.style.animation = 'particle-float-up 2.2s forwards ease-out';
            } else {
                const angle = Math.random() * Math.PI * 2;
                const velocity = Math.random() * 80 + 30;
                tx = Math.cos(angle) * velocity;
                ty = Math.sin(angle) * velocity - (type === 'dirt' ? 30 : 60);
            }

            particle.style.setProperty('--tx', `${tx}px`);
            particle.style.setProperty('--ty', `${ty}px`);

            parent.appendChild(particle);

            setTimeout(() => {
                particle.remove();
            }, this.antigravityActive ? 2200 : 600);
        }
    }

    getLocalCoords(screenX, screenY) {
        const parent = document.getElementById('particle-container');
        if (!parent) return { x: screenX, y: screenY };
        const rect = parent.getBoundingClientRect();
        const scale = this.baseScale * this.zoomLevel;
        return {
            x: (screenX - rect.left) / scale,
            y: (screenY - rect.top) / scale
        };
    }

    // Calculate map pixel coordinates from a plot element's position
    getPlotPixelCoords(plotId) {
        if (this.phaserWorld?.isReady()) {
            return this.phaserWorld.getPlotWorldPosition(plotId);
        }

        const plotEl = document.getElementById(`plot-${plotId}`);
        const parentEl = document.getElementById('game-world-objects');
        if (!plotEl || !parentEl) return { x: 0, y: 0 };

        const parentRect = parentEl.getBoundingClientRect();
        const plotRect = plotEl.getBoundingClientRect();

        const relativeLeft = ((plotRect.left + plotRect.width / 2 - parentRect.left) / parentRect.width) * 100;
        const relativeTop = ((plotRect.top + plotRect.height / 2 - parentRect.top) / parentRect.height) * 100;

        // Convert percentage to 1280x720 canvas pixels
        return {
            x: (relativeLeft / 100) * 1280,
            y: (relativeTop / 100) * 720
        };
    }

    getPlotScreenCoords(plotId) {
        const coords = this.getPlotPixelCoords(plotId);
        return this.stageToScreenCoords(coords.x, coords.y);
    }

    stageToScreenCoords(x, y) {
        const farmStage = document.getElementById('farm-stage');
        if (!farmStage) return { x, y };

        const rect = farmStage.getBoundingClientRect();
        return {
            x: rect.left + (x / 1280) * rect.width,
            y: rect.top + (y / 720) * rect.height
        };
    }

    isPlotUnlocked(plotId) {
        return this.inventory?.isPlotUnlocked(plotId) ?? true;
    }

    getNextLandPlotId() {
        return this.inventory?.getNextLandPlotId() ?? null;
    }

    isNextLandPlot(plotId) {
        return this.getNextLandPlotId() === Number(plotId);
    }

    getLandPurchasePrice() {
        return this.inventory?.getLandPurchasePrice() ?? null;
    }

    getLandRequiredLevel() {
        return this.inventory?.getLandRequiredLevel() ?? null;
    }

    getCropRequiredLevel(seedType) {
        return Number(CROP_CONFIGS[seedType]?.requiredLevel) || 1;
    }

    isCropUnlocked(seedType) {
        return (Number(this.inventory?.state?.level) || 1) >= this.getCropRequiredLevel(seedType);
    }

    // --- Core Farm Actions ---
    handlePlotClick(plotId) {
        if (this.isDesignMode || this.hasDragged || this.isPaveMode) return;
        if (this.isVisitingFarm) {
            this.showToast('Bạn đang tham quan nên không thể thao tác trên ruộng này.');
            return;
        }
        const plot = this.inventory.state.plots[plotId];
        if (!plot) return;
        this.playSFX('click');

        // Toggle selected styling
        document.querySelectorAll('.plot').forEach(p => p.classList.remove('selected'));
        const plotEl = document.getElementById(`plot-${plotId}`);

        if (!this.isPlotUnlocked(plotId)) {
            this.hideSeedPopup();
            this.hideCropDetail();

            if (this.isNextLandPlot(plotId)) {
                if (plotEl) plotEl.classList.add('selected');
                this.phaserWorld?.selectTile(plotId);
                this.showLandPurchaseDialog(plotId);
            } else {
                this.phaserWorld?.clearSelectedTile();
                this.showToast('Hãy mở ô đất liền kề trước!');
            }
            return;
        }

        if (plotEl) plotEl.classList.add('selected');
        this.phaserWorld?.selectTile(plotId);

        if (plot.state === 'empty') {
            this.activePlotId = plotId;
            this.showSeedPopup(plotId);
            this.hideCropDetail();
        } 
        else if (plot.state === 'mature') {
            this.harvestPlot(plotId);
        }
        else {
            this.showCropDetail(plot);
        }
    }

    showSeedPopup(plotId) {
        const popup = this.dom.seedPopup;
        
        this.renderSeedPopupCounts();

        const parentRect = this.dom.container.getBoundingClientRect();
        const plotScreen = this.getPlotScreenCoords(plotId);
        const popupLeft = (plotScreen.x - parentRect.left) - 125;
        const popupTop = (plotScreen.y - parentRect.top) - 230;

        popup.style.left = popupLeft + 'px';
        popup.style.top = popupTop + 'px';
        popup.classList.remove('hide');
    }

    hideSeedPopup() {
        this.dom.seedPopup.classList.add('hide');
        this.activePlotId = null;
        this.phaserWorld?.clearSelectedTile();
    }

    renderSeedPopupCounts() {
        for (const [key, crop] of Object.entries(CROP_CONFIGS)) {
            if (crop.shopVisible === false) continue;
            const value = Number(this.inventory.state.inventory.seeds[key]) || 0;
            const requiredLevel = Number(crop.requiredLevel) || 1;
            const isUnlocked = this.isCropUnlocked(key);
            const countEl = document.getElementById(`count-${key}`);
            if (countEl) {
                countEl.textContent = isUnlocked ? `x${value}` : `Mở ở cấp ${requiredLevel}`;
            }
            const itemBtn = document.querySelector(`.seed-item[data-seed="${key}"]`);
            if (itemBtn) {
                itemBtn.disabled = !isUnlocked || value <= 0;
                itemBtn.title = isUnlocked
                    ? `${crop.nameVi} - ${crop.growthTime} giây`
                    : `Đạt cấp ${requiredLevel} để mở khóa`;
            }
            const allBtn = document.querySelector(`.btn-plant-all[data-seed="${key}"]`);
            if (allBtn) {
                allBtn.disabled = !isUnlocked || value <= 0;
                allBtn.title = isUnlocked
                    ? 'Trồng vào tất cả ô đất trống'
                    : `Đạt cấp ${requiredLevel} để mở khóa`;
            }
        }
    }

    plantSeedOnActivePlot(seedType) {
        if (this.isVisitingFarm) return;
        if (this.activePlotId === null) return;

        const requiredLevel = this.getCropRequiredLevel(seedType);
        if (!this.isCropUnlocked(seedType)) {
            this.showToast(`Cần đạt cấp ${requiredLevel} để trồng ${CROP_CONFIGS[seedType]?.nameVi || 'giống này'}!`);
            return;
        }
        
        const plotId = this.activePlotId;
        const count = this.inventory.state.inventory.seeds[seedType] || 0;

        if (!this.isPlotUnlocked(plotId)) {
            this.hideSeedPopup();
            this.showToast('Hãy mua ô đất này trước khi gieo hạt!');
            return;
        }
        
        if (count <= 0) {
            this.showToast('Bạn đã hết hạt giống này! Hãy mua thêm ở Cửa hàng.');
            return;
        }

        if (this.inventory.state.energy < 3) {
            this.showToast('Không đủ năng lượng! Hãy nạp thêm.');
            return;
        }

        this.hideSeedPopup();
        
        const plot = this.inventory.state.plots[plotId];
        
        // Deduct seed and energy
        this.inventory.state.inventory.seeds[seedType]--;
        this.inventory.state.energy -= 3;
        this.inventory.state.stats.plantedTotal++;
        
        this.inventory.checkAchievements();
        this.inventory.updateQuestProgress('plant', seedType, 1);
        
        this.renderHUD();
        this.inventory.saveGame();

        // Lock plot state to digging
        plot.state = 'digging';
        this.tiles[plotId].render();
        
        const coords = this.getPlotPixelCoords(plotId);
        
        // Slower natural travel -> plays walk -> plays dig -> plays plant -> idle home
        this.farmer.setTarget(coords.x, coords.y - 12, () => {
            // Arrived! State DIG
            this.farmer.setState('DIG');
            
            let digTick = 0;
            const digInterval = setInterval(() => {
                this.playSFX('dig');
                
                // Burst dirt particles
                this.createParticles(coords.x, coords.y, 10, 'dirt');
                
                digTick++;
                if (digTick >= 4) {
                    clearInterval(digInterval);
                    
                    // Transitions to PLANT animation
                    this.farmer.setState('PLANT');
                    this.playSFX('plant');

                    setTimeout(() => {
                        plot.state = 'sprouting';
                        plot.cropType = seedType;
                        plot.plantTime = Date.now();
                        plot.growthDuration = CROP_CONFIGS[seedType].growthTime * 1000;
                        
                        this.tiles[plotId].render();
                        this.showToast(`Đã gieo hạt giống ${CROP_CONFIGS[seedType].nameVi}!`);
                        this.inventory.saveGame();

                        this.farmer.setState('IDLE');
                        
                        this.farmerIdleTimeout = setTimeout(() => {
                            const homeCoords = {
                                x: this.farmerHomePos.left / 100 * 1280,
                                y: this.farmerHomePos.top / 100 * 720
                            };
                            this.farmer.setTarget(homeCoords.x, homeCoords.y);
                        }, 2000);
                    }, 1000);
                }
            }, 300);
        });
    }

    plantAllSeeds(seedType) {
        if (this.isVisitingFarm) return;
        const requiredLevel = this.getCropRequiredLevel(seedType);
        if (!this.isCropUnlocked(seedType)) {
            this.showToast(`Cần đạt cấp ${requiredLevel} để trồng ${CROP_CONFIGS[seedType]?.nameVi || 'giống này'}!`);
            return;
        }
        let emptyPlots = this.inventory.state.plots.filter(p => p.state === 'empty' && this.isPlotUnlocked(p.id));
        if (this.activePlotId !== null) {
            const activeIndex = emptyPlots.findIndex(p => p.id === this.activePlotId);
            if (activeIndex !== -1) {
                const [activePlot] = emptyPlots.splice(activeIndex, 1);
                emptyPlots.unshift(activePlot);
            }
        }

        const emptyCount = emptyPlots.length;
        if (emptyCount === 0) {
            this.showToast('Không có ô đất trống nào!');
            this.hideSeedPopup();
            return;
        }

        const seedCount = this.inventory.state.inventory.seeds[seedType] || 0;
        if (seedCount <= 0) {
            this.showToast('Bạn đã hết hạt giống này! Hãy mua thêm ở Cửa hàng.');
            this.hideSeedPopup();
            return;
        }

        const maxByEnergy = Math.floor(this.inventory.state.energy / 3);
        const plantCount = Math.min(emptyCount, seedCount, maxByEnergy);

        if (plantCount <= 0) {
            this.showToast('Không đủ năng lượng!');
            return;
        }

        this.hideSeedPopup();

        for (let i = 0; i < plantCount; i++) {
            const plot = emptyPlots[i];
            plot.state = 'sprouting';
            plot.cropType = seedType;
            plot.plantTime = Date.now();
            plot.growthDuration = CROP_CONFIGS[seedType].growthTime * 1000;
            this.tiles[plot.id].render();

            const coords = this.getPlotPixelCoords(plot.id);
            this.createParticles(coords.x, coords.y, 8, 'dirt');
        }

        this.inventory.state.inventory.seeds[seedType] -= plantCount;
        this.inventory.state.energy -= plantCount * 3;
        this.inventory.state.stats.plantedTotal += plantCount;

        this.inventory.updateQuestProgress('plant', seedType, plantCount);
        this.inventory.checkAchievements();

        this.renderHUD();
        this.inventory.saveGame();

        this.showToast(`Đã trồng hàng loạt ${plantCount} hạt giống ${CROP_CONFIGS[seedType].nameVi}!`);

        const firstPlotCoords = this.getPlotPixelCoords(emptyPlots[0].id);
        this.farmer.setTarget(firstPlotCoords.x, firstPlotCoords.y - 12, () => {
            this.farmer.setState('DIG');
            this.playSFX('plant');
            setTimeout(() => {
                this.farmer.setState('IDLE');
                this.farmerIdleTimeout = setTimeout(() => {
                    const homeCoords = {
                        x: this.farmerHomePos.left / 100 * 1280,
                        y: this.farmerHomePos.top / 100 * 720
                    };
                    this.farmer.setTarget(homeCoords.x, homeCoords.y);
                }, 2000);
            }, 1000);
        });
    }

    harvestPlot(plotId) {
        if (this.isVisitingFarm) return;
        if (!this.isPlotUnlocked(plotId)) return;
        const plot = this.inventory.state.plots[plotId];
        if (plot.state !== 'mature') return;

        if (this.inventory.state.energy < 2) {
            this.showToast('Không đủ năng lượng để thu hoạch!');
            return;
        }

        const cropType = plot.cropType;
        const cropCfg = CROP_CONFIGS[cropType];

        this.inventory.state.energy -= 2;
        this.renderHUD();
        this.inventory.saveGame();

        plot.state = 'digging';
        this.tiles[plotId].render();

        const coords = this.getPlotPixelCoords(plotId);
        
        // Walk over -> play HARVEST swing -> reward +1 -> walk home
        this.farmer.setTarget(coords.x, coords.y - 12, () => {
            this.farmer.setState('HARVEST');
            this.playSFX('harvest');
            
            // Fruit shakes slightly then bursts sparks
            this.createParticles(coords.x, coords.y, 15, 'spark');

            setTimeout(() => {
                this.inventory.state.inventory.crops[cropType]++;
                this.inventory.state.stats.harvestedTotal++;
                this.inventory.addXp(cropCfg.xpReward);

                this.inventory.updateQuestProgress('harvest', cropType, 1);
                this.inventory.checkAchievements();

                plot.state = 'empty';
                plot.cropType = null;
                plot.plantTime = null;
                plot.growthDuration = 0;
                
                this.tiles[plotId].render();
                
                this.hideCropDetail();
                this.showToast(`+1 ${cropCfg.nameVi} đã được xếp vào kho đồ! (+${cropCfg.xpReward} XP)`);
                this.inventory.saveGame();
                this.updateHarvestAllBadge();

                this.farmer.setState('IDLE');
                
                this.farmerIdleTimeout = setTimeout(() => {
                    const homeCoords = {
                        x: this.farmerHomePos.left / 100 * 1280,
                        y: this.farmerHomePos.top / 100 * 720
                    };
                    this.farmer.setTarget(homeCoords.x, homeCoords.y);
                }, 2000);
            }, 1000);
        });
    }

    harvestAllCrops() {
        if (this.systemSettings?.ENABLE_AUTO_HARVEST === false) {
            this.showToast('Chức năng thu hoạch tất cả đang tạm tắt.');
            return;
        }
        if (this.isVisitingFarm) {
            this.showToast('Bạn đang tham quan nên không thể thu hoạch farm này.');
            return;
        }
        const maturePlots = this.inventory.state.plots.filter(p => p.state === 'mature' && this.isPlotUnlocked(p.id));
        const matureCount = maturePlots.length;

        if (matureCount === 0) {
            this.showToast('Không có cây trồng nào chín để thu hoạch!');
            return;
        }

        if (this.inventory.state.energy < 2) {
            this.showToast('Không đủ năng lượng để thu hoạch! Cần ít nhất 2 Năng lượng.');
            return;
        }

        const maxByEnergy = Math.floor(this.inventory.state.energy / 2);
        const harvestCount = Math.min(matureCount, maxByEnergy);

        let harvestedTypes = {};
        let totalXp = 0;

        for (let i = 0; i < harvestCount; i++) {
            const plot = maturePlots[i];
            const coords = this.getPlotPixelCoords(plot.id);
            const cropType = plot.cropType;
            const cropCfg = CROP_CONFIGS[cropType];

            this.inventory.state.energy -= 2;
            this.createParticles(coords.x, coords.y, 10, 'spark');

            this.inventory.state.inventory.crops[cropType]++;
            this.inventory.state.stats.harvestedTotal++;
            this.inventory.addXp(cropCfg.xpReward);
            totalXp += cropCfg.xpReward;

            harvestedTypes[cropCfg.nameVi] = (harvestedTypes[cropCfg.nameVi] || 0) + 1;

            this.inventory.updateQuestProgress('harvest', cropType, 1);

            plot.state = 'empty';
            plot.cropType = null;
            plot.plantTime = null;
            plot.growthDuration = 0;
            
            this.tiles[plot.id].render();
        }

        this.inventory.checkAchievements();
        this.renderHUD();
        this.inventory.saveGame();
        this.hideCropDetail();
        this.updateHarvestAllBadge();

        const summaryParts = Object.entries(harvestedTypes).map(([name, qty]) => `${qty} ${name}`);
        this.showToast(`Thu hoạch hàng loạt: +${summaryParts.join(', ')}! (+${totalXp} XP)`);

        this.playSFX('harvest');

        const firstPlotCoords = this.getPlotPixelCoords(maturePlots[0].id);
        this.farmer.setTarget(firstPlotCoords.x, firstPlotCoords.y - 12, () => {
            this.farmer.setState('HARVEST');
            setTimeout(() => {
                this.farmer.setState('IDLE');
                this.farmerIdleTimeout = setTimeout(() => {
                    const homeCoords = {
                        x: this.farmerHomePos.left / 100 * 1280,
                        y: this.farmerHomePos.top / 100 * 720
                    };
                    this.farmer.setTarget(homeCoords.x, homeCoords.y);
                }, 2000);
            }, 1000);
        });
    }

    formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        
        const pad = (num) => String(num).padStart(2, '0');
        
        if (h > 0) {
            return `${pad(h)}:${pad(m)}:${pad(s)}`;
        }
        return `${pad(m)}:${pad(s)}`;
    }

    // --- Dynamic DOM Rendering ---
    renderAll() {
        this.applyLayout();
        this.tiles.forEach(tile => tile.render());
        this.renderHUD();
        this.updateQuestBadge();
        this.updateHarvestAllBadge();
        this.generateForestFenceAndClouds();
        this.renderPavedPaths();
        this.phaserWorld?.syncAll();
    }

    renderHUD() {
        const hudState = this.isVisitingFarm && this.homeState ? this.homeState : this.inventory.state;
        this.dom.coinsVal.textContent = hudState.coins.toLocaleString('en-US');
        this.dom.gemsVal.textContent = hudState.gems.toLocaleString('en-US');
        
        this.dom.energyVal.textContent = `${hudState.energy}/${hudState.maxEnergy}`;
        const energyPercent = (hudState.energy / hudState.maxEnergy) * 100;
        this.dom.energyFill.style.width = energyPercent + '%';

        this.dom.levelVal.textContent = hudState.level;
        this.dom.xpVal.textContent = `${hudState.xp.toLocaleString('en-US')}/${hudState.xpNeeded.toLocaleString('en-US')}`;
        const xpPercent = (hudState.xp / hudState.xpNeeded) * 100;
        this.dom.xpFill.style.width = xpPercent + '%';
    }

    showCropDetail(plot) {
        this.activeDetailPlotId = plot.id;
        this.dom.cropDetailPanel.className = 'detail-panel active-plot-' + plot.id;
        const cropCfg = CROP_CONFIGS[plot.cropType];
        
        this.dom.detailCropIcon.textContent = cropCfg.icon;
        const mockImg = document.createElement('span');
        mockImg.style.fontSize = '2.2rem';
        mockImg.textContent = cropCfg.icon;
        this.dom.detailCropIcon.replaceWith(mockImg);
        mockImg.id = 'detail-crop-icon';

        this.dom.detailCropName.textContent = cropCfg.nameVi;
        
        const fertControls = document.getElementById('fertilizer-controls');
        if (plot.state === 'mature') {
            this.dom.detailCropTimer.textContent = 'Chín hoàn toàn - Click để thu hoạch!';
            if (fertControls) fertControls.style.display = 'none';
        } else {
            const elapsed = Date.now() - plot.plantTime;
            const remaining = Math.max(0, plot.growthDuration - elapsed);
            this.dom.detailCropTimer.textContent = `⏳ ${this.formatTime(Math.ceil(remaining / 1000))}`;
            if (fertControls) {
                fertControls.style.display = 'flex';
                const midCount = this.inventory.state.inventory.fertilizers?.mid || 0;
                const highCount = this.inventory.state.inventory.fertilizers?.high || 0;
                const midCountEl = document.getElementById('mid-fertilizer-count');
                const highCountEl = document.getElementById('high-fertilizer-count');
                if (midCountEl) midCountEl.textContent = `x${midCount}`;
                if (highCountEl) highCountEl.textContent = `x${highCount}`;
            }
        }
    }
    togglePaveMode() {
        if (this.isVisitingFarm) {
            this.showToast('Bạn đang tham quan nên không thể lát đường farm này.');
            return;
        }
        this.isPaveMode = !this.isPaveMode;
        const btn = document.getElementById('btn-pave-mode');
        const viewport = document.getElementById('game-viewport');
        const farmStage = document.getElementById('farm-stage');
        
        this.playSFX('click');
        
        // Reset paving start state when toggling
        this.paveStartCoords = null;
        this.removePaveStartMarker();
        
        if (this.isPaveMode) {
            if (this.isDesignMode) this.exitDesignMode(false);
            
            if (btn) btn.classList.add('active');
            if (viewport) viewport.style.cursor = 'cell';
            if (farmStage) farmStage.classList.add('pave-mode-active');
            this.showToast('📍 Lót đường: Chọn điểm đầu và điểm cuối để tự động lót đường!');
        } else {
            if (btn) btn.classList.remove('active');
            if (viewport) viewport.style.cursor = '';
            if (farmStage) farmStage.classList.remove('pave-mode-active');
            this.showToast('Đã tắt chế độ lót đường.');
        }
    }

    renderPaveStartMarker(x, y) {
        this.removePaveStartMarker();
        const farmStage = document.getElementById('farm-stage');
        if (farmStage) {
            const marker = document.createElement('div');
            marker.id = 'pave-start-marker';
            marker.className = 'pave-start-marker';
            marker.style.left = `${x}px`;
            marker.style.top = `${y}px`;
            farmStage.appendChild(marker);
        }
    }

    removePaveStartMarker() {
        const marker = document.getElementById('pave-start-marker');
        if (marker) {
            marker.remove();
        }
    }

    togglePavedPath(x, y) {
        this.inventory.state.pavedPaths = this.inventory.state.pavedPaths || [];
        const pathKey = `${x},${y}`;
        const index = this.inventory.state.pavedPaths.indexOf(pathKey);
        
        if (index !== -1) {
            this.inventory.state.pavedPaths.splice(index, 1);
            this.playSFX('dig');
            this.createParticles(x + 20, y + 20, 5, 'dirt');
        } else {
            if (this.inventory.state.coins < 2) {
                this.showToast('Không đủ vàng! Cần 2 Vàng để lót đường đất.');
                return;
            }
            this.inventory.state.coins -= 2;
            this.inventory.state.stats.coinsSpentTotal += 2;
            this.inventory.state.pavedPaths.push(pathKey);
            this.playSFX('plant');
            this.createParticles(x + 20, y + 20, 5, 'spark');
        }
        
        this.renderPavedPaths();
        this.renderHUD();
        this.inventory.saveGame();
    }

    renderPavedPaths() {
        const container = document.getElementById('paved-paths-container');
        if (!container) return;
        
        container.innerHTML = '';
        const paths = this.inventory.state.pavedPaths || [];
        
        paths.forEach(key => {
            const [x, y] = key.split(',').map(Number);
            const tile = document.createElement('div');
            tile.className = 'paved-path-tile';
            tile.style.left = `${x}px`;
            tile.style.top = `${y}px`;
            container.appendChild(tile);
        });
    }

    hideCropDetail() {
        this.dom.cropDetailPanel.className = 'detail-panel hide';
        this.activeDetailPlotId = null;
    }

    showToast(message) {
        this.dom.toastMsg.textContent = message;
        this.dom.toast.classList.remove('hide');
        
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            this.dom.toast.classList.add('hide');
        }, 3000);
    }

    renameFarm() {
        if (this.isVisitingFarm) {
            this.showToast('Bạn đang tham quan nên không thể đổi tên farm này.');
            return;
        }
        const currentName = this.inventory.state.farmName || 'Happy Farm';
        this.showCustomPrompt('🏷️ ĐỔI TÊN NÔNG TRẠI', 'Nhập tên nông trại mới của bạn (tối đa 15 ký tự):', currentName)
            .then(newName => {
                if (newName === null) return; // Cancelled
                
                const trimmed = newName.trim();
                if (trimmed === '') {
                    this.showToast('Tên nông trại không được để trống!');
                    return;
                }
                
                if (trimmed.length > 15) {
                    this.showToast('Tên nông trại không được vượt quá 15 ký tự!');
                    return;
                }
                
                this.inventory.state.farmName = trimmed;
                this.inventory.saveGame();
                this.updateSignpostText();
                this.playSFX('harvest');
                this.showToast(`Nông trại đã được đổi tên thành "${trimmed}"!`);
            });
    }

    showCustomPrompt(title, message, defaultValue = "") {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-custom-prompt');
            const titleEl = document.getElementById('custom-prompt-title');
            const messageEl = document.getElementById('custom-prompt-message');
            const inputEl = document.getElementById('custom-prompt-input');

            titleEl.textContent = title;
            messageEl.textContent = message;
            inputEl.value = defaultValue;

            modal.classList.remove('hide');
            inputEl.focus();
            inputEl.select();

            const cleanup = () => {
                modal.classList.add('hide');
                document.getElementById('btn-custom-prompt-ok').replaceWith(document.getElementById('btn-custom-prompt-ok').cloneNode(true));
                document.getElementById('btn-custom-prompt-cancel').replaceWith(document.getElementById('btn-custom-prompt-cancel').cloneNode(true));
                document.getElementById('btn-custom-prompt-close').replaceWith(document.getElementById('btn-custom-prompt-close').cloneNode(true));
                document.getElementById('custom-prompt-input').replaceWith(document.getElementById('custom-prompt-input').cloneNode(true));
            };

            document.getElementById('btn-custom-prompt-ok').addEventListener('click', () => {
                const val = document.getElementById('custom-prompt-input').value;
                cleanup();
                resolve(val);
            });

            const cancelHandler = () => {
                cleanup();
                resolve(null);
            };

            document.getElementById('btn-custom-prompt-cancel').addEventListener('click', cancelHandler);
            document.getElementById('btn-custom-prompt-close').addEventListener('click', cancelHandler);

            document.getElementById('custom-prompt-input').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('btn-custom-prompt-ok').click();
                } else if (e.key === 'Escape') {
                    cancelHandler();
                }
            });
        });
    }

    showCustomConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-custom-confirm');
            const titleEl = document.getElementById('custom-confirm-title');
            const messageEl = document.getElementById('custom-confirm-message');

            titleEl.textContent = title;
            messageEl.textContent = message;

            modal.classList.remove('hide');

            const cleanup = () => {
                modal.classList.add('hide');
                document.getElementById('btn-custom-confirm-ok').replaceWith(document.getElementById('btn-custom-confirm-ok').cloneNode(true));
                document.getElementById('btn-custom-confirm-cancel').replaceWith(document.getElementById('btn-custom-confirm-cancel').cloneNode(true));
                document.getElementById('btn-custom-confirm-close').replaceWith(document.getElementById('btn-custom-confirm-close').cloneNode(true));
            };

            document.getElementById('btn-custom-confirm-ok').addEventListener('click', () => {
                cleanup();
                resolve(true);
            });

            const cancelHandler = () => {
                cleanup();
                resolve(false);
            };

            document.getElementById('btn-custom-confirm-cancel').addEventListener('click', cancelHandler);
            document.getElementById('btn-custom-confirm-close').addEventListener('click', cancelHandler);
        });
    }

    showLandPurchaseDialog(plotId) {
        const modal = document.getElementById('modal-land-purchase');
        const titleEl = document.getElementById('land-purchase-title');
        const messageEl = document.getElementById('land-purchase-message');
        const goldBtn = document.getElementById('btn-land-buy-gold');
        const gemsBtn = document.getElementById('btn-land-buy-gems');
        const cancelBtn = document.getElementById('btn-land-buy-cancel');
        const closeBtn = document.getElementById('btn-land-buy-close');
        const price = this.getLandPurchasePrice();
        const requiredLevel = this.getLandRequiredLevel();

        if (!modal || !price) {
            this.showToast('Bạn đã mở hết ruộng đất!');
            return;
        }

        const cleanup = () => {
            modal.classList.add('hide');
            ['btn-land-buy-gold', 'btn-land-buy-gems', 'btn-land-buy-cancel', 'btn-land-buy-close'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.replaceWith(el.cloneNode(true));
            });
        };

        if (titleEl) titleEl.textContent = `Mua ô đất #${plotId + 1}`;
        const currentLevel = Number(this.inventory.state.level) || 1;
        const meetsLevel = currentLevel >= requiredLevel;
        if (messageEl) {
            messageEl.textContent = meetsLevel
                ? `Yêu cầu cấp ${requiredLevel} — Bạn đã đủ cấp để mua.`
                : `Yêu cầu cấp ${requiredLevel} — Cấp hiện tại: ${currentLevel}.`;
            messageEl.classList.toggle('requirement-missing', !meetsLevel);
        }
        if (goldBtn) {
            goldBtn.textContent = `Mua bằng ${price.gold.toLocaleString('en-US')} Vàng`;
            goldBtn.disabled = !meetsLevel || this.inventory.state.coins < price.gold;
            goldBtn.addEventListener('click', () => {
                if (this.inventory.buyLand('gold')) cleanup();
            });
        }
        if (gemsBtn) {
            gemsBtn.textContent = `Mua bằng ${price.gems.toLocaleString('en-US')} KC`;
            gemsBtn.disabled = !meetsLevel || this.inventory.state.gems < price.gems;
            gemsBtn.addEventListener('click', () => {
                if (this.inventory.buyLand('gems')) cleanup();
            });
        }

        const cancelHandler = () => cleanup();
        cancelBtn?.addEventListener('click', cancelHandler);
        closeBtn?.addEventListener('click', cancelHandler);
        modal.classList.remove('hide');
    }

    updateSignpostText() {
        const signpostText = this.dom.signpostText || document.getElementById('signpost-text');
        if (signpostText) {
            signpostText.textContent = this.inventory.state.farmName || 'Happy Farm';
        }
    }

    useFertilizer(type) {
        if (this.activeDetailPlotId === null || this.activeDetailPlotId === undefined) return;
        this.useFertilizerOnPlot(this.activeDetailPlotId, type);
    }

    useFertilizerOnPlot(plotId, type) {
        if (this.isVisitingFarm) {
            this.showToast('Bạn đang tham quan nên không thể bón phân farm này.');
            return;
        }
        if (plotId === null || plotId === undefined) return;
        const plot = this.inventory.state.plots[plotId];
        if (!plot || !this.isPlotUnlocked(plotId) || plot.state === 'mature' || plot.state === 'empty') return;

        if (!this.inventory.state.inventory.fertilizers) {
            this.inventory.state.inventory.fertilizers = { mid: 0, high: 0 };
        }
        let count = this.inventory.state.inventory.fertilizers[type] || 0;
        const price = type === 'mid' ? 50 : 150;
        const nameVi = type === 'mid' ? 'Phân bón Trung cấp' : 'Phân bón Cao cấp';

        if (count <= 0) {
            this.showCustomConfirm("🛒 MUA PHÂN BÓN", `Bạn không có ${nameVi}. Bạn có muốn mua và sử dụng ngay với giá ${price} Vàng không?`)
                .then(confirmBuy => {
                    if (!confirmBuy) return;

                    if (this.inventory.state.coins < price) {
                        this.showToast('Không đủ tiền vàng!');
                        return;
                    }

                    // Deduct coins
                    this.inventory.state.coins -= price;
                    this.inventory.state.stats.coinsSpentTotal += price;
                    this.inventory.state.inventory.fertilizers[type] = (this.inventory.state.inventory.fertilizers[type] || 0) + 1;
                    this.renderHUD();
                    this.showToast(`Đã mua 1 ${nameVi}!`);

                    // Apply logic after successful purchase confirm callback
                    this.applyFertilizerLogic(plotId, type, plot);
                });
        } else {
            this.applyFertilizerLogic(plotId, type, plot);
        }
    }

    useFertilizerOnPlot(plotId, type) {
        if (this.isVisitingFarm) {
            this.showToast('Bạn đang tham quan nên không thể bón phân farm này.');
            return;
        }
        if (plotId === null || plotId === undefined) return;
        const plot = this.inventory.state.plots[plotId];
        if (!plot || !this.isPlotUnlocked(plotId) || plot.state === 'mature' || plot.state === 'empty') return;

        if (!this.inventory.state.inventory.fertilizers) {
            this.inventory.state.inventory.fertilizers = { mid: 0, high: 0 };
        }

        const count = this.inventory.state.inventory.fertilizers[type] || 0;
        const nameVi = type === 'mid' ? 'Phân bón Trung cấp' : 'Phân bón Cao cấp';
        if (count <= 0) {
            this.showToast(`Bạn chưa có ${nameVi}. Hãy mua từ quầy của người chơi khác trong Chợ.`);
            return;
        }

        this.applyFertilizerLogic(plotId, type, plot);
    }

    applyFertilizerLogic(plotId, type, plot) {
        this.inventory.state.inventory.fertilizers[type]--;
        
        const now = Date.now();
        const elapsed = now - plot.plantTime;
        const remaining = Math.max(0, plot.growthDuration - elapsed);

        if (type === 'mid') {
            const reduction = remaining * 0.5;
            plot.plantTime -= reduction;
            this.showToast('Đã bón phân Trung cấp! Giảm 50% thời gian chờ.');
        } else if (type === 'high') {
            plot.plantTime = now - plot.growthDuration;
            this.showToast('Đã bón phân Cao cấp! Cây trồng đã chín ngay.');
        }

        // Particle effect
        const coords = this.getPlotPixelCoords(plotId);
        this.createParticles(coords.x, coords.y, 20, 'spark');
        this.playSFX('levelUp');

        this.inventory.saveGame();
        
        // Re-render plot and refresh details if active
        this.tiles[plotId].render();
        if (this.activeDetailPlotId === plotId) {
            this.showCropDetail(plot);
        }
    }

    // --- Modal Managers ---
    openModal(modalId) {
        const modal = document.getElementById(`modal-${modalId}`);
        if (!modal) return;

        if (modalId === 'shop') {
            this.renderShop();
        } else if (modalId === 'inventory') {
            this.renderInventory();
        } else if (modalId === 'quests') {
            this.renderQuests();
        } else if (modalId === 'achievements') {
            this.renderAchievements();
        } else if (modalId === 'stats') {
            this.renderStats();
        } else if (modalId === 'pets') {
            this.renderPets();
        } else if (modalId === 'leaderboard') {
            this.renderLeaderboard();
        } else if (modalId === 'settings') {
            this.renderAccountSettings();
        } else if (modalId === 'feed-mill') {
            if (!this.canUseFeedMill()) return;
            this.renderFeedMillPanel();
        }

        modal.classList.remove('hide');
    }

    closeModal(modalId) {
        const modal = document.getElementById(`modal-${modalId}`);
        if (modal) modal.classList.add('hide');
    }

    setAccountSettingsMessage(element, message = '', isError = false) {
        if (!element) return;
        element.textContent = message;
        element.classList.toggle('hide', !message);
        element.classList.toggle('error', Boolean(message) && isError);
    }

    renderAccountSettings() {
        if (this.dom.profileAccountId) {
            this.dom.profileAccountId.value = this.currentUser?.id ? `#${this.currentUser.id}` : '--';
        }
        if (this.dom.profileEmail) {
            this.dom.profileEmail.value = this.currentUser?.email || '';
        }
        if (this.dom.profileFarmName) {
            this.dom.profileFarmName.value = this.inventory?.state?.farmName
                || this.currentUser?.farmName
                || 'Happy Farm';
        }
        this.setAccountSettingsMessage(this.dom.profileSettingsMessage);
        this.setAccountSettingsMessage(this.dom.passwordSettingsMessage);
    }

    async submitProfileSettings() {
        const form = this.dom.profileSettingsForm;
        if (!form || this.isVisitingFarm) return;
        const submit = form.querySelector('button[type="submit"]');
        const email = this.dom.profileEmail?.value.trim() || '';
        const farmName = this.dom.profileFarmName?.value.trim() || '';

        submit.disabled = true;
        this.setAccountSettingsMessage(this.dom.profileSettingsMessage);
        try {
            const payload = await this.api.updateProfile({ email, farmName });
            this.currentUser = payload.profile || this.currentUser;
            if (payload.state) {
                this.inventory.state = this.inventory.mergeDeep({}, this.inventory.state, payload.state);
            } else {
                this.inventory.state.farmName = farmName;
            }
            this.updateSignpostText();
            this.renderAccountSettings();
            this.setAccountSettingsMessage(
                this.dom.profileSettingsMessage,
                'Đã cập nhật thông tin cá nhân.'
            );
            this.showToast('Đã cập nhật thông tin cá nhân!');
        } catch (err) {
            this.setAccountSettingsMessage(
                this.dom.profileSettingsMessage,
                err.message || 'Không cập nhật được thông tin cá nhân.',
                true
            );
        } finally {
            submit.disabled = false;
        }
    }

    async submitPasswordSettings() {
        const form = this.dom.passwordSettingsForm;
        if (!form) return;
        const submit = form.querySelector('button[type="submit"]');
        const data = new FormData(form);
        const currentPassword = String(data.get('currentPassword') || '');
        const newPassword = String(data.get('newPassword') || '');
        const confirmPassword = String(data.get('confirmPassword') || '');

        this.setAccountSettingsMessage(this.dom.passwordSettingsMessage);
        if (newPassword !== confirmPassword) {
            this.setAccountSettingsMessage(
                this.dom.passwordSettingsMessage,
                'Mật khẩu nhập lại không khớp.',
                true
            );
            return;
        }

        submit.disabled = true;
        try {
            const payload = await this.api.changePassword({ currentPassword, newPassword });
            form.reset();
            this.setAccountSettingsMessage(
                this.dom.passwordSettingsMessage,
                payload.message || 'Đổi mật khẩu thành công.'
            );
            this.showToast('Đổi mật khẩu thành công!');
        } catch (err) {
            this.setAccountSettingsMessage(
                this.dom.passwordSettingsMessage,
                err.message || 'Không đổi được mật khẩu.',
                true
            );
        } finally {
            submit.disabled = false;
        }
    }

    applySystemSettings() {
        const settings = this.systemSettings || SYSTEM_SETTINGS;
        const toggle = (element, visible) => {
            if (!element) return;
            element.hidden = !visible;
            element.classList.toggle('hide', !visible);
        };
        toggle(this.dom?.btnHarvestAll, settings.ENABLE_AUTO_HARVEST !== false);
        toggle(document.getElementById('btn-quests-menu'), settings.ENABLE_DELIVERY !== false);
        toggle(document.getElementById('quest-building'), settings.ENABLE_DELIVERY !== false);
        ['chicken-coop', 'cow-pen', 'pig-pen'].forEach(id => toggle(document.getElementById(id), settings.ENABLE_ANIMAL !== false));
        document.querySelectorAll('input[type="password"]').forEach(input => {
            input.minLength = Math.max(6, Number(settings.PASSWORD_MIN_LENGTH || 6));
        });
        clearInterval(this.shopRefreshInterval);
        const refreshSeconds = Number(settings.SHOP_REFRESH_TIME || 0);
        if (refreshSeconds > 0) {
            this.shopRefreshInterval = setInterval(() => {
                if (!document.getElementById('modal-shop')?.classList.contains('hide')) this.renderShop();
            }, refreshSeconds * 1000);
        }
        if (settings.ENABLE_EVENT !== false && settings.EVENT_POPUP) {
            const event = settings.ACTIVE_EVENTS?.[0];
            const message = event?.name || settings.EVENT_BANNER;
            if (message) setTimeout(() => this.showToast(`🎉 ${message}`), 500);
        }
    }

    renderStorePanel() {
        const buyGrid = this.dom.shopBuyList;
        const sellGrid = this.dom.shopSellList;
        if (!buyGrid || !sellGrid) return;
        
        buyGrid.innerHTML = '';
        sellGrid.innerHTML = '';

        const formatDuration = (sec) => {
            if (sec < 60) return `${sec} giây`;
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            return s > 0 ? `${m} phút ${s} giây` : `${m} phút`;
        };

        for (const [key, crop] of Object.entries(CROP_CONFIGS)) {
            const requiredLevel = Number(crop.requiredLevel) || 1;
            const isUnlocked = this.isCropUnlocked(key);
            // 1. Buy Seed Card
            const buyCard = document.createElement('div');
            buyCard.className = `shop-card ${isUnlocked ? '' : 'crop-locked'}`;
            buyCard.innerHTML = `
                <span class="card-icon">${crop.icon}</span>
                <div class="card-details">
                    <span class="card-title">Hạt giống ${crop.nameVi}</span>
                    <span class="card-desc">${isUnlocked ? `Lớn sau: ${formatDuration(crop.growthTime)}. Thu hoạch nhận +${crop.xpReward} XP.` : `🔒 Mở khóa ở cấp ${requiredLevel}.`}</span>
                    <span class="card-price" id="buy-price-${key}">${crop.originalPrice>crop.seedCost?`<del>🪙 ${crop.originalPrice}</del> `:''}🪙 ${crop.seedCost} Vàng ${crop.flashActive?'<b class="shop-flash-badge">FLASH SALE</b>':crop.discountActive?'<b class="shop-discount-badge">GIẢM GIÁ</b>':''}</span>
                    ${crop.flashActive&&crop.flashSaleEnd?`<small class="shop-countdown" data-shop-countdown="${this.escapeHtml(crop.flashSaleEnd)}"></small>`:''}
                    <div class="buy-action-row">
                        <div class="qty-selector">
                            <button type="button" class="qty-btn qty-dec" id="qty-dec-${key}">-</button>
                            <input type="number" class="qty-input" id="qty-input-${key}" value="1" min="1">
                            <button type="button" class="qty-btn qty-inc" id="qty-inc-${key}">+</button>
                        </div>
                        <button class="btn-buy" id="buy-btn-${key}">Mua</button>
                    </div>
                </div>
            `;
            buyGrid.appendChild(buyCard);
            
            const buyBtn = buyCard.querySelector('.btn-buy');
            const qtyInput = buyCard.querySelector('.qty-input');
            const decBtn = buyCard.querySelector('.qty-dec');
            const incBtn = buyCard.querySelector('.qty-inc');
            const priceLabel = buyCard.querySelector('.card-price');
            
            const maxAffordable = Math.floor(this.inventory.state.coins / crop.seedCost);
            const maxQty = Math.max(1, maxAffordable);
            
            buyBtn.disabled = !isUnlocked || this.inventory.state.coins < crop.seedCost;
            qtyInput.disabled = !isUnlocked;
            decBtn.disabled = !isUnlocked;
            incBtn.disabled = !isUnlocked;
            
            const handleInput = () => {
                let val = qtyInput.value;
                if (val === '') {
                    priceLabel.innerHTML = `🪙 0 Vàng`;
                    buyBtn.disabled = true;
                    return;
                }
                let qty = parseInt(val);
                if (isNaN(qty) || qty < 1) {
                    qty = 1;
                }
                if (qty > maxQty) {
                    qty = maxQty;
                }
                qtyInput.value = qty;
                const totalCost = crop.seedCost * qty;
                priceLabel.innerHTML = `🪙 ${totalCost} Vàng`;
                buyBtn.disabled = !isUnlocked || this.inventory.state.coins < totalCost;
            };

            qtyInput.addEventListener('input', handleInput);
            qtyInput.addEventListener('blur', () => {
                if (qtyInput.value === '') {
                    qtyInput.value = 1;
                    handleInput();
                }
            });

            decBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                let qty = parseInt(qtyInput.value) || 1;
                if (qty > 1) {
                    qtyInput.value = qty - 1;
                    handleInput();
                }
            });

            incBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                let qty = parseInt(qtyInput.value) || 1;
                if (qty < maxQty) {
                    qtyInput.value = qty + 1;
                    handleInput();
                }
            });

            buyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const qty = parseInt(qtyInput.value) || 1;
                this.inventory.buySeed(key, qty);
            });

            // 2. Sell Crop Card
            const countHarvested = this.inventory.state.inventory.crops[key] || 0;
            const sellCard = document.createElement('div');
            sellCard.className = 'shop-card';
            sellCard.innerHTML = `
                <span class="card-icon">${crop.icon}</span>
                <div class="card-details">
                    <span class="card-title">Củ/Quả ${crop.nameVi}</span>
                    <span class="card-desc">Trong kho: x${countHarvested} củ/quả.</span>
                    <span class="card-price">🪙 ${crop.cropValue} Vàng</span>
                    <button class="btn-sell" id="sell-btn-${key}">Bán hết</button>
                </div>
            `;
            sellGrid.appendChild(sellCard);
            
            const sellBtn = sellCard.querySelector('.btn-sell');
            sellBtn.disabled = countHarvested <= 0;
            sellBtn.addEventListener('click', () => {
                this.inventory.sellCrops(key);
            });
        }

        // 3. Add Fertilizers to Shop Buy list
        const fertilizersConfig = Object.entries(FERTILIZER_CONFIGS).map(([key, item]) => ({
            key, name: item.nameVi, icon: item.icon,
            desc: key === 'high' ? 'Rút ngắn 100% thời gian chờ, giúp cây chín ngay.' : 'Rút ngắn 50% thời gian chín còn lại của cây.',
            cost: Number(item.basePrice), ...item
        })).filter(item => item.shopVisible !== false);

        fertilizersConfig.forEach(fert => {
            const buyCard = document.createElement('div');
            buyCard.className = 'shop-card';
            buyCard.innerHTML = `
                <span class="card-icon">${fert.icon}</span>
                <div class="card-details">
                    <span class="card-title">${fert.name}</span>
                    <span class="card-desc">${fert.desc}</span>
                    <span class="card-price" id="buy-price-${fert.key}">${fert.originalPrice>fert.cost?`<del>🪙 ${fert.originalPrice}</del> `:''}🪙 ${fert.cost} Vàng ${fert.flashActive?'<b class="shop-flash-badge">FLASH SALE</b>':fert.discountActive?'<b class="shop-discount-badge">GIẢM GIÁ</b>':''}</span>
                    ${fert.flashActive&&fert.flashSaleEnd?`<small class="shop-countdown" data-shop-countdown="${this.escapeHtml(fert.flashSaleEnd)}"></small>`:''}
                    <div class="buy-action-row">
                        <div class="qty-selector">
                            <button type="button" class="qty-btn qty-dec">-</button>
                            <input type="number" class="qty-input" value="1" min="1">
                            <button type="button" class="qty-btn qty-inc">+</button>
                        </div>
                        <button class="btn-buy">Mua</button>
                    </div>
                </div>
            `;
            buyGrid.appendChild(buyCard);

            const buyBtn = buyCard.querySelector('.btn-buy');
            const qtyInput = buyCard.querySelector('.qty-input');
            const decBtn = buyCard.querySelector('.qty-dec');
            const incBtn = buyCard.querySelector('.qty-inc');
            const priceLabel = buyCard.querySelector('.card-price');

            const maxAffordable = Math.floor(this.inventory.state.coins / fert.cost);
            const maxQty = Math.max(1, maxAffordable);

            buyBtn.disabled = this.inventory.state.coins < fert.cost;

            const handleInput = () => {
                let val = qtyInput.value;
                if (val === '') {
                    priceLabel.innerHTML = `🪙 0 Vàng`;
                    buyBtn.disabled = true;
                    return;
                }
                let qty = parseInt(val);
                if (isNaN(qty) || qty < 1) {
                    qty = 1;
                }
                if (qty > maxQty) {
                    qty = maxQty;
                }
                qtyInput.value = qty;
                const totalCost = fert.cost * qty;
                priceLabel.innerHTML = `🪙 ${totalCost} Vàng`;
                buyBtn.disabled = this.inventory.state.coins < totalCost;
            };

            qtyInput.addEventListener('input', handleInput);
            qtyInput.addEventListener('blur', () => {
                if (qtyInput.value === '') {
                    qtyInput.value = 1;
                    handleInput();
                }
            });

            decBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                let qty = parseInt(qtyInput.value) || 1;
                if (qty > 1) {
                    qtyInput.value = qty - 1;
                    handleInput();
                }
            });

            incBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                let qty = parseInt(qtyInput.value) || 1;
                if (qty < maxQty) {
                    qtyInput.value = qty + 1;
                    handleInput();
                }
            });

            buyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const qty = parseInt(qtyInput.value) || 1;
                this.inventory.buyFertilizer(fert.key, qty);
            });
        });

        const feedMill = BUILDING_CONFIGS.feed_mill;
        if (feedMill && feedMill.shopVisible !== false) {
            const owned = this.inventory.getInventoryAmount('buildings', 'feed_mill') > 0;
            const card = document.createElement('div');
            card.className = 'shop-card feed-mill-shop-card';
            card.innerHTML = `
                <span class="card-icon">${feedMill.icon}</span>
                <div class="card-details">
                    <span class="card-title">${feedMill.nameVi}</span>
                    <span class="card-desc">Mua một lần, sau đó vào Thiết kế và kéo máy ra nông trại.</span>
                    <span class="card-price">🪙 ${Number(feedMill.basePrice || 2000).toLocaleString('vi-VN')} Vàng</span>
                    <button class="btn-buy" ${owned || this.inventory.state.coins < Number(feedMill.basePrice || 2000) ? 'disabled' : ''}>
                        ${owned ? 'Đã sở hữu' : 'Mua máy'}
                    </button>
                </div>
            `;
            card.querySelector('.btn-buy')?.addEventListener('click', () => this.inventory.buyFeedMill());
            buyGrid.appendChild(card);
        }
        this.updateShopCountdowns();
    }

    updateShopCountdowns() {
        document.querySelectorAll('[data-shop-countdown]').forEach(element => {
            const remaining = new Date(element.dataset.shopCountdown).getTime() - Date.now();
            if (remaining <= 0) { element.textContent = 'Flash Sale đã kết thúc'; return; }
            const totalSeconds = Math.floor(remaining / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            element.textContent = `Còn ${hours}h ${minutes}m ${seconds}s`;
        });
        clearTimeout(this.shopCountdownTimer);
        if (document.querySelector('[data-shop-countdown]')) this.shopCountdownTimer = setTimeout(() => this.updateShopCountdowns(), 1000);
    }

    renderFeedMillPanel() {
        if (!this.dom.feedMillStatus || !this.dom.feedRecipeList || !this.inventory?.state) return;

        const jobInfo = this.inventory.getFeedMillJobInfo();
        if (jobInfo.hasJob) {
            const outputName = jobInfo.outputMeta?.name || jobInfo.recipe.outputItemId;
            const statusText = jobInfo.ready
                ? `${outputName} đã sẵn sàng`
                : `Đang trộn ${outputName}, còn ${this.formatDurationMs(jobInfo.remainingMs)}`;
            this.dom.feedMillStatus.innerHTML = `
                <div class="feed-mill-job ${jobInfo.ready ? 'ready' : ''}">
                    <div>
                        <strong>${jobInfo.outputMeta?.icon || '🌾'} ${statusText}</strong>
                        <span>Thu được x${jobInfo.recipe.outputQty} khi hoàn tất.</span>
                    </div>
                    <button class="btn-buy" id="btn-feed-job-collect" ${jobInfo.ready ? '' : 'disabled'}>Thu</button>
                </div>
            `;
            this.dom.feedMillStatus.querySelector('#btn-feed-job-collect')?.addEventListener('click', () => {
                this.inventory.collectFeedMillJob();
            });
        } else {
            this.dom.feedMillStatus.innerHTML = `
                <div class="feed-mill-job">
                    <div>
                        <strong>Máy trộn đang trống</strong>
                        <span>Chọn một công thức bên dưới để làm thức ăn cho vật nuôi.</span>
                    </div>
                </div>
            `;
        }

        this.dom.feedRecipeList.innerHTML = '';
        Object.values(FEED_RECIPES).forEach(recipe => {
            const outputMeta = getMarketItemMeta(recipe.outputCategory, recipe.outputItemId);
            const status = this.inventory.getFeedRecipeStatus(recipe.id);
            const ingredientsHtml = status.ingredients.map(item => `
                <span class="${item.ok ? 'ok' : 'missing'}">
                    ${item.meta.icon} ${item.meta.name} ${item.owned}/${item.quantity}
                </span>
            `).join('');
            const card = document.createElement('div');
            card.className = 'shop-card feed-recipe-card';
            card.innerHTML = `
                <span class="card-icon">${outputMeta.icon}</span>
                <div class="card-details">
                    <span class="card-title">${outputMeta.name}</span>
                    <span class="card-desc">Tạo x${recipe.outputQty} sau ${this.formatDurationMs(recipe.durationSec * 1000)}</span>
                    <div class="recipe-ingredients">${ingredientsHtml}</div>
                    <button class="btn-buy" ${status.ok ? '' : 'disabled'}>Trộn</button>
                </div>
            `;
            card.querySelector('.btn-buy')?.addEventListener('click', () => {
                this.inventory.startFeedRecipe(recipe.id);
            });
            this.dom.feedRecipeList.appendChild(card);
        });
    }

    updateListingItemOptions() {
        if (!this.dom.listingCategory || !this.dom.listingItem) return;
        const category = this.dom.listingCategory.value;
        const items = listMarketItems().filter(item => item.category === category);
        this.dom.listingItem.innerHTML = items.map(item => {
            const count = getInventoryQuantity(this.inventory.state.inventory, item.category, item.itemId);
            return `<option value="${item.itemId}">${item.icon} ${item.name} (x${count})</option>`;
        }).join('');
        this.updateListingPriceHint();
    }

    updateListingPriceHint() {
        if (!this.dom.listingCategory || !this.dom.listingItem || !this.dom.listingPriceHint) return;
        const meta = getMarketItemMeta(this.dom.listingCategory.value, this.dom.listingItem.value);
        const count = getInventoryQuantity(this.inventory.state.inventory, meta.category, meta.itemId);
        this.dom.listingPrice.min = meta.minPrice;
        this.dom.listingPrice.max = meta.maxPrice;
        if (!this.dom.listingPrice.value || Number(this.dom.listingPrice.value) < meta.minPrice) {
            this.dom.listingPrice.value = meta.minPrice;
        }
        this.dom.listingQuantity.max = Math.max(1, count);
        this.dom.listingPriceHint.textContent = `Giá ${meta.minPrice}-${meta.maxPrice} vàng/cái, đang có x${count}`;
    }

    renderMarketCards(listings, container, mode = 'market') {
        if (!container) return;
        container.innerHTML = '';

        if (!listings || listings.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'market-empty';
            empty.textContent = mode === 'stall' ? 'Quầy hàng đang trống.' : 'Chưa có món hàng nào phù hợp.';
            container.appendChild(empty);
            return;
        }

        listings.forEach(listing => {
            const meta = listing.item || getMarketItemMeta(listing.category, listing.itemId);
            const isMine = this.currentUser && Number(listing.farmId) === Number(this.currentUser.farmId);
            const card = document.createElement('div');
            card.className = 'shop-card market-card';
            card.innerHTML = `
                <span class="card-icon">${meta.icon}</span>
                <div class="card-details">
                    <span class="card-title">${meta.name}</span>
                    <span class="card-desc">${MARKET_CATEGORIES[listing.category] || listing.category} • x${listing.quantity} • ${listing.farmName || 'Happy Farm'}</span>
                    <span class="card-price">🪙 ${listing.priceEach.toLocaleString('en-US')} / cái • Tổng ${listing.totalPrice.toLocaleString('en-US')}</span>
                    <div class="market-card-actions"></div>
                </div>
            `;

            const actions = card.querySelector('.market-card-actions');
            if (mode === 'stall') {
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'btn-sell';
                cancelBtn.textContent = 'Hủy bán';
                cancelBtn.addEventListener('click', () => this.cancelMarketListing(listing.id));
                actions.appendChild(cancelBtn);
            } else {
                const visitBtn = document.createElement('button');
                visitBtn.className = 'btn-buy secondary';
                visitBtn.textContent = 'Tham quan';
                visitBtn.addEventListener('click', () => this.visitFarm(listing.farmId));
                actions.appendChild(visitBtn);

                const buyBtn = document.createElement('button');
                buyBtn.className = 'btn-buy';
                buyBtn.textContent = isMine ? 'Của bạn' : 'Mua';
                buyBtn.disabled = isMine;
                buyBtn.addEventListener('click', () => this.buyMarketListing(listing.id));
                actions.appendChild(buyBtn);
            }

            container.appendChild(card);
        });
    }

    async refreshMarketPanels() {
        this.ensureMarketModal();
        if (!this.dom.marketList || !this.dom.myStallList) return;

        this.dom.marketList.innerHTML = '<div class="market-empty">Đang tải bảng chợ...</div>';
        this.dom.myStallList.innerHTML = '<div class="market-empty">Đang tải quầy hàng...</div>';

        try {
            if (this.isVisitingFarm && this.visitedFarm) {
                const stallPayload = await this.api.getFarmStall(this.visitedFarm.id);
                this.currentStall = stallPayload.stall || [];
                this.renderMarketCards(this.currentStall, this.dom.marketList, 'market');
                this.dom.myStallList.innerHTML = '<div class="market-empty">Bạn đang tham quan, hãy về nhà để quản lý quầy của mình.</div>';
                return;
            }

            const filters = {
                category: this.dom.marketCategoryFilter?.value || '',
                search: this.dom.marketSearch?.value || ''
            };
            const [marketPayload, stallPayload] = await Promise.all([
                this.api.listMarket(filters),
                this.api.getFarmStall(this.currentUser.farmId)
            ]);
            this.renderMarketCards(marketPayload.listings || [], this.dom.marketList, 'market');
            this.renderMarketCards(stallPayload.stall || [], this.dom.myStallList, 'stall');
            this.updateListingItemOptions();
        } catch (err) {
            this.dom.marketList.innerHTML = `<div class="market-empty">${err.message || 'Không tải được chợ.'}</div>`;
            this.dom.myStallList.innerHTML = '';
        }
    }

    async renderShop() {
        this.ensureMarketModal();
        this.renderStorePanel();
        this.renderFeedMillPanel();
        await this.refreshMarketPanels();
    }

    applyServerState(state) {
        if (!state) return;
        this.inventory.state = this.inventory.mergeDeep({}, this.inventory.state || {}, state);
        this.renderHUD();
        this.updateQuestBadge();
        this.updateHarvestAllBadge();
        this.tiles.forEach(tile => tile.render());
        this.renderPavedPaths();
        this.updateListingItemOptions();
        this.applyLayout();
        this.phaserWorld?.syncAll();
    }

    async createMarketListing() {
        const category = this.dom.listingCategory.value;
        const itemId = this.dom.listingItem.value;
        const quantity = Number.parseInt(this.dom.listingQuantity.value, 10) || 1;
        const priceEach = Number.parseInt(this.dom.listingPrice.value, 10) || 1;
        const meta = getMarketItemMeta(category, itemId);
        const available = getInventoryQuantity(this.inventory.state.inventory, category, itemId);

        if (quantity < 1 || quantity > available) {
            this.showToast('Số lượng rao bán không hợp lệ.');
            return;
        }
        if (priceEach < meta.minPrice || priceEach > meta.maxPrice) {
            this.showToast(`Giá phải trong khoảng ${meta.minPrice}-${meta.maxPrice} vàng.`);
            return;
        }

        try {
            const payload = await this.api.createListing({ category, itemId, quantity, priceEach });
            this.applyServerState(payload.state);
            this.inventory.updateQuestProgress('sell', itemId, quantity);
            this.inventory.checkAchievements();
            this.inventory.saveGame();
            this.showToast(`Đã rao bán x${quantity} ${meta.name}!`);
            await this.renderShop();
        } catch (err) {
            this.showToast(err.message || 'Không rao bán được.');
        }
    }

    async cancelMarketListing(listingId) {
        try {
            const payload = await this.api.cancelListing(listingId);
            this.applyServerState(payload.state);
            this.showToast('Đã hủy rao bán và trả hàng về kho.');
            await this.renderShop();
        } catch (err) {
            this.showToast(err.message || 'Không hủy được món hàng.');
        }
    }

    async buyMarketListing(listingId) {
        try {
            const payload = await this.api.buyListing(listingId);
            if (this.isVisitingFarm) {
                this.homeState = payload.state;
                this.renderHUD();
                if (this.visitedFarm) {
                    const stallPayload = await this.api.getFarmStall(this.visitedFarm.id);
                    this.currentStall = stallPayload.stall || [];
                    this.renderMarketCards(this.currentStall, this.dom.marketList, 'market');
                }
            } else {
                this.applyServerState(payload.state);
                await this.renderShop();
            }
            this.showToast('Đã mua vật phẩm từ người chơi khác!');
        } catch (err) {
            this.showToast(err.message || 'Không mua được món hàng.');
            await this.renderShop();
        }
    }

    async visitFarm(farmId) {
        if (this.currentUser && Number(farmId) === Number(this.currentUser.farmId)) {
            this.showToast('Đây là nông trại của bạn.');
            return;
        }

        try {
            await this.inventory.flushSave();
            if (!this.isVisitingFarm) {
                this.homeState = JSON.parse(JSON.stringify(this.inventory.state));
            }
            const payload = await this.api.getFarm(farmId);
            this.isVisitingFarm = true;
            this.visitedFarm = payload.farm;
            this.currentStall = payload.stall || [];
            this.inventory.state = payload.state;
            this.hideSeedPopup();
            this.hideCropDetail();
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hide'));
            this.renderAll();
            this.renderHUD();
            if (this.dom.visitBannerText) {
                this.dom.visitBannerText.textContent = `Đang tham quan ${payload.farm.name}`;
            }
            this.dom.visitBanner?.classList.remove('hide');
            this.showToast(`Đang tham quan ${payload.farm.name}. Farm này chỉ xem, có thể mua ở quầy.`);
        } catch (err) {
            this.showToast(err.message || 'Không vào được nông trại này.');
        }
    }

    async returnHomeFarm() {
        try {
            const payload = await this.api.getState();
            this.currentUser = payload.profile || this.currentUser;
            this.inventory.state = payload.state || this.homeState;
            this.isVisitingFarm = false;
            this.visitedFarm = null;
            this.currentStall = [];
            this.homeState = null;
            this.dom.visitBanner?.classList.add('hide');
            this.renderAll();
            this.showToast('Đã quay về nông trại của bạn.');
        } catch (err) {
            if (this.homeState) {
                this.inventory.state = this.homeState;
                this.isVisitingFarm = false;
                this.dom.visitBanner?.classList.add('hide');
                this.renderAll();
            }
            this.showToast(err.message || 'Không tải được nông trại của bạn.');
        }
    }

    openVisitedStall() {
        this.openModal('shop');
        this.selectShopTab('market');
        this.refreshMarketPanels();
    }

    handleAnimalClick(animalId) {
        if (this.systemSettings?.ENABLE_ANIMAL === false) {
            this.showToast('Chức năng vật nuôi đang tạm tắt.');
            return;
        }
        if (this.isDesignMode) return;
        if (this.isVisitingFarm) {
            this.showToast('Bạn đang tham quan, không thể chăm vật nuôi ở farm này.');
            return;
        }
        const info = this.inventory.getAnimalStatusInfo(animalId);
        if (!info) return;
        if (info.status === 'ready') {
            this.inventory.collectAnimalProduct(animalId);
        } else if (info.status === 'hungry') {
            this.phaserWorld?.showFeedTray(animalId);
        } else {
            this.showToast(`${info.config.label} đang sản xuất, còn ${this.formatDurationMs(info.remainingMs)}.`);
        }
        this.phaserWorld?.syncAnimals();
    }

    handleAnimalBuildingClick(animalType) {
        const labels = { chicken: 'gà', cow: 'bò', pig: 'heo' };
        this.showToast(`Hãy chọn trực tiếp một con ${labels[animalType] || 'vật nuôi'} để chăm sóc.`);
    }

    feedSelectedAnimal(animalId) {
        const fed = this.inventory.feedAnimal(animalId);
        if (fed) this.phaserWorld?.closeFeedTray();
        return fed;
    }

    canUseFeedMill() {
        return this.inventory?.getInventoryAmount('buildings', 'feed_mill') > 0
            && Boolean(this.inventory?.state?.layout?.feedMill);
    }

    renderInventory() {
        const seedsGrid = this.dom.invSeedsGrid;
        const cropsGrid = this.dom.invCropsGrid;
        const fertilizersGrid = this.dom.invFertilizersGrid || document.getElementById('inv-fertilizers-grid');

        seedsGrid.innerHTML = '';
        cropsGrid.innerHTML = '';
        if (fertilizersGrid) fertilizersGrid.innerHTML = '';

        let hasSeeds = false;
        let hasCrops = false;
        let hasFertilizers = false;

        for (const [key, crop] of Object.entries(CROP_CONFIGS)) {
            const seedCount = this.inventory.state.inventory.seeds[key] || 0;
            if (seedCount > 0) {
                hasSeeds = true;
                const seedCard = document.createElement('div');
                seedCard.className = 'inv-card';
                seedCard.innerHTML = `
                    <span class="card-icon">🌱</span>
                    <div class="card-details">
                        <span class="card-title">Hạt giống ${crop.nameVi}</span>
                        <span class="card-desc">Gieo để thu hoạch quả ${crop.icon}.</span>
                    </div>
                    <span class="inv-badge">x${seedCount}</span>
                `;
                seedsGrid.appendChild(seedCard);
            }

            const cropCount = this.inventory.state.inventory.crops[key] || 0;
            if (cropCount > 0) {
                hasCrops = true;
                const cropCard = document.createElement('div');
                cropCard.className = 'inv-card';
                cropCard.innerHTML = `
                    <span class="card-icon">${crop.icon}</span>
                    <div class="card-details">
                        <span class="card-title">Trái ${crop.nameVi}</span>
                        <span class="card-desc">Bán trong cửa hàng để lấy vàng.</span>
                    </div>
                    <span class="inv-badge">x${cropCount}</span>
                `;
                cropsGrid.appendChild(cropCard);
            }
        }

        if (fertilizersGrid) {
            const midCount = this.inventory.state.inventory.fertilizers?.mid || 0;
            if (midCount > 0) {
                hasFertilizers = true;
                const fertCard = document.createElement('div');
                fertCard.className = 'inv-card';
                fertCard.innerHTML = `
                    <span class="card-icon">🧪</span>
                    <div class="card-details">
                        <span class="card-title">Phân bón Trung cấp</span>
                        <span class="card-desc">Rút ngắn 50% thời gian chín còn lại của cây.</span>
                    </div>
                    <span class="inv-badge">x${midCount}</span>
                `;
                fertilizersGrid.appendChild(fertCard);
            }

            const highCount = this.inventory.state.inventory.fertilizers?.high || 0;
            if (highCount > 0) {
                hasFertilizers = true;
                const fertCard = document.createElement('div');
                fertCard.className = 'inv-card';
                fertCard.innerHTML = `
                    <span class="card-icon">💎</span>
                    <div class="card-details">
                        <span class="card-title">Phân bón Cao cấp</span>
                        <span class="card-desc">Giúp cây chín ngay lập tức.</span>
                    </div>
                    <span class="inv-badge">x${highCount}</span>
                `;
                fertilizersGrid.appendChild(fertCard);
            }
        }

        if (!hasSeeds) {
            seedsGrid.innerHTML = '<p style="grid-column: span 2; text-align: center; color: #aaa; padding: 10px;">Kho của bạn không còn hạt giống nào.</p>';
        }
        if (!hasCrops) {
            cropsGrid.innerHTML = '<p style="grid-column: span 2; text-align: center; color: #aaa; padding: 10px;">Kho của bạn không có nông sản đã thu hoạch.</p>';
        }
        if (fertilizersGrid && !hasFertilizers) {
            fertilizersGrid.innerHTML = '<p style="grid-column: span 2; text-align: center; color: #aaa; padding: 10px;">Kho của bạn không có phân bón.</p>';
        }
    }

    renderQuests() {
        const container = this.dom.questList;
        container.innerHTML = '';

        this.inventory.state.quests.forEach((q) => {
            const card = document.createElement('div');
            card.className = `quest-card ${q.claimed ? 'completed' : ''}`;
            
            const percent = Math.min(100, (q.current / q.target) * 100);
            const canClaim = q.current >= q.target && !q.claimed;

            card.innerHTML = `
                <span class="quest-icon">📌</span>
                <div class="quest-info">
                    <span class="quest-title">${q.title}</span>
                    <p class="card-desc" style="margin-bottom: 3px;">${q.desc}</p>
                    <div class="quest-progress-wrapper">
                        <div class="quest-progress-fill" style="width: ${percent}%"></div>
                    </div>
                    <span class="quest-reward">Phần thưởng: 🪙 ${q.rewardCoins} Vàng | ⚡ ${q.rewardXp} XP</span>
                </div>
                <button class="btn-claim" ${canClaim ? '' : 'disabled'} id="claim-btn-${q.id}">
                    ${q.claimed ? 'Đã Nhận' : 'Nhận Quà'}
                </button>
            `;
            container.appendChild(card);

            const btn = card.querySelector('.btn-claim');
            if (canClaim) {
                btn.addEventListener('click', () => {
                    this.inventory.claimQuest(q.id);
                });
            }
        });
    }

    updateQuestBadge() {
        const claimableQuests = this.inventory.state.quests.filter(q => q.current >= q.target && !q.claimed).length;
        const badge = this.dom.questBadge;
        if (claimableQuests > 0) {
            badge.textContent = claimableQuests;
            badge.classList.remove('hide');
        } else {
            badge.classList.add('hide');
        }
    }

    renderQuests() {
        this.refreshDeliveryBoard();
    }

    updateQuestBadge() {
        const claimableQuests = this.getClaimableOrderCount()
            + this.getClaimableMilestoneCount()
            + (this.leaderboardData?.previousReward?.claimable ? 1 : 0);
        const badge = this.dom.questBadge;
        if (!badge) return;
        if (claimableQuests > 0) {
            badge.textContent = claimableQuests;
            badge.classList.remove('hide');
        } else {
            badge.classList.add('hide');
        }
    }

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    formatDurationMs(durationMs) {
        const totalSeconds = Math.max(0, Math.ceil(Number(durationMs || 0) / 1000));
        if (totalSeconds <= 0) return 'sẵn sàng';
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes <= 0) return `${seconds}s`;
        return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
    }

    formatShortCountdown(targetIso) {
        if (!targetIso) return '--';
        const remainingMs = Math.max(0, new Date(targetIso).getTime() - Date.now());
        const totalSeconds = Math.ceil(remainingMs / 1000);
        if (totalSeconds <= 0) return 'now';
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    }

    formatReward(reward = {}) {
        const parts = [];
        if (reward.coins) parts.push(`${Number(reward.coins).toLocaleString('en-US')} vàng`);
        if (reward.gems) parts.push(`${Number(reward.gems).toLocaleString('en-US')} kim cương`);
        if (reward.xp) parts.push(`${Number(reward.xp).toLocaleString('en-US')} XP`);
        if (reward.fertilizers) {
            Object.entries(reward.fertilizers).forEach(([type, amount]) => {
                const name = type === 'mid' ? 'phân trung cấp' : type === 'high' ? 'phân cao cấp' : `phân ${type}`;
                parts.push(`${amount} ${name}`);
            });
        }
        return parts.join(' | ') || 'Không có thưởng';
    }

    getOrderAvailability(order) {
        const rows = (order.items || []).map(item => {
            const owned = Number(this.inventory.state.inventory?.[item.category]?.[item.itemId] || 0);
            const needed = Number(item.quantity || 0);
            const meta = getMarketItemMeta(item.category, item.itemId);
            return {
                ...item,
                owned,
                needed,
                ok: owned >= needed,
                icon: meta.icon,
                name: meta.name
            };
        });
        return {
            rows,
            canDeliver: order.status === 'active' && rows.length > 0 && rows.every(row => row.ok)
        };
    }

    getClaimableOrderCount() {
        return (this.deliveryOrders || []).filter(order => this.getOrderAvailability(order).canDeliver).length;
    }

    getClaimableMilestoneCount() {
        return (this.weeklyStatus?.milestones || []).filter(milestone => milestone.claimable).length;
    }

    async refreshDeliveryBoard(options = {}) {
        const { silent = false } = options;
        if (!this.dom?.questList) return;
        clearTimeout(this.orderRefreshTimer);

        if (this.isVisitingFarm) {
            this.dom.questList.innerHTML = '<div class="market-empty">Về nhà để giao đơn hàng.</div>';
            return;
        }

        if (!silent) {
            this.dom.questList.innerHTML = '<div class="market-empty">Đang tải bảng đơn hàng...</div>';
        }

        try {
            const payload = await this.api.getOrders();
            this.deliveryOrders = payload.orders || [];
            this.weeklyStatus = payload.weekly || null;
            this.renderDeliveryBoardContent();
            this.updateQuestBadge();
        } catch (err) {
            if (!silent) {
                this.dom.questList.innerHTML = `<div class="market-empty">${this.escapeHtml(err.message || 'Không tải được bảng đơn hàng.')}</div>`;
            }
        }
    }

    renderDeliveryBoardContent() {
        if (!this.dom?.questList) return;
        clearTimeout(this.orderRefreshTimer);

        const weekly = this.weeklyStatus;
        if (this.dom.weeklyScore) {
            const points = Number(weekly?.score?.points || 0);
            this.dom.weeklyScore.textContent = `${points.toLocaleString('en-US')} điểm`;
        }
        if (this.dom.weeklyReset) {
            this.dom.weeklyReset.textContent = this.formatShortCountdown(weekly?.endsAt);
        }

        this.renderWeeklyMilestones();

        if (!this.deliveryOrders?.length) {
            this.dom.questList.innerHTML = '<div class="market-empty">Chưa có đơn hàng nào.</div>';
            return;
        }

        let hasCooldown = false;
        this.dom.questList.innerHTML = '';
        this.deliveryOrders
            .slice()
            .sort((a, b) => Number(a.slotIndex) - Number(b.slotIndex))
            .forEach(order => {
                const card = this.createOrderCard(order);
                if (order.status === 'trashed') hasCooldown = true;
                this.dom.questList.appendChild(card);
            });

        if (hasCooldown) {
            this.orderRefreshTimer = setTimeout(() => {
                const expired = this.deliveryOrders.some(order => (
                    order.status === 'trashed'
                    && new Date(order.cooldownUntil).getTime() <= Date.now()
                ));
                if (expired) {
                    this.refreshDeliveryBoard({ silent: true });
                } else {
                    this.renderDeliveryBoardContent();
                }
            }, 1000);
        }
    }

    renderWeeklyMilestones() {
        const container = this.dom.weeklyMilestones;
        if (!container) return;
        const milestones = this.weeklyStatus?.milestones || [];
        if (!milestones.length) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = milestones.map(milestone => {
            const className = milestone.claimed ? 'milestone-card claimed' : milestone.claimable ? 'milestone-card claimable' : 'milestone-card';
            const button = milestone.claimed
                ? '<button class="btn-claim" disabled>Đã nhận</button>'
                : `<button class="btn-claim" data-claim-milestone="${this.escapeHtml(milestone.id)}" ${milestone.claimable ? '' : 'disabled'}>Nhận</button>`;
            return `
                <div class="${className}">
                    <div class="milestone-title">${Number(milestone.threshold).toLocaleString('en-US')} điểm</div>
                    <div class="milestone-reward">${this.escapeHtml(this.formatReward(milestone.reward))}</div>
                    ${button}
                </div>
            `;
        }).join('');

        container.querySelectorAll('[data-claim-milestone]').forEach(btn => {
            btn.addEventListener('click', () => this.claimWeeklyMilestone(btn.getAttribute('data-claim-milestone')));
        });
    }

    createOrderCard(order) {
        const card = document.createElement('div');
        const availability = this.getOrderAvailability(order);
        const remaining = order.status === 'trashed' ? this.formatShortCountdown(order.cooldownUntil) : null;
        card.className = `order-card ${availability.canDeliver ? 'ready' : ''} ${order.status === 'trashed' ? 'cooldown' : ''}`;

        if (order.status === 'trashed') {
            card.innerHTML = `
                <div class="order-title">Ô đơn ${Number(order.slotIndex) + 1}</div>
                <p class="card-desc">Đang chờ đơn mới: ${this.escapeHtml(remaining)}</p>
            `;
            return card;
        }

        const itemsHtml = availability.rows.map(row => `
            <div class="order-item">
                <span>${this.escapeHtml(row.icon)} ${this.escapeHtml(row.name)} x${row.needed}</span>
                <strong class="order-owned ${row.ok ? 'ok' : 'missing'}">${row.owned}/${row.needed}</strong>
            </div>
        `).join('');

        card.innerHTML = `
            <div class="order-title">Đơn hàng ${Number(order.slotIndex) + 1}</div>
            <div class="order-items">${itemsHtml}</div>
            <div class="order-reward">
                ${Number(order.rewardCoins).toLocaleString('en-US')} vàng | ${Number(order.rewardXp).toLocaleString('en-US')} XP | ${Number(order.weeklyPoints).toLocaleString('en-US')} điểm
            </div>
            <div class="order-actions">
                <button class="btn-claim" data-deliver-order="${order.id}" ${availability.canDeliver ? '' : 'disabled'}>Giao</button>
                <button class="btn-secondary-action" data-trash-order="${order.id}">Hủy</button>
            </div>
        `;

        card.querySelector('[data-deliver-order]')?.addEventListener('click', () => this.deliverOrder(order.id));
        card.querySelector('[data-trash-order]')?.addEventListener('click', () => this.trashOrder(order.id));
        return card;
    }

    async deliverOrder(orderId) {
        try {
            const payload = await this.api.deliverOrder(orderId);
            this.applyServerState(payload.state);
            this.deliveryOrders = payload.orders || [];
            this.weeklyStatus = payload.weekly || null;
            this.renderDeliveryBoardContent();
            this.updateQuestBadge();
            const delivered = payload.delivered || {};
            this.playSFX('quest');
            this.showToast(`Đã giao đơn: +${delivered.rewardCoins || 0} vàng, +${delivered.rewardXp || 0} XP, +${delivered.weeklyPoints || 0} điểm.`);
        } catch (err) {
            this.showToast(err.message || 'Không giao được đơn hàng.');
        }
    }

    async trashOrder(orderId) {
        try {
            const payload = await this.api.trashOrder(orderId);
            this.deliveryOrders = payload.orders || [];
            this.weeklyStatus = payload.weekly || null;
            this.renderDeliveryBoardContent();
            this.updateQuestBadge();
            this.showToast('Đã hủy đơn. Đơn mới sẽ xuất hiện sau 60 giây.');
        } catch (err) {
            this.showToast(err.message || 'Không hủy được đơn hàng.');
        }
    }

    async claimWeeklyMilestone(milestoneId) {
        try {
            const payload = await this.api.claimWeeklyMilestone(milestoneId);
            this.applyServerState(payload.state);
            this.weeklyStatus = payload.weekly || this.weeklyStatus;
            this.renderDeliveryBoardContent();
            this.updateQuestBadge();
            this.playSFX('quest');
            this.showToast('Đã nhận mốc thưởng tuần.');
        } catch (err) {
            this.showToast(err.message || 'Không nhận được mốc thưởng.');
        }
    }

    async renderLeaderboard() {
        if (!this.dom?.leaderboardList) return;
        this.dom.leaderboardList.innerHTML = '<div class="market-empty">Đang tải bảng xếp hạng...</div>';
        try {
            this.leaderboardData = await this.api.getLevelLeaderboard();
            this.renderLeaderboardContent();
            this.updateQuestBadge();
        } catch (err) {
            this.dom.leaderboardList.innerHTML = `<div class="market-empty">${this.escapeHtml(err.message || 'Không tải được bảng xếp hạng.')}</div>`;
        }
    }

    renderLeaderboardContent() {
        const data = this.leaderboardData || {};
        const leaderboard = data.leaderboard || {};
        if (this.dom.leaderboardReset) {
            this.dom.leaderboardReset.textContent = 'Cấp độ & XP';
        }
        if (this.dom.leaderboardMyRank) {
            this.dom.leaderboardMyRank.textContent = leaderboard.me
                ? `#${leaderboard.me.rank} - Cấp ${Number(leaderboard.me.level)}`
                : 'Chưa xếp hạng';
        }
        if (this.dom.rankRewardPanel) this.dom.rankRewardPanel.innerHTML = '';

        const rows = leaderboard.top || [];
        if (!rows.length) {
            this.dom.leaderboardList.innerHTML = '<div class="market-empty">Chưa có người chơi trong bảng xếp hạng.</div>';
            return;
        }

        this.dom.leaderboardList.innerHTML = rows.map(row => `
            <div class="leaderboard-row ${row.isMine ? 'mine' : ''}">
                <div class="leaderboard-rank">#${row.rank}</div>
                <div>
                    <div class="leaderboard-name">${this.escapeHtml(row.farmName || 'Happy Farm')}</div>
                    <div class="leaderboard-meta">${this.escapeHtml(row.ownerName || 'farmer')} | ${Number(row.xp || 0).toLocaleString('en-US')} XP</div>
                </div>
                <div class="leaderboard-meta">Cấp ${Number(row.level || 1)}</div>
            </div>
        `).join('');
    }

    renderRankRewardPanel() {
        const panel = this.dom.rankRewardPanel;
        if (!panel) return;
        const previous = this.leaderboardData?.previousReward;
        if (!previous || !previous.reward) {
            panel.innerHTML = '';
            return;
        }
        const status = previous.claimed ? 'Đã nhận' : previous.claimable ? 'Nhận thưởng' : 'Không có thưởng';
        panel.innerHTML = `
            <div class="milestone-title">Thưởng tuần trước: #${previous.rank} (${Number(previous.points || 0).toLocaleString('en-US')} điểm)</div>
            <div class="milestone-reward">${this.escapeHtml(this.formatReward(previous.reward.reward))}</div>
            <button class="btn-claim" id="btn-claim-rank-reward" ${previous.claimable ? '' : 'disabled'}>${status}</button>
        `;
        panel.querySelector('#btn-claim-rank-reward')?.addEventListener('click', () => this.claimWeeklyRankReward());
    }

    async claimWeeklyRankReward() {
        try {
            const payload = await this.api.claimWeeklyRankReward();
            this.applyServerState(payload.state);
            if (!this.leaderboardData) this.leaderboardData = {};
            this.leaderboardData.previousReward = payload.previousReward;
            this.renderLeaderboardContent();
            this.updateQuestBadge();
            this.playSFX('quest');
            this.showToast('Đã nhận thưởng xếp hạng tuần trước.');
        } catch (err) {
            this.showToast(err.message || 'Không nhận được thưởng xếp hạng.');
        }
    }

    renderAchievements() {
        const container = this.dom.achievementList;
        container.innerHTML = '';

        this.inventory.state.achievements.forEach((a) => {
            const card = document.createElement('div');
            const currentVal = this.inventory.state.stats[a.key] || 0;
            const isCompleted = currentVal >= a.target;
            
            if (isCompleted && !a.unlocked) {
                a.unlocked = true;
                this.inventory.state.gems += a.rewardGems;
                this.playSFX('levelUp');
                this.showToast(`🏆 Mở khóa thành tích: "${a.title}"! Nhận 💎 ${a.rewardGems} Kim cương.`);
            }

            card.className = `achieve-card ${isCompleted ? 'completed' : 'locked'}`;
            card.innerHTML = `
                <span class="achieve-icon">${isCompleted ? '👑' : '🔒'}</span>
                <div class="achieve-info">
                    <span class="achieve-title">${a.title}</span>
                    <p class="card-desc" style="margin-bottom: 3px;">${a.desc}</p>
                    <span class="achieve-reward">Thưởng: 💎 ${a.rewardGems} Kim Cương (${currentVal}/${a.target})</span>
                </div>
                <span class="achieve-status ${isCompleted ? '' : 'locked'}">${isCompleted ? 'Đã đạt' : 'Chưa đạt'}</span>
            `;
            container.appendChild(card);
        });
    }

    renderStats() {
        this.dom.statsPlanted.textContent = this.inventory.state.stats.plantedTotal.toLocaleString();
        this.dom.statsHarvested.textContent = this.inventory.state.stats.harvestedTotal.toLocaleString();
        this.dom.statsCoinsEarned.textContent = this.inventory.state.stats.coinsEarnedTotal.toLocaleString();
        this.dom.statsCoinsSpent.textContent = this.inventory.state.stats.coinsSpentTotal.toLocaleString();
        
        const mins = Math.floor(this.inventory.state.stats.timePlayed / 600) || 1;
        this.dom.statsTimePlayed.textContent = `${mins} phút`;
    }

    renderPets() {
        const shibaStatus = document.querySelector('.pet-card:nth-child(1) .pet-status');
        if (this.inventory.state.pets.shiba.active) {
            shibaStatus.textContent = 'Đang hoạt động (Trông trại)';
            shibaStatus.style.color = '#2ecc71';
        }

        const catCard = document.querySelector('.pet-card:nth-child(2)');
        const catBtn = catCard.querySelector('.btn-unlock-pet');
        const catStatus = document.createElement('span');
        catStatus.className = 'pet-status';

        if (this.inventory.state.pets.cat.unlocked) {
            catCard.className = 'pet-card active';
            if (this.inventory.state.pets.cat.active) {
                catStatus.textContent = 'Đang hoạt động (+10% Hồi năng lượng)';
                catStatus.style.color = '#2ecc71';
            } else {
                catStatus.textContent = 'Đang nghỉ ngơi';
                catStatus.style.color = '#f39c12';
            }
            if (catBtn) catBtn.replaceWith(catStatus);
        } else {
            catCard.className = 'pet-card locked';
            if (catBtn) {
                catBtn.disabled = this.inventory.state.gems < this.inventory.state.pets.cat.cost;
                if (!catBtn.dataset.bound) {
                    catBtn.dataset.bound = true;
                    catBtn.addEventListener('click', () => {
                        this.inventory.unlockCat();
                    });
                }
            }
        }
    }

    updateHarvestAllBadge() {
        const matureCount = this.inventory.state.plots.filter(p => p.state === 'mature' && this.isPlotUnlocked(p.id)).length;
        const badge = document.getElementById('harvest-all-badge');
        const btn = this.dom.btnHarvestAll;
        if (badge) {
            if (matureCount > 0) {
                badge.textContent = matureCount;
                badge.classList.remove('hide');
                if (btn) btn.disabled = false;
            } else {
                badge.classList.add('hide');
                if (btn) btn.disabled = true;
            }
        }
    }

    // --- Layout Customisation & Design Mode ---
    applyLayout() {
        if (!this.inventory.state.layout) {
            this.inventory.state.layout = JSON.parse(JSON.stringify(DEFAULT_STATE.layout));
        }

        const farmhouse = document.getElementById('farmhouse-overlay');
        const barn = document.getElementById('barn-overlay');
        const shopBuilding = document.getElementById('shop-building');
        const petBuilding = document.getElementById('pet-building');
        const questBuilding = document.getElementById('quest-building');
        const achieveBuilding = document.getElementById('achieve-building');
        const farmGridContainer = document.getElementById('farm-grid-container');

        if (farmhouse && this.inventory.state.layout.farmhouse) {
            farmhouse.style.left = `${this.inventory.state.layout.farmhouse.left}%`;
            farmhouse.style.top = `${this.inventory.state.layout.farmhouse.top}%`;
        }
        if (barn && this.inventory.state.layout.barn) {
            barn.style.left = `${this.inventory.state.layout.barn.left}%`;
            barn.style.top = `${this.inventory.state.layout.barn.top}%`;
        }
        if (shopBuilding && this.inventory.state.layout.shopBuilding) {
            shopBuilding.style.left = `${this.inventory.state.layout.shopBuilding.left}%`;
            shopBuilding.style.top = `${this.inventory.state.layout.shopBuilding.top}%`;
        }
        if (petBuilding && this.inventory.state.layout.petBuilding) {
            petBuilding.style.left = `${this.inventory.state.layout.petBuilding.left}%`;
            petBuilding.style.top = `${this.inventory.state.layout.petBuilding.top}%`;
        }
        if (questBuilding && this.inventory.state.layout.questBuilding) {
            questBuilding.style.left = `${this.inventory.state.layout.questBuilding.left}%`;
            questBuilding.style.top = `${this.inventory.state.layout.questBuilding.top}%`;
        }
        if (achieveBuilding && this.inventory.state.layout.achieveBuilding) {
            achieveBuilding.style.left = `${this.inventory.state.layout.achieveBuilding.left}%`;
            achieveBuilding.style.top = `${this.inventory.state.layout.achieveBuilding.top}%`;
        }
        if (farmGridContainer && this.inventory.state.layout.farmGrid) {
            farmGridContainer.style.left = `${this.inventory.state.layout.farmGrid.left}%`;
            farmGridContainer.style.top = `${this.inventory.state.layout.farmGrid.top}%`;
        }

        const signpost = document.getElementById('signpost-building');
        if (signpost && this.inventory.state.layout.signpost) {
            signpost.style.left = `${this.inventory.state.layout.signpost.left}%`;
            signpost.style.top = `${this.inventory.state.layout.signpost.top}%`;
        }

        const chickenCoop = document.getElementById('chicken-coop');
        const cowPen = document.getElementById('cow-pen');
        const pigPen = document.getElementById('pig-pen');
        const feedMillBuilding = document.getElementById('feed-mill-building');
        if (chickenCoop && this.inventory.state.layout.chickenCoop) {
            chickenCoop.style.left = `${this.inventory.state.layout.chickenCoop.left}%`;
            chickenCoop.style.top = `${this.inventory.state.layout.chickenCoop.top}%`;
        }
        if (cowPen && this.inventory.state.layout.cowPen) {
            cowPen.style.left = `${this.inventory.state.layout.cowPen.left}%`;
            cowPen.style.top = `${this.inventory.state.layout.cowPen.top}%`;
        }
        if (pigPen && this.inventory.state.layout.pigPen) {
            pigPen.style.left = `${this.inventory.state.layout.pigPen.left}%`;
            pigPen.style.top = `${this.inventory.state.layout.pigPen.top}%`;
        }
        const ownsFeedMill = this.inventory.getInventoryAmount('buildings', 'feed_mill') > 0;
        const feedMillLayout = this.inventory.state.layout.feedMill;
        if (feedMillBuilding) {
            feedMillBuilding.classList.toggle('hide', !ownsFeedMill || !feedMillLayout);
            if (feedMillLayout) {
                feedMillBuilding.style.left = `${feedMillLayout.left}%`;
                feedMillBuilding.style.top = `${feedMillLayout.top}%`;
            }
        }
        this.updateDesignFeedMillTray();

        this.updateSignpostText();

        this.renderDecorations();

        if (this.inventory.state.layout.farmhouse) {
            this.farmerHomePos.left = parseFloat(this.inventory.state.layout.farmhouse.left) + 16.0;
            this.farmerHomePos.top = parseFloat(this.inventory.state.layout.farmhouse.top) + 30.0;
        }

        this.phaserWorld?.refreshGridLayout();
    }

    renderDecorations() {
        const container = document.getElementById('decorations-container');
        if (!container) return;
        container.innerHTML = '';

        if (this.inventory.state.layout && this.inventory.state.layout.decorations) {
            this.inventory.state.layout.decorations.forEach(decor => {
                const div = document.createElement('div');
                div.id = decor.id;
                div.className = 'decor-outside';
                div.style.left = `${decor.left}%`;
                div.style.top = `${decor.top}%`;
                div.style.fontSize = decor.size || '2.2rem';
                div.textContent = decor.emoji;
                container.appendChild(div);
            });
        }
    }

    updateDesignFeedMillTray() {
        const tray = document.getElementById('design-feed-mill-tray');
        if (!tray || !this.inventory?.state) return;
        const owned = this.inventory.getInventoryAmount('buildings', 'feed_mill') > 0;
        tray.classList.toggle('hide', !this.isDesignMode || !owned || Boolean(this.inventory.state.layout.feedMill));
    }

    getPercentPosition(el) {
        const parent = el.offsetParent || el.parentElement;
        const parentWidth = parent.offsetWidth || 1280;
        const parentHeight = parent.offsetHeight || 720;

        if (el.style.left && el.style.left.endsWith('%')) {
            return {
                left: parseFloat(el.style.left),
                top: parseFloat(el.style.top)
            };
        }

        const style = window.getComputedStyle(el);
        const leftPx = parseFloat(style.left) || 0;
        const topPx = parseFloat(style.top) || 0;
        return {
            left: (leftPx / parentWidth) * 100,
            top: (topPx / parentHeight) * 100
        };
    }

    setupDragAndDrop() {
        let activeEl = null;
        let startX = 0;
        let startY = 0;
        let initialLeft = 0;
        let initialTop = 0;

        const onMouseDown = (e) => {
            if (!this.isDesignMode) return;

            const trayItem = e.target.closest('#design-feed-mill-item');
            let draggable = e.target.closest('#farmhouse-overlay, #barn-overlay, #farm-grid-container, #shop-building, #pet-building, #quest-building, #achieve-building, #signpost-building, #chicken-coop, #cow-pen, #pig-pen, #feed-mill-building, .decor-outside');
            if (trayItem) {
                if (this.inventory.getInventoryAmount('buildings', 'feed_mill') <= 0) return;
                const stage = document.getElementById('farm-stage');
                const machine = document.getElementById('feed-mill-building');
                if (!stage || !machine) return;
                const rect = stage.getBoundingClientRect();
                const left = Math.max(4, Math.min(96, ((e.clientX - rect.left) / rect.width) * 100));
                const top = Math.max(8, Math.min(94, ((e.clientY - rect.top) / rect.height) * 100));
                this.inventory.state.layout.feedMill = { left, top };
                machine.style.left = `${left}%`;
                machine.style.top = `${top}%`;
                machine.classList.remove('hide');
                this.updateDesignFeedMillTray();
                draggable = machine;
            }
            if (!draggable) return;

            e.preventDefault();
            e.stopPropagation();

            activeEl = draggable;
            startX = e.clientX;
            startY = e.clientY;

            const pos = this.getPercentPosition(activeEl);
            initialLeft = pos.left;
            initialTop = pos.top;

            activeEl.style.zIndex = '1000';
            document.body.style.cursor = 'grabbing';
        };

        const onMouseMove = (e) => {
            if (!this.isDesignMode || !activeEl) return;

            e.preventDefault();

            const parent = activeEl.offsetParent || activeEl.parentElement;
            const parentWidth = parent.offsetWidth || 1280;
            const parentHeight = parent.offsetHeight || 720;

            const deltaX = (e.clientX - startX) / (this.baseScale * this.zoomLevel);
            const deltaY = (e.clientY - startY) / (this.baseScale * this.zoomLevel);

            const deltaLeft = (deltaX / parentWidth) * 100;
            const deltaTop = (deltaY / parentHeight) * 100;

            let newLeft = initialLeft + deltaLeft;
            let newTop = initialTop + deltaTop;

            newLeft = Math.max(-20, Math.min(120, newLeft));
            newTop = Math.max(-20, Math.min(120, newTop));

            activeEl.style.left = `${newLeft.toFixed(2)}%`;
            activeEl.style.top = `${newTop.toFixed(2)}%`;

            if (activeEl.id === 'farm-grid-container') {
                if (!this.inventory.state.layout.farmGrid) {
                    this.inventory.state.layout.farmGrid = { left: newLeft, top: newTop };
                } else {
                    this.inventory.state.layout.farmGrid.left = newLeft;
                    this.inventory.state.layout.farmGrid.top = newTop;
                }
                this.phaserWorld?.refreshGridLayout();
            }
        };

        const onMouseUp = () => {
            if (!activeEl) return;

            if (activeEl.id === 'farmhouse-overlay' || activeEl.id === 'barn-overlay') {
                activeEl.style.zIndex = '2';
            } else if (activeEl.id === 'farm-grid-container') {
                activeEl.style.zIndex = '10';
            } else if (activeEl.id === 'signpost-building') {
                activeEl.style.zIndex = '';
            } else if (['chicken-coop', 'cow-pen', 'pig-pen', 'feed-mill-building'].includes(activeEl.id)) {
                activeEl.style.zIndex = '2';
            } else {
                activeEl.style.zIndex = '';
            }

            activeEl = null;
            document.body.style.cursor = '';
        };

        const onTouchStart = (e) => {
            if (!this.isDesignMode || e.touches.length !== 1) return;
            const touch = e.touches[0];
            onMouseDown({
                clientX: touch.clientX,
                clientY: touch.clientY,
                target: touch.target,
                preventDefault: () => e.preventDefault(),
                stopPropagation: () => e.stopPropagation()
            });
        };

        const onTouchMove = (e) => {
            if (!this.isDesignMode || !activeEl || e.touches.length !== 1) return;
            const touch = e.touches[0];
            onMouseMove({
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => e.preventDefault()
            });
        };

        const viewport = document.getElementById('game-viewport');
        if (viewport) {
            viewport.addEventListener('mousedown', onMouseDown);
            viewport.addEventListener('touchstart', onTouchStart, { passive: false });
        }
        const feedMillTrayItem = document.getElementById('design-feed-mill-item');
        feedMillTrayItem?.addEventListener('mousedown', onMouseDown);
        feedMillTrayItem?.addEventListener('touchstart', onTouchStart, { passive: false });
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchend', onMouseUp);
    }

    enterDesignMode() {
        if (this.isVisitingFarm) {
            this.showToast('Bạn đang tham quan nên không thể thiết kế farm này.');
            return;
        }
        if (this.isPaveMode) {
            this.togglePaveMode();
        }
        this.isDesignMode = true;
        
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hide'));
        this.hideSeedPopup();
        this.hideCropDetail();
        this.phaserWorld?.closeFeedTray();

        this.dom.container.classList.add('design-active');

        this.layoutBackup = {
            farmhouse: { ...this.inventory.state.layout.farmhouse },
            barn: { ...this.inventory.state.layout.barn },
            farmGrid: { ...this.inventory.state.layout.farmGrid },
            shopBuilding: this.inventory.state.layout.shopBuilding ? { ...this.inventory.state.layout.shopBuilding } : { left: 10, top: 35 },
            petBuilding: this.inventory.state.layout.petBuilding ? { ...this.inventory.state.layout.petBuilding } : { left: 48, top: 15 },
            questBuilding: this.inventory.state.layout.questBuilding ? { ...this.inventory.state.layout.questBuilding } : { left: 80, top: 30 },
            achieveBuilding: this.inventory.state.layout.achieveBuilding ? { ...this.inventory.state.layout.achieveBuilding } : { left: 85, top: 50 },
            signpost: this.inventory.state.layout.signpost ? { ...this.inventory.state.layout.signpost } : { left: 36, top: 12 },
            chickenCoop: this.inventory.state.layout.chickenCoop ? { ...this.inventory.state.layout.chickenCoop } : { left: 10, top: 56 },
            cowPen: this.inventory.state.layout.cowPen ? { ...this.inventory.state.layout.cowPen } : { left: 70, top: 18 },
            pigPen: this.inventory.state.layout.pigPen ? { ...this.inventory.state.layout.pigPen } : { left: 80, top: 62 },
            feedMill: this.inventory.state.layout.feedMill ? { ...this.inventory.state.layout.feedMill } : null,
            decorations: this.inventory.state.layout.decorations.map(d => ({ ...d }))
        };

        document.getElementById('design-banner').classList.remove('hide');
        document.getElementById('design-controls').classList.remove('hide');
        this.updateDesignFeedMillTray();

        this.showToast('Đã vào Chế độ Thiết kế! Hãy kéo thả các vật thể.');
    }

    exitDesignMode(save = true) {
        this.isDesignMode = false;
        this.dom.container.classList.remove('design-active');

        document.getElementById('design-banner').classList.add('hide');
        document.getElementById('design-controls').classList.add('hide');

        if (save) {
            const farmhouse = document.getElementById('farmhouse-overlay');
            const barn = document.getElementById('barn-overlay');
            const shopBuilding = document.getElementById('shop-building');
            const petBuilding = document.getElementById('pet-building');
            const questBuilding = document.getElementById('quest-building');
            const achieveBuilding = document.getElementById('achieve-building');
            const farmGridContainer = document.getElementById('farm-grid-container');
            
            if (farmhouse) this.inventory.state.layout.farmhouse = this.getPercentPosition(farmhouse);
            if (barn) this.inventory.state.layout.barn = this.getPercentPosition(barn);
            if (shopBuilding) this.inventory.state.layout.shopBuilding = this.getPercentPosition(shopBuilding);
            if (petBuilding) this.inventory.state.layout.petBuilding = this.getPercentPosition(petBuilding);
            if (questBuilding) this.inventory.state.layout.questBuilding = this.getPercentPosition(questBuilding);
            if (achieveBuilding) this.inventory.state.layout.achieveBuilding = this.getPercentPosition(achieveBuilding);
            if (farmGridContainer) this.inventory.state.layout.farmGrid = this.getPercentPosition(farmGridContainer);

            const signpost = document.getElementById('signpost-building');
            if (signpost) this.inventory.state.layout.signpost = this.getPercentPosition(signpost);

            const chickenCoop = document.getElementById('chicken-coop');
            if (chickenCoop) this.inventory.state.layout.chickenCoop = this.getPercentPosition(chickenCoop);

            const cowPen = document.getElementById('cow-pen');
            if (cowPen) this.inventory.state.layout.cowPen = this.getPercentPosition(cowPen);

            const pigPen = document.getElementById('pig-pen');
            if (pigPen) this.inventory.state.layout.pigPen = this.getPercentPosition(pigPen);

            const feedMillBuilding = document.getElementById('feed-mill-building');
            if (feedMillBuilding && !feedMillBuilding.classList.contains('hide')) {
                this.inventory.state.layout.feedMill = this.getPercentPosition(feedMillBuilding);
            }

            this.inventory.state.layout.decorations.forEach(decor => {
                const el = document.getElementById(decor.id);
                if (el) {
                    const pos = this.getPercentPosition(el);
                    decor.left = pos.left;
                    decor.top = pos.top;
                }
            });

            if (this.inventory.state.layout.farmhouse) {
                this.farmerHomePos.left = parseFloat(this.inventory.state.layout.farmhouse.left) + 16.0;
                this.farmerHomePos.top = parseFloat(this.inventory.state.layout.farmhouse.top) + 30.0;
            }

            this.phaserWorld?.syncAll();
            this.inventory.saveGame();
            this.showToast('Đã lưu bố cục nông trại mới!');
        } else {
            this.inventory.state.layout = JSON.parse(JSON.stringify(this.layoutBackup));
            this.applyLayout();
            this.showToast('Đã hủy các thay đổi bố cục.');
        }

        this.updateDesignFeedMillTray();

        const homeCoords = {
            x: this.farmerHomePos.left / 100 * 1280,
            y: this.farmerHomePos.top / 100 * 720
        };
        this.farmer.setTarget(homeCoords.x, homeCoords.y);
    }

    initClouds() {
        this.clouds = [];
        const w = window.innerWidth || 1280;
        const h = window.innerHeight || 720;

        // 1. Generate Background Cloud Layer (Mist texture)
        const numBgClouds = 12;
        for (let i = 0; i < numBgClouds; i++) {
            const x = Math.random() * (w + 600) - 300;
            const y = Math.random() * (h + 300) - 150;
            const scale = Math.random() * 0.6 + 0.9; // larger scale
            const speed = Math.random() * 0.02 + 0.01; // very slow
            const opacity = Math.random() * 0.12 + 0.25; // solid but soft base
            const parallaxFactor = 0.10; // distant background
            this.clouds.push(new Cloud(x, y, scale, speed, opacity, parallaxFactor, 'bg'));
        }

        // 2. Generate Foreground Layer 1: Front / Thick
        const numFgThick = 6;
        for (let i = 0; i < numFgThick; i++) {
            const x = Math.random() * (w + 400) - 200;
            const y = Math.random() * (h + 200) - 100;
            const scale = Math.random() * 0.4 + 0.7;
            const speed = Math.random() * 0.10 + 0.08;
            const opacity = Math.random() * 0.08 + 0.16;
            const parallaxFactor = 0.50;
            this.clouds.push(new Cloud(x, y, scale, speed, opacity, parallaxFactor, 'normal'));
        }

        // 3. Generate Foreground Layer 2: Middle
        const numFgMid = 10;
        for (let i = 0; i < numFgMid; i++) {
            const x = Math.random() * (w + 400) - 200;
            const y = Math.random() * (h + 200) - 100;
            const scale = Math.random() * 0.3 + 0.5;
            const speed = Math.random() * 0.05 + 0.04;
            const opacity = Math.random() * 0.06 + 0.09;
            const parallaxFactor = 0.30;
            this.clouds.push(new Cloud(x, y, scale, speed, opacity, parallaxFactor, 'normal'));
        }

        // 4. Generate Foreground Layer 3: Misty / High Altitude
        const numFgMisty = 6;
        for (let i = 0; i < numFgMisty; i++) {
            const x = Math.random() * (w + 400) - 200;
            const y = Math.random() * (h + 200) - 100;
            const scale = Math.random() * 0.2 + 0.4;
            const speed = Math.random() * 0.02 + 0.01;
            const opacity = Math.random() * 0.03 + 0.04;
            const parallaxFactor = 0.15;
            this.clouds.push(new Cloud(x, y, scale, speed, opacity, parallaxFactor, 'normal'));
        }
    }

    drawFog() {
        if (!this.fogCtx) return;
        const ctx = this.fogCtx;
        const w = this.fogCanvas.width;
        const h = this.fogCanvas.height;
        
        // 1. Clear canvas
        ctx.clearRect(0, 0, w, h);
        
        // 2. Fill with misty off-white solid color (the sea of clouds base layer)
        ctx.fillStyle = 'rgba(245, 248, 242, 0.96)';
        ctx.fillRect(0, 0, w, h);
        
        // 3. Draw all clouds with parallax camera adjustments
        this.clouds.forEach(cloud => cloud.draw(ctx, this.offsetX, this.offsetY));
        
        // 4. Apply destination-out composite operation to carve out the elliptical mask
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        
        const finalScale = this.baseScale * this.zoomLevel;
        
        // Center of the farm stage projected to screen viewport coordinates
        const cx = w / 2 + this.offsetX;
        const cy = h / 2 + this.offsetY;
        const rx = 560 * finalScale;
        const ry = 300 * finalScale;
        
        ctx.translate(cx, cy);
        ctx.scale(1, ry / rx);
        
        const grad = ctx.createRadialGradient(0, 0, rx * 0.9, 0, 0, rx * 2.0);
        
        grad.addColorStop(0.0, 'rgba(0, 0, 0, 1.0)');
        grad.addColorStop(0.1, 'rgba(0, 0, 0, 0.95)');
        grad.addColorStop(0.2, 'rgba(0, 0, 0, 0.75)');
        grad.addColorStop(0.4, 'rgba(0, 0, 0, 0.40)');
        grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)');
        grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, rx * 2.0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }

    generateForestFenceAndClouds() {
        const fencePostsContainer = document.getElementById('fence-posts');
        if (fencePostsContainer) {
            fencePostsContainer.innerHTML = '';
            
            const cx = 640;
            const cy = 360;
            const rx = 560;
            const ry = 296;
            const numPosts = 64;
            
            for (let i = 0; i < numPosts; i++) {
                const theta = (i / numPosts) * Math.PI * 2;
                const x = cx + rx * Math.cos(theta);
                const y = cy + ry * Math.sin(theta);
                
                const left = (x / 1280) * 100;
                const top = (y / 720) * 100;
                
                const post = document.createElement('div');
                post.className = 'fence-post';
                post.style.left = `${left}%`;
                post.style.top = `${top}%`;
                post.style.zIndex = Math.floor(y) + 5;
                
                fencePostsContainer.appendChild(post);
            }
        }

        const forestContainer = document.getElementById('forest-container');
        if (forestContainer) {
            forestContainer.innerHTML = '';
            
            const cx = 640;
            const cy = 360;
            const rx = 580;
            const ry = 310;
            
            const treeTypes = ['🌳', '🌲'];
            const numTrees = 50;
            let attempts = 0;
            let treesPlaced = 0;
            
            while (treesPlaced < numTrees && attempts < 500) {
                attempts++;
                
                const x = Math.random() * 1280;
                const y = Math.random() * 720;
                
                const dx = x - cx;
                const dy = y - cy;
                const distRatio = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
                
                if (distRatio > 1.0) {
                    const left = (x / 1280) * 100;
                    const top = (y / 720) * 100;
                    
                    const tree = document.createElement('div');
                    tree.className = 'forest-tree';
                    tree.style.left = `${left}%`;
                    tree.style.top = `${top}%`;
                    
                    const size = Math.random() * 1.5 + 1.8;
                    tree.style.fontSize = `${size}rem`;
                    
                    const emoji = treeTypes[Math.floor(Math.random() * treeTypes.length)];
                    tree.textContent = emoji;
                    tree.style.zIndex = Math.floor(y);
                    
                    forestContainer.appendChild(tree);
                    treesPlaced++;
                }
            }
        }
    }
}

// Start Game instance on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new Game();
});
export default Game;
