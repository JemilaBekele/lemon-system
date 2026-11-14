'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { getAllbranches } from '@/service/branch';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { IBranch } from '@/models/Branch';
import { branchColumns } from './tables/columns'; // Adjust path to your branch columns

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  branches: IBranch[];
  totalCount: number;
  error?: boolean;
};

type BranchListingPageProps = object;

export default function BranchListingPage({}: BranchListingPageProps) {
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
    // Fetch branches from API
    getAllbranches({ page, limit })
      .then(({ branches, totalCount }) => {
        if (!cancelled) setResult({ key, branches, totalCount });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key, branches: [], totalCount: 0, error: true });
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
        Error loading branches. Please try again later.
      </div>
    );

  // ─────────────────────────────────────────────
  // Client-side search filtering by name
  // ─────────────────────────────────────────────
  const filteredData = result.branches.filter((branch) =>
    branch.name.toLowerCase().includes(search.toLowerCase())
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
      columns={branchColumns}
    />
  );
}
