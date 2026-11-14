'use client';

// Price Update page, kept to one screen:
//   1. find prices (search, price type, shop)
//   2. tick rows (or none = every row shown) and raise / lower them by a %
//      — or type a new price straight into the row
//   3. Save. Nothing is saved before that; changed prices are highlighted.
//   4. "Sync prices to e-commerce" sends the saved e-commerce prices online.
// Prices show one per row, or all of a product's (or variant's) prices on
// one row; the choice is remembered in this browser.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { IProduct } from '@/models/Product';
import { IShop } from '@/models/shop';
import {
  getAllProducts,
  syncEcommercePrices,
  TPriceChange,
  updatePrices
} from '@/service/Product';
import { getShops } from '@/service/shop';
import { useDataVersion } from '@/lib/data-version';
import {
  Globe,
  LayoutList,
  Minus,
  Plus,
  RefreshCw,
  Rows3,
  Save,
  Search,
  X
} from 'lucide-react';

type TKind = TPriceChange['kind'];

// One editable price: a product sell price, a product / variant e-commerce
// price, or an additional price. Variants have no sell price of their own.
type TPriceRow = {
  key: string;
  kind: TKind;
  id: string;
  // The product or variant the price belongs to (one row in "per product")
  groupKey: string;
  productName: string;
  productCode: string;
  subProductName: string;
  label: string; // "Sell price", "E-commerce price" or an additional price's label
  shopId: string | null; // additional prices only; null = all shops
  shopName: string;
  oldPrice: number | null;
};

type TPriceGroup = {
  key: string;
  productName: string;
  productCode: string;
  subProductName: string;
  rows: TPriceRow[];
};

type TPriceType = 'all' | 'sell' | 'ecommerce' | 'additional';
type TLayout = 'price' | 'product';

const isEcommerce = (kind: TKind) =>
  kind === 'ecommerceProduct' || kind === 'ecommerceSubProduct';

const ANY_SHOP = 'any';
const ALL_SHOP_PRICES = 'all-shops'; // additional prices without a shop
const PAGE_SIZE = 50;
const LAYOUT_KEY = 'price-update-layout';

const round2 = (value: number) => Math.round(value * 100) / 100;

const formatPrice = (value: number | null) =>
  value === null
    ? 'Not set'
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

const toPrice = (value: unknown) =>
  value === null || value === undefined || value === '' ? null : Number(value);

const readLayout = (): TLayout => {
  try {
    return window.localStorage.getItem(LAYOUT_KEY) === 'product'
      ? 'product'
      : 'price';
  } catch {
    return 'price';
  }
};

// A product's prices first, then each variant's, so they stay together
const buildRows = (products: IProduct[], shopNames: Map<string, string>) => {
  const rows: TPriceRow[] = [];
  products.forEach((product) => {
    const base = {
      productName: product.name,
      productCode: product.productCode || ''
    };
    const additional = product.AdditionalPrice || [];
    const additionalRow = (price: (typeof additional)[number], sub = '') => ({
      ...base,
      key: `additional|${price.id}`,
      kind: 'additional' as const,
      id: price.id,
      groupKey: price.subProductId
        ? `sub|${price.subProductId}`
        : `product|${product.id}`,
      subProductName: sub,
      label: price.label || 'Price',
      shopId: price.shopId || null,
      shopName: price.shopId
        ? price.shop?.name || shopNames.get(price.shopId) || 'Shop'
        : 'All shops',
      oldPrice: Number(price.price) || 0
    });

    const productGroup = `product|${product.id}`;
    rows.push({
      ...base,
      key: `product|${product.id}`,
      kind: 'product',
      id: product.id,
      groupKey: productGroup,
      subProductName: '',
      label: 'Sell price',
      shopId: null,
      shopName: '',
      oldPrice: toPrice(product.sellPrice)
    });
    rows.push({
      ...base,
      key: `ecommerceProduct|${product.id}`,
      kind: 'ecommerceProduct',
      id: product.id,
      groupKey: productGroup,
      subProductName: '',
      label: 'E-commerce price',
      shopId: null,
      shopName: '',
      oldPrice: toPrice(product.ecommercePrice)
    });
    additional
      .filter((price) => !price.subProductId)
      .forEach((price) => rows.push(additionalRow(price)));

    (product.subProducts || []).forEach((sub) => {
      rows.push({
        ...base,
        key: `ecommerceSubProduct|${sub.id}`,
        kind: 'ecommerceSubProduct',
        id: sub.id,
        groupKey: `sub|${sub.id}`,
        subProductName: sub.name,
        label: 'E-commerce price',
        shopId: null,
        shopName: '',
        oldPrice: toPrice(sub.ecommercePrice)
      });
      additional
        .filter((price) => price.subProductId === sub.id)
        .forEach((price) => rows.push(additionalRow(price, sub.name)));
    });
  });
  return rows;
};

