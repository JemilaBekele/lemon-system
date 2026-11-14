'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { getAllTransfers } from '@/service/transfer';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { ITransfer } from '@/models/transfer';
import { transferColumns } from './tables/columns';

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  data: ITransfer[];
  totalCount: number;
  error?: boolean;
};

const toIsoDate = (value: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date.toISOString();
};

export default function TransferListingPage() {
  const [{ page, limit, q, startDate, endDate }] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(10),
    q: parseAsString.withDefault(''),
    startDate: parseAsString.withDefault(''),
    endDate: parseAsString.withDefault('')
  });
  const from = toIsoDate(startDate);
  const to = toIsoDate(endDate);
  const search = useDebouncedValue(q.trim(), 400);
  const key = `${page}:${limit}:${from ?? ''}:${to ?? ''}:${search}`;
  const dataVersion = useDataVersion();
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAllTransfers({ page, limit, startDate: from, endDate: to, search })
      .then(({ data, totalCount }) => {
        if (!cancelled) setResult({ key, data, totalCount });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, data: [], totalCount: 0, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [key, page, limit, from, to, search, dataVersion]);

  // Keep showing the previous page while the next one loads, instead of
  // flashing the skeleton on every page change or search keystroke.
  if (!result)
    return <DataTableSkeleton columnCount={6} rowCount={8} filterCount={2} />;

  if (result.error) return <div>Error loading transfer records.</div>;

  // The backend pages and searches (reference, status, store/shop names).
  return (
    <DataTable
      data={result.data}
      totalItems={result.totalCount}
      columns={transferColumns}
    />
  );
}
