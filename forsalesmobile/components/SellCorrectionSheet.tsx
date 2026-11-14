import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Button, ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney, toNumber } from '@/(utils)/format';
import { lineItemName } from '@/(utils)/itemName';
import AppImage from '@/components/AppImage';
import {
  SellCorrectionItemInput,
  useCreateSellCorrection,
  useSellForCorrection,
} from '@/(services)/api/sellCorrection';

// Same palette as the Order screen
const C = {
  accent: '#FF6B00',
  accentTint: '#FFF7ED',
  text: '#111827',
  label: '#374151',
  muted: '#6B7280',
  placeholder: '#9CA3AF',
  border: '#E5E7EB',
  danger: '#DC2626',
  dangerTint: '#FEE2E2',
  success: '#166534',
  successTint: '#DCFCE7',
};

// RETURN: the customer gave goods back (stock goes back to the shop).
// EXTRA: more goods were handed over than the sale recorded.
type Mode = 'RETURN' | 'EXTRA';

type Props = {
  sellId?: string;
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

const batchKey = (itemIndex: number, batchIndex: number) => `${itemIndex}:${batchIndex}`;

export default function SellCorrectionSheet({ sellId, visible, onClose, onCreated }: Props) {
  const { data: sell, isLoading, error, refetch } = useSellForCorrection(visible ? sellId : undefined);
  const createMutation = useCreateSellCorrection();

  const [mode, setMode] = useState<Mode>('RETURN');
  const [notes, setNotes] = useState('');
  // Unsigned amount per batch; the mode decides the sign when sending
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  // Start clean every time the sheet opens for a sale
  useEffect(() => {
    if (visible) {
      setMode('RETURN');
      setNotes('');
      setAmounts({});
    }
  }, [visible, sellId]);

  const sign = mode === 'RETURN' ? -1 : 1;
  const items = useMemo(() => sell?.items ?? [], [sell]);

  const itemAmount = (itemIndex: number) =>
    (items[itemIndex]?.batches ?? []).reduce(
      (sum, _batch, batchIndex) => sum + (amounts[batchKey(itemIndex, batchIndex)] || 0),
      0,
    );

  const correctionTotal = items.reduce(
    (sum, item, itemIndex) => sum + sign * itemAmount(itemIndex) * toNumber(item.unitPrice),
    0,
  );
  const currentNetTotal = toNumber(sell?.NetTotal ?? sell?.grandTotal);
  const hasChanges = Object.values(amounts).some((value) => value > 0);

  // Keep each batch within what was sold from it, and each line within its quantity
  const setBatchAmount = (itemIndex: number, batchIndex: number, next: number) => {
    const item = items[itemIndex];
    const soldFromBatch = Math.abs(toNumber(item?.batches?.[batchIndex]?.quantity));
    const soldOnLine = Math.abs(toNumber(item?.quantity));
    const otherBatches = itemAmount(itemIndex) - (amounts[batchKey(itemIndex, batchIndex)] || 0);
    const max = Math.max(0, Math.min(soldFromBatch, soldOnLine - otherBatches));
    const value = Math.max(0, Math.min(Math.floor(next || 0), max));
    setAmounts((prev) => ({ ...prev, [batchKey(itemIndex, batchIndex)]: value }));
  };

  const buildPayloadItems = (): SellCorrectionItemInput[] =>
    items
      .map((item, itemIndex) => {
        const batches = (item.batches ?? [])
          .map((batch, batchIndex) => ({
            batchId: batch.batchId,
            quantity: sign * (amounts[batchKey(itemIndex, batchIndex)] || 0),
          }))
          .filter((batch) => batch.quantity !== 0);
        const quantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
        const unitPrice = toNumber(item.unitPrice);
        return {
          productId: item.productId,
          subProductId: item.subProductId || undefined,
          shopId: item.shopId || undefined,
          unitOfMeasureId: item.unitOfMeasureId,
          quantity,
          unitPrice,
          totalPrice: Math.abs(quantity) * unitPrice,
          batches,
        };
      })
      .filter((item) => item.quantity !== 0);

  const submit = () => {
    if (!sell) return;
    const payloadItems = buildPayloadItems();
    if (payloadItems.length === 0) {
      Alert.alert('Nothing to send', 'Enter a quantity for at least one batch.');
      return;
    }

    const units = payloadItems.reduce((sum, item) => sum + Math.abs(item.quantity), 0);
    Alert.alert(
      mode === 'RETURN' ? 'Send return request?' : 'Send correction request?',
      `${mode === 'RETURN' ? 'Return' : 'Add'} ${units} unit${units === 1 ? '' : 's'} on invoice ${sell.invoiceNo}. ` +
        `Amount change: ${correctionTotal > 0 ? '+' : ''}${formatMoney(correctionTotal)}. ` +
        'It will wait for approval.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () =>
            createMutation.mutate(
              {
                sellId: sell.id,
                reference: sell.invoiceNo,
                notes: notes.trim() || undefined,
                status: 'PENDING',
                total: correctionTotal,
                items: payloadItems,
              },
              {
                onSuccess: () => {
                  Alert.alert('Request sent', 'The correction is waiting for approval.');
                  onCreated?.();
                  onClose();
                },
                onError: (err: Error) => Alert.alert('Error', err.message),
              },
            ),
        },
      ],
    );
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <YStack padding={40} alignItems="center" gap={12}>
          <Spinner size="large" color={C.accent} />
          <Text color={C.muted}>Loading sale...</Text>
        </YStack>
      );
    }
    if (error || !sell) {
      return (
        <YStack padding={32} alignItems="center" gap={12}>
          <Ionicons name="alert-circle-outline" size={36} color={C.danger} />
          <Text color={C.text} textAlign="center">{error?.message || 'Sale not found'}</Text>
          <Button
            backgroundColor="white"
            borderColor={C.border}
            borderWidth={1}
            borderRadius={10}
            onPress={() => refetch()}
          >
            <Text color={C.text} fontWeight="600">Try again</Text>
          </Button>
        </YStack>
      );
    }

    return (
      <YStack gap={16} padding={16} paddingBottom={32}>
        {/* Sale summary */}
        <YStack gap={8} borderWidth={1} borderColor={C.border} borderRadius={12} padding={14}>
          <XStack justifyContent="space-between">
            <Text color={C.label}>Invoice</Text>
            <Text color={C.text} fontWeight="700">{sell.invoiceNo}</Text>
          </XStack>
          <XStack justifyContent="space-between">
            <Text color={C.label}>Date</Text>
            <Text color={C.text}>{new Date(sell.saleDate).toLocaleDateString()}</Text>
          </XStack>
          {sell.customer ? (
            <XStack justifyContent="space-between" gap={12}>
              <Text color={C.label}>Customer</Text>
              <Text color={C.text} fontWeight="600" flexShrink={1} textAlign="right">
                {sell.customer.name}
              </Text>
            </XStack>
          ) : null}
          <XStack justifyContent="space-between">
            <Text color={C.label}>Grand total</Text>
            <Text color={C.text}>{formatMoney(sell.grandTotal)}</Text>
          </XStack>
        </YStack>

        {/* Return vs extra */}
        <YStack gap={8}>
          <Text fontWeight="700" color={C.text}>What happened?</Text>
          <XStack gap={8}>
            {(['RETURN', 'EXTRA'] as Mode[]).map((option) => {
              const selected = mode === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={{ flex: 1 }}
                  activeOpacity={0.8}
                  onPress={() => setMode(option)}
                >
                  <YStack
                    padding={12}
                    borderRadius={12}
                    borderWidth={selected ? 2 : 1}
                    borderColor={selected ? C.accent : C.border}
                    backgroundColor={selected ? C.accentTint : 'white'}
                    gap={2}
                  >
                    <XStack alignItems="center" gap={6}>
                      <Ionicons
                        name={option === 'RETURN' ? 'return-down-back-outline' : 'add-circle-outline'}
                        size={18}
                        color={selected ? C.accent : C.muted}
                      />
                      <Text fontWeight="700" color={selected ? C.accent : C.text}>
                        {option === 'RETURN' ? 'Return' : 'Extra delivered'}
                      </Text>
                    </XStack>
                    <Text fontSize={12} color={C.muted}>
                      {option === 'RETURN' ? 'Customer gave goods back' : 'More goods were handed over'}
                    </Text>
                  </YStack>
                </TouchableOpacity>
              );
            })}
          </XStack>
        </YStack>

        {/* Items and batches */}
        <YStack gap={10}>
          <Text fontWeight="700" color={C.text}>Items ({items.length})</Text>
          {items.map((item, itemIndex) => {
            const soldOnLine = Math.abs(toNumber(item.quantity));
            const lineAmount = itemAmount(itemIndex);
            const name = lineItemName(item.product, item.subProduct, 'Product');
            return (
              <YStack
                key={item.id || itemIndex}
                gap={10}
                borderWidth={1}
                borderColor={lineAmount > 0 ? C.accent : C.border}
                borderRadius={12}
                padding={12}
              >
                <XStack gap={12} alignItems="flex-start">
                  <AppImage
                    path={item.subProduct?.imageUrl || item.product?.imageUrl}
                    size={48}
                    radius={10}
                    bordered
                    zoomable
                    title={name}
                  />
                  <YStack flex={1} gap={2}>
                    <Text fontWeight="700" color={C.text}>{name}</Text>
                    <Text fontSize={12} color={C.muted}>
                      Shop: {item.shop?.name || '—'} · {formatMoney(item.unitPrice)} each
                    </Text>
                    <Text fontSize={12} color={C.muted}>
                      Sold: {soldOnLine} {item.unitOfMeasure?.name || ''}
                    </Text>
                  </YStack>
                </XStack>

                {(item.batches ?? []).map((batch, batchIndex) => {
                  const key = batchKey(itemIndex, batchIndex);
                  const value = amounts[key] || 0;
                  const soldFromBatch = Math.abs(toNumber(batch.quantity));
                  const inShop = toNumber((batch.batch as any)?.availableQuantity);
                  return (
                    <XStack
                      key={batch.id || key}
                      alignItems="center"
                      gap={8}
                      backgroundColor="#F9FAFB"
                      borderRadius={10}
                      padding={10}
                    >
                      <YStack flex={1} gap={2}>
                        <Text fontSize={13} fontWeight="600" color={C.text}>
                          Batch {batch.batch?.batchNumber || batch.batchId.slice(-6)}
                        </Text>
                        <Text fontSize={11} color={C.muted}>
                          Sold {soldFromBatch} · In shop {inShop}
                        </Text>
                      </YStack>

                      <TouchableOpacity
                        onPress={() => setBatchAmount(itemIndex, batchIndex, value - 1)}
                        disabled={value === 0}
                        accessibilityLabel="Decrease"
                        style={stepperButton(value === 0)}
                      >
                        <Ionicons name="remove" size={18} color={value === 0 ? C.placeholder : C.text} />
                      </TouchableOpacity>
                      <TextInput
                        value={value ? String(value) : ''}
                        onChangeText={(text) =>
                          setBatchAmount(itemIndex, batchIndex, parseInt(text.replace(/\D/g, ''), 10) || 0)
                        }
                        placeholder="0"
                        placeholderTextColor={C.placeholder}
                        keyboardType="number-pad"
                        style={{
                          width: 52,
                          height: 36,
                          borderWidth: 1,
                          borderColor: value ? C.accent : C.border,
                          borderRadius: 8,
                          backgroundColor: 'white',
                          textAlign: 'center',
                          color: C.text,
                          fontWeight: '700',
                        }}
                      />
                      <TouchableOpacity
                        onPress={() => setBatchAmount(itemIndex, batchIndex, value + 1)}
                        accessibilityLabel="Increase"
                        style={stepperButton(false)}
                      >
                        <Ionicons name="add" size={18} color={C.text} />
                      </TouchableOpacity>
                      {mode === 'RETURN' ? (
                        <TouchableOpacity
                          onPress={() => setBatchAmount(itemIndex, batchIndex, soldFromBatch)}
                          accessibilityLabel="Return all from this batch"
                        >
                          <Text fontSize={12} fontWeight="700" color={C.accent}>All</Text>
                        </TouchableOpacity>
                      ) : null}
                    </XStack>
                  );
                })}

                {lineAmount > 0 ? (
                  <XStack justifyContent="space-between">
                    <Text fontSize={12} color={C.muted}>
                      {mode === 'RETURN' ? 'Returning' : 'Adding'} {lineAmount} of {soldOnLine}
                    </Text>
                    <Text fontSize={13} fontWeight="700" color={mode === 'RETURN' ? C.danger : C.success}>
                      {mode === 'RETURN' ? '-' : '+'}
                      {formatMoney(lineAmount * toNumber(item.unitPrice))}
                    </Text>
                  </XStack>
                ) : null}
              </YStack>
            );
          })}
        </YStack>

        {/* Notes */}
        <YStack gap={6}>
          <Text fontWeight="700" color={C.text}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Reason for the return (optional)"
            placeholderTextColor={C.placeholder}
            multiline
            style={{
              minHeight: 72,
              borderWidth: 1,
              borderColor: C.border,
              borderRadius: 10,
              padding: 10,
              color: C.text,
              textAlignVertical: 'top',
            }}
          />
        </YStack>

        {/* Totals */}
        <YStack gap={6} borderWidth={1} borderColor={C.border} borderRadius={12} padding={14} backgroundColor="#F9FAFB">
          <XStack justifyContent="space-between">
            <Text color={C.label}>Current net total</Text>
            <Text color={C.text}>{formatMoney(currentNetTotal)}</Text>
          </XStack>
          <XStack justifyContent="space-between">
            <Text color={C.label}>This correction</Text>
            <Text color={correctionTotal < 0 ? C.danger : correctionTotal > 0 ? C.success : C.text} fontWeight="600">
              {correctionTotal > 0 ? '+' : ''}
              {formatMoney(correctionTotal)}
            </Text>
          </XStack>
          <XStack justifyContent="space-between" borderTopWidth={1} borderTopColor={C.border} paddingTop={8}>
            <Text fontWeight="700" color={C.text}>New net total</Text>
            <Text fontWeight="800" color={C.accent} fontSize={16}>
              {formatMoney(currentNetTotal + correctionTotal)}
            </Text>
          </XStack>
          <Text fontSize={12} color={C.muted}>Sent as pending; a manager approves it before stock changes.</Text>
        </YStack>
      </YStack>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <YStack flex={1} backgroundColor="white">
          <XStack
            justifyContent="space-between"
            alignItems="center"
            paddingHorizontal={16}
            paddingVertical={14}
            borderBottomWidth={1}
            borderBottomColor={C.border}
            gap={12}
          >
            <YStack flex={1}>
              <Text fontSize={20} fontWeight="700" color={C.text}>Return Sell Correction</Text>
              {sell ? <Text fontSize={13} color={C.muted}>{sell.invoiceNo}</Text> : null}
            </YStack>
            <Button
              onPress={onClose}
              circular
              size="$3"
              backgroundColor="white"
              borderColor={C.border}
              borderWidth={1}
              pressStyle={{ backgroundColor: '#F9FAFB', borderColor: C.border }}
              icon={<Ionicons name="close" size={18} color={C.text} />}
            />
          </XStack>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {renderBody()}
          </ScrollView>

          {sell ? (
            <XStack gap={12} padding={16} borderTopWidth={1} borderTopColor={C.border}>
              <Button
                flex={1}
                backgroundColor="white"
                borderColor={C.border}
                borderWidth={1}
                borderRadius={10}
                onPress={onClose}
                disabled={createMutation.isPending}
              >
                <Text color={C.text} fontWeight="600">Cancel</Text>
              </Button>
              <Button
                flex={2}
                backgroundColor={hasChanges ? C.accent : '#FDBA74'}
                borderWidth={0}
                borderRadius={10}
                onPress={submit}
                disabled={!hasChanges || createMutation.isPending}
                pressStyle={{ backgroundColor: '$orange10' }}
              >
                {createMutation.isPending ? (
                  <XStack gap={8} alignItems="center">
                    <Spinner size="small" color="white" />
                    <Text color="white" fontWeight="700">Sending...</Text>
                  </XStack>
                ) : (
                  <Text color="white" fontWeight="700">Send for approval</Text>
                )}
              </Button>
            </XStack>
          ) : null}
        </YStack>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const stepperButton = (disabled: boolean) => ({
  width: 36,
  height: 36,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: C.border,
  backgroundColor: disabled ? '#F3F4F6' : 'white',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
});