const groupRows = (rows: TPriceRow[]): TPriceGroup[] => {
  const groups = new Map<string, TPriceGroup>();
  rows.forEach((row) => {
    let group = groups.get(row.groupKey);
    if (!group) {
      group = {
        key: row.groupKey,
        productName: row.productName,
        productCode: row.productCode,
        subProductName: row.subProductName,
        rows: []
      };
      groups.set(row.groupKey, group);
    }
    group.rows.push(row);
  });
  return [...groups.values()];
};

function ProductName({
  name,
  subName,
  code
}: {
  name: string;
  subName: string;
  code: string;
}) {
  return (
    <>
      <div className='font-medium'>
        {name}
        {subName && (
          <span className='text-muted-foreground font-normal'> · {subName}</span>
        )}
      </div>
      {code && <div className='text-muted-foreground text-xs'>{code}</div>}
    </>
  );
}

export default function PriceUpdatePage() {
  const dataVersion = useDataVersion();
  const [products, setProducts] = useState<IProduct[] | null>(null);
  const [shops, setShops] = useState<IShop[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [layout, setLayoutState] = useState<TLayout>(readLayout);

  // Find
  const [search, setSearch] = useState('');
  const [priceType, setPriceType] = useState<TPriceType>('all');
  const [shopFilter, setShopFilter] = useState(ANY_SHOP);

  // Percent change
  const [percent, setPercent] = useState('');

  // Ticked prices and typed new prices (strings, so a box can be blank)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAllProducts({ page: 1, limit: 100000 }), getShops()])
      .then(([productResult, shopList]) => {
        if (cancelled) return;
        setProducts(productResult.products);
        setShops(shopList || []);
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dataVersion, reloadKey]);

  const setLayout = (next: TLayout) => {
    setLayoutState(next);
    setPage(1);
    try {
      window.localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Not remembered; the page still works
    }
  };

  const shopNames = useMemo(
    () => new Map(shops.map((shop) => [shop.id, shop.name])),
    [shops]
  );

  const rows = useMemo(
    () => (products ? buildRows(products, shopNames) : []),
    [products, shopNames]
  );

  const newPriceOf = useCallback(
    (row: TPriceRow): number | null => {
      const draft = drafts[row.key];
      if (draft === undefined || draft.trim() === '') return null;
      const value = Number(draft);
      return Number.isFinite(value) && value >= 0 ? round2(value) : null;
    },
    [drafts]
  );

  const isChanged = useCallback(
    (row: TPriceRow) => {
      const next = newPriceOf(row);
      return next !== null && next !== row.oldPrice;
    },
    [newPriceOf]
  );

  const shownRows = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((row) => {
      if (priceType === 'sell' && row.kind !== 'product') return false;
      if (priceType === 'ecommerce' && !isEcommerce(row.kind)) return false;
      if (priceType === 'additional' && row.kind !== 'additional') return false;
      if (shopFilter !== ANY_SHOP) {
        // Shop filter only narrows additional prices; sell prices have no shop
        if (row.kind !== 'additional') return false;
        const rowShop = row.shopId ?? ALL_SHOP_PRICES;
        if (rowShop !== shopFilter) return false;
      }
      if (words.length > 0) {
        const text =
          `${row.productName} ${row.productCode} ${row.subProductName} ${row.label}`.toLowerCase();
        if (!words.every((word) => text.includes(word))) return false;
      }
      return true;
    });
  }, [rows, search, priceType, shopFilter]);

  const shownGroups = useMemo(() => groupRows(shownRows), [shownRows]);

  // Back to page 1 and nothing ticked whenever the list changes
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [search, priceType, shopFilter]);

  const changes: TPriceChange[] = useMemo(
    () =>
      rows.filter(isChanged).map((row) => ({
        kind: row.kind,
        id: row.id,
        oldPrice: row.oldPrice,
        newPrice: newPriceOf(row) as number
      })),
    [rows, isChanged, newPriceOf]
  );

  const hasInvalid = useMemo(
    () =>
      Object.values(drafts).some((value) => {
        if (value.trim() === '') return false;
        const n = Number(value);
        return !Number.isFinite(n) || n < 0;
      }),
    [drafts]
  );

  // Pages count prices, or products when one row holds a product's prices
  const itemCount =
    layout === 'product' ? shownGroups.length : shownRows.length;
  const pageCount = Math.max(1, Math.ceil(itemCount / PAGE_SIZE));
  const pageSlice = <T,>(list: T[]) =>
    list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageRows = layout === 'price' ? pageSlice(shownRows) : [];
  const pageGroups = layout === 'product' ? pageSlice(shownGroups) : [];
  const pagePriceKeys =
    layout === 'product'
      ? pageGroups.flatMap((group) => group.rows.map((row) => row.key))
      : pageRows.map((row) => row.key);
  const allPageTicked =
    pagePriceKeys.length > 0 && pagePriceKeys.every((key) => selected.has(key));

  // Ticked prices, or every price shown when none is ticked
  const targetRows =
    selected.size > 0
      ? shownRows.filter((row) => selected.has(row.key))
      : shownRows;

  const changeByPercent = (direction: 1 | -1) => {
    const value = Number(percent);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Type a percent first, e.g. 10');
      return;
    }
    if (direction === -1 && value >= 100) {
      toast.error('A decrease must be less than 100%');
      return;
    }
    const factor = 1 + (direction * value) / 100;
    // A price that isn't set yet has nothing to scale
    const targets = targetRows.filter((row) => row.oldPrice !== null);
    if (targets.length === 0) {
      toast.error('No prices to change');
      return;
    }
    setDrafts((prev) => {
      const next = { ...prev };
      targets.forEach((row) => {
        next[row.key] = String(round2((row.oldPrice as number) * factor));
      });
      return next;
    });
  };

  const toggleKeys = (keys: string[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => (checked ? next.add(key) : next.delete(key)));
      return next;
    });
  };

  const undoDraft = (key: string) =>
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  // Unsaved e-commerce prices would not be sent: save them first
  const unsavedEcommerce = changes.some((change) => isEcommerce(change.kind));

  const handleSync = async () => {
    if (unsavedEcommerce) {
      toast.error('Save your e-commerce price changes first');
      return;
    }
    setIsSyncing(true);
    try {
      const result = await syncEcommercePrices();
      const notLinked = result.data?.notLinked ?? 0;
      toast.success(result.message || 'E-commerce prices synced', {
        description: notLinked
          ? `${notLinked} item(s) are not in the e-commerce shop yet: run "Sync from stock" there first.`
          : undefined
      });
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || 'Failed to sync prices to e-commerce';
      toast.error(message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSave = async () => {
    if (hasInvalid) {
      toast.error('Some new prices are not valid numbers');
      return;
    }
    if (changes.length === 0) return;
    setIsSaving(true);
    try {
      const result = await updatePrices(changes);
      toast.success(result.message || 'Prices updated');
      setDrafts({});
      setSelected(new Set());
      setReloadKey((k) => k + 1);
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || 'Failed to update prices';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  // The new-price box with its % change and undo, used by both layouts
  const priceInput = (row: TPriceRow) => {
    const next = newPriceOf(row);
    const changed = isChanged(row);
    const draft = drafts[row.key];
    const invalid = draft !== undefined && draft.trim() !== '' && next === null;
    const diff =
      changed && row.oldPrice
        ? (((next as number) - row.oldPrice) / row.oldPrice) * 100
        : null;
    return (
      <div className='flex items-center gap-2'>
        <Input
          type='number'
          min='0'
          step='0.01'
          value={draft ?? ''}
          placeholder={row.oldPrice === null ? 'Set price' : String(row.oldPrice)}
          onChange={(e) =>
            setDrafts((prev) => ({ ...prev, [row.key]: e.target.value }))
          }
          onWheel={(e) => e.currentTarget.blur()}
          aria-label={`New ${row.label.toLowerCase()} for ${row.productName}`}
          className={`h-8 w-28 ${invalid ? 'border-destructive' : ''} ${
            changed ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' : ''
          }`}
        />
        {diff !== null && (
          <span
            className={`text-xs whitespace-nowrap ${
              diff >= 0 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {diff >= 0 ? '+' : ''}
            {diff.toFixed(1)}%
          </span>
        )}
        {draft !== undefined && (
          <button
            type='button'
            onClick={() => undoDraft(row.key)}
            className='text-muted-foreground hover:text-foreground'
            aria-label='Undo this price'
          >
            <X className='h-4 w-4' />
          </button>
        )}
      </div>
    );
  };

  // One price inside a product row: its name, current value and new box
  const priceCell = (row: TPriceRow, showLabel: boolean) => (
    <div key={row.key} className='space-y-1'>
      {showLabel && (
        <div className='text-xs'>
          <span className='font-medium'>{row.label}</span>
          {row.shopName && (
            <span className='text-muted-foreground'> · {row.shopName}</span>
          )}
        </div>
      )}
      <div className='text-muted-foreground text-xs'>
        Now {formatPrice(row.oldPrice)}
      </div>
      {priceInput(row)}
    </div>
  );

  if (loadError)
    return (
      <div className='text-destructive p-4 text-sm'>
        Failed to load products.{' '}
        <Button variant='link' onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
      </div>
    );

  if (!products) return <div className='p-4 text-sm'>Loading prices...</div>;

  return (
    <div className='space-y-4 pb-24'>
      {/* Send the saved e-commerce prices to the online shop */}
      <div className='flex flex-col gap-3 rounded-md border bg-sky-50 p-3 sm:flex-row sm:items-center sm:justify-between dark:bg-sky-950/30'>
        <div className='flex items-start gap-2 text-sm'>
          <Globe className='mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300' />
          <span>
            <strong>E-commerce prices</strong> show online after you sync them.
            Edit them below (choose &quot;E-commerce price only&quot;), save,
            then sync.
          </span>
        </div>
        <Button
          type='button'
          onClick={handleSync}
          disabled={isSyncing || isSaving}
          className='gap-2'
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync prices to e-commerce'}
        </Button>
      </div>

      <Card>
        <CardContent className='space-y-4 pt-6'>
          {/* Find prices */}
          <div className='flex flex-col gap-3 md:flex-row'>
            <div className='relative flex-1'>
              <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
              <Input
                placeholder='Search product, code or price name...'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className='pl-9'
              />
            </div>
            <Select
              value={priceType}
              onValueChange={(value) => setPriceType(value as TPriceType)}
            >
              <SelectTrigger className='md:w-48'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All prices</SelectItem>
                <SelectItem value='sell'>Sell price only</SelectItem>
                <SelectItem value='ecommerce'>E-commerce price only</SelectItem>
                <SelectItem value='additional'>Additional prices only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={shopFilter} onValueChange={setShopFilter}>
              <SelectTrigger className='md:w-48'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_SHOP}>Any shop</SelectItem>
                <SelectItem value={ALL_SHOP_PRICES}>All-shop prices</SelectItem>
                {shops.map((shop) => (
                  <SelectItem key={shop.id} value={shop.id}>
                    {shop.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Layout */}
          <div className='flex flex-wrap items-center gap-2 text-sm'>
            <span className='text-muted-foreground'>Show:</span>
            <div className='inline-flex rounded-md border p-0.5'>
              <Button
                type='button'
                size='sm'
                variant={layout === 'price' ? 'secondary' : 'ghost'}
                onClick={() => setLayout('price')}
                className='h-7 gap-1.5'
                aria-pressed={layout === 'price'}
              >
                <LayoutList className='h-4 w-4' />
                One row per price
              </Button>
              <Button
                type='button'
                size='sm'
                variant={layout === 'product' ? 'secondary' : 'ghost'}
                onClick={() => setLayout('product')}
                className='h-7 gap-1.5'
                aria-pressed={layout === 'product'}
              >
                <Rows3 className='h-4 w-4' />
                One row per product
              </Button>
            </div>
          </div>

          {/* Change by percent */}
          <div className='bg-muted/50 flex flex-col gap-3 rounded-md p-3 sm:flex-row sm:items-center'>
            <span className='text-sm font-medium'>
              Change{' '}
              {selected.size > 0
                ? `${selected.size} ticked`
                : `all ${shownRows.length} shown`}{' '}
              price(s) by
            </span>
            <div className='relative w-full sm:w-28'>
              <Input
                type='number'
                min='0'
                step='0.01'
                placeholder='10'
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className='bg-background pr-7'
              />
              <span className='text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-sm'>
                %
              </span>
            </div>
            <div className='flex gap-2'>
              <Button
                type='button'
                onClick={() => changeByPercent(1)}
                className='flex-1 gap-1 sm:flex-none'
              >
                <Plus className='h-4 w-4' />
                Increase
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => changeByPercent(-1)}
                className='flex-1 gap-1 sm:flex-none'
              >
                <Minus className='h-4 w-4' />
                Decrease
              </Button>
            </div>
          </div>

          {/* Prices */}
          <div className='overflow-x-auto rounded-md border'>
            {layout === 'price' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10'>
                      <Checkbox
                        checked={allPageTicked}
                        onCheckedChange={(c) =>
                          toggleKeys(pagePriceKeys, c === true)
                        }
                        aria-label='Tick all on this page'
                      />
                    </TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className='text-right'>Current</TableHead>
                    <TableHead className='w-40'>New price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className='text-muted-foreground py-8 text-center'
                      >
                        No prices found
                      </TableCell>
                    </TableRow>
                  )}
                  {pageRows.map((row) => (
                    <TableRow
                      key={row.key}
                      className={
                        isChanged(row) ? 'bg-amber-50 dark:bg-amber-950/30' : ''
                      }
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected.has(row.key)}
                          onCheckedChange={(c) =>
                            toggleKeys([row.key], c === true)
                          }
                          aria-label={`Tick ${row.productName}`}
                        />
                      </TableCell>
                      <TableCell>
                        <ProductName
                          name={row.productName}
                          subName={row.subProductName}
                          code={row.productCode}
                        />
                      </TableCell>
                      <TableCell>
                        <div>{row.label}</div>
                        {row.shopName && (
                          <div className='text-muted-foreground text-xs'>
                            {row.shopName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className='text-right whitespace-nowrap'>
                        {formatPrice(row.oldPrice)}
                      </TableCell>
                      <TableCell>{priceInput(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10'>
                      <Checkbox
                        checked={allPageTicked}
                        onCheckedChange={(c) =>
                          toggleKeys(pagePriceKeys, c === true)
                        }
                        aria-label='Tick all on this page'
                      />
                    </TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Sell price</TableHead>
                    <TableHead>E-commerce price</TableHead>
                    <TableHead>Additional prices</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageGroups.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className='text-muted-foreground py-8 text-center'
                      >
                        No prices found
                      </TableCell>
                    </TableRow>
                  )}
                  {pageGroups.map((group) => {
                    const keys = group.rows.map((row) => row.key);
                    const sell = group.rows.find((row) => row.kind === 'product');
                    const ecommerce = group.rows.find((row) =>
                      isEcommerce(row.kind)
                    );
                    const extra = group.rows.filter(
                      (row) => row.kind === 'additional'
                    );
                    const changed = group.rows.some(isChanged);
                    const isVariant = group.key.startsWith('sub|');
                    return (
                      <TableRow
                        key={group.key}
                        className={`align-top ${
                          changed ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''
                        }`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={keys.every((key) => selected.has(key))}
                            onCheckedChange={(c) => toggleKeys(keys, c === true)}
                            aria-label={`Tick ${group.productName}`}
                          />
                        </TableCell>
                        <TableCell className='min-w-44'>
                          <ProductName
                            name={group.productName}
                            subName={group.subProductName}
                            code={group.productCode}
                          />
                        </TableCell>
                        <TableCell>
                          {sell ? (
                            priceCell(sell, false)
                          ) : (
                            <span
                              className='text-muted-foreground text-xs'
                              title={
                                isVariant
                                  ? 'Variants have no sell price of their own'
                                  : undefined
                              }
                            >
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {ecommerce ? (
                            priceCell(ecommerce, false)
                          ) : (
                            <span className='text-muted-foreground text-xs'>—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {extra.length > 0 ? (
                            <div className='flex flex-wrap gap-4'>
                              {extra.map((row) => priceCell(row, true))}
                            </div>
                          ) : (
                            <span className='text-muted-foreground text-xs'>—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {pageCount > 1 && (
            <div className='flex items-center justify-end gap-2 text-sm'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span>
                Page {page} of {pageCount}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save bar */}
      {(changes.length > 0 || hasInvalid) && (
        <div className='bg-background sticky bottom-0 z-10 flex flex-col gap-2 rounded-md border p-3 shadow-md sm:flex-row sm:items-center sm:justify-between'>
          <span className='text-sm'>
            <strong>{changes.length}</strong> price(s) changed
            {hasInvalid && (
              <span className='text-destructive ml-2'>
                Fix the red boxes first
              </span>
            )}
          </span>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => setDrafts({})}
              disabled={isSaving}
            >
              Undo all
            </Button>
            <Button
              type='button'
              onClick={handleSave}
              disabled={isSaving || changes.length === 0 || hasInvalid}
              className='gap-2'
            >
              <Save className='h-4 w-4' />
              {isSaving ? 'Saving...' : 'Save prices'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
