'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { toast } from 'sonner';
import {
  Package,
  Calendar,
  User,
  Info,
  Check,
  X,
  Banknote,
  FileText,
  Loader2,
  AlertTriangle,
  RefreshCw,} from 'lucide-react';
import {
  IPurchase,
  PURCHASE_PAYMENT_STATUS_LABELS,
  PURCHASE_STATUS_LABELS,
  PurchasePaymentStatus,
  PurchaseStatus,
  PurchaseItem
} from '@/models/purchase';
import {
  getPurchaseId,
  acceptPurchase,
  recordPurchasePayment,
  getStockCorrectionsByPurchaseId
} from '@/service/purchase';
import { getApiErrorMessage } from '@/service/authApi';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { IStockCorrection } from '@/models/StockCorrection';
import Link from 'next/link';

// import { deleteStockCorrection } from '@/service/StockCorrection';
import { PermissionGuard } from '@/components/PermissionGuard';
import { PERMISSIONS } from '@/stores/permissions';

type PurchaseViewProps = {
  id?: string;
};

const PurchasedetailPage: React.FC<PurchaseViewProps> = ({ id }) => {
  const [purchase, setPurchase] = useState<IPurchase | null>(null);
  const [stockCorrections, setStockCorrections] = useState<IStockCorrection[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [loadingCorrections, setLoadingCorrections] = useState(false);
  const [updating, setUpdating] = useState(false);
  // const [, setDeletingId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<
    PurchaseStatus.RECEIVED | PurchaseStatus.REJECTED
  >();
  const [amountPaidInput, setAmountPaidInput] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const fetchPurchaseData = async () => {
      try {
        if (id) {
          const purchaseData = await getPurchaseId(id);
          setPurchase(purchaseData);
          setSelectedStatus(undefined);
          setAmountPaidInput(String(purchaseData.amountPaid ?? 0));

          // Fetch stock corrections for this purchase
          await fetchStockCorrections(id);
        }
      } catch  {
        toast.error('Failed to fetch purchase details');
      } finally {
        setLoading(false);
      }
    };

    fetchPurchaseData();
  }, [id, refreshTrigger]);

  const fetchStockCorrections = async (purchaseId: string) => {
    setLoadingCorrections(true);
    try {
      const corrections = await getStockCorrectionsByPurchaseId(purchaseId);
      setStockCorrections(corrections);
    } catch  {
      toast.error('Failed to load stock corrections');
    } finally {
      setLoadingCorrections(false);
    }
  };

  const handleStatusUpdate = async (
    nextStatus: PurchaseStatus.RECEIVED | PurchaseStatus.REJECTED
  ) => {
    if (!id || purchase?.status !== PurchaseStatus.PENDING) {
      return;
    }

    setSelectedStatus(nextStatus);
    setUpdating(true);
    try {
      await acceptPurchase(id, nextStatus);
      toast.success(
        nextStatus === PurchaseStatus.RECEIVED
          ? 'Purchase received and stock booked in'
          : 'Purchase rejected'
      );
      // Reload the purchase (status, updatedBy) from the server
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to update purchase status'));
    } finally {
      setUpdating(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!id || !purchase) return;
    const amount = Number(amountPaidInput);
    if (amountPaidInput.trim() === '' || !Number.isFinite(amount) || amount < 0) {
      toast.error('Enter a valid amount (0 or more)');
      return;
    }
    if (amount > Number(purchase.grandTotal || 0)) {
      toast.error(
        `Amount paid cannot exceed the total (${Number(
          purchase.grandTotal || 0
        ).toFixed(2)})`
      );
      return;
    }

    setSavingPayment(true);
    try {
      await recordPurchasePayment(id, amount);
      toast.success('Payment recorded');
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to record payment'));
    } finally {
      setSavingPayment(false);
    }
  };

  // const handleDeleteStockCorrection = async (correctionId: string) => {
  //   setDeletingId(correctionId);
  //   try {
  //     await deleteStockCorrection(correctionId);
  //     toast.success('Stock correction deleted successfully');

  //     // Refresh the stock corrections list
  //     if (id) {
  //       await fetchStockCorrections(id);
  //     }
  //   } catch  {
  //     toast.error('Failed to delete stock correction');
  //   } finally {
  //     setDeletingId(null);
  //   }
  // };

  const refreshStockCorrections = async () => {
    if (id) {
      await fetchStockCorrections(id);
    }
  };

  if (loading) {
    return (
      <div className='flex h-screen items-center justify-center'>
        <Loader2 className='mr-2 h-8 w-8 animate-spin' />
        <p>Loading purchase details...</p>
      </div>
    );
  }

  if (!purchase) {
    return (
      <div className='flex h-screen items-center justify-center'>
        <p>Purchase not found</p>
      </div>
    );
  }

  // Calculate financial details safely
  const subtotal =
    purchase.items?.reduce((sum, item) => sum + (item.totalPrice || 0), 0) || 0;

  const grandTotal = purchase.grandTotal || subtotal;

  const isPending = purchase.status === PurchaseStatus.PENDING;
  const isRejected = purchase.status === PurchaseStatus.REJECTED;
  const amountPaid = Number(purchase.amountPaid || 0);
  const balanceDue = Math.max(Number(grandTotal) - amountPaid, 0);
  const paymentBadgeClass: Record<PurchasePaymentStatus, string> = {
    [PurchasePaymentStatus.UNPAID]: 'bg-red-500 text-white',
    [PurchasePaymentStatus.PARTIALLY_PAID]: 'bg-yellow-500 text-white',
    [PurchasePaymentStatus.PAID]: 'bg-green-500 text-white'
  };

  return (
   <div className='container mx-auto space-y-4 p-3 md:space-y-6 md:p-6 lg:p-8'>
  {/* Receive / reject - only while the purchase is pending */}
  {isPending && (
    <Card className='shadow-lg'>
      <CardHeader className='p-4 md:p-6'>
        <CardTitle className='text-lg font-bold md:text-xl'>
          Receive Purchase
        </CardTitle>
      </CardHeader>
      <CardContent className='p-4 pt-0 md:p-6 md:pt-0'>
        <PermissionGuard
          requiredPermission={PERMISSIONS.PURCHASE.ACCEPT.name}
        >
          <p className='text-muted-foreground mb-3 text-sm'>
            Receiving books the items into {purchase.store?.name ?? 'the store'}
            &apos;s stock. A rejected purchase books nothing.
          </p>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <Button
              onClick={() => handleStatusUpdate(PurchaseStatus.RECEIVED)}
              disabled={updating}
              className='w-full sm:w-auto'
              size='sm'
            >
              {updating && selectedStatus === PurchaseStatus.RECEIVED ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Check className='mr-2 h-4 w-4' />
              )}
              Mark as received
            </Button>
            <Button
              onClick={() => handleStatusUpdate(PurchaseStatus.REJECTED)}
              disabled={updating}
              variant='destructive'
              className='w-full sm:w-auto'
              size='sm'
            >
              {updating && selectedStatus === PurchaseStatus.REJECTED ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <X className='mr-2 h-4 w-4' />
              )}
              Reject
            </Button>
          </div>
        </PermissionGuard>
      </CardContent>
    </Card>
  )}

  {/* Purchase Details Card */}
  <Card className='shadow-lg'>
    <CardHeader className='p-4 md:p-6'>
      <CardTitle className='flex flex-col items-start gap-2 text-lg font-bold md:flex-row md:items-center md:text-2xl'>
        <div className='flex items-center gap-2'>
          <Package className='text-primary h-5 w-5' />
          <span className='truncate'>
            Purchase {purchase.invoiceNo || purchase.id}
          </span>
        </div>
        <Badge
          variant={
            purchase.status === PurchaseStatus.RECEIVED
              ? 'default'
              : isRejected
                ? 'destructive'
                : 'secondary'
          }
          className='mt-1 md:mt-0 md:ml-2'
        >
          {purchase.status === PurchaseStatus.RECEIVED ? (
            <Check className='mr-1 h-3 w-3' />
          ) : isRejected ? (
            <X className='mr-1 h-3 w-3' />
          ) : null}
          <span>{PURCHASE_STATUS_LABELS[purchase.status] ?? purchase.status}</span>
        </Badge>
        {purchase.paymentStatus && (
          <Badge
            className={`mt-1 md:mt-0 ${paymentBadgeClass[purchase.paymentStatus] ?? ''}`}
          >
            {PURCHASE_PAYMENT_STATUS_LABELS[purchase.paymentStatus] ??
              purchase.paymentStatus}
          </Badge>
        )}
      </CardTitle>
    </CardHeader>
    <CardContent className='space-y-4 p-4 md:space-y-6 md:p-6'>
      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6'>
        {/* Purchase Details */}
        <div className='space-y-3 md:space-y-4'>
          <h3 className='flex items-center gap-2 text-base font-semibold md:text-lg'>
            <Info className='text-primary h-4 w-4 md:h-5 md:w-5' />
            Purchase Information
          </h3>
          <div className='space-y-2'>
            <div className='flex items-start gap-2'>
              <FileText className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
              <div>
                <p className='font-medium text-sm'>Invoice Number:</p>
                <p className='text-muted-foreground text-sm truncate'>
                  {purchase.invoiceNo}
                </p>
              </div>
            </div>
            
            {purchase.supplier && (
              <div className='flex items-center gap-2'>
                <User className='text-muted-foreground h-4 w-4 shrink-0' />
                <div>
                  <p className='font-medium text-sm'>Supplier:</p>
                  <p className='text-muted-foreground text-sm'>
                    {purchase.supplier.name ?? 'Unknown Supplier'}
                  </p>
                </div>
              </div>
            )}
            
            {purchase.store && (
              <div className='flex items-center gap-2'>
                <User className='text-muted-foreground h-4 w-4 shrink-0' />
                <div>
                  <p className='font-medium text-sm'>Store:</p>
                  <p className='text-muted-foreground text-sm'>
                    {purchase.store.name ?? 'Unknown Store'}
                  </p>
                </div>
              </div>
            )}
            
            {purchase.createdBy && (
              <div className='flex items-center gap-2'>
                <User className='text-muted-foreground h-4 w-4 shrink-0' />
                <div>
                  <p className='font-medium text-sm'>Created By:</p>
                  <p className='text-muted-foreground text-sm'>
                    {purchase.createdBy.name ?? 'Unknown Employee'}
                  </p>
                </div>
              </div>
            )}
            
            {purchase.updatedBy && (
              <div className='flex items-center gap-2'>
                <User className='text-muted-foreground h-4 w-4 shrink-0' />
                <div>
                  <p className='font-medium text-sm'>Last Updated By:</p>
                  <p className='text-muted-foreground text-sm'>
                    {purchase.updatedBy.name ?? 'Unknown Employee'}
                  </p>
                </div>
              </div>
            )}
            
            {purchase.notes && (
              <div>
                <p className='font-medium text-sm'>Notes:</p>
                <p className='text-muted-foreground text-sm'>
                  {purchase.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Financial and Date Details */}
        <div className='space-y-3 md:space-y-4'>
          <h3 className='flex items-center gap-2 text-base font-semibold md:text-lg'>
            <Calendar className='text-primary h-4 w-4 md:h-5 md:w-5' />
            Financial Details
          </h3>
          <div className='space-y-2'>
            <div>
              <p className='font-medium text-sm'>Purchase Date:</p>
              <p className='text-muted-foreground text-sm'>
                {formatDate(purchase.purchaseDate)}
              </p>
            </div>

            <div className='flex items-center gap-2'>
              <Banknote className='text-muted-foreground h-4 w-4 shrink-0' />
              <div>
                <p className='font-medium text-sm'>Total:</p>
                <p className='text-muted-foreground text-sm'>
                  {grandTotal.toFixed(2)}
                </p>
              </div>
            </div>
            
            <div className='flex items-center gap-2'>
              <Package className='text-muted-foreground h-4 w-4 shrink-0' />
              <div>
                <p className='font-medium text-sm'>Total Products:</p>
                <p className='text-muted-foreground text-sm'>
                  {purchase.totalProducts || 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Supplier payment */}
      <div className='space-y-3 rounded-lg border p-4'>
        <h3 className='flex items-center gap-2 text-base font-semibold md:text-lg'>
          <Banknote className='text-primary h-4 w-4 md:h-5 md:w-5' />
          Payment
        </h3>
        <div className='grid grid-cols-1 gap-3 text-sm sm:grid-cols-4'>
          <div>
            <p className='font-medium'>Status</p>
            {purchase.paymentStatus ? (
              <Badge className={paymentBadgeClass[purchase.paymentStatus] ?? ''}>
                {PURCHASE_PAYMENT_STATUS_LABELS[purchase.paymentStatus] ??
                  purchase.paymentStatus}
              </Badge>
            ) : (
              <p className='text-muted-foreground'>-</p>
            )}
          </div>
          <div>
            <p className='font-medium'>Total</p>
            <p className='text-muted-foreground'>{Number(grandTotal).toFixed(2)}</p>
          </div>
          <div>
            <p className='font-medium'>Amount paid</p>
            <p className='text-muted-foreground'>{amountPaid.toFixed(2)}</p>
          </div>
          <div>
            <p className='font-medium'>Balance due</p>
            <p className='text-muted-foreground'>{balanceDue.toFixed(2)}</p>
          </div>
        </div>

        {isRejected ? (
          <p className='text-muted-foreground text-sm'>
            Payments can&apos;t be recorded on a rejected purchase.
          </p>
        ) : (
          <PermissionGuard
            requiredPermission={PERMISSIONS.PURCHASE.UPDATE.name}
          >
            <div className='flex flex-col gap-2 sm:flex-row sm:items-end'>
              <div className='w-full sm:w-48'>
                <label
                  htmlFor='purchase-amount-paid'
                  className='mb-1 block text-sm font-medium'
                >
                  Total amount paid so far
                </label>
                <Input
                  id='purchase-amount-paid'
                  type='number'
                  min={0}
                  max={Number(grandTotal)}
                  step='0.01'
                  value={amountPaidInput}
                  onChange={(e) => setAmountPaidInput(e.target.value)}
                  disabled={savingPayment}
                />
              </div>
              <Button
                size='sm'
                onClick={handleRecordPayment}
                disabled={
                  savingPayment ||
                  amountPaidInput.trim() === '' ||
                  Number(amountPaidInput) === amountPaid
                }
                className='w-full sm:w-auto'
              >
                {savingPayment && (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                )}
                Record payment
              </Button>
              {balanceDue > 0 && (
                <Button
                  size='sm'
                  variant='outline'
                  type='button'
                  onClick={() => setAmountPaidInput(Number(grandTotal).toFixed(2))}
                  disabled={savingPayment}
                  className='w-full sm:w-auto'
                >
                  Fill full amount
                </Button>
              )}
            </div>
          </PermissionGuard>
        )}
      </div>

      {/* Purchased Items Table Section */}
     {purchase.items?.length > 0 && (
  <div className='space-y-3 md:space-y-4'>
    <h3 className='text-base font-semibold md:text-lg'>Purchased Items</h3>
    
    {/* Mobile View - Stacked Cards */}
    <div className='space-y-3 md:hidden'>
      {purchase.items.map((item: PurchaseItem, index) => (
        <div 
          key={item.id || item.productId || index} 
          className='rounded-lg border border-gray-200 p-4 dark:border-gray-700'
        >
          <div className='space-y-3'>
            {/* Product Info */}
            <div>
              <div className='flex justify-between'>
                <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>Product</span>
                <span className='text-right text-sm font-medium'>
                  {item.product?.name || 'Unknown Product'}
                </span>
              </div>
              {item.batch?.batchNumber && (
                <div className='mt-1 flex justify-between'>
                  <span className='text-xs text-gray-500 dark:text-gray-400'>Batch</span>
                  <span className='text-right text-xs text-gray-600 dark:text-gray-400'>
                    {item.batch.batchNumber}
                  </span>
                </div>
              )}
            </div>
            
            {/* Quantity & Unit */}
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>Qty</span>
                <div className='mt-1 text-sm font-medium'>
                  {item.quantity}
                  {item?.unitOfMeasure?.name && (
                    <span className='ml-1 text-xs text-gray-500 dark:text-gray-400'>
                      {item.unitOfMeasure.name}
                    </span>
                  )}
                </div>
              </div>
              
              <div>
                <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>Unit Price</span>
                <div className='mt-1 text-sm font-medium'>
                  {(item.unitPrice || 0).toFixed(2)}
                </div>
              </div>
            </div>
            
            {/* Total Price */}
            <div className='pt-2 border-t border-gray-100 dark:border-gray-700'>
              <div className='flex justify-between'>
                <span className='text-sm font-medium'>Total</span>
                <span className='text-sm font-bold text-primary'>
                  {(item.totalPrice || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
      
      {/* Summary on Mobile */}
      <div className='rounded-lg bg-gray-50 p-4 dark:bg-gray-800'>
        <div className='flex justify-between text-sm font-semibold'>
          <span>Grand Total</span>
          <span className='text-primary'>
            {purchase.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
    
    {/* Desktop View - Table */}
    <div className='hidden overflow-x-auto md:block'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='whitespace-nowrap text-xs md:text-sm'>Product</TableHead>
            <TableHead className='whitespace-nowrap text-xs md:text-sm'>SubProduct</TableHead>
            <TableHead className='whitespace-nowrap text-xs md:text-sm'>Batch</TableHead>
            <TableHead className='whitespace-nowrap text-xs md:text-sm'>Unit</TableHead>
            <TableHead className='whitespace-nowrap text-xs md:text-sm'>Quantity</TableHead>
            <TableHead className='whitespace-nowrap text-xs md:text-sm'>Unit Price</TableHead>
            <TableHead className='whitespace-nowrap text-xs md:text-sm'>Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchase.items.map((item: PurchaseItem, index) => (
            <TableRow key={item.id || item.productId || index}>
              <TableCell className='whitespace-nowrap text-xs md:text-sm'>
                <div className='font-medium'>
                  {item.product?.name || 'Unknown Product'}
                </div>
              </TableCell>
               <TableCell className='font-medium'>
                                               {item?.subProduct?.name || ''}
                                             
                                           </TableCell>
              <TableCell className='whitespace-nowrap text-xs md:text-sm'>
                <div className='text-gray-600 dark:text-gray-400'>
                  {item.batch?.batchNumber || 'N/A'}
                </div>
              </TableCell>
              <TableCell className='whitespace-nowrap text-xs md:text-sm'>
                <div className='text-gray-600 dark:text-gray-400'>
                  {item?.unitOfMeasure?.name || 'N/A'}
                </div>
              </TableCell>
              <TableCell className='whitespace-nowrap text-xs md:text-sm'>
                <div className='font-medium'>
                  {item.quantity}
                </div>
              </TableCell>
              <TableCell className='whitespace-nowrap text-xs md:text-sm'>
                <div className='font-medium'>
                  {(item.unitPrice || 0).toFixed(2)}
                </div>
              </TableCell>
              <TableCell className='whitespace-nowrap text-xs md:text-sm'>
                <div className='font-bold text-primary'>
                  {(item.totalPrice || 0).toFixed(2)}
                </div>
              </TableCell>
            </TableRow>
          ))}
          
          {/* Total Row on Desktop */}
          <TableRow className='bg-gray-50 dark:bg-gray-800'>
            <TableCell colSpan={5} className='text-right text-sm font-semibold'>
              Grand Total
            </TableCell>
            <TableCell className='whitespace-nowrap text-xs md:text-sm'>
              <div className='font-bold text-lg text-primary'>
                {purchase.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0).toFixed(2)}
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
)}
    </CardContent>
  </Card>

  {/* Stock Corrections Section */}
  <Card className='shadow-lg'>
    <CardHeader className='flex flex-col items-start gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-6'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <CardTitle className='flex items-center gap-2 text-lg font-bold md:text-xl'>
          <AlertTriangle className='text-amber-500 h-5 w-5' />
          Stock Corrections
          {stockCorrections.length > 0 && (
            <Badge variant='secondary' className='ml-2'>
              {stockCorrections.length}
            </Badge>
          )}
        </CardTitle>
        <div className='sm:ml-2'>
          <Link href={`/dashboard/purchase/StockCorrection/${id}`}>
            <Button variant='outline' size='sm' className='w-full sm:w-auto'>
              Add Stock Correction
            </Button>
          </Link>
        </div>
      </div>
      <Button
        variant='outline'
        size='sm'
        onClick={refreshStockCorrections}
        disabled={loadingCorrections}
        className='w-full sm:w-auto'
      >
        {loadingCorrections ? (
          <Loader2 className='h-4 w-4 animate-spin' />
        ) : (
          <>
            <RefreshCw className='mr-2 h-4 w-4' />
            <span className='hidden sm:inline'>Refresh</span>
          </>
        )}
      </Button>
    </CardHeader>
    <CardContent className='p-4 pt-0 md:p-6 md:pt-0'>
      {loadingCorrections ? (
        <div className='flex flex-col items-center justify-center py-4 md:flex-row'>
          <Loader2 className='mr-2 h-6 w-6 animate-spin' />
          <p className='mt-2 text-sm md:mt-0 md:text-base'>Loading stock corrections...</p>
        </div>
      ) : stockCorrections.length === 0 ? (
        <div className='text-muted-foreground py-4 text-center md:py-6'>
          <p className='text-sm md:text-base'>No stock corrections found for this purchase</p>
        </div>
      ) : (
        <div className='space-y-4'>
          {stockCorrections.map((correction) => (
            <Card
              key={correction.id}
              className='border-l-4 border-l-amber-500'
            >
              <CardContent className='p-4 md:p-6'>
                <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                  <div className='flex-1'>
                    <h4 className='text-base font-semibold md:text-lg'>
                      Stock Correction #{correction.id.slice(-6)}
                    </h4>
                    <div className='mt-2 flex flex-wrap gap-2'>
                      <Badge variant='outline' className='capitalize text-xs md:text-sm'>
                        Reason: {correction.reason.toLowerCase()}
                      </Badge>
                      <Badge
                        variant={
                          correction.status === 'APPROVED'
                            ? 'default'
                            : correction.status === 'REJECTED'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className='capitalize text-xs md:text-sm'
                      >
                        Status: {correction.status.toLowerCase()}
                      </Badge>
                    </div>
                  </div>
                  {correction.reference && (
                    <div className='text-right text-sm'>
                      <p className='font-medium'>Reference:</p>
                      <p className='text-muted-foreground truncate'>
                        {correction.reference}
                      </p>
                    </div>
                  )}
                </div>

                <div className='mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4'>
                  <div>
                    <p className='text-muted-foreground text-xs md:text-sm'>
                      <span className='font-medium'>Created:</span>{' '}
                      {formatDate(correction.createdAt)}
                      {correction.createdBy &&
                        ` by ${correction.createdBy.name}`}
                    </p>
                  </div>
                  <div>
                    {correction.store && (
                      <p className='text-muted-foreground text-xs md:text-sm'>
                        <span className='font-medium'>Store:</span>{' '}
                        {correction.store.name}
                      </p>
                    )}
                    {correction.shop && (
                      <p className='text-muted-foreground text-xs md:text-sm'>
                        <span className='font-medium'>Shop:</span>{' '}
                        {correction.shop.name}
                      </p>
                    )}
                  </div>
                </div>

                {correction.notes && (
                  <div className='bg-muted mb-4 rounded-md p-3'>
                    <p className='text-xs font-medium md:text-sm'>Notes:</p>
                    <p className='text-muted-foreground text-xs md:text-sm'>
                      {correction.notes}
                    </p>
                  </div>
                )}

            

                <div className='mt-4'>
  <h5 className='mb-2 text-sm font-medium md:text-base'>Correction Items:</h5>
  
  {/* Mobile View - Stacked Cards */}
  <div className='space-y-3 md:hidden'>
    {correction.items && correction.items.map((item, index) => (
      <div key={index} className='rounded-lg border border-gray-200 p-3 dark:border-gray-700'>
        <div className='space-y-2'>
          <div className='flex justify-between'>
            <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>Product:</span>
            <span className='text-right text-sm'>
              {item.product?.name || 'Unknown Product'}
            </span>
          </div>
          
          <div className='flex justify-between'>
            <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>Batch:</span>
            <span className='text-right text-sm text-gray-600 dark:text-gray-400'>
              {item.batch?.batchNumber || 'N/A'}
            </span>
          </div>
          
          <div className='flex justify-between'>
            <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>Quantity:</span>
            <span className='text-right text-sm font-medium'>
              {item.quantity}
            </span>
          </div>
          
          <div className='flex justify-between'>
            <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>Unit:</span>
            <span className='text-right text-sm text-gray-600 dark:text-gray-400'>
              {item.unitOfMeasure?.name || 'N/A'}
            </span>
          </div>
        </div>
      </div>
    ))}
  </div>
  
  {/* Desktop View - Table */}
{/* Mobile View - Stacked Cards */}
<div className='space-y-3 md:hidden'>
  {correction.items && correction.items.map((item, index) => (
    <div key={index} className='rounded-lg border border-gray-200 p-4 dark:border-gray-700'>
      <div className='space-y-3'>
        {/* Main product info */}
        <div>
          <div className='flex justify-between'>
            <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>Product</span>
            <span className='text-right text-sm font-medium'>
              {item.product?.name || 'Unknown Product'}
            </span>
          </div>
          
          {item.batch?.batchNumber && (
            <div className='mt-1 flex justify-between'>
              <span className='text-xs text-gray-500 dark:text-gray-400'>Batch</span>
              <span className='text-right text-xs text-gray-600 dark:text-gray-400'>
                {item.batch.batchNumber}
              </span>
            </div>
          )}
        </div>
        
        {/* Quantity and Unit - side by side */}
        <div className='grid grid-cols-2 gap-4'>
          <div>
            <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>Quantity</span>
            <div className='mt-1 text-sm font-medium'>
              {item.quantity}
            </div>
          </div>
          
          <div>
            <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>Unit</span>
            <div className='mt-1 text-sm text-gray-600 dark:text-gray-400'>
              {item.unitOfMeasure?.name || 'N/A'}
            </div>
          </div>
        </div>
        
        {/* Correction indicator if needed */}
        {item.quantity < 0 && (
          <div className='rounded-md bg-red-50 p-2 dark:bg-red-900/20'>
            <div className='flex items-center gap-1'>
              <div className='h-1.5 w-1.5 rounded-full bg-red-500'></div>
              <span className='text-xs font-medium text-red-600 dark:text-red-400'>
                Stock reduction
              </span>
            </div>
          </div>
        )}
        
        {item.quantity > 0 && (
          <div className='rounded-md bg-green-50 p-2 dark:bg-green-900/20'>
            <div className='flex items-center gap-1'>
              <div className='h-1.5 w-1.5 rounded-full bg-green-500'></div>
              <span className='text-xs font-medium text-green-600 dark:text-green-400'>
                Stock addition
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  ))}
  
  {/* Summary card for mobile */}
  <div className='rounded-lg bg-gray-50 p-4 dark:bg-gray-800'>
    <div className='flex justify-between text-sm font-semibold'>
      <span>Total Items</span>
      <span className='text-primary'>
        {correction.items?.length || 0}
      </span>
    </div>
    
    <div className='mt-2 flex justify-between text-sm'>
      <span className='text-gray-600 dark:text-gray-400'>Net Quantity</span>
      <span className={`
        font-medium
        ${correction.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) > 0 
          ? 'text-green-600 dark:text-green-400' 
          : correction.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) < 0 
            ? 'text-red-600 dark:text-red-400'
            : 'text-gray-600 dark:text-gray-400'
        }
      `}>
        {correction.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) > 0 ? '+' : ''}
        {correction.items?.reduce((sum, item) => sum + (item.quantity || 0), 0)}
      </span>
    </div>
  </div>
</div>

{/* Desktop View - Table */}
<div className='hidden overflow-x-auto md:block'>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead className='whitespace-nowrap text-xs md:text-sm'>Product</TableHead>
                    <TableHead className='whitespace-nowrap text-xs md:text-sm'>SubProduct</TableHead>

        <TableHead className='whitespace-nowrap text-xs md:text-sm'>Batch</TableHead>
        <TableHead className='whitespace-nowrap text-xs md:text-sm'>Quantity</TableHead>
        <TableHead className='whitespace-nowrap text-xs md:text-sm'>Unit</TableHead>
        <TableHead className='whitespace-nowrap text-xs md:text-sm'>Type</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {correction.items &&
        correction.items.map((item, index) => (
          <TableRow key={index}>
            <TableCell className='whitespace-nowrap text-xs md:text-sm'>
              <div className='font-medium'>
                {item.product?.name || 'Unknown Product'}
              </div>
            </TableCell>
              <TableCell className='font-medium'>
                                               {item?.subProduct?.name || ''}
                                             
                                           </TableCell>
            <TableCell className='whitespace-nowrap text-xs md:text-sm'>
              <div className='text-gray-600 dark:text-gray-400'>
                {item.batch?.batchNumber || 'N/A'}
              </div>
            </TableCell>
            <TableCell className='whitespace-nowrap text-xs md:text-sm'>
              <div className={`
                font-medium
                ${item.quantity > 0 
                  ? 'text-green-600 dark:text-green-400' 
                  : item.quantity < 0 
                    ? 'text-red-600 dark:text-red-400'
                    : ''
                }
              `}>
                {item.quantity > 0 ? '+' : ''}
                {item.quantity}
              </div>
            </TableCell>
            <TableCell className='whitespace-nowrap text-xs md:text-sm'>
              <div className='text-gray-600 dark:text-gray-400'>
                {item.unitOfMeasure?.name || 'N/A'}
              </div>
            </TableCell>
            <TableCell className='whitespace-nowrap text-xs md:text-sm'>
              <Badge 
                variant={item.quantity > 0 ? 'default' : 'destructive'} 
                className='text-xs'
              >
                {item.quantity > 0 ? 'Addition' : 'Reduction'}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
    </TableBody>
  </Table>
</div>
</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
</div>
  );
};

export default PurchasedetailPage;
