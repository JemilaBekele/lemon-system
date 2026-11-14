'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { getAllSellStockCorrections } from '@/service/SellStockCorrection';
import { stockCorrectionColumns } from './tables/columns';
import { ISellStockCorrection } from '@/models/SellStockCorrection';

type StockCorrectionListingPageProps = object;

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  data: ISellStockCorrection[];
  totalCount: number;
  error?: boolean;
};

export default function StockCorrectionListingPage({}: StockCorrectionListingPageProps) {
  // ────────────────────────────────────────────────────────────────
  // Query‑string inputs
  // ────────────────────────────────────────────────────────────────
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
    // Fetch data from API
    getAllSellStockCorrections({ page, limit })
      .then(({ data, totalCount }) => {
        if (!cancelled) setResult({ key, data, totalCount });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key, data: [], totalCount: 0, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [key, page, limit, dataVersion]);

  if (result?.key !== key)
    return <DataTableSkeleton columnCount={6} rowCount={8} filterCount={2} />;

  if (result.error)
    return (
      <div className='p-4 text-red-500'>
        Error loading stock corrections. Please try again later.
      </div>
    );

  // ────────────────────────────────────────────────────────────────
  // Client‑side search filter
  // ────────────────────────────────────────────────────────────────
  const filteredData = result.data.filter((item: ISellStockCorrection) => {
    const searchLower = search.toLowerCase();

    const referenceMatch = item.reference?.toLowerCase().includes(searchLower);
    const notesMatch = item.notes?.toLowerCase().includes(searchLower);
    const createdByMatch = item.createdBy?.name
      ?.toLowerCase()
      .includes(searchLower);

    return referenceMatch || notesMatch || createdByMatch;
  });

  // ────────────────────────────────────────────────────────────────
  // Client‑side pagination
  // ────────────────────────────────────────────────────────────────
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  return (
    <DataTable
      data={paginatedData}
      totalItems={result.totalCount}
      columns={stockCorrectionColumns}
    />
  );
}
