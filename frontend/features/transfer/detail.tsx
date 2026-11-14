/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
  Loader2,
  ArrowRightLeft
} from 'lucide-react';
import { ITransfer, ITransferItem, TransferStatus } from '@/models/transfer';
import {
  getTransferId,
  completeTransfer,
  cancelTransfer
} from '@/service/transfer';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { AlertModal } from '@/components/modal/alert-modal';
import { PermissionGuard } from '@/components/PermissionGuard';
import { PERMISSIONS } from '@/stores/permissions';
import { useAuthStore } from '@/stores/auth.store';
import { getUserById } from '@/service/user';
import { Imployee } from '@/models/employee';

type TransferViewProps = {
  id?: string;
};

// Does the user's profile include the transfer's destination store/shop?
const canReachDestination = (
  transfer: ITransfer,
  profile: Imployee | null
): boolean => {
  if (!profile) return false;
  const shops = (profile.shops as any[] | undefined) || [];
  const stores = (profile.stores as any[] | undefined) || [];

  if (transfer.destinationType === 'STORE' && transfer.destStore) {
    const dest = transfer.destStore;
    return stores.some(
      (s: any) => s.id === dest.id || s.storeId === dest.id || s.name === dest.name
    );
  }
  if (transfer.destinationType === 'SHOP' && transfer.destShop) {
    const dest = transfer.destShop;
    return shops.some((s: any) => s.id === dest.id || s.name === dest.name);
  }
  return false;
};

