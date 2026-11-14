'use client';

// Stock ledger card shared by the product and sub-product detail pages:
// every movement with a running balance, branch and sales filters, sale
// details (customer, salesperson, unit price) and Excel export.

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Download, FileText, Filter, ShoppingBag, Store, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  exportStockLedgerToExcel,
  StockLedgerExportData
} from '@/lib/exportExcel';

import type { IStockLedgerEntry } from '@/models/StockLedger';

export type { IStockLedgerEntry };

const formatDateTime = (dateString: string) => {
  try {
    return format(new Date(dateString), 'PPP pp');
  } catch {
    return dateString;
  }
};

const formatUnitPrice = (value: number | null) =>
  value === null || value === undefined
    ? '-'
    : Number(value).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

const isIn = (ledger: IStockLedgerEntry) => ledger.movementType.includes('IN');
const isOut = (ledger: IStockLedgerEntry) => ledger.movementType.includes('OUT');

// Reference cell: sale invoices link to the sale
function ReferenceCell({ ledger }: { ledger: IStockLedgerEntry }) {
  const text = ledger.invoiceNo || ledger.reference;
  if (!text) return <>N/A</>;
  if (!text.startsWith('Sell-')) return <span>{text}</span>;
  return (
    <a
      href={`/dashboard/Products/view/sell?id=${text.replace(/^Sell-/, '')}`}
      target='_blank'
      rel='noopener noreferrer'
      className='text-primary hover:text-primary/80 underline transition-colors'
      title='View invoice details'
    >
      {text}
    </a>
  );
}

