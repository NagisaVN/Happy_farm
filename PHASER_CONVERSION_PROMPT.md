# Happy Farm → Phaser Conversion Prompt

## Project Overview

**Current Stack:**
- Framework: Vanilla JavaScript ES Modules
- Rendering: Canvas 2D API
- Build Tool: Vite
- Backend: Express.js + MySQL (optional online features)
- Asset Management: HTML DOM + CSS (grid-based layout)

**Target Stack:**
- Framework: Phaser 3.x (2D game engine)
- Rendering: WebGL/Canvas (Phaser handles automatically)
- Build Tool: Vite (keep as-is)
- Backend: Express.js + MySQL (keep as-is)
- Asset Management: Phaser Scene system + Sprite groups

---

## Current Architecture

### Game Structure
1. **Game.js** - Main game loop, UI binding, input handling, game state management
2. **FarmTile.js** - Individual plot logic (growth timers, crop rendering, harvesting)
3. **Farmer.js** - Player character with animations (IDLE, WALK, DIG, PLANT, HARVEST states)
4. **Animation.js** - Canvas sprite drawing and frame management
5. **Inventory.js** - Game state, localStorage persistence, shop, quests, achievements
6. **Seed.js** - Crop configurations (growth time, prices, XP rewards)
7. **Dog.js, Chicken.js, Cow.js** - Farm animals with movement and animation
8. **ItemCatalog.js** - Item database and market system

### Game Systems
- **Isometric Grid Layout**: 28 plots (7×4 grid) with z-index depth sorting
- **Crop Growth System**: 5 states (empty → digging → sprouting → growing → mature)
- **Energy System**: Plant costs 3 energy, harvest costs 2, regenerates over time
- **XP & Leveling**: Players gain XP from farming actions
- **Shop System**: Buy seeds/fertilizer, sell crops, buy cosmetics
- **Quests & Achievements**: Reward gold/XP/diamonds
- **Pets System**: Shiba (default) and Cat (unlockable)
- **Environmental Effects**: Animated clouds, dust particles, light rays, mist
- **Design Mode**: Drag-and-drop farm layout editor
- **Path Drawing Mode**: Draw roads/paths with auto-connecting grid
- **Anti-Gravity Mode**: Debug mode with physics effects

### Visual Rendering
- **Canvas 2D** for farmer sprite animations (8 directions, 5 animation states)
- **HTML div elements** for farm tiles and UI
- **CSS transitions** for UI animations and responsive scaling
- **Parallax scrolling** for background clouds and mist effects
- **Sprite sheets** for crop textures at different growth stages

---

## Phaser Conversion Strategy

### Phase 1: Core Game Setup
```
✓ Create Phaser.Game instance with config
✓ Set up MainScene extending Phaser.Scene
✓ Configure camera with zoom/pan for isometric view
✓ Replace Vite canvas mounting with Phaser's auto-mount
```

### Phase 2: Asset Management
**Current:** HTML/CSS + Image files in `assets/` folder
**Phaser:** Use asset loader and preload scene

- Preload farmer sprite sheet (currently drawn on canvas)
- Preload crop sprite sheets
- Preload animal sprites
- Preload UI textures
- Preload background parallax layers

### Phase 3: Scene Structure
```javascript
// Create these scenes:
1. BootScene - Asset preloading, loading progress
2. MainScene - Game world, farm tiles, farmer, animals
3. UIScene - HUD overlay (non-interactive camera)
```

### Phase 4: Game Objects Mapping

| Current | → | Phaser Equivalent |
|---------|---|---|
| Game.js game loop | → | Scene.update() |
| FarmTile DOM elements | → | Phaser.GameObjects.Sprite + data store |
| Farmer canvas sprite | → | Phaser.Sprites.AnimatedSprite |
| Animation.js drawing | → | Phaser.Anims.AnimationManager |
| Cloud canvas drawing | → | Phaser.GameObjects.Sprite (parallax) |
| Particle effects | → | Phaser.GameObjects.Particles |
| Timer bubbles | → | Phaser.GameObjects.Text or Container |
| Input (click) | → | Phaser.Input.InputPlugin |
| Timer updates | → | Phaser.Time.TimerEvent |

