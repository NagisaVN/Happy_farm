# File-by-File Conversion Examples

## 1. Game.js → MainScene.js

### Before (Vanilla JS)
```javascript
// Game.js
class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.camera = { x: 0, y: 0 };
    this.tiles = [];
    this.farmer = new Farmer(this);
    this.inventory = new Inventory();
    
    this.gameLoop();
  }

  gameLoop() {
    this.update();
    this.render();
    requestAnimationFrame(() => this.gameLoop());
  }

  update() {
    this.farmer.update();
    this.tiles.forEach(tile => tile.update(Date.now()));
    this.handleInput();
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.renderBackground();
    this.renderTiles();
    this.farmer.render(this.ctx);
  }

  handlePlotClick(id) {
    if (this.inventory.state.plots[id].state === 'empty') {
      this.showCropSelector(id);
    }
  }
}
```

### After (Phaser Scene)
```javascript
// scenes/MainScene.js
import Phaser from 'phaser';
import { Inventory } from '../systems/Inventory.js';
import { CROP_CONFIGS } from '../data/Seed.js';

export default class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
  }

  create() {
    // Initialize game state
    this.inventory = new Inventory();
    this.inventory.load();
    
    // Create background
    this.createBackground();
    
    // Create farm tiles
    this.createFarmTiles();
    
    // Create farmer
    this.createFarmer();
    
    // Create animals
    this.createAnimals();
    
    // Setup UI scene
    this.scene.launch('UIScene', { mainScene: this });
    
    // Input setup
    this.setupInput();
    
    // Camera setup
    this.setupCamera();
  }

  update() {
    // Update farmer animation
    this.updateFarmer();
    
    // Update crop growth
    this.updateCropGrowth();
  }

  createFarmTiles() {
    this.farmTiles = this.add.group();
    
    for (let i = 0; i < 28; i++) {
      const row = Math.floor(i / 7);
      const col = i % 7;
      const x = 150 + col * 100;
      const y = 100 + row * 100;
      
      const tile = this.add.sprite(x, y, 'tile-empty');
      tile.setData('id', i);
      tile.setData('state', this.inventory.state.plots[i]);
      
      // Z-index for isometric depth
      tile.setDepth(row * 10 - col + 20);
      
      tile.setInteractive();
      tile.on('pointerdown', () => this.handlePlotClick(i));
      
      this.farmTiles.add(tile);
    }
  }

  createFarmer() {
    this.farmer = this.add.sprite(640, 360, 'farmer', 0);
    this.farmer.setDepth(500);
    
    // Create animations
    this.createFarmerAnimations();
    this.farmer.play('farmer-idle-front');
  }

  createFarmerAnimations() {
    const directions = ['front', 'back', 'left', 'right'];
    
    // Idle animations
    directions.forEach(dir => {
      this.anims.create({
        key: `farmer-idle-${dir}`,
        frames: this.anims.generateFrameNumbers('farmer', { frames: [0, 1] }),
        frameRate: 10,
        repeat: -1
      });
    });
    
    // Walk animations
    directions.forEach(dir => {
      this.anims.create({
        key: `farmer-walk-${dir}`,
        frames: this.anims.generateFrameNumbers('farmer', { frames: [2, 3, 4, 5, 6, 7, 8, 9] }),
        frameRate: 12,
        repeat: -1
      });
    });
    
    // Action animations
    ['dig', 'plant', 'harvest'].forEach(action => {
      this.anims.create({
        key: `farmer-${action}`,
        frames: this.anims.generateFrameNumbers('farmer', { frames: [10, 11, 12, 13, 14, 15] }),
        frameRate: 10,
        repeat: 0
      });
    });
  }

  handlePlotClick(id) {
    const plot = this.inventory.state.plots[id];
    
    if (this.inventory.isDesignMode) return;
    
    if (plot.state === 'empty') {
      this.showCropSelector(id);
    } else if (plot.state === 'mature') {
      this.harvestPlot(id);
    }
  }

  showCropSelector(plotId) {
    // Emit event for UIScene to handle
    this.events.emit('showCropSelector', { plotId });
  }

  harvestPlot(plotId) {
    const plot = this.inventory.state.plots[plotId];
    if (plot.state !== 'mature') return;
    
    // Farmer walks to plot and harvests
    this.moveFarmerTo(plotId, () => {
      plot.state = 'empty';
      this.inventory.addResource('gold', CROP_CONFIGS[plot.cropType].sellPrice);
      this.updateTileVisual(plotId);
      this.events.emit('resourcesUpdated', this.inventory.getResources());
    });
  }

  moveFarmerTo(plotId, callback) {
    const row = Math.floor(plotId / 7);
    const col = plotId % 7;
    const targetX = 150 + col * 100;
    const targetY = 100 + row * 100;
    
    this.tweens.add({
      targets: this.farmer,
      x: targetX,
      y: targetY,
      duration: 1000,
      onComplete: callback
    });
  }

  updateTileVisual(plotId) {
    const tile = this.farmTiles.children.entries[plotId];
    const plot = this.inventory.state.plots[plotId];
    
    if (plot.state === 'empty') {
      tile.setTexture('tile-empty');
    } else if (plot.state === 'sprouting') {
      tile.setTexture(`crop-${plot.cropType}-1`);
    } else if (plot.state === 'growing') {
      tile.setTexture(`crop-${plot.cropType}-2`);
    } else if (plot.state === 'mature') {
      tile.setTexture(`crop-${plot.cropType}-mature`);
    }
  }

  updateCropGrowth() {
    const now = Date.now();
    
    this.inventory.state.plots.forEach((plot, id) => {
      if (plot.state === 'empty') return;
      
      const elapsed = now - plot.plantTime;
      const remaining = plot.growthDuration - elapsed;
      
      if (remaining <= 0) {
        plot.state = 'mature';
        this.updateTileVisual(id);
        this.events.emit('cropMatured', { id, cropType: plot.cropType });
      } else if (elapsed > plot.growthDuration * 0.5 && plot.state === 'sprouting') {
        plot.state = 'growing';
        this.updateTileVisual(id);
      }
    });
  }

  setupInput() {
    this.input.on('pointer', (pointer) => {
      if (this.inventory.isDesignMode) {
        // Handle drag & drop
      }
    });
  }

  setupCamera() {
    this.cameras.main.setBounds(0, 0, 1280, 720);
    this.cameras.main.startFollow(this.farmer, true, 0.1, 0.1);
  }

  createBackground() {
    // Add parallax clouds
    this.clouds = this.add.group();
    for (let i = 0; i < 5; i++) {
      const cloud = this.add.sprite(Math.random() * 1280, Math.random() * 200, 'cloud');
      cloud.setScrollFactor(0.3);
      cloud.setDepth(-10);
      this.clouds.add(cloud);
    }
  }

  createAnimals() {
    // Will implement dog, chicken, cow movement
  }

  shutdown() {
    // Save game state
    this.inventory.save();
  }
}
```

