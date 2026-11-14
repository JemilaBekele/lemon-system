'use client';

import { useEffect, useState } from 'react';
import { ICompany } from '@/models/employee';
import { getCompanyById } from '@/service/companyService';
import { toast } from 'sonner';
import FormCardSkeleton from '@/components/form-card-skeleton';
import CompanyForm from './add';

type CompanyViewPageProps = {
  companyId: string;
};

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://192.168.1.1:5050';

const normalizeLogoPath = (path?: string | File) => {
  if (!path) return undefined;
  if (typeof path !== 'string') {
    // If path is a File, return undefined or handle as needed
    return undefined;
  }
  const normalizedPath = path.replace(/\\/g, '/');
  if (normalizedPath.startsWith('http')) {
    return normalizedPath;
  }
  // Remove any leading slashes to prevent double slashes in URL
  const cleanPath = normalizedPath.replace(/^\/+/, '');
  return `${BACKEND_URL}/${cleanPath}`;
};

// Keyed by id so a stale result never shows while a new id is loading.
type TLoadResult = {
  id: string;
  company: ICompany | null;
  pageTitle: string;
};

export default function CompanyViewPage({ companyId }: CompanyViewPageProps) {
  const isNew = companyId === 'new';
  const [result, setResult] = useState<TLoadResult | null>(null);

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;
    getCompanyById(companyId)
      .then((response) => {
        if (cancelled) return;
        const company = response || null;
        const combinedCompanyData = {
          ...company,
          logo: normalizeLogoPath(company?.logo)
        } as ICompany;
        setResult({
          id: companyId,
          company: combinedCompanyData,
          pageTitle: `Edit Company: ${company?.name || company?.id}`
        });
      })
      .catch(() => {
        if (cancelled) return;
        toast.error('Error loading company');
        setResult({
          id: companyId,
          company: null,
          pageTitle: 'Create New Company'
        });
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, isNew]);

  if (!isNew && result?.id !== companyId) return <FormCardSkeleton />;

  const loaded = isNew ? null : result;

  return (
    <CompanyForm
      initialData={loaded?.company ?? null}
      pageTitle={loaded?.pageTitle ?? 'Create New Company'}
    />
  );
}
