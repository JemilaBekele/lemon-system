'use client';

import { useEffect, useState } from 'react';
import { getPurchaseById } from '@/service/purchase';
import PurchaseForm from './form';
import { IPurchase } from '@/models/purchase';
import FormCardSkeleton from '@/components/form-card-skeleton';

type TPurchaseViewPageProps = {
  purchaseId: string;
};

// Keyed by id so a stale result never shows while a new id is loading.
type TLoadResult = { id: string; data: IPurchase | null; error?: string };

export default function PurchaseViewPage({ purchaseId }: TPurchaseViewPageProps) {
  const isNew = purchaseId === 'new';
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    getPurchaseById(purchaseId)
      .then((data) => {
        if (!cancelled) setResult({ id: purchaseId, data: (data as IPurchase) || null });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ id: purchaseId, data: null, error: 'Failed to load purchase.' });
      });

    return () => {
      cancelled = true;
    };
  }, [purchaseId, isNew]);

  if (!isNew && result?.id !== purchaseId) return <FormCardSkeleton />;
  if (!isNew && result?.error)
    return <p className='text-destructive text-sm'>{result.error}</p>;

  const purchase = isNew ? null : (result?.data ?? null);

  return (
    <PurchaseForm initialData={purchase} isEdit={!isNew} />
  );
}
