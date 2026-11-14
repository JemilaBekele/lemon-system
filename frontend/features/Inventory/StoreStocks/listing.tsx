'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { getAllStoreStocks } from '@/service/store'; // your service
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { storeStockColumns } from './cloumn';

type TStoreStock = Awaited<
  ReturnType<typeof getAllStoreStocks>
>['data'][number];

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  data: TStoreStock[];
  totalCount: number;
  error?: boolean;
};

// Same parsing as the server-side search params cache: invalid dates are ignored.
const toIsoDate = (value: string | null) => {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date.toISOString();
};

export default function StoreStockListingPage() {
  const [{ page, limit, q: search, startDate: rawStart, endDate: rawEnd }] =
    useQueryStates({
      page: parseAsInteger.withDefault(1),
      limit: parseAsInteger.withDefault(10),
      q: parseAsString.withDefault(''),
      startDate: parseAsString,
      endDate: parseAsString
    });
  const startDate = toIsoDate(rawStart);
  const endDate = toIsoDate(rawEnd);
  const key = `${page}:${limit}:${startDate ?? ''}:${endDate ?? ''}`;
  const dataVersion = useDataVersion();
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    // ────────────────────────────────────────────────
    // Fetch data from API with optional date filters
    // ────────────────────────────────────────────────
    getAllStoreStocks({ page, limit, startDate, endDate })
      .then(({ data, totalCount }) => {
        if (!cancelled) setResult({ key, data, totalCount });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, data: [], totalCount: 0, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [key, page, limit, startDate, endDate, dataVersion]);

  if (result?.key !== key)
    return <DataTableSkeleton columnCount={6} rowCount={8} filterCount={2} />;

  if (result.error) return <div>Error loading store stock records.</div>;

  // ────────────────────────────────────────────────
  // Client-side search filter
  // (matches batchId, store name, status)
  // ────────────────────────────────────────────────
  const filteredData = result.data.filter((item) => {
    const searchTerm = search.toLowerCase();

    const batchId = item?.batch?.batchNumber.toLowerCase() || '';
    const storeName = item?.store?.name?.toLowerCase() || '';
    const status = item?.status?.toLowerCase() || '';

    return (
      batchId.includes(searchTerm) ||
      storeName.includes(searchTerm) ||
      status.includes(searchTerm)
    );
  });

  // ────────────────────────────────────────────────
  // Client-side pagination
  // ────────────────────────────────────────────────
  const startIndex = (page - 1) * limit;
  const paginatedData = filteredData.slice(startIndex, startIndex + limit);

  return (
    <DataTable
      data={paginatedData}
      totalItems={result.totalCount}
      columns={storeStockColumns}
    />
  );
}
