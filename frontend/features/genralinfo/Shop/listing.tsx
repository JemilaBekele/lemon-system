'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { shopColumns } from './tables/columns'; // Make sure you have columns defined for Shop
import { getAllshop } from '@/service/shop';
import { IShop } from '@/models/shop';

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  shops: IShop[];
  totalCount: number;
  error?: boolean;
};

type ShopListingPageProps = object;

export default function ShopListingPage({}: ShopListingPageProps) {
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
    // Fetch shops from API
    getAllshop({ page })
      .then(({ shops, totalCount }) => {
        if (!cancelled) setResult({ key, shops, totalCount });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key, shops: [], totalCount: 0, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [key, page, dataVersion]);

  if (result?.key !== key)
    return <DataTableSkeleton columnCount={6} rowCount={8} filterCount={2} />;

  if (result.error)
    return (
      <div className='p-4 text-red-500'>
        Error loading shops. Please try again later.
      </div>
    );

  // ─────────────────────────────────────────────
  // Client‑side search filtering by name or branch/location
  // ─────────────────────────────────────────────
  const filteredData = result.shops.filter((shop) =>
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
      columns={shopColumns}
    />
  );
}
