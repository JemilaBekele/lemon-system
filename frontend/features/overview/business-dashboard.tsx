'use client';

// Main dashboard: stock management and sales. Finances (cost, profit,
// supplier payments) live in other software, so nothing here is about cost.
// One date range + branch drives the sales numbers; stock alerts (expiring,
// low, out of stock) always show the stock as it is now.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  PackageX,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
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
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { getBusinessAnalyticsApi, IBusinessAnalytics } from '@/service/Report';
import { getBranches } from '@/service/branch';
import { IBranch } from '@/models/Branch';

// ---------- formatting ----------

const birr = (value: number) =>
  `${Math.round(value).toLocaleString('en-US')} birr`;

const compact = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return Math.round(value).toLocaleString('en-US');
};

const count = (value: number) => value.toLocaleString('en-US');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const periodLabel = (period: string, granularity: 'day' | 'month') => {
  const [y, m, d] = period.split('-').map(Number);
  return granularity === 'month'
    ? `${MONTHS[m - 1]} ${String(y).slice(2)}`
    : `${MONTHS[m - 1]} ${d}`;
};

const longDate = (value: string) =>
  new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

// ---------- date range ----------

type TPreset = 'today' | '7d' | '30d' | 'month' | 'lastMonth' | 'year' | 'custom';

const PRESETS: { value: TPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom range' }
];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const presetRange = (preset: TPreset): { from: string; to: string } => {
  const today = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };
  switch (preset) {
    case 'today':
      return { from: ymd(today), to: ymd(today) };
    case '7d':
      return { from: ymd(daysAgo(6)), to: ymd(today) };
    case 'month':
      return {
        from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: ymd(today)
      };
    case 'lastMonth':
      return {
        from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: ymd(new Date(today.getFullYear(), today.getMonth(), 0))
      };
    case 'year':
      return { from: ymd(new Date(today.getFullYear(), 0, 1)), to: ymd(today) };
    case '30d':
    default:
      return { from: ymd(daysAgo(29)), to: ymd(today) };
  }
};

const PRESET_KEY = 'dashboard-range-preset';

// Remembered range choice (this browser only). The overview renders only on
// the client (the permission shell waits for the auth store), so reading
// storage while initialising state is safe.
const loadPreset = (): TPreset => {
  try {
    const saved = localStorage.getItem(PRESET_KEY) as TPreset | null;
    if (saved && saved !== 'custom' && PRESETS.some((p) => p.value === saved)) {
      return saved;
    }
  } catch {
    // storage unavailable
  }
  return '30d';
};

// Keyed by request so the page knows when the shown data is stale
type TLoadResult = {
  key: string;
  data: IBusinessAnalytics | null;
  error?: string;
};

// ---------- sales chart: one measure at a time (never two y-axes) ----------

type TMeasure = 'amount' | 'sales' | 'items';

const MEASURES: { value: TMeasure; label: string; format: (n: number) => string }[] = [
  { value: 'amount', label: 'Sales amount', format: birr },
  { value: 'sales', label: 'Number of sales', format: count },
  { value: 'items', label: 'Items sold', format: count }
];

// Validated categorical slot 1 (blue), stepped for each theme
const chartConfig = {
  value: { label: 'Sales', theme: { light: '#2a78d6', dark: '#3987e5' } }
} satisfies ChartConfig;

// ---------- small pieces ----------

function Change({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className='text-muted-foreground text-xs'>No sales in previous period</span>
    );
  }
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className='text-muted-foreground flex items-center gap-1 text-xs'>
      <span
        className={`flex items-center font-medium ${
          up ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
        }`}
      >
        <Icon className='h-3.5 w-3.5' aria-hidden />
        {up ? '+' : ''}
        {value.toFixed(1)}%
      </span>
      vs previous period
    </span>
  );
}

type TTone = 'neutral' | 'warning' | 'critical';

const TONES: Record<TTone, string> = {
  neutral: '',
  warning: 'border-amber-300 dark:border-amber-800',
  critical: 'border-red-300 dark:border-red-900'
};

