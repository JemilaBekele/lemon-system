'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { getAllRolePermissions } from '@/service/roleService';
import { rolePermissionColumns } from './tables/columns';

type PermissionListingPageProps = object;

type TRolePermission = Awaited<
  ReturnType<typeof getAllRolePermissions>
>['rolePermissions'][number];

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  rolePermissions: TRolePermission[];
  totalCount: number;
  error?: boolean;
};

export default function RolePermissionListingPage({}: PermissionListingPageProps) {
  const [{ page, limit, q, startDate: start, endDate: end }] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(10),
    q: parseAsString.withDefault(''),
    startDate: parseAsString.withDefault(''),
    endDate: parseAsString.withDefault('')
  });
  const search = q.toLowerCase();
  const startDate = start || undefined;
  const endDate = end || undefined;
  const key = `${page}:${limit}:${start}:${end}`;
  const dataVersion = useDataVersion();
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAllRolePermissions({ page, limit, startDate, endDate })
      .then(({ rolePermissions, totalCount }) => {
        if (!cancelled) setResult({ key, rolePermissions, totalCount });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key, rolePermissions: [], totalCount: 0, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [key, page, limit, startDate, endDate, dataVersion]);

  if (result?.key !== key)
    return <DataTableSkeleton columnCount={5} rowCount={8} filterCount={2} />;

  if (result.error)
    return <div className='text-red-500'>Error loading permissions list.</div>;

  // Client-side search filter on name or description
  const filteredData = result.rolePermissions.filter(
    (perm) =>
      perm.role?.name.toLowerCase().includes(search) ||
      (perm.permission?.name?.toLowerCase() ?? '').includes(search)
  );

  // Client-side pagination
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  return (
    <DataTable
      data={paginatedData}
      totalItems={result.totalCount}
      columns={rolePermissionColumns}
    />
  );
}