### Phase 5: State Management
- Keep **Inventory.js** mostly as-is (pure data management)
- Update localStorage integration if needed
- Consider migrating to Phaser Events for game notifications
- Use Phaser Scene data store for temporary state

### Phase 6: Key Conversions

#### 6.1 Canvas Farmer Sprite Animation
**Before:**
```javascript
// Animation.js draws manually on 2D canvas
ctx.drawImage(spriteSheet, srcX, srcY, w, h, destX, destY, w, h);
```

**After:**
```javascript
// Phaser AnimatedSprite with texture atlas
this.farmer = this.add.sprite(x, y, 'farmer-atlas');
this.anims.create({
  key: 'farmer-idle-front',
  frames: this.anims.generateFrameNumbers('farmer-atlas', { frames: [0, 1] }),
  frameRate: 10,
  repeat: -1
});
this.farmer.play('farmer-idle-front');
```

#### 6.2 FarmTile Grid
**Before:**
```html
<div class="plot" id="plot-0"></div>
```

**After:**
```javascript
// Phaser sprite group with physics
this.farmTiles = this.add.group();
for (let i = 0; i < 28; i++) {
  const tile = this.add.sprite(x, y, 'tile-empty');
  tile.setData('id', i);
  tile.setInteractive();
  this.farmTiles.add(tile);
}
```

#### 6.3 Crop Growth & Timers
**Before:**
```javascript
// Update function checks elapsed time
const elapsed = now - plot.plantTime;
if (elapsed > plot.growthDuration) {
  plot.state = 'mature';
}
```

**After:**
```javascript
// Use Phaser timer events
this.time.delayedCall(growthDuration, () => {
  plot.state = 'mature';
  updateTileVisual();
});
```

#### 6.4 Input Handling
**Before:**
```javascript
el.addEventListener('click', (e) => {
  this.game.handlePlotClick(id);
});
```

**After:**
```javascript
tile.on('pointerdown', () => {
  this.handlePlotClick(id);
});
```

#### 6.5 Parallax Clouds & Effects
**Before:**
```javascript
// Canvas drawing with manual offset calculation
draw(ctx, offsetX, offsetY) {
  const dx = this.x + offsetX * this.parallaxFactor;
  ctx.drawCloud(dx, dy);
}
```

**After:**
```javascript
// Phaser camera + sprite depth
this.clouds = this.add.group();
this.clouds.setDepth(-10);
this.physics.world.enable(clouds);
clouds.setScrollFactor(0.3); // Parallax factor
```

#### 6.6 HUD/UI Layer
**Before:**
```html
<div id="hud-resources">...</div>
<div id="hud-xp">...</div>
```

**After:**
```javascript
// Create UIScene with fixed camera
// Or use Phaser UI plugin for fixed overlay
this.add.text(10, 10, resources).setDepth(1000);
```

#### 6.7 Animals (Dog, Chicken, Cow)
**Before:**
```javascript
// Animal class with manual position updates
update() {
  this.x += vx;
  this.y += vy;
  this.renderOnCanvas();
}
```

**After:**
```javascript
// Phaser sprite with tweens and physics
this.chicken = this.add.sprite(x, y, 'chicken-idle');
this.tweens.add({
  targets: this.chicken,
  x: targetX,
  y: targetY,
  duration: 2000,
  onUpdate: () => updateCollisions()
});
```

#### 6.8 Design Mode (Drag & Drop)
**Before:**
```javascript
// Manual drag detection and DOM manipulation
el.addEventListener('mousedown', dragStart);
document.addEventListener('mousemove', drag);
```

**After:**
```javascript
// Phaser drag plugin
this.input.setDraggable(tile);
this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
  gameObject.x = dragX;
  gameObject.y = dragY;
});
```

#### 6.9 Path Drawing Mode
**Before:**
```javascript
// Canvas line drawing with grid snapping
ctx.strokeStyle = 'brown';
ctx.lineTo(x, y);
```

**After:**
```javascript
// Phaser graphics object or tilemap
this.graphics = this.make.graphics({ x: 0, y: 0, add: true });
this.graphics.lineStyle(2, 0x8B4513);
this.graphics.lineBetween(x1, y1, x2, y2);
```

#### 6.10 Web Audio → Phaser Sound
**Before:**
```javascript
// Web Audio API context and oscillators
const osc = audioContext.createOscillator();
osc.frequency.value = freq;
osc.start();
```

