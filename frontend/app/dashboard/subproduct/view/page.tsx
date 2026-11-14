import FormCardSkeleton from '@/components/form-card-skeleton';
import PageContainer from '@/components/layout/page-container';
import SubProductDetailsPage from '@/features/Inventory/Products/subproduct/view';
import { Suspense } from 'react';

export const metadata = {
  title: 'Dashboard : sub-product detail'
};

type PageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function SubProductViewPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  return (
    <PageContainer scrollable>
      <div className='flex-1 space-y-4'>
        <Suspense fallback={<FormCardSkeleton />}>
          <SubProductDetailsPage subProductId={resolvedSearchParams?.id} />
        </Suspense>
      </div>
    </PageContainer>
  );
}
