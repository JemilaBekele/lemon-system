'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { getAllPermissions } from '@/service/roleService';
import { permissionColumns } from './permcolumn';

type TPermission = Awaited<
  ReturnType<typeof getAllPermissions>
>['permissions'][number];

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  permissions: TPermission[];
  totalCount: number;
  error?: boolean;
};

export default function PermissionListingPage() {
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
    getAllPermissions({ page, limit })
      .then(({ permissions, totalCount }) => {
        if (!cancelled) setResult({ key, permissions, totalCount });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key, permissions: [], totalCount: 0, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [key, page, limit, dataVersion]);

  if (result?.key !== key)
    return <DataTableSkeleton columnCount={5} rowCount={8} filterCount={2} />;

  if (result.error)
    return <div className='text-red-500'>Error loading permission list.</div>;

  // Optional client-side search filtering by name or description
  const filteredData = result.permissions.filter((perm) =>
    `${perm.name} ${perm.description ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  // Pagination (slice filtered results)
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  return (
    <DataTable
      data={paginatedData}
      totalItems={result.totalCount}
      columns={permissionColumns}
    />
  );
}
