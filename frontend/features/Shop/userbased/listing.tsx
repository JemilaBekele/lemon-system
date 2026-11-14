'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { DataTable } from '@/components/ui/table/newdatatable';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { getAllSellsuserBased } from '@/service/Sell';
import { sellColumns } from './tables/columns';
import { ISell, SaleStatus } from '@/models/Sell';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { AlertCircle, Clock, Check } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  salesData: ISell[]; // just this page
  filteredCount: number;
  totalCount: number;
  statusCounts: Record<string, number>;
  error?: boolean;
};

const toIsoDate = (value: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date.toISOString();
};

// Status card component
export function StatusCard({
  title,
  count,
  variant = 'default',
  needsAttention = false,
  selected = false,
  href,
  value
}: {
  title: string;
  count: number;
  variant?:
    | 'default'
    | 'approved'
    | 'notApproved'
    | 'partial'
    | 'delivered'
    | 'cancelled'
    | 'total';
  needsAttention?: boolean;
  selected?: boolean;
  href: string;
  value?: string;
}) {
  const variantStyles = {
    default: 'border-border bg-card',
    total: 'border-border bg-card',
    approved:
      'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20',
    notApproved: needsAttention
      ? 'border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/40 shadow-md ring-1 ring-amber-200 dark:ring-amber-800'
      : 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/20',
    partial:
      'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20',
    delivered:
      'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20',
    cancelled: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20'
  };

  const selectedStyles = selected
    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
    : '';

  const textColors = {
    default: 'text-foreground',
    total: 'text-foreground',
    approved: 'text-blue-700 dark:text-blue-400',
    notApproved: needsAttention
      ? 'text-amber-800 dark:text-amber-300'
      : 'text-gray-700 dark:text-gray-400',
    partial: 'text-orange-700 dark:text-orange-400',
    delivered: 'text-green-700 dark:text-green-400',
    cancelled: 'text-red-700 dark:text-red-400'
  };

  const iconColors = {
    notApproved: needsAttention
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-gray-500'
  };

  return (
    <Link href={href} className='block'>
      <Card
        className={`relative cursor-pointer transition-all hover:shadow-md ${variantStyles[variant]} ${selectedStyles} ${needsAttention ? 'animate-pulse' : ''}`}
      >
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <div className='flex items-center gap-2'>
            <RadioGroupItem
              value={value || ''}
              id={`status-${value}`}
              className='h-4 w-4'
              checked={selected}
            />
            <Label
              htmlFor={`status-${value}`}
              className={`text-sm font-medium ${textColors[variant]} cursor-pointer`}
            >
              {title}
            </Label>
          </div>
          {variant === 'notApproved' && needsAttention && count > 0 && (
            <div className='flex items-center'>
              <AlertCircle className={`h-4 w-4 ${iconColors.notApproved}`} />
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-between'>
            <div className={`text-2xl font-bold ${textColors[variant]}`}>
              {count}
            </div>
            {selected && (
              <Badge variant='secondary' className='flex items-center gap-1'>
                <Check className='h-3 w-3' />
                Selected
              </Badge>
            )}
            {variant === 'notApproved' && needsAttention && count > 0 && (
              <div className='flex items-center'>
                <Clock className={`h-4 w-4 ${iconColors.notApproved}`} />
                <span className={`text-xs ${textColors.notApproved}`}>
                  Needs approval
                </span>
              </div>
            )}
          </div>
          {variant === 'notApproved' && needsAttention && count > 0 && (
            <div
              className={`mt-1 text-xs ${textColors.notApproved} font-medium`}
            >
              Action required
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function SellListingPage() {
  // ────────────────────────────────────────────────────────────────
  // Query‑string inputs - Add status filter
  // ────────────────────────────────────────────────────────────────
  const [params] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(10),
    q: parseAsString.withDefault(''),
    startDate: parseAsString.withDefault(''),
    endDate: parseAsString.withDefault(''),
    status: parseAsString.withDefault('')
  });
  const page = params.page || 1;
  const search = params.q || '';
  const limit = params.limit || 10;
  const startDate = toIsoDate(params.startDate);
  const endDate = toIsoDate(params.endDate);
  const statusFilter = params.status || 'all';

  // Helper function to build query strings
  const buildQueryString = (status: string) => {
    const params = new URLSearchParams();

    // Always include search if it exists
    if (search) params.set('q', search);

    // Always reset to page 1 when changing status
    params.set('page', '1');

    // Include limit
    params.set('limit', limit.toString());

    // Include date filters if they exist
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    // Set status
    params.set('status', status);

    return `?${params.toString()}`;
  };

  // Wait until typing pauses before searching on the server
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Every filter is applied on the server, so all of them are part of the key
  const key = [
    page,
    limit,
    startDate ?? '',
    endDate ?? '',
    debouncedSearch,
    statusFilter
  ].join(':');
  const dataVersion = useDataVersion();
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAllSellsuserBased({
      page,
      limit,
      startDate,
      endDate,
      q: debouncedSearch,
      status: statusFilter
    })
      .then((res) => {
        if (!cancelled)
          setResult({
            key,
            salesData: res.data,
            filteredCount: res.filteredCount,
            totalCount: res.totalCount,
            statusCounts: res.statusCounts
          });
      })
      .catch(() => {
        if (!cancelled)
          setResult({
            key,
            salesData: [],
            filteredCount: 0,
            totalCount: 0,
            statusCounts: {},
            error: true
          });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dataVersion]);

  if (result?.key !== key)
    return <DataTableSkeleton columnCount={6} rowCount={8} filterCount={2} />;

  if (result.error)
    return (
      <div className='p-4 text-red-500'>
        Error loading sells. Please try again later.
      </div>
    );

  // ────────────────────────────────────────────────────────────────
  // Counts come from the server and cover all of the user's sales in
  // the date range (not filtered by status or search)
  // ────────────────────────────────────────────────────────────────
  const { salesData, filteredCount, totalCount, statusCounts } = result;
  const allStatusCounts = {
    [SaleStatus.APPROVED]: statusCounts[SaleStatus.APPROVED] ?? 0,
    [SaleStatus.NOT_APPROVED]: statusCounts[SaleStatus.NOT_APPROVED] ?? 0,
    [SaleStatus.PARTIALLY_DELIVERED]:
      statusCounts[SaleStatus.PARTIALLY_DELIVERED] ?? 0,
    [SaleStatus.DELIVERED]: statusCounts[SaleStatus.DELIVERED] ?? 0,
    [SaleStatus.CANCELLED]: statusCounts[SaleStatus.CANCELLED] ?? 0
  };

  const totalSells = totalCount; // All sells, not filtered
  const needsApprovalCount = allStatusCounts[SaleStatus.NOT_APPROVED];

  // The server already returned just this page
  const paginatedData = salesData;

  return (
    <div className='space-y-6'>
      {/* Radio Group for Status Filter */}
      <RadioGroup
        defaultValue={statusFilter}
        className='space-y-3'
        value={statusFilter}
      >
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6'>
          <StatusCard
            title='All Sells'
            count={totalSells}
            variant='total'
            selected={statusFilter === 'all'}
            value='all'
            href={buildQueryString('all')}
          />
          <StatusCard
            title='Approved'
            count={allStatusCounts[SaleStatus.APPROVED]}
            variant='approved'
            selected={statusFilter === SaleStatus.APPROVED}
            value={SaleStatus.APPROVED}
            href={buildQueryString(SaleStatus.APPROVED)}
          />
          <StatusCard
            title='Not Approved'
            count={allStatusCounts[SaleStatus.NOT_APPROVED]}
            variant='notApproved'
            needsAttention={allStatusCounts[SaleStatus.NOT_APPROVED] > 0}
            selected={statusFilter === SaleStatus.NOT_APPROVED}
            value={SaleStatus.NOT_APPROVED}
            href={buildQueryString(SaleStatus.NOT_APPROVED)}
          />
          <StatusCard
            title='Partially Delivered'
            count={allStatusCounts[SaleStatus.PARTIALLY_DELIVERED]}
            variant='partial'
            selected={statusFilter === SaleStatus.PARTIALLY_DELIVERED}
            value={SaleStatus.PARTIALLY_DELIVERED}
            href={buildQueryString(SaleStatus.PARTIALLY_DELIVERED)}
          />
          <StatusCard
            title='Delivered'
            count={allStatusCounts[SaleStatus.DELIVERED]}
            variant='delivered'
            selected={statusFilter === SaleStatus.DELIVERED}
            value={SaleStatus.DELIVERED}
            href={buildQueryString(SaleStatus.DELIVERED)}
          />
          <StatusCard
            title='Cancelled'
            count={allStatusCounts[SaleStatus.CANCELLED]}
            variant='cancelled'
            selected={statusFilter === SaleStatus.CANCELLED}
            value={SaleStatus.CANCELLED}
            href={buildQueryString(SaleStatus.CANCELLED)}
          />
        </div>
      </RadioGroup>

      {/* Filter Status Display */}
      {statusFilter !== 'all' && (
        <div className='bg-muted/50 rounded-lg border p-4'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <Badge variant='outline' className='text-sm'>
                Filter Applied
              </Badge>
              <span className='text-muted-foreground text-sm'>
                Showing {filteredCount} {statusFilter.toLowerCase()} sale
                {filteredCount === 1 ? '' : 's'}
              </span>
            </div>
            <Link
              href={buildQueryString('all')}
              className='text-primary text-sm hover:underline'
            >
              Clear Filter
            </Link>
          </div>
        </div>
      )}

      {/* Attention Banner if there are pending approvals */}
      {needsApprovalCount > 0 && (
        <div className='rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20'>
          <div className='flex items-center gap-2'>
            <AlertCircle className='h-5 w-5 text-amber-600 dark:text-amber-400' />
            <h3 className='font-semibold text-amber-800 dark:text-amber-300'>
              Attention Required
            </h3>
          </div>
          <p className='mt-1 text-sm text-amber-700 dark:text-amber-400'>
            You have {needsApprovalCount} sale
            {needsApprovalCount === 1 ? '' : 's'} waiting for approval. Please
            review and approve them to proceed with delivery.
          </p>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        data={paginatedData}
        totalItems={filteredCount} // Use filtered count for pagination
        columns={sellColumns}
        currentPage={page}
        itemsPerPage={limit}
        searchValue={search}
        statusFilter={statusFilter}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
}
