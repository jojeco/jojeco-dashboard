import db from './database.js';

await db.init(); // Initialize database

const spools = [
  { brand: 'Bambu Lab', type: 'PETG Basic', color_name: 'Dark Brown', sku: 'G00-N00-1.75-1000-SPLFREE', qty: 1 },
  { brand: 'Bambu Lab', type: 'PLA Matte', color_name: 'Nardo Gray', sku: 'A01-D0-1.75-1000-SPLFREE', qty: 1 },
  { brand: 'Bambu Lab', type: 'PLA Matte', color_name: 'Dark Red', sku: 'A01-R4-1.75-1000-SPLFREE', qty: 1 },
  { brand: 'Bambu Lab', type: 'PETG Basic', color_name: 'Gray', sku: 'G00-D00-1.75-1000-SPLFREE', qty: 2 },
  { brand: 'Bambu Lab', type: 'PLA Matte', color_name: 'Dark Blue', sku: 'A01-B6-1.75-1000-SPLFREE', qty: 2 },
  { brand: 'Bambu Lab', type: 'PLA Matte', color_name: 'Dark Brown', sku: 'A01-N2-1.75-1000-SPLFREE', qty: 2 },
  { brand: 'Bambu Lab', type: 'PLA Matte', color_name: 'Marine Blue', sku: 'A01-B3-1.75-1000-SPLFREE', qty: 1 },
  { brand: 'Bambu Lab', type: 'PLA Matte', color_name: 'Charcoal', sku: 'A01-K1-1.75-1000-SPLFREE', qty: 1 }, // 2 used, 1 remaining
  { brand: 'Bambu Lab', type: 'PLA Matte', color_name: 'Charcoal', sku: 'A01-K1-1.75-1000-SPLFREE', qty: 2, status: 'empty', weight_remaining_g: 0 },
  { brand: 'Bambu Lab', type: 'PLA Matte', color_name: 'Dark Green', sku: 'A01-G7-1.75-1000-SPLFREE', qty: 2 },
  { brand: 'Bambu Lab', type: 'PLA Matte', color_name: 'Ivory White', sku: 'A01-W2-1.75-1000-SPLFREE', qty: 2 },
  { brand: 'Bambu Lab', type: 'PLA Matte', color_name: 'Apple Green', sku: 'A01-G0-1.75-1000-SPLFREE', qty: 1 },
  { brand: 'Bambu Lab', type: 'PLA Matte', color_name: 'Plum', sku: 'A01-R3-1.75-1000-SPLFREE', qty: 1 },
  { brand: 'Bambu Lab', type: 'PETG Basic', color_name: 'Black', sku: 'G00-K00-1.75-1000-SPLFREE', qty: 1 },
  { brand: 'Bambu Lab', type: 'PLA Matte', color_name: 'Sky Blue', sku: 'A01-B0-1.75-1000-SPLFREE', qty: 1 },
  { brand: 'Bambu Lab', type: 'PLA Basic', color_name: 'Cyan', sku: 'A00-B8-1.75-1000-SPLFREE', qty: 1 },
  { brand: 'Bambu Lab', type: 'PLA Basic', color_name: 'Gold', sku: 'A00-Y4-1.75-1000-SPLFREE', qty: 1 },
  { brand: 'Bambu Lab', type: 'PLA Basic', color_name: 'Red', sku: 'A00-R0-1.75-1000-SPLFREE', qty: 1 },
  { brand: 'Bambu Lab', type: 'PLA Basic', color_name: 'Jade White', sku: 'A00-W1-1.75-1000-SPLFREE', qty: 1 },
];

const insertStmt = db.prepare(`
  INSERT INTO filament_spools (brand, type, color_name, sku, weight_initial_g, weight_remaining_g, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const now = Date.now();
let count = 0;

for (const def of spools) {
  for (let i = 0; i < def.qty; i++) {
    const status = def.status || 'active';
    const remaining = def.weight_remaining_g !== undefined ? def.weight_remaining_g : 1000;
    insertStmt.run(def.brand, def.type, def.color_name, def.sku, 1000, remaining, status, now, now);
    count++;
  }
}

console.log(`Inserted ${count} spools.`);
db.close();
