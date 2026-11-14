'use client';

import { useEffect, useState } from 'react';
import { getSupplierById } from '@/service/supplier';
import SupplierForm from './form';
import { ISupplier } from '@/models/supplier';
import FormCardSkeleton from '@/components/form-card-skeleton';

type TSupplierViewPageProps = {
  supplierId: string;
};

// Keyed by id so a stale result never shows while a new id is loading.
type TLoadResult = { id: string; data: ISupplier | null; error?: string };

export default function SupplierViewPage({ supplierId }: TSupplierViewPageProps) {
  const isNew = supplierId === 'new';
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    getSupplierById(supplierId)
      .then((data) => {
        if (!cancelled) setResult({ id: supplierId, data: (data as ISupplier) || null });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ id: supplierId, data: null, error: 'Failed to load supplier.' });
      });

    return () => {
      cancelled = true;
    };
  }, [supplierId, isNew]);

  if (!isNew && result?.id !== supplierId) return <FormCardSkeleton />;
  if (!isNew && result?.error)
    return <p className='text-destructive text-sm'>{result.error}</p>;

  const supplier = isNew ? null : (result?.data ?? null);

  return (
    <SupplierForm
      initialData={supplier}
      pageTitle={isNew ? 'Create New Supplier' : 'Edit Supplier'}
    />
  );
}
