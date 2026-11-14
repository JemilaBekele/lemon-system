'use client';

import { useEffect, useState } from 'react';
import { getCustomerById } from '@/service/customer';
import CustomerForm from './form';
import { ICustomer } from '@/models/customer';
import FormCardSkeleton from '@/components/form-card-skeleton';

type TCustomerViewPageProps = {
  customerId: string;
};

// Keyed by id so a stale result never shows while a new id is loading.
type TLoadResult = { id: string; data: ICustomer | null; error?: string };

export default function CustomerViewPage({ customerId }: TCustomerViewPageProps) {
  const isNew = customerId === 'new';
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    getCustomerById(customerId)
      .then((data) => {
        if (!cancelled) setResult({ id: customerId, data: (data as ICustomer) || null });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ id: customerId, data: null, error: 'Failed to load customer.' });
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, isNew]);

  if (!isNew && result?.id !== customerId) return <FormCardSkeleton />;
  if (!isNew && result?.error)
    return <p className='text-destructive text-sm'>{result.error}</p>;

  const customer = isNew ? null : (result?.data ?? null);

  return (
    <CustomerForm
      initialData={customer}
      pageTitle={isNew ? 'Create New Customer' : 'Edit Customer'}
    />
  );
}
