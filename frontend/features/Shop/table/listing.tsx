'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useDataVersion } from '@/lib/data-version';
import { DataTable } from '@/components/ui/table/newdatatable';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import { getAllSells, exportSells } from '@/service/Sell';
import { sellColumns } from './tables/columns';
import { ISell, SaleStatus } from '@/models/Sell';
import { AlertCircle } from 'lucide-react';
import { RadioGroup } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import ExportButtons from '@/components/ExportButtonsd';
import { StatusCard } from '../userbased/listing';
import { getAllEmployapi } from '@/service/employee';
import { IEmployee } from '@/models/employee';
import EmployeeFilter from './employee';
import UncheckedCorrectionsFilter from './UncheckedCorrectionsFilter'; // Import the client component
import ExportPeachtree from './peachtree-export';

// Keyed by query so a stale page never shows while a new one is loading.
type TLoadResult = {
  key: string;
  salesData: ISell[]; // just this page
  filteredCount: number;
  totalCount: number;
  statusCounts: Record<string, number>;
  uncheckedCount: number;
  error?: boolean;
};

const toIsoDate = (value: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date.toISOString();
};

export default function SellListingPage() {
  const getSaleStatusDisplayText = (status: SaleStatus): string => {
    switch (status) {
      case SaleStatus.APPROVED:
        return 'approved';
      case SaleStatus.NOT_APPROVED:
        return 'not approved';
      case SaleStatus.PARTIALLY_DELIVERED:
        return 'partially delivered';
      case SaleStatus.DELIVERED:
        return 'delivered';
      case SaleStatus.CANCELLED:
        return 'cancelled';
      default:
        return 'unknown';
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Query‑string inputs - Add employee filter
  // ────────────────────────────────────────────────────────────────
  const [params] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(10),
    q: parseAsString.withDefault(''),
    startDate: parseAsString.withDefault(''),
    endDate: parseAsString.withDefault(''),
    status: parseAsString.withDefault(''),
    employee: parseAsString.withDefault(''),
    unchecked: parseAsString.withDefault('')
  });
  const page = params.page || 1;
  const search = params.q || '';
  const limit = params.limit || 10;
  const startDate = toIsoDate(params.startDate);
  const endDate = toIsoDate(params.endDate);
  const statusFilter = params.status || 'all';
  const employeeFilter = params.employee || 'all';
  const uncheckedCorrectionsFilter = params.unchecked === 'true';

  // Helper function to build query strings
  const buildQueryStringLocal = (params: {
    status?: string;
    employee?: string;
    unchecked?: boolean;
    page?: string;
  }) => {
    const urlParams = new URLSearchParams();

    // Always include search if it exists
    if (search) urlParams.set('q', search);

    // Set page (default to 1 when changing filters)
    urlParams.set('page', params.page || '1');

    // Include limit
    urlParams.set('limit', limit.toString());

    // Include date filters if they exist
    if (startDate) urlParams.set('startDate', startDate);
    if (endDate) urlParams.set('endDate', endDate);

    // Set status
    urlParams.set('status', params.status || statusFilter);

    // Set employee - ensure it's a string
    const employeeValue = params.employee || employeeFilter;
    urlParams.set('employee', employeeValue.toString());

    // Set unchecked corrections filter
    const uncheckedValue = params.unchecked !== undefined ? params.unchecked : uncheckedCorrectionsFilter;
    if (uncheckedValue) {
      urlParams.set('unchecked', 'true');
    } else {
      urlParams.delete('unchecked');
    }

    return `?${urlParams.toString()}`;
  };

  // Build status filter URL helper (for StatusCard links)
  const buildStatusFilterUrl = (status: string) => {
    return buildQueryStringLocal({
      status: status,
      employee: employeeFilter,
      unchecked: uncheckedCorrectionsFilter,
      page: '1'
    });
  };

  // Wait until typing pauses before searching on the server
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Every filter is applied on the server, so all of them are part of the key
  const key = [
    page,
    limit,
    startDate ?? '',
    endDate ?? '',
    debouncedSearch,
    statusFilter,
    employeeFilter,
    uncheckedCorrectionsFilter
  ].join(':');
  const dataVersion = useDataVersion();
  const [result, setResult] = useState<TLoadResult | null>(null);
  const [employees, setEmployees] = useState<IEmployee[]>([]);

  // Employees for the dropdown: loaded once
  useEffect(() => {
    getAllEmployapi()
      .then((list: IEmployee[]) => setEmployees(list || []))
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAllSells({
      page,
      limit,
      startDate,
      endDate,
      q: debouncedSearch,
      status: statusFilter,
      employee: employeeFilter,
      unchecked: uncheckedCorrectionsFilter
    })
      .then((res) => {
        if (!cancelled)
          setResult({
            key,
            salesData: res.data,
            filteredCount: res.filteredCount,
            totalCount: res.totalCount,
            statusCounts: res.statusCounts,
            uncheckedCount: res.uncheckedCount
          });
      })
      .catch((error) => {
        console.error('Error loading sells:', error);
        if (!cancelled)
          setResult({
            key,
            salesData: [],
            filteredCount: 0,
            totalCount: 0,
            statusCounts: {},
            uncheckedCount: 0,
            error: true
          });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dataVersion]);

  if (result?.key !== key)
    return <DataTableSkeleton columnCount={6} rowCount={8} filterCount={2} />;

  if (result.error)
    return (
      <div className='p-4 text-red-500'>
        Error loading sells. Please try again later.
      </div>
    );

  // Counts come from the server and cover every sale in the date range
  const { salesData, filteredCount, totalCount, statusCounts } = result;
  const uncheckedCorrectionsCount = result.uncheckedCount;
  const allStatusCounts = {
    [SaleStatus.APPROVED]: statusCounts[SaleStatus.APPROVED] ?? 0,
    [SaleStatus.NOT_APPROVED]: statusCounts[SaleStatus.NOT_APPROVED] ?? 0,
    [SaleStatus.PARTIALLY_DELIVERED]:
      statusCounts[SaleStatus.PARTIALLY_DELIVERED] ?? 0,
    [SaleStatus.DELIVERED]: statusCounts[SaleStatus.DELIVERED] ?? 0,
    [SaleStatus.CANCELLED]: statusCounts[SaleStatus.CANCELLED] ?? 0
  };
  const totalSells = totalCount;
  const needsApprovalCount = allStatusCounts[SaleStatus.NOT_APPROVED];

  // Get selected employee name for display
  const selectedEmployee = employees.find((emp: IEmployee) => {
    const empId = emp.id;
    return empId === employeeFilter;
  });

  // The server already returned just this page
  const paginatedData = salesData;

  return (
    <div className='space-y-6'>
      {/* Export Buttons and Header */}
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Sales Management</div>
        <div className="flex flex-wrap items-start gap-2">
        <ExportPeachtree
          startDate={startDate}
          endDate={endDate}
          fetchSells={() =>
            exportSells({
              startDate,
              endDate,
              q: debouncedSearch,
              status: statusFilter,
              employee: employeeFilter,
              unchecked: uncheckedCorrectionsFilter,
              withItems: true
            })
          }
        />
        <ExportButtons 
          data={paginatedData} 
          fetchAll={() =>
            exportSells({
              startDate,
              endDate,
              q: debouncedSearch,
              status: statusFilter,
              employee: employeeFilter,
              unchecked: uncheckedCorrectionsFilter
            })
          }
          statusCounts={allStatusCounts}
          totalSells={totalSells}
        />
        </div>
      </div>

      {/* Employee Filter Dropdown - Client Component */}
      <EmployeeFilter
        employees={employees}
        currentEmployeeFilter={employeeFilter}
        statusFilter={statusFilter}
        search={search}
        limit={limit}
        startDate={startDate}
        endDate={endDate}
        uncheckedCorrectionsFilter={uncheckedCorrectionsFilter}
      />

      {/* Additional Filters Section */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-6">
          {/* Unchecked Corrections Filter - Client Component */}
          <UncheckedCorrectionsFilter
            isChecked={uncheckedCorrectionsFilter}
            count={uncheckedCorrectionsCount}
            search={search}
            limit={limit}
            startDate={startDate}
            endDate={endDate}
            statusFilter={statusFilter}
            employeeFilter={employeeFilter}
          />
        </div>
      </div>

      {/* Radio Group for Status Filter */}
      <RadioGroup
        defaultValue={statusFilter}
        className='space-y-3'
        value={statusFilter}
      >
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6'>
          <StatusCard
            title='All Sells'
            count={totalSells}
            variant='total'
            selected={statusFilter === 'all'}
            value='all'
            href={buildStatusFilterUrl('all')}
          />
          <StatusCard
            title='Approved'
            count={allStatusCounts[SaleStatus.APPROVED]}
            variant='approved'
            selected={statusFilter === SaleStatus.APPROVED}
            value={SaleStatus.APPROVED}
            href={buildStatusFilterUrl(SaleStatus.APPROVED)}
          />
          <StatusCard
            title='Not Approved'
            count={allStatusCounts[SaleStatus.NOT_APPROVED]}
            variant='notApproved'
            needsAttention={allStatusCounts[SaleStatus.NOT_APPROVED] > 0}
            selected={statusFilter === SaleStatus.NOT_APPROVED}
            value={SaleStatus.NOT_APPROVED}
            href={buildStatusFilterUrl(SaleStatus.NOT_APPROVED)}
          />
          <StatusCard
            title='Partially Delivered'
            count={allStatusCounts[SaleStatus.PARTIALLY_DELIVERED]}
            variant='partial'
            selected={statusFilter === SaleStatus.PARTIALLY_DELIVERED}
            value={SaleStatus.PARTIALLY_DELIVERED}
            href={buildStatusFilterUrl(SaleStatus.PARTIALLY_DELIVERED)}
          />
          <StatusCard
            title='Delivered'
            count={allStatusCounts[SaleStatus.DELIVERED]}
            variant='delivered'
            selected={statusFilter === SaleStatus.DELIVERED}
            value={SaleStatus.DELIVERED}
            href={buildStatusFilterUrl(SaleStatus.DELIVERED)}
          />
          <StatusCard
            title='Cancelled'
            count={allStatusCounts[SaleStatus.CANCELLED]}
            variant='cancelled'
            selected={statusFilter === SaleStatus.CANCELLED}
            value={SaleStatus.CANCELLED}
            href={buildStatusFilterUrl(SaleStatus.CANCELLED)}
          />
        </div>
      </RadioGroup>

      {/* Filter Status Display */}
      {(statusFilter !== 'all' || employeeFilter !== 'all' || uncheckedCorrectionsFilter) && (
        <div className='bg-muted/50 rounded-lg border p-4'>
          <div className='flex items-center justify-between'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline' className='text-sm'>
                Filters Applied
              </Badge>
              
              {statusFilter !== 'all' && (
                <Badge variant="secondary" className="text-sm">
                  Status: {getSaleStatusDisplayText(statusFilter as SaleStatus)}
                </Badge>
              )}
              
              {employeeFilter !== 'all' && selectedEmployee && (
                <Badge variant="secondary" className="text-sm">
                  Employee: {selectedEmployee.name}
                </Badge>
              )}
              
              {uncheckedCorrectionsFilter && (
                <Badge className="text-sm">
                  Unchecked Corrections Only
                </Badge>
              )}
              
              <span className='text-muted-foreground text-sm'>
                Showing {filteredCount} sale{filteredCount === 1 ? '' : 's'}
              </span>
            </div>
            
            <Link
              href={buildQueryStringLocal({
                status: 'all',
                employee: 'all',
                unchecked: false,
                page: '1'
              })}
              className='text-primary text-sm hover:underline'
            >
              Clear All Filters
            </Link>
          </div>
        </div>
      )}

      {/* Attention Banners */}
      {needsApprovalCount > 0 && (
        <div className='rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20'>
          <div className='flex items-center gap-2'>
            <AlertCircle className='h-5 w-5 text-amber-600 dark:text-amber-400' />
            <h3 className='font-semibold text-amber-800 dark:text-amber-300'>
              Attention Required
            </h3>
          </div>
          <p className='mt-1 text-sm text-amber-700 dark:text-amber-400'>
            You have {needsApprovalCount} sale
            {needsApprovalCount === 1 ? '' : 's'} waiting for approval. Please
            review and approve them to proceed with delivery.
          </p>
        </div>
      )}

      {/* Unchecked Corrections Attention Banner */}
      {uncheckedCorrectionsCount > 0 && !uncheckedCorrectionsFilter && (
        <div className='rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <AlertCircle className='h-5 w-5 text-blue-600 dark:text-blue-400' />
              <h3 className='font-semibold text-blue-800 dark:text-blue-300'>
                Stock Corrections Need Checking
              </h3>
            </div>
            <Link
              href={buildQueryStringLocal({
                unchecked: true,
                page: '1'
              })}
              className='text-blue-600 text-sm hover:underline dark:text-blue-400'
            >
              View All
            </Link>
          </div>
          <p className='mt-1 text-sm text-blue-700 dark:text-blue-400'>
            You have {uncheckedCorrectionsCount} sell
            {uncheckedCorrectionsCount === 1 ? '' : 's'} with unchecked stock corrections.
            Please review and mark them as checked.
          </p>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        data={paginatedData}
        totalItems={filteredCount}
        columns={sellColumns}
        currentPage={page}
        itemsPerPage={limit}
        searchValue={search}
        statusFilter={statusFilter}
        employeeFilter={employeeFilter}
        uncheckedCorrectionsFilter={uncheckedCorrectionsFilter}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
}
