'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { getAllUnitsOfMeasure } from '@/service/UnitOfMeasure';
import { unitOfMeasureColumns } from './tables/columns';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { IUnitOfMeasure } from '@/models/UnitOfMeasure';

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  units: IUnitOfMeasure[];
  totalCount: number;
  error?: boolean;
};

type UnitsListingPageProps = object;

export default function UnitsListingPage({}: UnitsListingPageProps) {
  // ────────────────────────────────────────────────────────────────
  // Query-string inputs
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
    getAllUnitsOfMeasure({ page, limit })
      .then(({ units, totalCount }) => {
        if (!cancelled) setResult({ key, units, totalCount });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key, units: [], totalCount: 0, error: true });
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
        Error loading units of measure. Please try again later.
      </div>
    );

  // ────────────────────────────────────────────────────────────────
  // Client-side search filter
  // ────────────────────────────────────────────────────────────────
  const filteredData = result.units.filter((item: IUnitOfMeasure) =>
    item.name?.toLowerCase().includes(search.toLowerCase())
  );

  // ────────────────────────────────────────────────────────────────
  // Client-side pagination
  // ────────────────────────────────────────────────────────────────
  const startIndex = (page - 1) * limit;
  const paginatedData = filteredData.slice(startIndex, startIndex + limit);

  return (
    <DataTable
      data={paginatedData}
      totalItems={result.totalCount}
      columns={unitOfMeasureColumns}
    />
  );
}