**After:**
```javascript
// Phaser sound manager (requires audio files or Phaser audio synth plugin)
// OR keep Web Audio for procedural sounds
// (Phaser Sound is for pre-recorded audio primarily)
```

---

## Implementation Roadmap

### Step 1: Project Setup
- [ ] Install Phaser 3.x: `npm install phaser`
- [ ] Create `src/scenes/` directory
- [ ] Create `src/scenes/BootScene.js` for asset loading
- [ ] Create `src/scenes/MainScene.js` for game world
- [ ] Create `src/scenes/UIScene.js` for HUD
- [ ] Update `Game.js` to initialize Phaser.Game instead of manual canvas loop

### Step 2: Asset Preparation
- [ ] Export farmer animations to sprite sheet (or use existing canvas frame export)
- [ ] Create texture atlas JSON for farmer sprites
- [ ] Export crop sprites at all growth stages
- [ ] Export animal sprites
- [ ] Export UI elements as textures
- [ ] Create `assets/atlases/` for all sprite sheets

### Step 3: BootScene Implementation
- [ ] Create preload function loading all atlases
- [ ] Add loading progress bar
- [ ] Create texture atlases programmatically if needed
- [ ] Transition to MainScene

### Step 4: MainScene Implementation
- [ ] Set up isometric camera
- [ ] Create farm tile group with interactive sprites
- [ ] Implement FarmTile logic as sprite data/callbacks
- [ ] Add Farmer sprite with animations
- [ ] Implement plot click handling
- [ ] Connect Inventory state to visual updates

### Step 5: Gameplay Systems
- [ ] Growth timer system using Phaser.Time
- [ ] Energy system UI updates
- [ ] Crop state visualization (empty → digging → sprouting → growing → mature)
- [ ] Harvest mechanics
- [ ] Shop integration

### Step 6: Farmer Movement & Animation
- [ ] Create animated sprite for farmer
- [ ] Implement walk animation tweens
- [ ] Implement action animations (dig, plant, harvest)
- [ ] State machine for farmer behavior

### Step 7: Environmental Effects
- [ ] Parallax cloud layer with scrollFactor
- [ ] Dust particle emitter
- [ ] Light ray effects
- [ ] Mist/fog layer

### Step 8: Animals
- [ ] Dog sprite and animation
- [ ] Chicken sprite and animation
- [ ] Cow sprite and animation
- [ ] Movement AI/tweens

### Step 9: UI Layer
- [ ] Create UIScene for fixed HUD
- [ ] Resource display (gold, diamonds, XP)
- [ ] Energy bar
- [ ] Quest panel
- [ ] Shop UI
- [ ] Settings/modal overlays

### Step 10: Input & Interaction
- [ ] Plot clicking
- [ ] Design mode (drag & drop)
- [ ] Path drawing mode
- [ ] Menu navigation

### Step 11: Polish & Optimization
- [ ] Anti-gravity debug mode
- [ ] Zoom & pan camera
- [ ] Responsive scaling
- [ ] Performance optimization (sprite batch rendering)
- [ ] Audio integration

---

## Code Architecture in Phaser

### File Structure (Post-Conversion)
```
src/
├── main.js                 # Entry point, Phaser.Game init
├── config.js               # Phaser game config
├── scenes/
│   ├── BootScene.js        # Preload assets
│   ├── MainScene.js        # Game world (replaces Game.js mostly)
│   └── UIScene.js          # HUD overlay
├── gameObjects/
│   ├── FarmTile.js         # Phaser tile sprite wrapper
│   ├── FarmerSprite.js     # Farmer animated sprite
│   ├── AnimalSprite.js     # Dog, Chicken, Cow base class
│   └── ParticleEffects.js  # Dust, light rays, etc.
├── systems/
│   ├── Inventory.js        # Keep as-is (state management)
│   ├── InputManager.js     # Input event delegation
│   ├── AudioManager.js     # Sound effects
│   └── CameraManager.js    # Zoom, pan, parallax
└── data/
    ├── Seed.js             # Keep as-is
    ├── ItemCatalog.js      # Keep as-is
    └── constants.js        # Game constants
```

### Key Phaser Patterns to Use

