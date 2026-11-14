'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { getAllSuppliers } from '@/service/supplier';
import { supplierColumns } from './tables/columns';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { ISupplier } from '@/models/supplier';

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  suppliers: ISupplier[];
  totalCount: number;
  error?: boolean;
};

export default function SuppliersListingPage() {
  const [{ page, limit, q }] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(10),
    q: parseAsString.withDefault('')
  });
  const key = `${page}:${limit}`;
  const dataVersion = useDataVersion();
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAllSuppliers({ page, limit })
      .then(({ suppliers, totalCount }) => {
        if (!cancelled) setResult({ key, suppliers, totalCount });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key, suppliers: [], totalCount: 0, error: true });
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
        Error loading suppliers. Please try again later.
      </div>
    );

  // Client-side search filter
  const filteredData = result.suppliers.filter((item) =>
    item.name?.toLowerCase().includes(q.toLowerCase())
  );

  // Client-side pagination
  const startIndex = (page - 1) * limit;
  const paginatedData = filteredData.slice(startIndex, startIndex + limit);

  return (
    <DataTable
      data={paginatedData}
      totalItems={result.totalCount}
      columns={supplierColumns}
    />
  );
}