---

## 2. Farmer.js → FarmerSprite Class (Optional Wrapper)

### Before (Canvas Drawing)
```javascript
// Farmer.js
export class Farmer {
  constructor(game) {
    this.game = game;
    this.x = 640;
    this.y = 360;
    this.state = 'IDLE'; // IDLE, WALK, DIG, PLANT, HARVEST
    this.direction = 'FRONT';
    this.animation = new Animation();
  }

  setTarget(tx, ty, callback) {
    this.targetX = tx;
    this.targetY = ty;
    this.callback = callback;
    
    if (Math.abs(this.targetX - this.x) > 5) {
      this.state = 'WALK';
    }
  }

  update() {
    // Update position
    if (this.state === 'WALK') {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist > 5) {
        this.x += (dx / dist) * this.speed;
        this.y += (dy / dist) * this.speed;
      } else {
        this.state = 'IDLE';
        if (this.callback) this.callback();
      }
    }
  }

  render(ctx) {
    // Draw farmer using Animation.js
    const frame = this.animation.getFrame(this.state, this.direction);
    ctx.drawImage(spriteSheet, frame.sx, frame.sy, 64, 64, this.x, this.y, 64, 64);
  }
}
```

### After (Optional Wrapper Class)
```javascript
// gameObjects/FarmerSprite.js
import Phaser from 'phaser';

export class FarmerSprite extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'farmer');
    
    this.state = 'IDLE';
    this.direction = 'FRONT';
    
    // Add to scene
    scene.add.existing(this);
    scene.physics.add.existing(this);
    
    // Play idle animation
    this.play('farmer-idle-front');
  }

  moveTo(targetX, targetY, onComplete) {
    const distance = Phaser.Math.Distance.Between(
      this.x, this.y, 
      targetX, targetY
    );
    
    this.state = 'WALK';
    this.play('farmer-walk-front');
    
    this.scene.tweens.add({
      targets: this,
      x: targetX,
      y: targetY,
      duration: distance * 2, // 2ms per pixel
      onComplete: () => {
        this.state = 'IDLE';
        this.play('farmer-idle-front');
        if (onComplete) onComplete();
      }
    });
  }

  performAction(actionType) {
    this.state = actionType.toUpperCase();
    this.play(`farmer-${actionType}`);
  }

  setState(state) {
    this.state = state;
  }
}
```

