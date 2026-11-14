// Sample catalogue: 10 dental products across 5 categories / 9 subcategories,
// each with a generated image; 5 of them have sub-products (also with images).
// Safe to re-run: categories, subcategories and products are matched by code
// and skipped when they already exist.
//
//   node prisma/seed-sample-products.js
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const prisma = require('../src/services/prisma');

const UPLOADS = path.join(__dirname, '../uploads');

const CATEGORIES = [
  {
    code: 'CAT101',
    name: 'Restorative',
    color: ['#2563eb', '#1e3a8a'],
    subs: [
      { code: 'SUB101', name: 'Composites' },
      { code: 'SUB102', name: 'Bonding Agents' },
      { code: 'SUB103', name: 'Cements' },
    ],
  },
  {
    code: 'CAT102',
    name: 'Endodontics',
    color: ['#16a34a', '#14532d'],
    subs: [
      { code: 'SUB104', name: 'Rotary Files' },
      { code: 'SUB105', name: 'Obturation' },
    ],
  },
  {
    code: 'CAT103',
    name: 'Infection Control',
    color: ['#0891b2', '#164e63'],
    subs: [
      { code: 'SUB106', name: 'Gloves' },
      { code: 'SUB107', name: 'Disinfectants' },
    ],
  },
  {
    code: 'CAT104',
    name: 'Instruments',
    color: ['#7c3aed', '#3b0764'],
    subs: [
      { code: 'SUB108', name: 'Hand Instruments' },
      { code: 'SUB109', name: 'Burs' },
    ],
  },
  {
    code: 'CAT105',
    name: 'Impression Materials',
    color: ['#ea580c', '#7c2d12'],
    subs: [{ code: 'SUB110', name: 'Alginate' }],
  },
];

// unit = UnitOfMeasure name (must exist); subs = sub-products
const PRODUCTS = [
  {
    code: 'PRS001',
    name: 'Nano-Hybrid Composite Syringe Kit',
    generic: 'Light-cure resin composite',
    category: 'CAT101',
    sub: 'SUB101',
    unit: 'Box',
    sellPrice: 4200,
    ecommercePrice: 4500,
    description: 'Universal nano-hybrid composite for anterior and posterior restorations. 4 g syringes.',
    subs: [
      { name: 'Shade A1', sellPrice: 1150, ecommercePrice: 1250 },
      { name: 'Shade A2', sellPrice: 1150, ecommercePrice: 1250 },
      { name: 'Shade A3', sellPrice: 1150, ecommercePrice: 1250 },
    ],
  },
  {
    code: 'PRS002',
    name: 'Universal Bonding Agent 5ml',
    generic: 'Single-component adhesive',
    category: 'CAT101',
    sub: 'SUB102',
    unit: 'Piece',
    sellPrice: 2600,
    ecommercePrice: 2850,
    description: 'Self-etch / total-etch universal adhesive, 5 ml bottle.',
  },
  {
    code: 'PRS003',
    name: 'Glass Ionomer Luting Cement',
    generic: 'Glass ionomer cement',
    category: 'CAT101',
    sub: 'SUB103',
    unit: 'Pack',
    sellPrice: 1800,
    ecommercePrice: 1950,
    description: 'Powder 35 g + liquid 25 ml for crowns, bridges and orthodontic bands.',
  },
  {
    code: 'PRS004',
    name: 'NiTi Rotary File Set',
    generic: 'Nickel-titanium endodontic files',
    category: 'CAT102',
    sub: 'SUB104',
    unit: 'Pack',
    sellPrice: 3400,
    ecommercePrice: 3700,
    description: 'Heat-treated NiTi rotary files, 6 files per pack, sizes SX–F3.',
    subs: [
      { name: '21 mm', sellPrice: 3300, ecommercePrice: 3600 },
      { name: '25 mm', sellPrice: 3400, ecommercePrice: 3700 },
      { name: '31 mm', sellPrice: 3600, ecommercePrice: 3900 },
    ],
  },
  {
    code: 'PRS005',
    name: 'Gutta Percha Points',
    generic: 'Gutta percha',
    category: 'CAT102',
    sub: 'SUB105',
    unit: 'Box',
    sellPrice: 650,
    ecommercePrice: 720,
    description: 'Color-coded ISO gutta percha points, 120 points per box.',
    subs: [
      { name: '#15–40 Assorted', sellPrice: 650, ecommercePrice: 720 },
      { name: '#45–80 Assorted', sellPrice: 700, ecommercePrice: 780 },
    ],
  },
  {
    code: 'PRS006',
    name: 'Nitrile Examination Gloves',
    generic: 'Powder-free nitrile gloves',
    category: 'CAT103',
    sub: 'SUB106',
    unit: 'Box',
    sellPrice: 850,
    ecommercePrice: 950,
    description: 'Powder-free, latex-free nitrile gloves, 100 pcs per box.',
    subs: [
      { name: 'Small', sellPrice: 850, ecommercePrice: 950 },
      { name: 'Medium', sellPrice: 850, ecommercePrice: 950 },
      { name: 'Large', sellPrice: 850, ecommercePrice: 950 },
    ],
  },
  {
    code: 'PRS007',
    name: 'Surface Disinfectant Spray 1L',
    generic: 'Alcohol-based disinfectant',
    category: 'CAT103',
    sub: 'SUB107',
    unit: 'Liter',
    sellPrice: 1100,
    ecommercePrice: 1200,
    description: 'Fast-acting alcohol-based disinfectant for dental chairs and surfaces.',
  },
  {
    code: 'PRS008',
    name: 'Dental Mirror Set (12 pcs)',
    generic: 'Mouth mirrors with handles',
    category: 'CAT104',
    sub: 'SUB108',
    unit: 'Pack',
    sellPrice: 1500,
    ecommercePrice: 1650,
    description: 'Front-surface mouth mirrors #5 with stainless steel autoclavable handles.',
  },
  {
    code: 'PRS009',
    name: 'Diamond Bur Assortment',
    generic: 'FG diamond burs',
    category: 'CAT104',
    sub: 'SUB109',
    unit: 'Pack',
    sellPrice: 900,
    ecommercePrice: 1000,
    description: 'Friction-grip diamond burs for high-speed handpieces, 10 per pack.',
    subs: [
      { name: 'Round', sellPrice: 900, ecommercePrice: 1000 },
      { name: 'Flame', sellPrice: 950, ecommercePrice: 1050 },
      { name: 'Tapered', sellPrice: 950, ecommercePrice: 1050 },
    ],
  },
  {
    code: 'PRS010',
    name: 'Alginate Impression Material 500g',
    generic: 'Irreversible hydrocolloid',
    category: 'CAT105',
    sub: 'SUB110',
    unit: 'Pack',
    sellPrice: 750,
    ecommercePrice: 820,
    description: 'Dust-free, chromatic alginate with mint flavor, 500 g bag.',
  },
];

