'use client';

import { useEffect, useState } from 'react';
import { getPurchaseById } from '@/service/purchase';
import { IPurchase } from '@/models/purchase';
import { IStockCorrection } from '@/models/StockCorrection';
import FormCardSkeleton from '@/components/form-card-skeleton';
import PurchaseCorrectionForm from './correction';

type TPurchaseViewPageProps = {
  purchaseId: string;
};

// Keyed by id so a stale result never shows while a new id is loading.
type TLoadResult = {
  id: string;
  purchase: IPurchase | null;
  initialData: IStockCorrection | null;
  isEdit: boolean;
};

export default function PurchasecorrectPage({
  purchaseId
}: TPurchaseViewPageProps) {
  const isNew = purchaseId === 'new';
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    getPurchaseById(purchaseId)
      .then((purchase: IPurchase) => {
        if (cancelled) return;
        // Optionally, transform purchase data into initialData for IStockCorrection
        // For example, map relevant fields if needed
        const initialData = {
          storeId: purchase?.storeId || '',
          reason: 'PURCHASE_ERROR', // Default value
          purchaseId: purchaseId,
          items:
            purchase?.items?.map((item) => ({
              productId: item.productId.toString(),
              subProductId: item.subProductId?.toString() || '',
              batchId: item.batchId?.toString() || '',
              unitOfMeasureId: item.unitOfMeasureId.toString(),
              quantity: Number(item.quantity)
            })) || [],
          reference: '',
          notes: ''
        } as IStockCorrection;
        setResult({ id: purchaseId, purchase, initialData, isEdit: true });
      })
      .catch(() => {
        // Same as before: on failure, fall back to an empty, non-edit form.
        if (!cancelled)
          setResult({
            id: purchaseId,
            purchase: null,
            initialData: null,
            isEdit: false
          });
      });

    return () => {
      cancelled = true;
    };
  }, [purchaseId, isNew]);

  if (!isNew && result?.id !== purchaseId) return <FormCardSkeleton />;

  const loaded = isNew ? null : result;

  return (
    <PurchaseCorrectionForm
      purchaseId={purchaseId}
      initialData={loaded?.initialData ?? null}
      isEdit={loaded?.isEdit ?? false}
      purchaseData={loaded?.purchase ?? null} // <-- pass original purchase separately
    />
  );
}