---

## 3. FarmTile.js → Sprite Data & Events

### Before (DOM Elements)
```javascript
// FarmTile.js
export class FarmTile {
  constructor(game, id) {
    this.game = game;
    this.id = id;
    this.el = document.getElementById(`plot-${id}`);
    
    this.el.addEventListener('click', (e) => {
      this.game.handlePlotClick(this.id);
    });
  }

  get plotState() {
    return this.game.inventory.state.plots[this.id];
  }

  update(now) {
    const plot = this.plotState;
    const elapsed = now - plot.plantTime;
    
    if (elapsed > plot.growthDuration) {
      plot.state = 'mature';
      this.render();
    }
  }

  render() {
    const plot = this.plotState;
    this.el.className = `plot ${plot.state}`;
  }
}
```

### After (Phaser Sprite)
```javascript
// MainScene.js - simplified tile creation
function createFarmTiles() {
  this.farmTiles = this.add.group();
  
  for (let i = 0; i < 28; i++) {
    const row = Math.floor(i / 7);
    const col = i % 7;
    const x = 150 + col * 100;
    const y = 100 + row * 100;
    
    // Create sprite
    const tile = this.add.sprite(x, y, 'tile-empty');
    
    // Store plot state reference in sprite data
    const plotState = this.inventory.state.plots[i];
    tile.setData('plotState', plotState);
    tile.setData('id', i);
    
    // Set interactive
    tile.setInteractive();
    
    // Click handler
    tile.on('pointerdown', () => {
      this.handlePlotClick(i);
    });
    
    // Z-depth for isometric sorting
    tile.setDepth(row * 10 - col + 20);
    
    this.farmTiles.add(tile);
  }
}

// Update tile visuals
function updateCropGrowth() {
  this.farmTiles.children.entries.forEach((tile) => {
    const id = tile.getData('id');
    const plot = this.inventory.state.plots[id];
    
    // Update texture based on crop state
    if (plot.state === 'empty') {
      tile.setTexture('tile-empty');
    } else if (plot.state === 'mature') {
      tile.setTexture(`crop-${plot.cropType}-mature`);
    }
  });
}
```

---

## 4. Animation.js → Phaser AnimationManager

### Before (Manual Canvas Drawing)
```javascript
// Animation.js
export class Animation {
  constructor() {
    this.spriteSheet = null;
    this.frameData = {
      'IDLE': { frames: [0, 1], speed: 20 },
      'WALK': { frames: [2, 3, 4, 5, 6, 7, 8, 9], speed: 8 }
    };
  }

  getFrame(state, direction) {
    const stateData = this.frameData[state];
    const frameIndex = stateData.frames[Math.floor(this.frameTimer / stateData.speed)];
    return {
      sx: frameIndex * 64,
      sy: direction * 64
    };
  }

  update() {
    this.frameTimer++;
  }
}
```

