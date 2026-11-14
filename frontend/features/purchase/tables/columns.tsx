'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import { PurchaseCellAction } from './cell-action';
import {
  IPurchase,
  PURCHASE_PAYMENT_STATUS_LABELS,
  PURCHASE_STATUS_LABELS,
  PurchasePaymentStatus,
  PurchaseStatus
} from '@/models/purchase';
import { Badge } from '@/components/ui/badge';

export const purchaseColumns: ColumnDef<IPurchase>[] = [
  {
    accessorKey: 'invoiceNo',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Invoice No' />
    ),
    cell: ({ cell }) => (
      <div className='font-medium'>
        {cell.getValue<IPurchase['invoiceNo']>()}
      </div>
    ),
    enableColumnFilter: true
  },
  {
    accessorKey: 'supplier',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Supplier' />
    ),
    cell: ({ cell }) => (
      <div>{cell.getValue<IPurchase['supplier']>()?.name || '-'}</div>
    ),
    enableColumnFilter: true
  },
  {
    accessorKey: 'store',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Store' />
    ),
    cell: ({ cell }) => (
      <div>{cell.getValue<IPurchase['store']>()?.name || '-'}</div>
    ),
    enableColumnFilter: true
  },
  {
    accessorKey: 'purchaseDate',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Purchase Date' />
    ),
    cell: ({ cell }) => {
      const date = cell.getValue<IPurchase['purchaseDate']>();
      return <div>{date ? new Date(date).toLocaleDateString() : '-'}</div>;
    },
    enableColumnFilter: true
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ cell }) => {
      const status = cell.getValue<PurchaseStatus>();

      const statusColors: Record<PurchaseStatus, string> = {
        RECEIVED: 'bg-green-500 text-white',
        PENDING: 'bg-yellow-500 text-white',
        REJECTED: 'bg-red-500 text-white'
      };

      return (
        <Badge className={statusColors[status]}>
          {PURCHASE_STATUS_LABELS[status] ?? status}
        </Badge>
      );
    },
    enableColumnFilter: true
  },
  {
    accessorKey: 'paymentStatus',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Payment' />
    ),
    cell: ({ row }) => {
      const paymentStatus = row.original.paymentStatus;
      const amountPaid = Number(row.original.amountPaid || 0);

      const paymentColors: Record<PurchasePaymentStatus, string> = {
        UNPAID: 'bg-red-500 text-white',
        PARTIALLY_PAID: 'bg-yellow-500 text-white',
        PAID: 'bg-green-500 text-white'
      };

      if (!paymentStatus) return <div>-</div>;
      return (
        <div className='flex flex-col items-start gap-1'>
          <Badge className={paymentColors[paymentStatus]}>
            {PURCHASE_PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus}
          </Badge>
          {paymentStatus === 'PARTIALLY_PAID' && (
            <span className='text-muted-foreground text-xs'>
              Paid {amountPaid.toFixed(2)}
            </span>
          )}
        </div>
      );
    },
    enableColumnFilter: true
  },
  {
    accessorKey: 'grandTotal',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Total Price' />
    ),
    cell: ({ cell }) => (
      <div className='font-medium'>
        {Number(cell.getValue<number>() ?? 0).toFixed(2)}
      </div>
    )
  },
  {
    accessorKey: 'totalProducts',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Total Product' />
    ),
    cell: ({ cell }) => (
      <div className='font-medium'>{cell.getValue<number>()}</div>
    )
  },

  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <PurchaseCellAction data={row.original} />
  }
];
