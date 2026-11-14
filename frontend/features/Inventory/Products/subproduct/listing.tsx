'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { getAllSubProducts } from '@/service/Product';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { ISubProduct } from '@/models/Product';
import { SubproductColumns } from './columns';

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  subProducts: ISubProduct[];
  totalCount: number;
  error?: boolean;
};

export default function SubProductsListingPage() {
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
    getAllSubProducts({ page, limit })
      .then(({ subProducts, totalCount }) => {
        if (!cancelled) setResult({ key, subProducts, totalCount });
      })
      .catch((err) => {
        console.error('Error loading products:', err);
        if (!cancelled)
          setResult({ key, subProducts: [], totalCount: 0, error: true });
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
        Error loading products. Please try again later.
      </div>
    );

  const searchLower = q.toLowerCase();
  const filteredData = result.subProducts.filter((item) =>
    item.name.toLowerCase().includes(searchLower)
  );

  const startIndex = (page - 1) * limit;
  const paginatedData = filteredData.slice(startIndex, startIndex + limit);

  return (
    <div>
      <DataTable
        data={paginatedData}
        totalItems={result.totalCount}
        columns={SubproductColumns}
      />
    </div>
  );
}
