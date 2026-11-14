'use client';

import { useEffect, useState } from 'react';
import { getTransferById } from '@/service/transfer';
import TransferForm from './form';
import { ITransfer } from '@/models/transfer';
import FormCardSkeleton from '@/components/form-card-skeleton';

type TTransferViewPageProps = {
  transferId: string;
};

// Keyed by id so a stale result never shows while a new id is loading.
type TLoadResult = { id: string; data: ITransfer | null; error?: string };

export default function TransferViewPage({ transferId }: TTransferViewPageProps) {
  const isNew = transferId === 'new';
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    getTransferById(transferId)
      .then((data) => {
        if (!cancelled) setResult({ id: transferId, data: (data as ITransfer) || null });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ id: transferId, data: null, error: 'Failed to load transfer.' });
      });

    return () => {
      cancelled = true;
    };
  }, [transferId, isNew]);

  if (!isNew && result?.id !== transferId) return <FormCardSkeleton />;
  if (!isNew && result?.error)
    return <p className='text-destructive text-sm'>{result.error}</p>;

  const transfer = isNew ? null : (result?.data ?? null);

  return <TransferForm initialData={transfer} isEdit={!isNew} />;
}
