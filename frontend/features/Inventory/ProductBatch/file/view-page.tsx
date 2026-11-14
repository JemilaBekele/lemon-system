'use client';

import { useEffect, useState } from 'react';
import { getProductBatchById } from '@/service/productBatchService';
import ProductBatchForm from './form';
import { IProductBatch } from '@/models/Product';
import FormCardSkeleton from '@/components/form-card-skeleton';

type TProductBatchViewPageProps = {
  batchId: string;
};

// Keyed by id so a stale result never shows while a new id is loading.
type TLoadResult = { id: string; data: IProductBatch | null; error?: string };

export default function ProductBatchViewPage({ batchId }: TProductBatchViewPageProps) {
  const isNew = batchId === 'new';
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    getProductBatchById(batchId)
      .then((data) => {
        if (!cancelled) setResult({ id: batchId, data: (data as IProductBatch) || null });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ id: batchId, data: null, error: 'Failed to load product batch.' });
      });

    return () => {
      cancelled = true;
    };
  }, [batchId, isNew]);

  if (!isNew && result?.id !== batchId) return <FormCardSkeleton />;
  if (!isNew && result?.error)
    return <p className='text-destructive text-sm'>{result.error}</p>;

  const productBatch = isNew ? null : (result?.data ?? null);

  return (
    <ProductBatchForm
      initialData={productBatch}
      pageTitle={isNew ? 'Create New Product Batch' : 'Edit Product Batch'}
    />
  );
}
