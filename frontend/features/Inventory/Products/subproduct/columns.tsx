/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import Link from 'next/link';

import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import { CalendarDays, Package, Store, ShoppingCart, Boxes, Tag } from 'lucide-react';
import { SubproductCellAction } from './cell-action'; // Update to subproduct cell action
import { ISubProduct } from '@/models/Product';

export const SubproductColumns: ColumnDef<ISubProduct>[] = [
  {
    accessorKey: 'subProductCode',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Code' />
    ),
    cell: ({ cell }) => <div>{cell.getValue<ISubProduct['subProductCode']>()}</div>,
    enableColumnFilter: true
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Subproduct Name' />
    ),
    cell: ({ row }) => (
      <div className='flex flex-col gap-1'>
        <div className='flex items-center gap-2'>
          <Package className='text-muted-foreground h-4 w-4' />
          <Link
            href={`/dashboard/subproduct/view?id=${row.original.id}`}
            className='text-primary font-medium hover:underline'
            title='View sub-product details'
          >
            {row.original.name}
          </Link>
        </div>
        <div className='flex items-center gap-2 text-xs text-gray-500'>
          <Tag className='h-3 w-3' />
          <span>Parent: {row.original.product?.name || 'N/A'}</span>
        </div>
      </div>
    ),
    enableColumnFilter: true
  },
  {
    id: 'parentProduct',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Parent Product' />
    ),
    cell: ({ row }) => {
      const product = row.original.product;
      return (
        <div className='space-y-1'>
          <div className='flex items-center gap-2'>
            <Boxes className='h-4 w-4 text-purple-500' />
            <span className='font-medium'>{product?.name || 'N/A'}</span>
          </div>
          <div className='text-muted-foreground ml-6 text-xs'>
            <div>Code: {product?.productCode || 'N/A'}</div>
            {product?.category && (
              <div>Category: {product.category.name}</div>
            )}
          </div>
        </div>
      );
    },
    enableColumnFilter: true
  },
  {
    id: 'shopStocks',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Shop Stock' />
    ),
    cell: ({ row }) => {
      const shopStocks = row.original.stockSummary?.shopStocks || {};
      return (
        <div className='space-y-1'>
          {Object.entries(shopStocks).map(([shopName, stockInfo]: [string, any]) => (
            <div key={shopName} className='text-sm'>
              <div className='flex items-center gap-1'>
                <ShoppingCart className='h-3 w-3 text-blue-500' />
                <span className='font-medium'>{shopName}:</span>
                <span className='text-muted-foreground ml-1'>
                  {stockInfo?.quantity || 0}
                </span>
                {stockInfo?.branchName && (
                  <span className='text-muted-foreground ml-1 text-xs'>
                    ({stockInfo.branchName})
                  </span>
                )}
              </div>
            </div>
          ))}
          {Object.keys(shopStocks).length === 0 && (
            <span className='text-muted-foreground text-sm'>No shop stock</span>
          )}
        </div>
      );
    },
    enableSorting: false,
    enableColumnFilter: false
  },
  {
    id: 'storeStocks',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Store Stock' />
    ),
    cell: ({ row }) => {
      const storeStocks = row.original.stockSummary?.storeStocks || {};
      return (
        <div className='space-y-1'>
          {Object.entries(storeStocks).map(([storeName, stockInfo]: [string, any]) => (
            <div key={storeName} className='text-sm'>
              <div className='flex items-center gap-1'>
                <Store className='h-3 w-3 text-green-500' />
                <span className='font-medium'>{storeName}:</span>
                <span className='text-muted-foreground ml-1'>
                  {stockInfo?.quantity || 0}
                </span>
                {stockInfo?.branchName && (
                  <span className='text-muted-foreground ml-1 text-xs'>
                    ({stockInfo.branchName})
                  </span>
                )}
              </div>
            </div>
          ))}
          {Object.keys(storeStocks).length === 0 && (
            <span className='text-muted-foreground text-sm'>No store stock</span>
          )}
        </div>
      );
    },
    enableSorting: false,
    enableColumnFilter: false
  },
  {
    id: 'totalStock',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Branch Stock Summary' />
    ),
    cell: ({ row }) => {
      const { shopStocks = {}, storeStocks = {} } = row.original.stockSummary || {};

      const shopBranchTotals: Record<string, number> = {};
      const storeBranchTotals: Record<string, number> = {};
      const combinedBranchTotals: Record<string, number> = {};

      // Process shop stocks by branch
      Object.values(shopStocks).forEach((stockInfo: any) => {
        const branchName = stockInfo?.branchName || 'Unknown Branch';
        const quantity = stockInfo?.quantity || 0;

        shopBranchTotals[branchName] = (shopBranchTotals[branchName] || 0) + quantity;
        combinedBranchTotals[branchName] = (combinedBranchTotals[branchName] || 0) + quantity;
      });

      // Process store stocks by branch
      Object.values(storeStocks).forEach((stockInfo: any) => {
        const branchName = stockInfo?.branchName || 'Unknown Branch';
        const quantity = stockInfo?.quantity || 0;

        storeBranchTotals[branchName] = (storeBranchTotals[branchName] || 0) + quantity;
        combinedBranchTotals[branchName] = (combinedBranchTotals[branchName] || 0) + quantity;
      });

      const allBranches = Array.from(
        new Set([
          ...Object.keys(shopBranchTotals),
          ...Object.keys(storeBranchTotals)
        ])
      ).sort();

      const totalCombined = Object.values(combinedBranchTotals).reduce(
        (sum, qty) => sum + qty,
        0
      );

      return (
        <div className='space-y-3'>
          {allBranches.length > 0 ? (
            <div className='space-y-2'>
              {allBranches.map((branchName) => {
                const shopQty = shopBranchTotals[branchName] || 0;
                const storeQty = storeBranchTotals[branchName] || 0;
                const combinedQty = combinedBranchTotals[branchName] || 0;

                return (
                  <div key={branchName} className='space-y-1'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <Package className='h-3 w-3 text-amber-500' />
                        <span className='text-sm font-medium'>
                          {branchName}
                        </span>
                      </div>
                      <span className='text-sm font-bold'>{combinedQty}</span>
                    </div>

                    <div className='text-muted-foreground ml-5 space-y-1 text-xs'>
                      {shopQty > 0 && (
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-1'>
                            <ShoppingCart className='h-2.5 w-2.5 text-blue-500' />
                            <span>Shops:</span>
                          </div>
                          <span>{shopQty}</span>
                        </div>
                      )}
                      {storeQty > 0 && (
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-1'>
                            <Store className='h-2.5 w-2.5 text-green-500' />
                            <span>Stores:</span>
                          </div>
                          <span>{storeQty}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <span className='text-muted-foreground text-sm'>
              No stock in any branch
            </span>
          )}

          <div className='space-y-2 border-t pt-2'>
            <div className='flex items-center justify-between border-t pt-2 text-sm font-bold'>
              <div className='flex items-center gap-2'>
                <Package className='h-3 w-3 text-amber-500' />
                <span>Total :</span>
              </div>
              <span className='text-lg'>{totalCombined}</span>
            </div>
          </div>
        </div>
      );
    },
    enableSorting: true,
    sortingFn: (rowA, rowB) => {
      const getTotalStock = (row: any) => {
        const { shopStocks = {}, storeStocks = {} } = row.original.stockSummary || {};
        let total = 0;

        Object.values(shopStocks).forEach((stockInfo: any) => {
          total += stockInfo?.quantity || 0;
        });

        Object.values(storeStocks).forEach((stockInfo: any) => {
          total += stockInfo?.quantity || 0;
        });

        return total;
      };

      const totalA = getTotalStock(rowA);
      const totalB = getTotalStock(rowB);
      return totalA - totalB;
    },
    enableColumnFilter: false
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    cell: ({ cell }) => {
      const date = cell.getValue<ISubProduct['createdAt']>();
      return (
        <div className='text-muted-foreground flex items-center gap-1 text-sm'>
          <CalendarDays className='h-4 w-4' />
          {date ? new Date(date).toLocaleDateString() : '-'}
        </div>
      );
    },
    enableColumnFilter: false
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <SubproductCellAction data={row.original as any} />
  }
];
