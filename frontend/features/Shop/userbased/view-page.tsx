'use client';

import { useEffect, useState } from 'react';
import { getSellById } from '@/service/Sell';
import { getProductsnew } from '@/service/Product'; // make sure this exists
import SalesForm from './form';
import { ISell } from '@/models/Sell';
import { IProduct } from '@/models/Product'; // adjust if needed
import FormCardSkeleton from '@/components/form-card-skeleton';

type SalesViewPageProps = {
  sellId: string; // renamed from supplierId
};

// Keyed by id so a stale result never shows while a new id is loading.
type TLoadResult = {
  id: string;
  sell: ISell | null;
  products: IProduct[];
  error?: string;
};

export default function UserSalesViewPage({ sellId }: SalesViewPageProps) {
  const isNew = sellId === 'new';
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      // Fetch sell data if editing
      isNew ? Promise.resolve(null) : getSellById(sellId),
      // Fetch products for the form
      getProductsnew()
    ])
      .then(([data, products]) => {
        if (!cancelled)
          setResult({
            id: sellId,
            sell: (data as ISell) || null,
            products: products ?? []
          });
      })
      .catch(() => {
        if (!cancelled)
          setResult({
            id: sellId,
            sell: null,
            products: [],
            error: 'Failed to load sell.'
          });
      });

    return () => {
      cancelled = true;
    };
  }, [sellId, isNew]);

  if (result?.id !== sellId) return <FormCardSkeleton />;
  if (result.error)
    return <p className='text-destructive text-sm'>{result.error}</p>;

  const pageTitle = isNew ? 'Create New Sell' : 'Edit Sell';

  return (
    <SalesForm
      initialData={isNew ? null : result.sell}
      pageTitle={pageTitle}
      products={result.products}
    />
  );
}
