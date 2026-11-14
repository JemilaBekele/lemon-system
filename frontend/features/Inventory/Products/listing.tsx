// features/Inventory/Products/listing.tsx
'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { getAllProducts } from '@/service/Product';
import { productColumns } from './tables/columns';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { IProduct } from '@/models/Product';
import ExportButtons from '@/components/export-button';

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  products: IProduct[];
  totalCount: number;
  error?: boolean;
};

export default function ProductsListingPage() {
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
    getAllProducts({ page, limit })
      .then(({ products, totalCount }) => {
        if (!cancelled) setResult({ key, products, totalCount });
      })
      .catch((err) => {
        console.error('Error loading products:', err);
        if (!cancelled)
          setResult({ key, products: [], totalCount: 0, error: true });
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
  const filteredData = result.products.filter(
    (item) =>
      item.name.toLowerCase().includes(searchLower) ||
      item.generic?.toLowerCase().includes(searchLower) ||
      item.productCode?.toLowerCase().includes(searchLower)
  );

  const startIndex = (page - 1) * limit;
  const paginatedData = filteredData.slice(startIndex, startIndex + limit);

  return (
    <div>
      <ExportButtons data={filteredData} />
      <DataTable
        data={paginatedData}
        totalItems={result.totalCount}
        columns={productColumns}
      />
    </div>
  );
}