const escapeXml = (s) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

// Wrap a title into lines of at most ~18 characters
const wrap = (text, max = 18) => {
  const lines = [];
  let line = '';
  text.split(' ').forEach((word) => {
    if ((`${line} ${word}`).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 3);
};

let lastStamp = 0;
const uniqueStamp = () => {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
};

// Render a simple branded card (gradient, tooth icon, title, subtitle) to
// uploads/<folder>/image-<ts>.webp, and return the path stored in the DB,
// in the same form as uploadImage().
const makeImage = async (folder, title, subtitle, [c1, c2]) => {
  const lines = wrap(title);
  const startY = 400 - (lines.length - 1) * 24;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="300" cy="200" r="110" fill="#ffffff" opacity="0.15"/>
  <path d="M255 140c-30 0-50 22-50 55 0 30 12 50 20 80 8 30 12 60 28 60 14 0 16-40 32-40h30c16 0 18 40 32 40 16 0 20-30 28-60 8-30 20-50 20-80 0-33-20-55-50-55-20 0-30 10-45 10s-25-10-45-10z"
        fill="#ffffff" transform="translate(0,-10)"/>
  ${lines
    .map(
      (l, i) =>
        `<text x="300" y="${startY + i * 48}" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(l)}</text>`,
    )
    .join('\n  ')}
  <text x="300" y="${startY + lines.length * 48 + 20}" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#ffffff" opacity="0.85" text-anchor="middle">${escapeXml(subtitle)}</text>
</svg>`;
  const dir = path.join(UPLOADS, folder);
  await fs.mkdir(dir, { recursive: true });
  const filename = `image-${uniqueStamp()}.webp`;
  await sharp(Buffer.from(svg)).webp({ quality: 80 }).toFile(path.join(dir, filename));
  return path.join('uploads', folder, filename);
};

const main = async () => {
  const units = await prisma.unitOfMeasure.findMany();
  const unitId = (name) => {
    const u = units.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!u) throw new Error(`Unit of measure "${name}" not found`);
    return u.id;
  };

  const catIds = {};
  const subIds = {};
  const catColor = {};
  for (const cat of CATEGORIES) {
    catColor[cat.code] = cat.color;
    let category = await prisma.category.findUnique({ where: { code: cat.code } });
    if (!category) {
      category = await prisma.category.create({
        data: {
          code: cat.code,
          name: cat.name,
          image: await makeImage('category_images', cat.name, 'Category', cat.color),
        },
      });
      console.log(`+ category ${cat.code} ${cat.name}`);
    }
    catIds[cat.code] = category.id;

    for (const sub of cat.subs) {
      let subCategory = await prisma.subCategory.findUnique({ where: { code: sub.code } });
      if (!subCategory) {
        subCategory = await prisma.subCategory.create({
          data: {
            code: sub.code,
            name: sub.name,
            categoryId: category.id,
            image: await makeImage('subcategory_images', sub.name, cat.name, cat.color),
          },
        });
        console.log(`  + subcategory ${sub.code} ${sub.name}`);
      }
      subIds[sub.code] = subCategory.id;
    }
  }

  for (const p of PRODUCTS) {
    if (await prisma.product.findUnique({ where: { productCode: p.code } })) {
      console.log(`= product ${p.code} already exists, skipped`);
      continue;
    }
    const color = catColor[p.category];
    const imageUrl = await makeImage('product_images', p.name, p.generic, color);
    const subProducts = [];
    for (const [i, s] of (p.subs || []).entries()) {
      subProducts.push({
        name: s.name,
        subProductCode: `${p.code}-SUB-${String(i + 1).padStart(3, '0')}`,
        sellPrice: s.sellPrice,
        ecommercePrice: s.ecommercePrice,
        imageUrl: await makeImage('subproduct_images', p.name, s.name, color),
      });
    }

    await prisma.product.create({
      data: {
        productCode: p.code,
        name: p.name,
        generic: p.generic,
        description: p.description,
        categoryId: catIds[p.category],
        subCategoryId: subIds[p.sub],
        unitOfMeasureId: unitId(p.unit),
        sellPrice: p.sellPrice,
        ecommercePrice: p.ecommercePrice,
        warningQuantity: 5,
        imageUrl,
        ...(subProducts.length && { subProducts: { create: subProducts } }),
      },
    });
    console.log(`+ product ${p.code} ${p.name}${subProducts.length ? ` (${subProducts.length} sub-products)` : ''}`);
  }
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