### After (Phaser Built-in)
```javascript
// scenes/BootScene.js - preload sprites
preload() {
  // Load sprite sheet
  this.load.spritesheet('farmer', 'assets/farmer.png', {
    frameWidth: 64,
    frameHeight: 64
  });
}

// MainScene.js - create animations
create() {
  // Idle animation
  this.anims.create({
    key: 'farmer-idle',
    frames: this.anims.generateFrameNumbers('farmer', { 
      frames: [0, 1] 
    }),
    frameRate: 10,
    repeat: -1
  });

  // Walk animation
  this.anims.create({
    key: 'farmer-walk',
    frames: this.anims.generateFrameNumbers('farmer', { 
      frames: [2, 3, 4, 5, 6, 7, 8, 9] 
    }),
    frameRate: 12,
    repeat: -1
  });
  
  // Play
  this.farmer.play('farmer-idle');
}

// update() - automatic, no manual frame tracking needed
```

---

## 5. Dog.js, Chicken.js, Cow.js → Sprite with Tweens

### Before (Manual Movement)
```javascript
// Dog.js
export class Dog {
  constructor(game, x, y) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
  }

  wander() {
    const angle = Math.random() * Math.PI * 2;
    this.targetX = this.x + Math.cos(angle) * 100;
    this.targetY = this.y + Math.sin(angle) * 100;
  }

  update() {
    // Move towards target
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 5) {
      this.vx = (dx / dist) * 1.5;
      this.vy = (dy / dist) * 1.5;
      this.x += this.vx;
      this.y += this.vy;
    } else {
      this.wander();
    }
  }

  render(ctx) {
    ctx.drawImage(dogSprite, this.x, this.y);
  }
}
```

### After (Phaser Sprite with Tweens)
```javascript
// gameObjects/Dog.js
import Phaser from 'phaser';

export class Dog extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'dog');
    
    scene.add.existing(this);
    scene.physics.add.existing(this);
    
    this.setCollideWorldBounds(true);
    this.setBounce(1, 1);
    
    this.play('dog-idle');
    this.wander();
  }

  wander() {
    const targetX = Phaser.Math.Between(100, 1100);
    const targetY = Phaser.Math.Between(100, 600);
    const distance = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
    
    this.scene.tweens.add({
      targets: this,
      x: targetX,
      y: targetY,
      duration: distance * 3,
      onComplete: () => this.wander()
    });
  }
}
```

---

## 6. Inventory.js → Keep As-Is

```javascript
// systems/Inventory.js - UNCHANGED
export class Inventory {
  constructor() {
    this.state = this.loadFromLocalStorage() || this.getDefaultState();
  }

  plantCrop(plotId, cropType) {
    this.state.plots[plotId] = {
      cropType,
      state: 'sprouting',
      plantTime: Date.now(),
      growthDuration: CROP_CONFIGS[cropType].growthTime
    };
    this.save();
  }

  save() {
    localStorage.setItem('farmState', JSON.stringify(this.state));
  }

  loadFromLocalStorage() {
    const data = localStorage.getItem('farmState');
    return data ? JSON.parse(data) : null;
  }

  getDefaultState() {
    return { plots: Array(28).fill(null).map(() => ({ state: 'empty' })) };
  }
}
```

---

## Summary Table

| File | Handling |
|------|----------|
| Game.js | → MainScene class |
| Farmer.js | → Animated sprite in MainScene |
| FarmTile.js | → Sprite group with data stores |
| Animation.js | → Phaser AnimationManager |
| Dog/Chicken/Cow.js | → Sprites with tweens |
| Inventory.js | Keep as-is (pure state) |
| Seed.js | Keep as-is (data constants) |
| ItemCatalog.js | Keep as-is (item database) |

