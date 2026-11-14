'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { getSubCategoriesByCategory } from '@/service/Category';
import { subCategoryColumns } from './tables/columns';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { ISubCategory } from '@/models/Category';

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  subcategories: ISubCategory[];
  totalCount: number;
  error?: boolean;
};

type SubCategoriesListingPageProps = object;

export default function SubCategoriesListingPage({}: SubCategoriesListingPageProps) {
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
    getSubCategoriesByCategory({ page, limit })
      .then(({ subcategories = [], totalCount = 0 }) => {
        if (!cancelled) setResult({ key, subcategories, totalCount });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key, subcategories: [], totalCount: 0, error: true });
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
        Error loading subcategories. Please try again later.
      </div>
    );

  const filteredData = result.subcategories.filter((item) =>
    item.name?.toLowerCase().includes(search.toLowerCase())
  );

  const startIndex = (page - 1) * limit;
  const paginatedData = filteredData.slice(startIndex, startIndex + limit);

  return (
    <DataTable
      data={paginatedData}
      totalItems={result.totalCount}
      columns={subCategoryColumns}
    />
  );
}
