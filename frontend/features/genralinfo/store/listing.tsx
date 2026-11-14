'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { storeColumns } from './tables/columns'; // Make sure you have columns defined for Shop
import { getAllstore } from '@/service/store';
import { IStore } from '@/models/store';

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  stores: IStore[];
  totalCount: number;
  error?: boolean;
};

type ShopListingPageProps = object;

export default function StoreListingPage({}: ShopListingPageProps) {
  const [{ page, limit, q: search }] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(10),
    q: parseAsString.withDefault('')
  });
  const key = `${page}`;
  const dataVersion = useDataVersion();
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Fetch stores from API
    getAllstore({ page })
      .then(({ stores, totalCount }) => {
        if (!cancelled) setResult({ key, stores, totalCount });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key, stores: [], totalCount: 0, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [key, page, dataVersion]);

  if (result?.key !== key)
    return <DataTableSkeleton columnCount={6} rowCount={8} filterCount={2} />;

  if (result.error) return <div>Error loading shops list.</div>;

  // ─────────────────────────────────────────────
  // Client‑side search filtering by name or branch/location
  // ─────────────────────────────────────────────
  const filteredData = result.stores.filter((shop) =>
    `${shop.name} `.toLowerCase().includes(search.toLowerCase())
  );

  // ─────────────────────────────────────────────
  // Pagination
  // ─────────────────────────────────────────────
  const startIndex = (page - 1) * limit;
  const paginatedData = filteredData.slice(startIndex, startIndex + limit);

  return (
    <DataTable
      data={paginatedData}
      totalItems={result.totalCount}
      columns={storeColumns}
    />
  );
}