const TransferDetailPage: React.FC<TransferViewProps> = ({ id }) => {
  const authUser = useAuthStore((s) => s.user);
  const hasAuthUser = !!authUser;
  const [transfer, setTransfer] = useState<ITransfer | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [updating, setUpdating] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<Imployee | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const loadTransfer = useCallback(async () => {
    if (!id) return;
    try {
      setTransfer(await getTransferId(id));
    } catch {
      toast.error('Failed to fetch transfer details');
    }
  }, [id]);

  // Load the transfer straight away; it does not depend on the profile.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getTransferId(id)
      .then((data) => {
        if (!cancelled) setTransfer(data);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to fetch transfer details');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // The profile (assigned shops/stores) only decides whether "Complete" is allowed,
  // so it loads in parallel and never blocks the page.
  useEffect(() => {
    if (!hasAuthUser) return;
    let cancelled = false;
    getUserById()
      .then((profile) => {
        if (!cancelled) setUserProfile(profile);
      })
      .catch(() => {
        if (!cancelled) setUserProfile(null);
      })
      .finally(() => {
        if (!cancelled) setProfileLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hasAuthUser]);

  const hasDestinationAccess = useMemo(
    () => (transfer ? canReachDestination(transfer, userProfile) : false),
    [transfer, userProfile]
  );

  const handleStatusUpdate = async (action: 'complete' | 'cancel') => {
    if (!id) return;

    if (action === 'complete' && !hasDestinationAccess) {
      toast.error('You do not have access to complete this transfer');
      return;
    }

    setUpdating(true);
    try {
      if (action === 'complete') {
        await completeTransfer(id);
        setIsCompleteModalOpen(false);
        toast.success('Transfer completed successfully');
      } else {
        await cancelTransfer(id);
        setIsCancelModalOpen(false);
        toast.success('Transfer cancelled successfully');
      }
      await loadTransfer();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || `Failed to ${action} transfer`
      );
    } finally {
      setUpdating(false);
    }
  };

  const openCompleteModal = () => {
    if (!hasDestinationAccess) {
      toast.error('You do not have access to the destination shop/store');
      return;
    }
    setIsCompleteModalOpen(true);
  };

  const openCancelModal = () => {
    setIsCancelModalOpen(true);
  };

  if (loading) {
    return (
      <div className='flex h-64 items-center justify-center'>
        <Loader2 className='mr-2 h-8 w-8 animate-spin' />
        <p>Loading transfer details...</p>
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className='flex h-64 items-center justify-center'>
        <p>Transfer not found</p>
      </div>
    );
  }

  // Calculate total quantity
  const totalQuantity =
    transfer.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

  // Check if transfer is completed or cancelled
  const isImmutable =
    transfer.status === TransferStatus.COMPLETED ||
    transfer.status === TransferStatus.CANCELLED;

  return (
    <div className='container mx-auto space-y-6 p-4 md:p-8'>
      {/* Confirmation Modals */}
      <AlertModal
        isOpen={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
        onConfirm={() => handleStatusUpdate('complete')}
        loading={updating}
        title='Complete Transfer'
        description='Are you sure you want to complete this transfer? This action cannot be undone.'
        confirmText='Complete Transfer'
        cancelText='Cancel'
        variant='default'
      />

      <AlertModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={() => handleStatusUpdate('cancel')}
        loading={updating}
        title='Cancel Transfer'
        description='Are you sure you want to cancel this transfer? This action cannot be undone.'
        confirmText='Cancel Transfer'
        cancelText='Go Back'
        variant='destructive'
      />

      {/* Transfer Status Update Section - Only show if not completed or cancelled */}
      {!isImmutable && (
        <Card className='shadow-lg'>
          <CardHeader>
            <CardTitle className='text-xl font-bold'>
              Update Transfer Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='flex flex-col items-start gap-4 sm:flex-row sm:items-center'>
              <div className='flex w-full gap-2 sm:w-auto'>
                {/* Complete Transfer Button - Conditionally shown based on destination access */}
                {hasDestinationAccess ? (
                  <PermissionGuard
                    requiredPermission={PERMISSIONS.TRANSFER.COMPLETE.name}
                  >
                    <Button
                      onClick={openCompleteModal}
                      disabled={
                        updating || transfer.status === TransferStatus.COMPLETED
                      }
                      className='w-full sm:w-auto'
                    >
                      {updating ? (
                        <>
                          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                          Completing...
                        </>
                      ) : (
                        <>
                          <Check className='mr-2 h-4 w-4' />
                          Complete Transfer
                        </>
                      )}
                    </Button>
                  </PermissionGuard>
                ) : (
                  // Show disabled button with tooltip or alternative message
                  <div className='relative group'>
                    <Button
                      disabled
                      className='w-full sm:w-auto opacity-50 cursor-not-allowed'
                    >
                      <Check className='mr-2 h-4 w-4' />
                      Complete Transfer
                    </Button>
                    <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10'>
                      {profileLoaded
                        ? `No access to destination ${transfer.destinationType?.toLowerCase()}`
                        : 'Checking access...'}
                    </div>
                  </div>
                )}

                {/* Cancel Transfer Button - Always visible if user has permission */}
                <PermissionGuard
                  requiredPermission={PERMISSIONS.TRANSFER.CANCEL.name}
                >
                  <Button
                    variant='destructive'
                    onClick={openCancelModal}
                    disabled={
                      updating || transfer.status === TransferStatus.CANCELLED
                    }
                    className='w-full sm:w-auto'
                  >
                    {updating ? (
                      <>
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        Cancelling...
                      </>
                    ) : (
                      <>
                        <X className='mr-2 h-4 w-4' />
                        Cancel Transfer
                      </>
                    )}
                  </Button>
                </PermissionGuard>
              </div>

            </div>
          </CardContent>
        </Card>
      )}

      <Card className='shadow-lg'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-2xl font-bold'>
            <ArrowRightLeft className='text-primary' />
            Transfer {transfer.reference || ''}
            <Badge
              variant={
                transfer.status === TransferStatus.COMPLETED
                  ? 'default'
                  : transfer.status === TransferStatus.CANCELLED
                    ? 'destructive'
                    : 'secondary'
              }
              className='ml-2'
            >
              {transfer.status === TransferStatus.COMPLETED ? (
                <>
                  <Check className='mr-1 h-3 w-3' /> {transfer.status}
                </>
              ) : transfer.status === TransferStatus.CANCELLED ? (
                <>
                  <X className='mr-1 h-3 w-3' /> {transfer.status}
                </>
              ) : (
                <>{transfer.status}</>
              )}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
            {/* Transfer Details */}
            <div className='space-y-4'>
              <h3 className='flex items-center gap-2 text-lg font-semibold'>
                <Info className='text-primary h-5 w-5' />
                Transfer Information
              </h3>
              <div className='space-y-2'>
                <div className='flex items-center gap-2'>
                  <Package className='text-muted-foreground h-4 w-4' />
                  <p>
                    <span className='font-medium'>Reference:</span>{' '}
                    {transfer.reference || 'N/A'}
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <Package className='text-muted-foreground h-4 w-4' />
                  <p>
                    <span className='font-medium'>Source:</span>{' '}
                    {transfer.sourceType === 'STORE'
                      ? (transfer.sourceStore?.name ?? 'Unknown Store')
                      : (transfer.sourceShop?.name ?? 'Unknown Shop')}
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <Package className='text-muted-foreground h-4 w-4' />
                  <p>
                    <span className='font-medium'>Destination:</span>{' '}
                    {transfer.destinationType === 'STORE'
                      ? (transfer.destStore?.name ?? 'Unknown Store')
                      : (transfer.destShop?.name ?? 'Unknown Shop')}
                  </p>
                  {profileLoaded && !hasDestinationAccess && (
                    <Badge variant="outline" className="text-xs">
                      No Access
                    </Badge>
                  )}
                </div>
                {transfer.createdBy && (
                  <div className='flex items-center gap-2'>
                    <User className='text-muted-foreground h-4 w-4' />
                    <p>
                      <span className='font-medium'>Initiated By:</span>{' '}
                      {transfer.createdBy.name ?? 'Unknown Employee'}
                    </p>
                  </div>
                )}
                {transfer.updatedBy && (
                  <div className='flex items-center gap-2'>
                    <User className='text-muted-foreground h-4 w-4' />
                    <p>
                      <span className='font-medium'>Approved By:</span>{' '}
                      {transfer.updatedBy.name ?? ''}
                    </p>
                  </div>
                )}
                {transfer.notes && (
                  <div>
                    <p className='font-medium'>Notes:</p>
                    <p className='text-muted-foreground'>{transfer.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Date Details */}
            <div className='space-y-4'>
              <h3 className='flex items-center gap-2 text-lg font-semibold'>
                <Calendar className='text-primary h-5 w-5' />
                Date Details
              </h3>
              <div className='space-y-2'>
                <div>
                  <p className='font-medium'>Created At:</p>
                  <p className='text-muted-foreground'>
                    {formatDate(transfer.createdAt)}
                  </p>
                </div>
                <div>
                  <p className='font-medium'>Updated At:</p>
                  <p className='text-muted-foreground'>
                    {formatDate(transfer.updatedAt)}
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <Package className='text-muted-foreground h-4 w-4' />
                  <p>
                    <span className='font-medium'>Total Items:</span>{' '}
                    {transfer.items?.length || 0}
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <Package className='text-muted-foreground h-4 w-4' />
                  <p>
                    <span className='font-medium'>Total Quantity:</span>{' '}
                    {totalQuantity}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Transfer Items Table Section */}
         {transfer.items?.length > 0 && (
  <div className='space-y-4'>
    <h3 className='text-lg font-semibold'>Transfer Items</h3>
    
    {/* Desktop Table */}
    <div className='hidden md:block'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className='whitespace-nowrap text-xs md:text-sm'>SubProduct</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Quantity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transfer.items.map((item: ITransferItem) => (
            <TableRow key={item.id}>
              <TableCell className='font-medium'>
                {item.product?.name || 'Unknown Product'}
              </TableCell>
               <TableCell className='font-medium'>
                                {item?.subProduct?.name || ''}
                              
                            </TableCell>
              <TableCell>
                {item.batch?.batchNumber || 'Unknown Batch'}
              </TableCell>
              <TableCell>
                {item.unitOfMeasure?.name || 'Unknown Unit'}
              </TableCell>
              <TableCell>{item.quantity}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>

    {/* Mobile Cards */}
    <div className='md:hidden space-y-3'>
      {transfer.items.map((item: ITransferItem) => (
        <div 
          key={item.id} 
          className='bg-card border rounded-lg p-4 shadow-sm'
        >
          <div className='grid grid-cols-2 gap-3'>
            <div>
              <p className='text-sm font-medium text-gray-500'>Product</p>
              <p className='font-medium'>{item.product?.name || 'Unknown Product'}</p>
              {item.subProduct?.name && (
                <p className='text-muted-foreground text-sm'>{item.subProduct.name}</p>
              )}
            </div>
            <div>
              <p className='text-sm font-medium text-gray-500'>Quantity</p>
              <p>{item.quantity}</p>
            </div>
            <div>
              <p className='text-sm font-medium text-gray-500'>Batch</p>
              <p>{item.batch?.batchNumber || 'Unknown Batch'}</p>
            </div>
            <div>
              <p className='text-sm font-medium text-gray-500'>Unit</p>
              <p>{item.unitOfMeasure?.name || 'Unknown Unit'}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
        </CardContent>
      </Card>
    </div>
  );
};

export default TransferDetailPage;