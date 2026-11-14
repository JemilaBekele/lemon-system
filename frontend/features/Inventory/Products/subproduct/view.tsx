'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import FormCardSkeleton from '@/components/form-card-skeleton';
import { AlertTriangle, Box, MapPin, Package, Tag } from 'lucide-react';
import { getSubProductDetails, ISubProductDetails } from '@/service/Product';
import StockLedgerCard from '../stock-ledger';

const formatMoney = (value: number | string | null | undefined) =>
  value === null || value === undefined || value === ''
    ? '—'
    : Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : '—';

export default function SubProductDetailsPage({
  subProductId
}: {
  subProductId?: string;
}) {
  const [details, setDetails] = useState<ISubProductDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subProductId) return;
    let cancelled = false;
    getSubProductDetails(subProductId)
      .then((data) => {
        if (!cancelled) setDetails(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err?.response?.data?.message || 'Failed to load sub-product'
          );
      });
    return () => {
      cancelled = true;
    };
  }, [subProductId]);

  if (!subProductId)
    return <div className='p-4 text-red-500'>No sub-product selected.</div>;
  if (error) return <div className='p-4 text-red-500'>{error}</div>;
  if (!details) return <FormCardSkeleton />;

  const {
    subProduct,
    product,
    additionalPrices,
    batches,
    locationStocks,
    stockLedgers,
    summary
  } = details;
  const unit = product.unitOfMeasure?.symbol || 'units';
  const isLow =
    product.warningQuantity > 0 &&
    summary.totalQuantity > 0 &&
    summary.totalQuantity <= product.warningQuantity;

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-bold'>
            {product.name} — {subProduct.name}
          </h1>
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <Badge variant='outline'>{subProduct.subProductCode}</Badge>
            {product.category && (
              <Badge variant='secondary'>{product.category.name}</Badge>
            )}
            <Badge variant={subProduct.isActive ? 'default' : 'destructive'}>
              {subProduct.isActive ? 'Active' : 'Inactive'}
            </Badge>
            {summary.totalQuantity === 0 && (
              <Badge variant='destructive' className='flex items-center gap-1'>
                <AlertTriangle className='h-3 w-3' /> Out of Stock
              </Badge>
            )}
            {isLow && (
              <Badge className='flex items-center gap-1 bg-yellow-100 text-yellow-700 hover:bg-yellow-100'>
                <AlertTriangle className='h-3 w-3' /> Low Stock
              </Badge>
            )}
          </div>
        </div>
        <Link
          href={`/dashboard/Products/view?id=${product.id}`}
          className='text-primary text-sm hover:underline'
        >
          View parent product ({product.productCode})
        </Link>
      </div>

      {/* Summary */}
      <div className='grid grid-cols-1 gap-4 md:grid-cols-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>Total Stock</CardTitle>
            <Box className='text-muted-foreground h-4 w-4' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {summary.totalQuantity} {unit}
            </div>
            <p className='text-muted-foreground text-xs'>
              {summary.storeQuantity} in stores + {summary.shopQuantity} in shops
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>Sell Price</CardTitle>
            <Tag className='text-muted-foreground h-4 w-4' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {formatMoney(subProduct.effectiveSellPrice)}
            </div>
            <p className='text-muted-foreground text-xs'>
              {subProduct.sellPrice === null
                ? 'Uses the product price'
                : 'Sub-product price'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>Batches</CardTitle>
            <Package className='text-muted-foreground h-4 w-4' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{summary.batchCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>Locations</CardTitle>
            <MapPin className='text-muted-foreground h-4 w-4' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{summary.locationCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        {/* Details + prices */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-2 gap-4 text-sm'>
              <div>
                <p className='font-medium'>Parent Product</p>
                <p className='text-muted-foreground'>{product.name}</p>
              </div>
              <div>
                <p className='font-medium'>Sub Category</p>
                <p className='text-muted-foreground'>
                  {product.subCategory?.name || '—'}
                </p>
              </div>
              <div>
                <p className='font-medium'>Unit of Measure</p>
                <p className='text-muted-foreground'>
                  {product.unitOfMeasure?.name || '—'}
                </p>
              </div>
              <div>
                <p className='font-medium'>Product Price</p>
                <p className='text-muted-foreground'>
                  {formatMoney(product.sellPrice)}
                </p>
              </div>
              <div>
                <p className='font-medium'>E-commerce Price</p>
                <p className='text-muted-foreground'>
                  {subProduct.ecommercePrice !== null &&
                  subProduct.ecommercePrice !== undefined
                    ? formatMoney(subProduct.ecommercePrice)
                    : 'Not set'}
                </p>
              </div>
              <div>
                <p className='font-medium'>Warning Quantity</p>
                <p className='text-muted-foreground'>
                  {product.warningQuantity > 0
                    ? `${product.warningQuantity} ${unit} (whole product)`
                    : 'No alert set'}
                </p>
              </div>
              <div>
                <p className='font-medium'>Created</p>
                <p className='text-muted-foreground'>
                  {formatDate(subProduct.createdAt)}
                </p>
              </div>
            </div>

            <div className='border-t pt-4'>
              <p className='mb-2 font-medium'>Additional Prices</p>
              {additionalPrices.length > 0 ? (
                <div className='space-y-2'>
                  {additionalPrices.map((price) => (
                    <div
                      key={price.id}
                      className='bg-muted/50 flex items-center justify-between rounded-md border px-3 py-2 text-sm'
                    >
                      <div>
                        <p className='font-medium'>{price.label}</p>
                        <p className='text-muted-foreground text-xs'>
                          {price.shopName || 'All Shops'} •{' '}
                          {price.branchName || 'All Branches'}
                        </p>
                      </div>
                      <p className='font-bold'>{formatMoney(price.price)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className='text-muted-foreground text-sm'>
                  No additional prices
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stock per location */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <MapPin className='text-primary h-5 w-5' /> Stock by Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            {locationStocks.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className='text-right'>Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locationStocks.map((loc) => (
                    <TableRow key={`${loc.type}:${loc.id}`}>
                      <TableCell>
                        <Badge variant='outline' className='mr-2 capitalize'>
                          {loc.type}
                        </Badge>
                        {loc.name}
                      </TableCell>
                      <TableCell>{loc.branchName || '—'}</TableCell>
                      <TableCell className='text-right font-medium'>
                        {loc.quantity} {unit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className='text-muted-foreground text-sm'>
                No stock in your stores or shops.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Batches */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Package className='text-primary h-5 w-5' /> Batches
          </CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className='text-right'>Stores</TableHead>
                  <TableHead className='text-right'>Shops</TableHead>
                  <TableHead className='text-right'>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className='font-medium'>{batch.batchNumber}</TableCell>
                    <TableCell>
                      {formatDate(batch.expiryDate)}
                      {batch.isExpired && (
                        <Badge variant='destructive' className='ml-2'>
                          Expired
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-right'>{batch.storeQuantity}</TableCell>
                    <TableCell className='text-right'>{batch.shopQuantity}</TableCell>
                    <TableCell className='text-right font-medium'>
                      {batch.totalQuantity}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className='text-muted-foreground text-sm'>No batches yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Stock Ledger (same as the product page) */}
      <StockLedgerCard
        ledgers={stockLedgers}
        unitSymbol={unit}
        name={`${product.name} - ${subProduct.name}`}
        code={subProduct.subProductCode || product.productCode}
      />
    </div>
  );
}