export default function StockLedgerCard({
  ledgers,
  unitSymbol,
  name,
  code
}: {
  ledgers: IStockLedgerEntry[];
  unitSymbol: string;
  name: string; // product (or "product — sub-product") name for the export
  code: string;
}) {
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  // 'all' movements, 'sales' only, or a salesperson id
  const [salesFilter, setSalesFilter] = useState<string>('all');

  const branches = useMemo(() => {
    const map = new Map<string, string>();
    ledgers.forEach((ledger) => {
      const branch = ledger.store?.branch || ledger.shop?.branch;
      if (branch?.id) map.set(branch.id, branch.name);
    });
    return Array.from(map, ([id, branchName]) => ({ id, name: branchName }));
  }, [ledgers]);

  const salespeople = useMemo(() => {
    const map = new Map<string, string>();
    ledgers.forEach((ledger) => {
      const person = ledger.sale?.salesperson;
      if (person) map.set(person.id, person.name);
    });
    return Array.from(map, ([id, personName]) => ({ id, name: personName })).sort(
      (a, b) => a.name.localeCompare(b.name)
    );
  }, [ledgers]);

  const branchLedgers = useMemo(
    () =>
      selectedBranch === 'all'
        ? ledgers
        : ledgers.filter(
            (ledger) =>
              ledger.store?.branch?.id === selectedBranch ||
              ledger.shop?.branch?.id === selectedBranch
          ),
    [ledgers, selectedBranch]
  );

  // Oldest first, with the running balance worked out over every movement in
  // the branch; the sales filter then only hides rows, so balances stay true
  const ledgerRows = useMemo(() => {
    const sorted = [...branchLedgers].sort(
      (a, b) =>
        new Date(a.movementDate).getTime() - new Date(b.movementDate).getTime()
    );
    let runningBalance = 0;
    const withBalance = sorted.map((ledger) => {
      if (isIn(ledger)) runningBalance += Math.abs(ledger.quantity);
      else if (isOut(ledger)) runningBalance -= Math.abs(ledger.quantity);
      return { ledger, balance: runningBalance };
    });
    if (salesFilter === 'all') return withBalance;
    return withBalance.filter(({ ledger }) =>
      salesFilter === 'sales'
        ? !!ledger.sale
        : ledger.sale?.salesperson?.id === salesFilter
    );
  }, [branchLedgers, salesFilter]);

  const finalBalance = branchLedgers.reduce((balance, ledger) => {
    if (isIn(ledger)) return balance + Math.abs(ledger.quantity);
    if (isOut(ledger)) return balance - Math.abs(ledger.quantity);
    return balance;
  }, 0);

  const unitOf = (ledger: IStockLedgerEntry) =>
    ledger.unitOfMeasure?.symbol || unitSymbol;

  const handleExportExcel = () => {
    try {
      if (ledgerRows.length === 0) {
        toast.error('No data to export');
        return;
      }
      // Same rows and balances as the table (branch + sales filter)
      const exportData: StockLedgerExportData[] = ledgerRows.map(
        ({ ledger, balance }) => ({
          Date: formatDateTime(ledger.movementDate),
          Type: ledger.movementType,
          Batch: ledger.batch?.batchNumber || 'N/A',
          Location: ledger.store
            ? `Store: ${ledger.store.name}`
            : ledger.shop
              ? `Shop: ${ledger.shop.name}`
              : 'N/A',
          Branch: ledger.store?.branch?.name || ledger.shop?.branch?.name || 'N/A',
          In: isIn(ledger) ? `${ledger.quantity} ${unitOf(ledger)}` : '-',
          Out: isOut(ledger) ? `${Math.abs(ledger.quantity)} ${unitOf(ledger)}` : '-',
          Balance: `${balance} ${unitOf(ledger)}`,
          'Reference/Invoice': ledger.invoiceNo || ledger.reference || 'N/A',
          Customer: ledger.sale?.customerName || '-',
          Salesperson: ledger.sale?.salesperson?.name || '-',
          'Unit Price': formatUnitPrice(ledger.unitPrice),
          User: ledger.user?.name || 'System',
          Notes: ledger.notes || 'N/A'
        })
      );
      exportStockLedgerToExcel(
        exportData,
        {
          productName: name,
          productCode: code,
          unitSymbol,
          selectedBranch,
          finalBalance: `${finalBalance} ${unitSymbol}`
        },
        `${code}_${name.replace(/\s+/g, '_')}_Stock_Ledger`
      );
      toast.success('Excel file downloaded successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export Excel file');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
          <CardTitle className='flex items-center gap-2'>
            <FileText className='text-primary h-5 w-5' />
            Stock Ledger ({ledgerRows.length})
          </CardTitle>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={handleExportExcel}
              disabled={ledgerRows.length === 0}
              className='gap-2'
            >
              <Download className='h-4 w-4' />
              Export Excel
            </Button>
            <Select value={salesFilter} onValueChange={setSalesFilter}>
              <SelectTrigger className='w-full sm:w-48' aria-label='Sales filter'>
                <SelectValue placeholder='Sales filter' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All movements</SelectItem>
                <SelectItem value='sales'>Sales only</SelectItem>
                {salespeople.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    Sales by {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Filter className='text-muted-foreground hidden h-4 w-4 sm:block' />
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className='w-full sm:w-45' aria-label='Branch filter'>
                <SelectValue placeholder='Filter by branch' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Branches</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {ledgerRows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Reference/Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Salesperson</TableHead>
                <TableHead className='text-right'>Unit Price</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledgerRows.map(({ ledger, balance }) => (
                <TableRow key={ledger.id}>
                  <TableCell>{formatDateTime(ledger.movementDate)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        isIn(ledger) ? 'default' : isOut(ledger) ? 'destructive' : 'secondary'
                      }
                    >
                      {ledger.movementType}
                    </Badge>
                  </TableCell>
                  <TableCell>{ledger.batch?.batchNumber || 'N/A'}</TableCell>
                  <TableCell>
                    {ledger.store ? (
                      <div className='flex items-center gap-1'>
                        <Store className='h-3 w-3' />
                        {ledger.store.name}
                      </div>
                    ) : ledger.shop ? (
                      <div className='flex items-center gap-1'>
                        <ShoppingBag className='h-3 w-3' />
                        {ledger.shop.name}
                      </div>
                    ) : (
                      'N/A'
                    )}
                  </TableCell>
                  <TableCell>
                    {ledger.store?.branch?.name || ledger.shop?.branch?.name || 'N/A'}
                  </TableCell>
                  <TableCell className='font-medium text-green-600'>
                    {isIn(ledger) ? `${ledger.quantity} ${unitOf(ledger)}` : '-'}
                  </TableCell>
                  <TableCell className='font-medium text-red-600'>
                    {isOut(ledger) ? `${Math.abs(ledger.quantity)} ${unitOf(ledger)}` : '-'}
                  </TableCell>
                  <TableCell className='font-bold'>
                    {balance} {unitOf(ledger)}
                  </TableCell>
                  <TableCell>
                    <ReferenceCell ledger={ledger} />
                  </TableCell>
                  <TableCell
                    className='max-w-40 truncate'
                    title={ledger.sale?.customerName || ''}
                  >
                    {ledger.sale?.customerName || '-'}
                  </TableCell>
                  <TableCell>{ledger.sale?.salesperson?.name || '-'}</TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatUnitPrice(ledger.unitPrice)}
                  </TableCell>
                  <TableCell>
                    {ledger.user ? (
                      <div className='flex items-center gap-1'>
                        <User className='h-3 w-3' />
                        {ledger.user.name}
                      </div>
                    ) : (
                      'System'
                    )}
                  </TableCell>
                  <TableCell className='max-w-50 truncate' title={ledger.notes || ''}>
                    {ledger.notes || 'N/A'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <tfoot>
              <TableRow className='bg-muted/50'>
                <TableCell colSpan={7} className='text-right font-bold'>
                  Final Balance:
                </TableCell>
                <TableCell className='text-lg font-bold'>
                  {finalBalance} {unitSymbol}
                </TableCell>
                <TableCell colSpan={6}></TableCell>
              </TableRow>
            </tfoot>
          </Table>
        ) : (
          <p className='text-muted-foreground'>
            {salesFilter !== 'all' && branchLedgers.length > 0
              ? 'No sales match this filter'
              : selectedBranch === 'all'
                ? 'No stock movements recorded'
                : 'No stock movements found for selected branch'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
