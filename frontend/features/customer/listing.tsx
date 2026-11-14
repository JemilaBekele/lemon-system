'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { getAllCustomers } from '@/service/customer';
import { customerColumns } from './tables/columns';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { ICustomer } from '@/models/customer';

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  customers: ICustomer[];
  totalCount: number;
  error?: boolean;
};

type CustomersListingPageProps = object;

export default function CustomersListingPage({}: CustomersListingPageProps) {
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
    getAllCustomers({ page, limit })
      .then(({ customers, totalCount }) => {
        if (!cancelled) setResult({ key, customers, totalCount });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key, customers: [], totalCount: 0, error: true });
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
        Error loading customers. Please try again later.
      </div>
    );

  // ────────────────────────────────────────────────────────────────
  // Client‑side search filter
  // ────────────────────────────────────────────────────────────────
  const filteredData = result.customers.filter((item) =>
    `${item.name} ${item.phone1} ${item.phone2}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  // ────────────────────────────────────────────────────────────────
  // Client‑side pagination
  // ────────────────────────────────────────────────────────────────
  const startIndex = (page - 1) * limit;
  const paginatedData = filteredData.slice(startIndex, startIndex + limit);

  return (
    <DataTable
      data={paginatedData}
      totalItems={result.totalCount}
      columns={customerColumns}
    />
  );
}
