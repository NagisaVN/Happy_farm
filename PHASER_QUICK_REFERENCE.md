# Phaser Migration Quick Reference

## Before (Current - Vanilla JS)
```javascript
// Game loop
function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}

// Canvas drawing
ctx.drawImage(spriteSheet, ...);

// Event handling
element.addEventListener('click', handler);

// Timer
const elapsed = now - startTime;
```

## After (Phaser)
```javascript
// Game loop built-in
update() { /* called auto */ }

// Sprites
this.add.sprite(x, y, 'texture');

// Event handling  
sprite.on('pointerdown', handler);

// Timer
this.time.delayedCall(delay, callback);
```

---

## Key Mappings

| Component | Current | → Phaser |
|-----------|---------|---------|
| Game Loop | `requestAnimationFrame` | `Scene.update()` |
| Rendering | Canvas 2D `ctx` | `this.add.*()` |
| Sprites | Canvas drawing | `Sprite`, `AnimatedSprite` |
| Animations | Frame timer + draw | `Anims.AnimationManager` |
| Input | `addEventListener` | `this.input.on()` |
| Timers | Manual timestamp | `this.time.delayedCall()` |
| Movement | Manual x/y update | `Tweens` |
| Camera | Manual offset calc | `this.cameras.main` |
| Particles | Canvas drawing | `Emitter` |
| Z-Sorting | CSS z-index | `depth` property |

---

## 3-Step Migration Strategy

### 1. Setup Phaser (1 hour)
- Install Phaser 3.x
- Create BootScene (asset loading)
- Create MainScene stub
- Mount in Vite/HTML

### 2. Convert Core (4-6 hours)
- Farmer sprite + animations → Phaser AnimatedSprite
- Farm tile grid → Sprite group
- FarmTile logic → Sprite data + callbacks
- Plot click → Phaser input events
- Growth timers → Phaser.Time

### 3. Polish (2-4 hours)
- UI Layer (create UIScene)
- Parallax effects
- Animal movement
- Design mode (drag & drop)
- Effects/particles

---

## Code Snippets for Copy-Paste

### Initialize Phaser Game
```javascript
// main.js
import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import MainScene from './scenes/MainScene';
import UIScene from './scenes/UIScene';

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, MainScene, UIScene],
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  }
};

const game = new Phaser.Game(config);
```

### BootScene Template
```javascript
export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    this.load.setPath('assets/');
    this.load.spritesheet('farmer', 'farmer.png', { frameWidth: 64, frameHeight: 64 });
    this.load.image('tile-empty', 'tile.png');
    this.load.image('cloud', 'cloud.png');
  }

  create() {
    this.scene.start('MainScene');
  }
}
```

### MainScene Template
```javascript
export default class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
  }

  create() {
    // Create farm tiles
    this.farmTiles = this.add.group();
    for (let i = 0; i < 28; i++) {
      const row = Math.floor(i / 7);
      const col = i % 7;
      const x = 150 + col * 100;
      const y = 100 + row * 100;
      
      const tile = this.add.sprite(x, y, 'tile-empty');
      tile.setData('id', i);
      tile.setInteractive();
      tile.on('pointerdown', () => this.handlePlotClick(i));
      tile.setDepth(row * 10 - col);
      
      this.farmTiles.add(tile);
    }

    // Create farmer
    this.farmer = this.add.sprite(640, 360, 'farmer', 0);
    this.anims.create({
      key: 'farmer-idle',
      frames: this.anims.generateFrameNumbers('farmer', { frames: [0, 1] }),
      frameRate: 10,
      repeat: -1
    });
    this.farmer.play('farmer-idle');

    // Camera
    this.cameras.main.setBounds(0, 0, 1280, 720);
    this.cameras.main.startFollow(this.farmer);
  }

  update() {
    // Game logic
  }

  handlePlotClick(id) {
    console.log('Plot clicked:', id);
  }
}
```

### Farmer Movement & Animation
```javascript
moveFarmerTo(targetX, targetY, actionKey) {
  this.tweens.add({
    targets: this.farmer,
    x: targetX,
    y: targetY,
    duration: 1000,
    onComplete: () => {
      // Play action animation
      this.farmer.play(`farmer-${actionKey}`);
    }
  });
}
```

### Crop Growth Timer
```javascript
plantCrop(plotId, cropType) {
  const plot = this.inventory.state.plots[plotId];
  plot.state = 'sprouting';
  plot.cropType = cropType;
  plot.plantTime = Date.now();

  this.time.delayedCall(plot.growthDuration, () => {
    plot.state = 'mature';
    this.updateTileVisual(plotId);
    this.events.emit('cropMatured', { plotId, cropType });
  });
}
```

### Parallax Background
```javascript
create() {
  this.clouds = this.add.group();
  for (let i = 0; i < 3; i++) {
    const cloud = this.add.sprite(200 + i * 400, 100, 'cloud');
    cloud.setScrollFactor(0.3); // Parallax effect
    cloud.setDepth(-10);
    this.clouds.add(cloud);
  }
}
```

### Drag & Drop (Design Mode)
```javascript
enableDesignMode() {
  this.input.setDraggable(this.farmer);
  this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
    gameObject.x = dragX;
    gameObject.y = dragY;
  });
  this.input.on('dragend', (pointer, gameObject) => {
    // Save new position
  });
}
```

### Input Event System
```javascript
// Emit event
this.events.emit('resourcesUpdated', { gold: 100, xp: 50 });

// Listen in UIScene
this.scene.get('MainScene').events.on('resourcesUpdated', (data) => {
  this.updateHUD(data);
});
```

---

## File Deletion Plan

After migration complete, these files become obsolete:
- ~~Game.js~~ (logic moves to MainScene)
- ~~Animation.js~~ (Phaser handles sprite animation)
- ~~FarmTile.js~~ (becomes sprite group + data)
- ~~Farmer.js~~ (becomes animated sprite)
- ~~Dog.js, Chicken.js, Cow.js~~ (become sprites with tweens)

**Keep these files:**
- Inventory.js (pure state management)
- Seed.js (crop configuration)
- ItemCatalog.js (item database)
- GameApi.js (backend API calls)
- style.css (can remain for UI overlays if needed)

---

## Performance Considerations

- **Sprite batching:** Phaser auto-batches, very efficient
- **28 tiles:** No problem, even with physics enabled
- **Animations:** Phaser's animation system is optimized
- **Particles:** Use pooling for dust/light effects
- **Draw calls:** Monitor with built-in profiler
- **Mobile:** Works great, Phaser has built-in touch input

---

## Testing Strategy

1. Test single crop growth cycle
2. Test farmer movement & animation
3. Test design mode (drag & drop)
4. Test click input on all tiles
5. Test with localStorage persistence
6. Test responsive scaling
7. Performance test with all tiles + animals active
8. Touch input test on mobile

