'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { purchaseColumns } from './tables/columns';
import { getAllPurchases } from '@/service/purchase';
import { IPurchase } from '@/models/purchase';

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  purchases: IPurchase[];
  totalCount: number;
  error?: boolean;
};

export default function PurchaseListingPage() {
  const [{ page, limit, q: search }] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(10),
    q: parseAsString.withDefault('')
  });
  const key = `${page}:${limit}`;
  const dataVersion = useDataVersion();
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Fetch purchases from API
    getAllPurchases({ page, limit })
      .then(({ purchases, totalCount }) => {
        if (!cancelled) setResult({ key, purchases, totalCount });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key, purchases: [], totalCount: 0, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [key, page, limit, dataVersion]);

  if (result?.key !== key)
    return <DataTableSkeleton columnCount={6} rowCount={8} filterCount={2} />;

  if (result.error) return <div>Error loading purchases.</div>;

  // ──────────────────────────────────────────────
  // Client-side search filter (example: supplier name)
  // ──────────────────────────────────────────────
  const filteredData = result.purchases.filter((item) =>
    item?.supplier?.name?.toLowerCase().includes(search.toLowerCase())
  );

  // ──────────────────────────────────────────────
  // Client-side pagination (in case API doesn’t paginate fully)
  // ──────────────────────────────────────────────
  const startIndex = (page - 1) * limit;
  const paginatedData = filteredData.slice(startIndex, startIndex + limit);

  return (
    <DataTable
      data={paginatedData}
      totalItems={result.totalCount}
      columns={purchaseColumns}
    />
  );
}
