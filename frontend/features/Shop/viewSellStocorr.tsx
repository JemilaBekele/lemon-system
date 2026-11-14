'use client';

import { useEffect, useState } from 'react';
import { ISell } from '@/models/Sell';
import {
  ISellStockCorrection,
  SellStockCorrectionStatus
} from '@/models/SellStockCorrection';
import { getSellById } from '@/service/SellStockCorrection';
import SellCorrectionForm from './SellStockCorre';
import { toast } from 'sonner';
import FormCardSkeleton from '@/components/form-card-skeleton';

type TSellViewPageProps = {
  sellId: string;
};

// Keyed by id so a stale result never shows while a new id is loading.
type TLoadResult = {
  id: string;
  sell: ISell | null;
  initialData: ISellStockCorrection | null;
};

// Transform sell data into initialData for ISellStockCorrection
// Using the enhanced sell data with batch availability
function toInitialData(
  sellId: string,
  sell: ISell | null
): ISellStockCorrection {
  return {
    id: '', // Will be generated when creating
    sellId: sellId,
    status: 'PENDING' as SellStockCorrectionStatus,
    reference: sell?.invoiceNo,
    total: 0, // Will be calculated based on items
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items:
      sell?.items?.map((item) => {
        // Calculate total price for this item
        const totalPrice =
          Number(item.unitPrice) * Math.abs(Number(item.quantity));

        return {
          id: '', // Will be generated when creating
          correctionId: '', // Will be set when creating correction
          productId: item.productId?.toString() || '',
          subProductId: item.subProductId?.toString() || '',
          shopId: item.shopId?.toString(),
          unitOfMeasureId: item.unitOfMeasureId?.toString() || '',
          quantity: 0, // Start with 0 adjustment
          unitPrice: Number(item.unitPrice),
          totalPrice: totalPrice,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          batches:
            item.batches?.map((sellBatch) => ({
              id: '', // Will be generated when creating
              correctionItemId: '', // Will be set when creating correction item
              batchId: sellBatch.batchId?.toString() || '',
              quantity: 0 // Start with 0 adjustment
            })) || []
        };
      }) || []
  } as ISellStockCorrection;
}

export default function SellViewPage({ sellId }: TSellViewPageProps) {
  const isNew = sellId === 'new';
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    getSellById(sellId)
      .then((sell: ISell | null) => {
        if (cancelled) return;
        let initialData: ISellStockCorrection | null = null;
        try {
          initialData = toInitialData(sellId, sell);
        } catch (error) {
          toast.error(error as string);
        }
        setResult({ id: sellId, sell, initialData });
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(error as string);
        setResult({ id: sellId, sell: null, initialData: null });
      });

    return () => {
      cancelled = true;
    };
  }, [sellId, isNew]);

  if (!isNew && result?.id !== sellId) return <FormCardSkeleton />;

  return (
    <SellCorrectionForm
      sellId={sellId}
      initialData={isNew ? null : (result?.initialData ?? null)}
      sellData={isNew ? null : (result?.sell ?? null)}
    />
  );
}
