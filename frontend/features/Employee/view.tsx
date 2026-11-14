'use client';

import { useEffect, useState } from 'react';
import { getEmployeeById } from '@/service/employee';
import EmployeeForm from './formwithoutpass';
import { IEmployee } from '@/models/employee';
import FormCardSkeleton from '@/components/form-card-skeleton';

type TEmployeeViewPageProps = {
  id: string;
};

// Keyed by id so a stale result never shows while a new id is loading.
type TLoadResult = { id: string; data: IEmployee | null; error?: string };

export default function EmployeeViewPage({ id }: TEmployeeViewPageProps) {
  const isNew = id === 'new';
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    getEmployeeById(id)
      .then((data) => {
        if (!cancelled) setResult({ id: id, data: (data as IEmployee) || null });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ id: id, data: null, error: 'Failed to load employee.' });
      });

    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  if (!isNew && result?.id !== id) return <FormCardSkeleton />;
  if (!isNew && result?.error)
    return <p className='text-destructive text-sm'>{result.error}</p>;

  const employee = isNew ? null : (result?.data ?? null);

  return (
    <EmployeeForm
      initialData={employee}
      pageTitle={isNew ? 'Create New Employee' : 'Edit Employee'}
    />
  );
}
