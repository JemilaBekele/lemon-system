import PageContainer from '@/components/layout/page-container';
import { Heading } from '@/components/ui/heading';
import { Separator } from '@/components/ui/separator';
import { PermissionGuard } from '@/components/PermissionGuard';
import { PERMISSIONS } from '@/stores/permissions';
import PriceUpdatePage from '@/features/Inventory/PriceUpdate/price-update';

export const metadata = {
  title: 'Dashboard: Price Update'
};

export default function Page() {
  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <Heading
          title='Price Update'
          description='Change sell, e-commerce and additional prices by percent, by product and shop, or one by one, then sync the e-commerce prices online.'
        />
        <Separator />
        <PermissionGuard requiredPermission={PERMISSIONS.PRODUCT.UPDATE.name}>
          <PriceUpdatePage />
        </PermissionGuard>
      </div>
    </PageContainer>
  );
}
