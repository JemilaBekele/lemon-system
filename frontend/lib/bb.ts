import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { IProduct } from '@/models/Product';

// Stock columns shared by the Excel and CSV exports
const round2 = (value: number) => Math.round(value * 100) / 100;

const stockColumns = (product: IProduct) => {
  const summary = product.stockSummary;
  const totalStock = summary?.totalStock ?? 0;
  const sellPrice = Number(product.sellPrice) || 0;
  return {
    'Store Stock': summary?.totalStoreStock ?? 0,
    'Shop Stock': summary?.totalShopStock ?? 0,
    'Total Stock': totalStock,
    'Stock Value': round2(totalStock * sellPrice)
  };
};

// Column groups the user can tick in the export dialog, in sheet order.
// "Qty per store" / "Qty per shop" expand to one column per location.
export const PRODUCT_EXPORT_COLUMNS = [
  { key: 'id', label: 'Product ID' },
  { key: 'code', label: 'Product Code' },
  { key: 'name', label: 'Name' },
  { key: 'generic', label: 'Generic Name' },
  { key: 'description', label: 'Description' },
  { key: 'category', label: 'Category' },
  { key: 'unit', label: 'Unit' },
  { key: 'sellPrice', label: 'Sell Price' },
  { key: 'additionalPrices', label: 'Additional Prices' },
  { key: 'qty', label: 'Qty' },
  { key: 'storeStock', label: 'Store Stock' },
  { key: 'shopStock', label: 'Shop Stock' },
  { key: 'stockValue', label: 'Stock Value' },
  { key: 'perStore', label: 'Qty per store' },
  { key: 'perShop', label: 'Qty per shop' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created Date' },
  { key: 'updatedAt', label: 'Updated Date' }
] as const;

export type TProductExportColumn = (typeof PRODUCT_EXPORT_COLUMNS)[number]['key'];

export type TProductExportOptions = {
  columns?: TProductExportColumn[]; // default: all
  includeOutOfStock?: boolean; // default: true
};

// "Recommended: 300 (Lemon, Nuna); Sub A - XX: 275". Rows for several shops
// with the same label and price are merged; no shop means all shops.
const formatAdditionalPrices = (product: IProduct) => {
  const subNames = new Map(
    (product.subProducts || []).map((sub) => [sub.id, sub.name])
  );
  const groups = new Map<string, { text: string; shops: string[]; allShops: boolean }>();
  (product.AdditionalPrice || []).forEach((price) => {
    const subName = price.subProductId ? subNames.get(price.subProductId) : '';
    const label = `${subName ? `${subName} - ` : ''}${price.label || 'Price'}`;
    const text = `${label}: ${Number(price.price) || 0}`;
    const group = groups.get(text) || { text, shops: [], allShops: false };
    if (price.shop?.name) group.shops.push(price.shop.name);
    else group.allShops = true;
    groups.set(text, group);
  });
  return [...groups.values()]
    .map((group) =>
      group.allShops || group.shops.length === 0
        ? group.text
        : `${group.text} (${group.shops.join(', ')})`
    )
    .join('; ');
};

export const exportToExcel = (
  allData: IProduct[],
  filename: string = 'products',
  options: TProductExportOptions = {}
) => {
  const selected = new Set<TProductExportColumn>(
    options.columns ?? PRODUCT_EXPORT_COLUMNS.map((column) => column.key)
  );
  const data =
    options.includeOutOfStock === false
      ? allData.filter((p) => (p.stockSummary?.totalStock ?? 0) > 0)
      : allData;
  if (data.length === 0 || selected.size === 0) return false;

  // Every store / shop that appears in the data gets its own quantity column
  const storeNames = Array.from(
    new Set(data.flatMap((p) => Object.keys(p.stockSummary?.storeStocks || {})))
  ).sort();
  const shopNames = Array.from(
    new Set(data.flatMap((p) => Object.keys(p.stockSummary?.shopStocks || {})))
  ).sort();

  // Numeric columns that get a total
  const summed: string[] = [];

  const excelData: Record<string, string | number>[] = data.map((product) => {
    const summary = product.stockSummary;
    const totalStock = summary?.totalStock ?? 0;
    const unit = product.unitOfMeasure;
    const row: Record<string, string | number> = {};
    const add = (key: TProductExportColumn, label: string, value: string | number) => {
      if (selected.has(key)) row[label] = value;
    };
    add('id', 'Product ID', product.id);
    add('code', 'Product Code', product.productCode);
    add('name', 'Name', product.name);
    add('generic', 'Generic Name', product.generic || '');
    add('description', 'Description', product.description || '');
    add('category', 'Category', product.category?.name || '');
    add(
      'unit',
      'Unit',
      unit ? `${unit.name}${unit.symbol ? ` (${unit.symbol})` : ''}` : ''
    );
    add('sellPrice', 'Sell Price', Number(product.sellPrice) || 0);
    add('additionalPrices', 'Additional Prices', formatAdditionalPrices(product));
    add('qty', 'Qty', totalStock);
    add('storeStock', 'Store Stock', summary?.totalStoreStock ?? 0);
    add('shopStock', 'Shop Stock', summary?.totalShopStock ?? 0);
    add(
      'stockValue',
      'Stock Value',
      round2(totalStock * (Number(product.sellPrice) || 0))
    );
    if (selected.has('perStore')) {
      storeNames.forEach((name) => {
        row[`Store: ${name}`] = summary?.storeStocks?.[name]?.quantity ?? 0;
      });
    }
    if (selected.has('perShop')) {
      shopNames.forEach((name) => {
        row[`Shop: ${name}`] = summary?.shopStocks?.[name]?.quantity ?? 0;
      });
    }
    add('status', 'Status', product.isActive ? 'Active' : 'Inactive');
    add('createdAt', 'Created Date', new Date(product.createdAt).toLocaleDateString());
    add('updatedAt', 'Updated Date', new Date(product.updatedAt).toLocaleDateString());
    return row;
  });

  const header = Object.keys(excelData[0]);
  summed.push(
    ...header.filter(
      (key) =>
        ['Qty', 'Store Stock', 'Shop Stock', 'Stock Value'].includes(key) ||
        key.startsWith('Store: ') ||
        key.startsWith('Shop: ')
    )
  );

  // Totals row, labelled in the first text column
  if (summed.length > 0) {
    const totalsRow: Record<string, string | number> = {};
    const labelColumn = header.find((key) => !summed.includes(key));
    if (labelColumn) totalsRow[labelColumn] = 'TOTAL';
    summed.forEach((key) => {
      const total = excelData.reduce(
        (sum, row) => sum + (Number(row[key]) || 0),
        0
      );
      totalsRow[key] = key === 'Stock Value' ? round2(total) : total;
    });
    excelData.push(totalsRow);
  }

  const worksheet = XLSX.utils.json_to_sheet(excelData, { header });

  // Create workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
  
  // Generate Excel file
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  // Download file
  saveAs(blob, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  return true;
};

export const exportToCSV = (data: IProduct[], filename: string = 'products') => {
  const excelData = data.map(product => ({
    'Product ID': product.id,
    'Product Code': product.productCode,
    'Name': product.name,
    'Generic Name': product.generic || '',
    'Category': product.category?.name || '',
    'Sell Price': Number(product.sellPrice) || 0,
    ...stockColumns(product),
    'Status': product.isActive ? 'Active' : 'Inactive',
  }));

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
};