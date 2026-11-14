// File: employee-listing-page.tsx
'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { employeeColumns } from './employee-tables/columns';
import { getAllEmployees } from '@/service/employee';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { IEmployee } from '@/models/employee';

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  employees: IEmployee[];
  totalCount: number;
  error?: boolean;
};

// Same normalisation the server-side searchParamsCache applied:
// a valid date becomes an ISO string, anything else is dropped.
function toIsoDate(value: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date.toISOString();
}

type EmployeeListingPageProps = object;

export default function EmployeeListingPage({}: EmployeeListingPageProps) {
  const [{ page, limit, q: search, startDate: rawStart, endDate: rawEnd }] =
    useQueryStates({
      page: parseAsInteger.withDefault(1),
      limit: parseAsInteger.withDefault(10),
      q: parseAsString.withDefault(''),
      startDate: parseAsString,
      endDate: parseAsString
    });
  const startDate = toIsoDate(rawStart); // Will be undefined if not in params
  const endDate = toIsoDate(rawEnd); // Will be undefined if not in params
  const key = `${page}:${startDate ?? ''}:${endDate ?? ''}`;
  const dataVersion = useDataVersion();
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAllEmployees({ page, startDate, endDate })
      .then(({ success, totalCount, employees = [] }) => {
        if (!success) throw new Error('Failed to fetch employees');
        if (!cancelled) setResult({ key, employees, totalCount });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key, employees: [], totalCount: 0, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [key, page, startDate, endDate, dataVersion]);

  if (result?.key !== key)
    return <DataTableSkeleton columnCount={6} rowCount={8} filterCount={2} />;

  if (result.error) return <div>Error loading employees</div>;

  // Apply client-side search filter
  const searchLower = search.toLowerCase();
  const filteredData = result.employees.filter(
    (item) =>
      item.name.toLowerCase().includes(searchLower) ||
      item.email?.toLowerCase().includes(searchLower) ||
      item.phone?.toLowerCase().includes(searchLower)
  );

  // Implement client-side pagination
  const startIndex = (page - 1) * limit;
  const paginatedData = filteredData.slice(startIndex, startIndex + limit);

  return (
    <DataTable
      data={paginatedData}
      totalItems={result.totalCount}
      columns={employeeColumns}
    />
  );
}
