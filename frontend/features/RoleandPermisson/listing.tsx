'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { getAllRoles } from '@/service/roleService';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { roleColumns } from './tables/columns'; // Adjust to your actual path

type TRole = Awaited<ReturnType<typeof getAllRoles>>['roles'][number];

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  roles: TRole[];
  totalCount: number;
  error?: boolean;
};

export default function RoleListingPage() {
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
    getAllRoles({ page, limit })
      .then(({ roles, totalCount }) => {
        if (!cancelled) setResult({ key, roles, totalCount });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key, roles: [], totalCount: 0, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [key, page, limit, dataVersion]);

  if (result?.key !== key)
    return <DataTableSkeleton columnCount={5} rowCount={8} filterCount={2} />;

  if (result.error)
    return <div className='text-red-500'>Error loading role list.</div>;

  // Optional client-side filtering (by name or description)
  const filteredData = result.roles.filter((role) =>
    `${role.name} ${role.description ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  return (
    <DataTable
      data={paginatedData}
      totalItems={result.totalCount}
      columns={roleColumns}
    />
  );
}