#### 1. Scene Communication
```javascript
// MainScene emits event
this.events.emit('farmTileHarvested', cropType);

// UIScene listens
this.scene.get('MainScene').events.on('farmTileHarvested', (cropType) => {
  updateResourceUI();
});
```

#### 2. Data Objects
```javascript
// Store plot state in sprite data
tile.setData('id', plotId);
tile.setData('cropType', 'carrot');
tile.setData('growthDuration', 5000);

// Retrieve and update
const plot = tile.getData('cropType');
```

#### 3. Event Listeners for UI Updates
```javascript
// When crop matures, emit event
this.events.emit('cropMatured', { id, cropType });

// UIScene updates resources
this.scene.get('MainScene').events.on('cropMatured', (data) => {
  this.updateInventoryDisplay();
});
```

#### 4. Tweens for Animations
```javascript
// Farmer walking to plot
this.tweens.add({
  targets: farmer,
  x: targetX,
  y: targetY,
  duration: 1000,
  onComplete: () => {
    farmer.play('dig-animation');
  }
});
```

---

## Common Pitfalls & Solutions

### 1. Isometric Perspective
**Challenge:** Phaser is 2D orthographic by default; isometric needs custom z-index sorting
**Solution:** Use depth sorting or y-sort algorithm for proper stacking
```javascript
tiles.sort((a, b) => a.y - b.y); // Y-axis sorting for isometric feel
```

### 2. Canvas Sprite Animation
**Challenge:** Farmer animations drawn procedurally on canvas
**Solution:** Pre-render to sprite sheet or use Phaser's graphics for generation
```javascript
// Generate sprite sheet at runtime if needed
const bmd = this.make.renderTexture({ width: 256, height: 256 });
// Draw frames into RenderTexture, then use as texture
```

### 3. Parallax Background
**Challenge:** Manual offset calculation in canvas
**Solution:** Use Phaser Camera scrollFactor
```javascript
clouds.setScrollFactor(0.3); // Parallax at 30% camera movement
```

### 4. Responsive Scaling
**Challenge:** Game must scale to different window sizes maintaining 16:9
**Solution:** Use Phaser's SCALE config
```javascript
scale: {
  mode: Phaser.Scale.FIT,
  autoCenter: Phaser.Scale.CENTER_BOTH,
  width: 1280,
  height: 720
}
```

### 5. localStorage Persistence
**Challenge:** Seamlessly sync Phaser scene state with storage
**Solution:** Keep Inventory.js pure, call save/load at scene transitions
```javascript
shutdown() {
  Inventory.save(this.gameState);
}

create() {
  this.gameState = Inventory.load();
}
```

---

## Migration Checklist

- [ ] Install Phaser 3.x via npm
- [ ] Create BootScene with asset preloading
- [ ] Create MainScene as primary game world
- [ ] Convert farmer animation to Phaser sprites
- [ ] Convert farm tile grid to sprite group
- [ ] Implement plot click handling via Phaser input
- [ ] Migrate growth timers to Phaser.Time
- [ ] Add parallax effect using scrollFactor
- [ ] Create UIScene for HUD
- [ ] Convert animal movement to tweens
- [ ] Implement drag & drop for design mode
- [ ] Add particle effects
- [ ] Test responsiveness on multiple screen sizes
- [ ] Optimize performance (sprite batching, etc.)
- [ ] Test on mobile/touch devices

---

## Resources

- **Phaser Docs:** https://photonstorm.github.io/phaser3-docs/
- **Phaser Examples:** https://phaser.io/examples
- **Sprite Sheet Format:** Use TextureAtlas JSON or Aseprite export
- **Camera & Zoom:** Phaser.Cameras.Scene2D.Camera
- **Input Handling:** Phaser.Input.InputPlugin
- **Tweens & Timers:** Phaser.Tweens.TweenManager

---

## Notes

1. **Keep Inventory.js unchanged** if possible—it's pure data, not rendering
2. **Web Audio API** for procedural sounds can coexist with Phaser Sound
3. **localStorage** integration stays the same—just call from scene lifecycle
4. **Express backend** needs no changes, keep API calls identical
5. **Consider using Phaser Scene plugins** for custom managers (AudioManager, InputManager)
6. **Test performance** with 28 tiles before adding complex effects
7. **Mobile touch input** works out-of-box with Phaser.Input