function Kpi({
  title,
  value,
  sub,
  icon,
  tone = 'neutral',
  href,
  children
}: {
  title: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: TTone;
  href?: string;
  children?: React.ReactNode;
}) {
  const card = (
    <Card className={`h-full gap-2 py-4 ${TONES[tone]} ${href ? 'hover:bg-muted/40 transition-colors' : ''}`}>
      <CardContent className='space-y-1 px-4'>
        <p className='text-muted-foreground flex items-center gap-1.5 text-sm'>
          {icon}
          {title}
        </p>
        <p className='text-2xl font-semibold tracking-tight tabular-nums'>{value}</p>
        {sub && <p className='text-muted-foreground text-xs'>{sub}</p>}
        {children}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function Empty({ text }: { text: string }) {
  return <p className='text-muted-foreground py-6 text-center text-sm'>{text}</p>;
}

// Single-series horizontal bars (shop / category), value labelled at the end
function RankBars({ rows }: { rows: { name: string; amount: number }[] }) {
  if (rows.length === 0) return <Empty text='No sales in this period' />;
  const height = Math.max(120, rows.length * 36);
  return (
    <ChartContainer config={chartConfig} className='w-full' style={{ height }}>
      <BarChart
        data={rows}
        layout='vertical'
        margin={{ left: 4, right: 56 }}
        barCategoryGap={6}
      >
        <XAxis type='number' hide />
        <YAxis
          type='category'
          dataKey='name'
          width={110}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12 }}
        />
        <ChartTooltip
          cursor={{ fillOpacity: 0.06 }}
          content={
            <ChartTooltipContent hideIndicator formatter={(value) => birr(Number(value))} />
          }
        />
        <Bar dataKey='amount' fill='var(--color-value)' radius={4} maxBarSize={22}>
          <LabelList
            dataKey='amount'
            position='right'
            className='fill-muted-foreground'
            fontSize={11}
            formatter={(value: number) => compact(value)}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function SectionTable({
  headers,
  rows,
  empty
}: {
  headers: { label: string; right?: boolean }[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) return <Empty text={empty} />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h.label} className={h.right ? 'text-right' : ''}>
              {h.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((cells, i) => (
          <TableRow key={i}>
            {cells.map((cell, j) => (
              <TableCell
                key={j}
                className={
                  headers[j]?.right ? 'text-right tabular-nums' : 'max-w-60 truncate'
                }
              >
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Status chip: always an icon-free label + colour, never colour alone
function DaysLeft({ days }: { days: number }) {
  const expired = days < 0;
  const soon = days <= 30;
  const cls = expired
    ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-100'
    : soon
      ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100'
      : 'bg-muted text-muted-foreground';
  const text = expired
    ? `Expired ${Math.abs(days)}d ago`
    : days === 0
      ? 'Expires today'
      : `${days} days left`;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

function StockLevel({ quantity, warning }: { quantity: number; warning: number }) {
  const pct = warning > 0 ? Math.min(100, (quantity / warning) * 100) : 0;
  const out = quantity === 0;
  return (
    <div className='flex items-center justify-end gap-2'>
      <div className='bg-muted hidden h-1.5 w-16 overflow-hidden rounded-full sm:block'>
        <div
          className={`h-full rounded-full ${out ? 'bg-red-600' : 'bg-amber-500'}`}
          style={{ width: `${out ? 100 : pct}%` }}
        />
      </div>
      <span className={out ? 'font-medium text-red-700 dark:text-red-400' : ''}>
        {out ? 'Out' : count(quantity)}
      </span>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className='h-28 rounded-xl' />
        ))}
      </div>
      <Skeleton className='h-80 rounded-xl' />
      <div className='grid gap-4 lg:grid-cols-2'>
        <Skeleton className='h-64 rounded-xl' />
        <Skeleton className='h-64 rounded-xl' />
      </div>
    </div>
  );
}

// ---------- page ----------

export default function BusinessDashboard() {
  const [preset, setPreset] = useState<TPreset>(loadPreset);
  const [custom, setCustom] = useState(() => presetRange('30d'));
  const [branchId, setBranchId] = useState('all');
  const [branches, setBranches] = useState<IBranch[]>([]);
  const [measure, setMeasure] = useState<TMeasure>('amount');
  const [result, setResult] = useState<TLoadResult | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getBranches()
      .then((list) => setBranches(list || []))
      .catch(() => setBranches([]));
  }, []);

  const range = useMemo(
    () => (preset === 'custom' ? custom : presetRange(preset)),
    [preset, custom]
  );

  const validRange = !!range.from && !!range.to && range.from <= range.to;
  const requestKey = `${range.from}|${range.to}|${branchId}|${reloadKey}`;

  useEffect(() => {
    if (!validRange) return;
    let cancelled = false;
    getBusinessAnalyticsApi({
      from: range.from,
      to: range.to,
      branchId: branchId === 'all' ? undefined : branchId
    })
      .then((loaded) => {
        if (!cancelled) setResult({ key: requestKey, data: loaded });
      })
      .catch((err) => {
        if (!cancelled)
          setResult((prev) => ({
            key: requestKey,
            // keep showing the last good numbers under the error
            data: prev?.data ?? null,
            error: err?.response?.data?.message || 'Failed to load the dashboard'
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [range, branchId, requestKey, validRange]);

  // The last loaded numbers stay on screen (dimmed) while a new range loads
  const data = result?.data ?? null;
  const loading = validRange && result?.key !== requestKey;
  const error = result?.key === requestKey ? result.error : undefined;

  const choosePreset = (value: TPreset) => {
    setPreset(value);
    if (value !== 'custom') {
      try {
        localStorage.setItem(PRESET_KEY, value);
      } catch {
        // storage unavailable
      }
    } else {
      setCustom(range);
    }
  };

  const measureInfo = MEASURES.find((m) => m.value === measure)!;
  const trend = useMemo(
    () =>
      (data?.trend || []).map((point) => ({
        label: periodLabel(point.period, data!.range.granularity),
        value: point[measure],
        amount: point.amount,
        sales: point.sales,
        items: point.items
      })),
    [data, measure]
  );

  const k = data?.kpis;
  const pendingTotal = data
    ? Object.values(data.pending).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <div className='space-y-4'>
      {/* Filters: one row above everything they control */}
      <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
        <Select value={preset} onValueChange={(v) => choosePreset(v as TPreset)}>
          <SelectTrigger className='sm:w-44' aria-label='Date range'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {preset === 'custom' && (
          <div className='flex items-center gap-2'>
            <Input
              type='date'
              value={custom.from}
              max={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              className='sm:w-40'
              aria-label='From'
            />
            <span className='text-muted-foreground text-sm'>to</span>
            <Input
              type='date'
              value={custom.to}
              min={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              className='sm:w-40'
              aria-label='To'
            />
          </div>
        )}
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className='sm:w-48' aria-label='Branch'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All branches</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setReloadKey((n) => n + 1)}
          disabled={loading}
          className='gap-2 sm:ml-auto'
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      {data && (
        <p className='text-muted-foreground -mt-2 text-xs'>
          Sales from {longDate(data.range.from)} to {longDate(data.range.to)}, compared
          with {longDate(data.range.previousFrom)} – {longDate(data.range.previousTo)}.
          Stock figures are as of now.
        </p>
      )}

      {error && (
        <Card className='border-destructive/40'>
          <CardContent className='flex items-center justify-between gap-3 py-4 text-sm'>
            <span className='text-destructive'>{error}</span>
            <Button size='sm' variant='outline' onClick={() => setReloadKey((n) => n + 1)}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {!data && loading && <DashboardSkeleton />}

      {data && k && (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* Sales numbers */}
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            <Kpi title='Sales amount' value={birr(k.salesAmount)}>
              <Change value={data.previous.salesAmountChange} />
            </Kpi>
            <Kpi title='Number of sales' value={count(k.salesCount)}>
              <Change value={data.previous.salesCountChange} />
            </Kpi>
            <Kpi title='Items sold' value={count(k.itemsSold)}>
              <Change value={data.previous.itemsSoldChange} />
            </Kpi>
            <Kpi
              title='Average sale'
              value={birr(k.averageSale)}
              sub='Sales amount ÷ number of sales'
            />
          </div>

          {/* Stock numbers (now) */}
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            <Kpi
              title='In stock'
              icon={<Boxes className='h-4 w-4' aria-hidden />}
              value={`${count(k.productsInStock)} products`}
              sub={`${count(k.unitsInStock)} units in stores and shops`}
              href='/dashboard/Products'
            />
            <Kpi
              title='Expiring in 60 days'
              icon={<CalendarClock className='h-4 w-4' aria-hidden />}
              value={count(k.expiringCount)}
              sub={k.expiredCount > 0 ? `${count(k.expiredCount)} batch(es) already expired` : 'batches still in stock'}
              tone={k.expiredCount > 0 ? 'critical' : k.expiringCount > 0 ? 'warning' : 'neutral'}
            />
            <Kpi
              title='Low stock'
              icon={<AlertTriangle className='h-4 w-4' aria-hidden />}
              value={count(k.lowStockCount)}
              sub="At or below the product's warning level"
              tone={k.lowStockCount > 0 ? 'warning' : 'neutral'}
            />
            <Kpi
              title='Out of stock'
              icon={<PackageX className='h-4 w-4' aria-hidden />}
              value={count(k.outOfStockCount)}
              sub='Active products with nothing in stock'
              tone={k.outOfStockCount > 0 ? 'critical' : 'neutral'}
            />
          </div>

          {/* Sales chart */}
          <Card>
            <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
              <div className='space-y-1.5'>
                <CardTitle>Sales</CardTitle>
                <CardDescription>
                  {measureInfo.label} by {data.range.granularity === 'month' ? 'month' : 'day'}
                </CardDescription>
              </div>
              <div className='bg-muted inline-flex rounded-md p-1' role='tablist'>
                {MEASURES.map((m) => (
                  <button
                    key={m.value}
                    type='button'
                    role='tab'
                    aria-selected={measure === m.value}
                    onClick={() => setMeasure(m.value)}
                    className={`rounded px-3 py-1 text-sm transition-colors ${
                      measure === m.value
                        ? 'bg-background font-medium shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {k.salesCount === 0 ? (
                <Empty text='No approved sales in this period' />
              ) : (
                <ChartContainer config={chartConfig} className='h-72 w-full'>
                  <BarChart data={trend} margin={{ left: 4, right: 12, top: 8 }}>
                    <CartesianGrid vertical={false} strokeOpacity={0.4} />
                    <XAxis
                      dataKey='label'
                      tickLine={false}
                      axisLine={false}
                      minTickGap={16}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      allowDecimals={false}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => compact(Number(v))}
                    />
                    <ChartTooltip
                      cursor={{ fillOpacity: 0.06 }}
                      content={
                        <ChartTooltipContent
                          hideIndicator
                          formatter={(_, __, item) => {
                            const p = item.payload as (typeof trend)[number];
                            return (
                              <div className='grid w-full gap-0.5'>
                                <div className='flex justify-between gap-4'>
                                  <span className='text-muted-foreground'>Sales amount</span>
                                  <span className='font-medium tabular-nums'>{birr(p.amount)}</span>
                                </div>
                                <div className='flex justify-between gap-4'>
                                  <span className='text-muted-foreground'>Number of sales</span>
                                  <span className='font-medium tabular-nums'>{count(p.sales)}</span>
                                </div>
                                <div className='flex justify-between gap-4'>
                                  <span className='text-muted-foreground'>Items sold</span>
                                  <span className='font-medium tabular-nums'>{count(p.items)}</span>
                                </div>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                    <Bar dataKey='value' fill='var(--color-value)' radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Stock alerts */}
          <div className='grid gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <CalendarClock className='h-4 w-4 text-red-600' aria-hidden />
                  Expired and expiring batches
                </CardTitle>
                <CardDescription>
                  Batches still in stock that are expired or expire within 60 days, soonest first
                </CardDescription>
              </CardHeader>
              <CardContent className='overflow-x-auto'>
                <SectionTable
                  headers={[
                    { label: 'Product / batch' },
                    { label: 'Expiry date' },
                    { label: 'Status' },
                    { label: 'Qty', right: true }
                  ]}
                  rows={data.expiring.map((b) => [
                    <div key='p'>
                      <div className='truncate font-medium'>{b.product}</div>
                      <div className='text-muted-foreground text-xs'>Batch {b.batchNumber}</div>
                    </div>,
                    longDate(b.expiryDate),
                    <DaysLeft key='d' days={b.daysLeft} />,
                    count(b.quantity)
                  ])}
                  empty='No batches expire in the next 60 days'
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <AlertTriangle className='h-4 w-4 text-amber-600' aria-hidden />
                  Low and out of stock
                </CardTitle>
                <CardDescription>
                  At or below the product&apos;s warning level, emptiest first
                </CardDescription>
              </CardHeader>
              <CardContent className='overflow-x-auto'>
                <SectionTable
                  headers={[
                    { label: 'Product' },
                    { label: 'Warn at', right: true },
                    { label: 'In stock', right: true }
                  ]}
                  rows={data.lowStock.map((p) => [
                    <div key='n'>
                      <div className='truncate font-medium'>{p.name}</div>
                      {p.code && <div className='text-muted-foreground text-xs'>{p.code}</div>}
                    </div>,
                    count(p.warningQuantity),
                    <StockLevel key='q' quantity={p.quantity} warning={p.warningQuantity} />
                  ])}
                  empty='Nothing is low on stock'
                />
              </CardContent>
            </Card>
          </div>

          {/* Where sales come from */}
          <div className='grid gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Sales by shop</CardTitle>
                <CardDescription>Line totals before discount</CardDescription>
              </CardHeader>
              <CardContent>
                <RankBars rows={data.byShop} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Sales by category</CardTitle>
                <CardDescription>Line totals before discount</CardDescription>
              </CardHeader>
              <CardContent>
                <RankBars rows={data.byCategory} />
              </CardContent>
            </Card>
          </div>

          <div className='grid gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Best-selling products</CardTitle>
                <CardDescription>By quantity sold in this period</CardDescription>
              </CardHeader>
              <CardContent className='overflow-x-auto'>
                <SectionTable
                  headers={[
                    { label: 'Product' },
                    { label: 'Qty sold', right: true },
                    { label: 'Amount', right: true }
                  ]}
                  rows={data.topProducts.map((p) => [
                    <div key='n'>
                      <div className='truncate font-medium'>{p.name}</div>
                      {p.code && <div className='text-muted-foreground text-xs'>{p.code}</div>}
                    </div>,
                    count(p.quantity),
                    birr(p.amount)
                  ])}
                  empty='No sales in this period'
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <PackageX className='h-4 w-4' aria-hidden />
                  Stock not selling
                </CardTitle>
                <CardDescription>In stock but not sold in this period, most units first</CardDescription>
              </CardHeader>
              <CardContent>
                <SectionTable
                  headers={[{ label: 'Product' }, { label: 'In stock', right: true }]}
                  rows={data.notSelling.map((p) => [
                    <div key='n'>
                      <div className='truncate font-medium'>{p.name}</div>
                      {p.code && <div className='text-muted-foreground text-xs'>{p.code}</div>}
                    </div>,
                    count(p.quantity)
                  ])}
                  empty='Everything in stock sold at least once'
                />
              </CardContent>
            </Card>
          </div>

          <div className='grid gap-4 lg:grid-cols-3'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Top customers</CardTitle>
              </CardHeader>
              <CardContent>
                <SectionTable
                  headers={[
                    { label: 'Customer' },
                    { label: 'Orders', right: true },
                    { label: 'Amount', right: true }
                  ]}
                  rows={data.topCustomers.map((c) => [c.name, count(c.orders), birr(c.amount)])}
                  empty='No customer sales in this period'
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Sales by salesperson</CardTitle>
              </CardHeader>
              <CardContent>
                <SectionTable
                  headers={[
                    { label: 'Salesperson' },
                    { label: 'Orders', right: true },
                    { label: 'Amount', right: true }
                  ]}
                  rows={data.salespeople.map((s) => [s.name, count(s.orders), birr(s.amount)])}
                  empty='No sales in this period'
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <ClipboardCheck className='h-4 w-4' aria-hidden />
                  Waiting for approval
                </CardTitle>
                <CardDescription>{count(pendingTotal)} item(s) need someone to act</CardDescription>
              </CardHeader>
              <CardContent className='space-y-1'>
                {[
                  { label: 'Sales to approve', n: data.pending.sales, href: '/dashboard/Selllist' },
                  { label: 'Purchases to receive', n: data.pending.purchases, href: '/dashboard/purchase' },
                  { label: 'Transfers pending', n: data.pending.transfers, href: '/dashboard/Transfer' },
                  {
                    label: 'Stock corrections',
                    n: data.pending.stockCorrections,
                    href: '/dashboard/StockCorrection'
                  },
                  {
                    label: 'Sale returns / corrections',
                    n: data.pending.saleCorrections,
                    href: '/dashboard/Selllist'
                  }
                ].map((row) => (
                  <Link
                    key={row.label}
                    href={row.href}
                    className='hover:bg-muted flex items-center justify-between rounded-md px-2 py-1.5 text-sm'
                  >
                    <span>{row.label}</span>
                    <span
                      className={`min-w-8 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${
                        row.n > 0
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {row.n}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          <p className='text-muted-foreground text-xs'>
            Counts approved, partly delivered and delivered sales. Sales amount is after
            discounts and approved returns.
          </p>
        </div>
      )}
    </div>
  );
}
