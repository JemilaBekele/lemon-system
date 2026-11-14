'use client';

import { useEffect, useState } from 'react';
import { getStockCorrectionById } from '@/service/StockCorrection';
import StockCorrectionForm from './form';
import { IStockCorrection } from '@/models/StockCorrection';
import FormCardSkeleton from '@/components/form-card-skeleton';

type TStockCorrectionViewPageProps = {
  stockCorrectionId: string;
};

// Keyed by id so a stale result never shows while a new id is loading.
type TLoadResult = { id: string; data: IStockCorrection | null; error?: string };

export default function StockCorrectionViewPage({ stockCorrectionId }: TStockCorrectionViewPageProps) {
  const isNew = stockCorrectionId === 'new';
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    getStockCorrectionById(stockCorrectionId)
      .then((data) => {
        if (!cancelled) setResult({ id: stockCorrectionId, data: (data as IStockCorrection) || null });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ id: stockCorrectionId, data: null, error: 'Failed to load stock correction.' });
      });

    return () => {
      cancelled = true;
    };
  }, [stockCorrectionId, isNew]);

  if (!isNew && result?.id !== stockCorrectionId) return <FormCardSkeleton />;
  if (!isNew && result?.error)
    return <p className='text-destructive text-sm'>{result.error}</p>;

  const stockCorrection = isNew ? null : (result?.data ?? null);

  return (
    <StockCorrectionForm initialData={stockCorrection} isEdit={!isNew} />
  );
}
