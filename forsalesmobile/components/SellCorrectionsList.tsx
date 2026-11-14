import React from 'react';
import { Spinner, Text, XStack, YStack } from 'tamagui';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney, toNumber } from '@/(utils)/format';
import { lineItemName } from '@/(utils)/itemName';
import { SellCorrection, useSellCorrections } from '@/(services)/api/sellCorrection';

// Same palette as the Order screen
const C = {
  accent: '#FF6B00',
  text: '#111827',
  label: '#374151',
  muted: '#6B7280',
  border: '#E5E7EB',
  danger: '#DC2626',
  success: '#166534',
};

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  PENDING: { label: 'Waiting approval', bg: '#FEF3C7', fg: '#92400E' },
  APPROVED: { label: 'Approved', bg: '#DCFCE7', fg: '#166534' },
  PARTIAL: { label: 'Partly approved', bg: '#FFF7ED', fg: '#C2410C' },
  REJECTED: { label: 'Rejected', bg: '#FEE2E2', fg: '#991B1B' },
};

const Pill = ({ label, bg, fg }: { label: string; bg: string; fg: string }) => (
  <YStack backgroundColor={bg} paddingHorizontal={10} paddingVertical={3} borderRadius={999}>
    <Text color={fg} fontSize={12} fontWeight="700">{label}</Text>
  </YStack>
);

const CorrectionCard = ({ correction }: { correction: SellCorrection }) => {
  const status = STATUS[correction.status] || { label: correction.status, bg: '#F3F4F6', fg: C.label };
  const total = toNumber(correction.total);

  return (
    <YStack gap={10} borderWidth={1} borderColor={C.border} borderRadius={12} padding={12} backgroundColor="white">
      <XStack justifyContent="space-between" alignItems="center" gap={8}>
        <YStack flex={1}>
          <Text fontWeight="700" color={C.text}>
            {new Date(correction.createdAt).toLocaleDateString()}{' '}
            <Text fontSize={12} color={C.muted} fontWeight="400">
              {new Date(correction.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </Text>
          {correction.createdBy?.name ? (
            <Text fontSize={12} color={C.muted}>By {correction.createdBy.name}</Text>
          ) : null}
        </YStack>
        <Pill {...status} />
      </XStack>

      {correction.items.map((item) => {
        const quantity = toNumber(item.quantity);
        const isReturn = quantity < 0;
        const amount = Math.abs(quantity) * toNumber(item.unitPrice);
        return (
          <YStack key={item.id} gap={4} backgroundColor="#F9FAFB" borderRadius={10} padding={10}>
            <XStack justifyContent="space-between" alignItems="flex-start" gap={8}>
              <YStack flex={1} gap={2}>
                <Text fontWeight="600" color={C.text}>
                  {lineItemName(item.product, item.subProduct, 'Product')}
                </Text>
                <XStack alignItems="center" gap={4}>
                  <Ionicons
                    name={isReturn ? 'return-down-back-outline' : 'add-circle-outline'}
                    size={14}
                    color={isReturn ? C.danger : C.success}
                  />
                  <Text fontSize={13} fontWeight="700" color={isReturn ? C.danger : C.success}>
                    {isReturn ? 'Returned' : 'Extra delivered'} {Math.abs(quantity)} {item.unitOfMeasure?.name || ''}
                  </Text>
                </XStack>
                {item.shop?.name ? (
                  <Text fontSize={12} color={C.muted}>Shop: {item.shop.name}</Text>
                ) : null}
                {item.batches.length > 0 ? (
                  <Text fontSize={12} color={C.muted}>
                    {item.batches
                      .map((b) => `Batch ${b.batch?.batchNumber || '—'} × ${Math.abs(toNumber(b.quantity))}`)
                      .join(' · ')}
                  </Text>
                ) : null}
              </YStack>
              <Text fontWeight="700" color={isReturn ? C.danger : C.success}>
                {isReturn ? '-' : '+'}
                {formatMoney(amount)}
              </Text>
            </XStack>
          </YStack>
        );
      })}

      {correction.notes ? (
        <Text fontSize={13} color={C.label}>
          <Text fontWeight="600">Note: </Text>
          {correction.notes}
        </Text>
      ) : null}

      <XStack justifyContent="space-between" borderTopWidth={1} borderTopColor={C.border} paddingTop={8}>
        <Text fontWeight="600" color={C.label}>Amount change</Text>
        <Text fontWeight="800" color={total < 0 ? C.danger : total > 0 ? C.success : C.text}>
          {total > 0 ? '+' : ''}
          {formatMoney(total)}
        </Text>
      </XStack>
    </YStack>
  );
};

// "Returns & corrections" section of the order details: every correction
// raised on this sale, with what was returned or added and its approval state.
export default function SellCorrectionsList({ sellId }: { sellId: string }) {
  const { data: corrections, isLoading, error } = useSellCorrections(sellId);

  if (isLoading) {
    return (
      <XStack gap={8} alignItems="center" paddingVertical={4}>
        <Spinner size="small" color={C.accent} />
        <Text color={C.muted} fontSize={13}>Loading returns...</Text>
      </XStack>
    );
  }

  // Nothing to show: keep the order details clean
  if (error || !corrections || corrections.length === 0) return null;

  return (
    <YStack gap={10}>
      <XStack alignItems="center" gap={6}>
        <Ionicons name="return-down-back-outline" size={18} color={C.accent} />
        <Text fontWeight="700" color={C.text} fontSize={16}>
          Returns & Corrections ({corrections.length})
        </Text>
      </XStack>
      {corrections.map((correction) => (
        <CorrectionCard key={correction.id} correction={correction} />
      ))}
    </YStack>
  );
}
