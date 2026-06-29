// --- Crops Configuration ---
export const CROP_CONFIGS = {
    carrot: {
        name: 'Carrot',
        nameVi: 'Cà rốt',
        icon: '🥕',
        growthTime: 370, // seconds (10s + 3m/stage * 2 stages)
        seedCost: 10,
        cropValue: 38,
        xpReward: 5
    },
    corn: {
        name: 'Corn',
        nameVi: 'Ngô',
        icon: '🌽',
        growthTime: 30, // seconds
        seedCost: 20,
        cropValue: 83,
        xpReward: 12
    },
    tomato: {
        name: 'Tomato',
        nameVi: 'Cà chua',
        icon: '🍅',
        growthTime: 60, // seconds
        seedCost: 40,
        cropValue: 165,
        xpReward: 25
    },
    pumpkin: {
        name: 'Pumpkin',
        nameVi: 'Bí ngô',
        icon: '🎃',
        growthTime: 120, // seconds
        seedCost: 80,
        cropValue: 360,
        xpReward: 55
    }
};
