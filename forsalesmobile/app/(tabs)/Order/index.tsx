import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Alert,
  RefreshControl,
  Modal,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from 'react-native';
import {
  Text,
  XStack,
  YStack,
  Button,
  ScrollView,
  Spinner,
  Input,
  Fieldset,
  Label,
} from 'tamagui';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney } from '@/(utils)/format';

// React Query imports
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from "@/(utils)/config";
import { GetAllSellsUserParams, GetAllSellsUserResponse, Sell, SellItem, SellItemBatch } from "@/(utils)/types";
import { lineItemName } from '@/(utils)/itemName';
import AppImage from '@/components/AppImage';
import SellCorrectionSheet from '@/components/SellCorrectionSheet';
import SellCorrectionsList from '@/components/SellCorrectionsList';

// Query keys
const sellsKeys = {
  all: ['sells'] as const,
  lists: () => [...sellsKeys.all, 'list'] as const,
  list: (filters: GetAllSellsUserParams) => [...sellsKeys.lists(), filters] as const,
  userSells: (userId?: string) => [...sellsKeys.all, 'user', userId] as const,
  detail: (id: string) => [...sellsKeys.all, 'detail', id] as const,
  convert: (sellId: string) => [...sellsKeys.all, 'convert', sellId] as const,
};

// Get all sells for a specific user
const getAllSellsUser = async (
  params: GetAllSellsUserParams
): Promise<GetAllSellsUserResponse> => {
  try {
    const response = await api.get("/sells/user/based", {
      params: {
        startDate: params.startDate,
        endDate: params.endDate,
        customerName: params.customerName,
        status: params.status,
      }
    });
    
    return {
      success: true,
      sells: response.data.sells || [],
      count: response.data.count || 0,
      meta: response.data.meta || {},
    };
  } catch (error: any) {
    throw new Error(error.response?.data?.message || "Failed to fetch user sells");
  }
};

// React Query hook for fetching user sells
const useUserSells = (params: GetAllSellsUserParams) => {
  return useQuery<GetAllSellsUserResponse, Error>({
    queryKey: sellsKeys.list(params),
    queryFn: () => getAllSellsUser(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    enabled: !!params, // Only run query if params exist
    select: (data) => ({
      ...data,
      sells: data.sells || [],
    }),
  });
};

export interface ConvertOrderResponse {
  success: boolean;
  message: string;
  cart: any;
  originalOrder: {
    invoiceNo: string;
    saleStatus: string;
    grandTotal: number;
    totalProducts: number;
  };
}

// Convert order to cart
const convertOrderToCart = async (
  sellId: string
): Promise<ConvertOrderResponse> => {
  try {
    const response = await api.post(`/carts/convert/${sellId}/OrderToCart`);
    
    return {
      success: true,
      message: response.data.message,
      cart: response.data.cart,
      originalOrder: response.data.originalOrder,
    };
  } catch (error: any) {
    throw new Error(error.response?.data?.message || "Failed to convert order to cart");
  }
};

// Context type for optimistic updates
interface ConvertOrderContext {
  previousSells?: GetAllSellsUserResponse;
}

// React Query hook for converting order to cart
const useConvertOrderToCart = () => {
  const queryClient = useQueryClient();
  
  return useMutation<
    ConvertOrderResponse,
    Error,
    string, // sellId parameter
    ConvertOrderContext // Context type
  >({
    mutationFn: convertOrderToCart,
    // On successful conversion
    onSuccess: (data, sellId) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: sellsKeys.all });
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      
      // You can also update the cache optimistically
      // Remove the sold item from sells list if needed
      queryClient.setQueryData<GetAllSellsUserResponse>(
        sellsKeys.lists(),
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            sells: oldData.sells?.filter(sell => sell.id !== sellId) || [],
            count: Math.max(0, (oldData.count || 1) - 1),
          };
        }
      );
    },
    // Optional: onMutate for optimistic updates
    onMutate: async (sellId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: sellsKeys.all });
      
      // Snapshot the previous value
      const previousSells = queryClient.getQueryData<GetAllSellsUserResponse>(sellsKeys.lists());
      
      // Return a context object with the snapshotted value
      return { previousSells };
    },
    // Optional: onError for rollback
    onError: (err, sellId, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousSells) {
        queryClient.setQueryData(sellsKeys.lists(), context.previousSells);
      }
    },
    // Optional: onSettled for cleanup
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: sellsKeys.all });
    },
  });
};

// // Helper hook for getting a single sell
// const useSellDetail = (sellId?: string) => {
//   return useQuery({
//     queryKey: sellsKeys.detail(sellId || ''),
//     queryFn: async () => {
//       if (!sellId) throw new Error('No sell ID provided');
//       const response = await api.get(`/sells/${sellId}`);
//       return response.data;
//     },
//     enabled: !!sellId, // Only fetch if sellId exists
//   });
// };

// Date utility functions
const formatDateForBackend = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Presentation palette for this screen (white, black text, orange accent)
const C = {
  accent: '#FF6B00',
  accentTint: '#FFF7ED',
  text: '#111827',
  label: '#374151',
  muted: '#6B7280',
  placeholder: '#9CA3AF',
  border: '#E5E7EB',
  danger: '#DC2626',
};

const softShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
} as const;

// Light-tint pill colours for sale / item statuses
const statusPill = (status: string): { bg: string; fg: string } => {
  switch (status) {
    case 'DELIVERED': return { bg: '#DCFCE7', fg: '#166534' };
    case 'APPROVED': return { bg: '#FFF7ED', fg: '#C2410C' };
    case 'PARTIALLY_DELIVERED': return { bg: '#FEF3C7', fg: '#92400E' };
    case 'PENDING': return { bg: '#FEF3C7', fg: '#92400E' };
    case 'CANCELLED':
    case 'REJECTED': return { bg: '#FEE2E2', fg: '#991B1B' };
    case 'RETURNED': return { bg: '#F3F4F6', fg: '#374151' };
    case 'NOT_APPROVED': return { bg: '#F3F4F6', fg: '#374151' };
    default: return { bg: '#F3F4F6', fg: '#374151' };
  }
};

const StatusPill = ({ status, label }: { status: string; label: string }) => {
  const { bg, fg } = statusPill(status);
  return (
    <YStack backgroundColor={bg} paddingHorizontal={10} paddingVertical={3} borderRadius={999}>
      <Text color={fg} fontSize={12} fontWeight="700">
        {label}
      </Text>
    </YStack>
  );
};

const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <XStack justifyContent="space-between" alignItems="center" gap="$3">
    <Text color={C.label} fontSize={14}>{label}</Text>
    {children}
  </XStack>
);

const inputStyle = {
  backgroundColor: 'white',
  borderColor: C.border,
  borderWidth: 1,
  borderRadius: 10,
  color: C.text,
  placeholderTextColor: C.placeholder,
  focusStyle: { borderColor: C.accent },
} as const;

const StatusSelect = ({
  value,
  onValueChange
}: {
  value: string;
  onValueChange: (value: string) => void;
}) => {
  const [showModal, setShowModal] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    value && value !== 'all' ? value.split(',').map(s => s.trim()) : []
  );

  const statusOptions = [
    { value: 'DELIVERED', label: 'Delivered' },
    { value: 'NOT_APPROVED', label: 'Not Approved' },
    { value: 'PARTIALLY_DELIVERED', label: 'Partially Delivered' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'RETURNED', label: 'Returned' },
  ];

  const getStatusLabel = () => {
    if (selectedStatuses.length === 0) return 'All Statuses';
    if (selectedStatuses.length === 1) {
      const option = statusOptions.find(opt => opt.value === selectedStatuses[0]);
      return option ? option.label : 'Custom Status';
    }
    return `${selectedStatuses.length} Statuses`;
  };

  const getStatusColor = (statusValue: string) => statusPill(statusValue).fg;

  const handleStatusToggle = (statusValue: string) => {
    setSelectedStatuses(prev => {
      if (prev.includes(statusValue)) {
        return prev.filter(s => s !== statusValue);
      } else {
        return [...prev, statusValue];
      }
    });
  };

  const handleApply = () => {
    if (selectedStatuses.length === 0) {
      onValueChange('all');
    } else {
      onValueChange(selectedStatuses.join(','));
    }
    setShowModal(false);
  };

  const handleClear = () => {
    setSelectedStatuses([]);
    onValueChange('all');
    setShowModal(false);
  };

  return (
    <>
      <XStack
        onPress={() => setShowModal(true)}
        backgroundColor="white"
        borderColor={C.border}
        borderWidth={1}
        borderRadius={10}
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={12}
        height={44}
        pressStyle={{ backgroundColor: '#F9FAFB' }}
        cursor="pointer"
      >
        <XStack alignItems="center" gap="$2" flex={1}>
          {selectedStatuses.length > 0 ? (
            <XStack gap="$1" alignItems="center">
              {selectedStatuses.slice(0, 2).map((status) => (
                <YStack
                  key={status}
                  width={10}
                  height={10}
                  borderRadius={999}
                  backgroundColor={getStatusColor(status)}
                />
              ))}
              {selectedStatuses.length > 2 ? (
                <Text color={C.muted} fontSize={12}>
                  +{selectedStatuses.length - 2}
                </Text>
              ) : null}
            </XStack>
          ) : (
            <Ionicons name="funnel-outline" size={16} color={C.muted} />
          )}
          <Text
            color={C.text}
            fontWeight="500"
            fontSize={14}
            numberOfLines={1}
            flex={1}
            textAlign="left"
          >
            {getStatusLabel()}
          </Text>
        </XStack>
        <Ionicons name="chevron-down" size={18} color={C.muted} />
      </XStack>

      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowModal(false)}>
          <YStack
            flex={1}
            justifyContent="center"
            alignItems="center"
            backgroundColor="rgba(0,0,0,0.4)"
            padding="$4"
          >
            <TouchableWithoutFeedback>
              <YStack
                backgroundColor="white"
                borderRadius={16}
                padding={16}
                width="100%"
                maxWidth={400}
                borderWidth={1}
                borderColor={C.border}
                maxHeight="80%"
              >
                <ScrollView showsVerticalScrollIndicator={false}>
                  <YStack gap={12}>
                    <YStack gap={4}>
                      <Text color={C.text} fontSize={18} fontWeight="700">
                        Select Order Status
                      </Text>
                      <Text fontSize={13} color={C.muted}>
                        Select one or multiple statuses
                      </Text>
                    </YStack>

                    <YStack gap={8}>
                      {statusOptions.map((option) => {
                        const selected = selectedStatuses.includes(option.value);
                        return (
                          <XStack
                            key={option.value}
                            onPress={() => handleStatusToggle(option.value)}
                            backgroundColor={selected ? C.accentTint : 'white'}
                            borderColor={selected ? C.accent : C.border}
                            borderWidth={1}
                            borderRadius={12}
                            paddingHorizontal={12}
                            paddingVertical={12}
                            alignItems="center"
                            gap={12}
                            pressStyle={{ opacity: 0.8 }}
                            cursor="pointer"
                          >
                            <YStack
                              width={10}
                              height={10}
                              borderRadius={999}
                              backgroundColor={getStatusColor(option.value)}
                            />
                            <Text
                              flex={1}
                              fontSize={15}
                              fontWeight="600"
                              color={selected ? C.accent : C.text}
                            >
                              {option.label}
                            </Text>
                            {selected ? (
                              <Ionicons name="checkmark" size={18} color={C.accent} />
                            ) : null}
                          </XStack>
                        );
                      })}
                    </YStack>

                    <XStack gap={12} marginTop={4}>
                      <Button
                        flex={1}
                        backgroundColor="white"
                        borderColor={C.border}
                        borderWidth={1}
                        borderRadius={10}
                        onPress={handleClear}
                        pressStyle={{ backgroundColor: '#F9FAFB', borderColor: C.border }}
                      >
                        <Text color={C.text} fontWeight="600" fontSize={14}>
                          Clear All
                        </Text>
                      </Button>
                      <Button
                        flex={1}
                        backgroundColor={C.accent}
                        borderWidth={0}
                        borderRadius={10}
                        onPress={handleApply}
                        pressStyle={{ backgroundColor: '$orange10' }}
                      >
                        <Text color="white" fontWeight="700" fontSize={14}>
                          Apply ({selectedStatuses.length || 'All'})
                        </Text>
                      </Button>
                    </XStack>
                  </YStack>
                </ScrollView>
              </YStack>
            </TouchableWithoutFeedback>
          </YStack>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
};

const getDatePresets = () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  
  const last3Days = new Date(today);
  last3Days.setDate(today.getDate() - 3);
  
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);
  
  const lastMonth = new Date(today);
  lastMonth.setMonth(today.getMonth() - 1);
  
  const last3Months = new Date(today);
  last3Months.setMonth(today.getMonth() - 3);
  
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  return {
    today: formatDateForBackend(today),
    yesterday: formatDateForBackend(yesterday),
    last3Days: formatDateForBackend(last3Days),
    lastWeek: formatDateForBackend(lastWeek),
    lastMonth: formatDateForBackend(lastMonth),
    last3Months: formatDateForBackend(last3Months),
    startOfMonth: formatDateForBackend(startOfMonth),
    startOfYear: formatDateForBackend(startOfYear),
    current: formatDateForBackend(today),
  };
};

// UPDATED: CustomerFilter component - simple input box for customer name
// SIMPLE: CustomerFilter component - inline input box without popup
const CustomerFilter = ({
  value,
  onValueChange
}: {
  value?: string;
  onValueChange: (value: string | undefined) => void;
}) => {
  const [tempValue, setTempValue] = useState(value || '');

  // Handle input change with debounce
  const handleInputChange = useCallback((text: string) => {
    setTempValue(text);

    // If empty, clear the filter immediately
    if (text.trim() === '') {
      onValueChange(undefined);
    }
  }, [onValueChange]);

  // Handle apply when user stops typing or presses enter
  const handleApply = useCallback(() => {
    const trimmedValue = tempValue.trim();
    if (trimmedValue === '') {
      onValueChange(undefined);
    } else {
      onValueChange(trimmedValue);
    }
    // Dismiss keyboard
    Keyboard.dismiss();
  }, [tempValue, onValueChange]);

  // Handle clear
  const handleClear = useCallback(() => {
    setTempValue('');
    onValueChange(undefined);
  }, [onValueChange]);

  // Update temp value when external value changes
  useEffect(() => {
    setTempValue(value || '');
  }, [value]);

  const applyDisabled = tempValue.trim() === (value || '');

  return (
    <YStack gap={6}>
      <Label htmlFor="customerInput" fontSize={13} fontWeight="600" color={C.label} lineHeight={18}>
        Customer
      </Label>
      <XStack alignItems="center" gap={8}>
        <Input
          id="customerInput"
          flex={1}
          value={tempValue}
          onChangeText={handleInputChange}
          placeholder="Enter customer name..."
          {...inputStyle}
          onSubmitEditing={handleApply}
          returnKeyType="done"
          clearButtonMode="while-editing"
        />
        {tempValue.trim() ? (
          <Button
            size="$3"
            circular
            backgroundColor="white"
            borderColor={C.border}
            borderWidth={1}
            onPress={handleClear}
            pressStyle={{ backgroundColor: '#F9FAFB', borderColor: C.border }}
            icon={<Ionicons name="close" size={16} color={C.muted} />}
          />
        ) : null}
        <Button
          size="$3"
          backgroundColor={C.accent}
          borderWidth={0}
          borderRadius={10}
          onPress={handleApply}
          disabled={applyDisabled}
          opacity={applyDisabled ? 0.5 : 1}
          pressStyle={{ backgroundColor: '$orange10' }}
        >
          <Text color="white" fontWeight="700" fontSize={13}>
            Apply
          </Text>
        </Button>
      </XStack>
      <Text fontSize={12} color={C.muted}>
        {value ? `Filtering by: "${value}"` : 'Leave empty to show all customers'}
      </Text>
    </YStack>
  );
};

// Enhanced Date Input Component
const DateInput = ({
  value,
  onDateChange,
  placeholder
}: {
  value?: string;
  onDateChange: (date: string) => void;
  placeholder: string;
}) => {
  const [tempValue, setTempValue] = useState(value || '');
  const [showManualInput, setShowManualInput] = useState(false);

  const validateDate = (dateString: string): boolean => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) return false;

    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  };

  const handleDateChange = (text: string) => {
    setTempValue(text);
  };

  const formatDisplayDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const showDateInput = () => {
    setShowManualInput(true);
    setTempValue(value || '');
  };

  const handleCancel = () => {
    setShowManualInput(false);
    setTempValue(value || '');
  };

  const handleConfirm = () => {
    if (validateDate(tempValue)) {
      onDateChange(tempValue);
      setShowManualInput(false);
    } else {
      Alert.alert('Invalid Date', 'Please use format: YYYY-MM-DD (e.g., 2024-01-15)');
    }
  };

  return (
    <YStack>
      <XStack
        onPress={showDateInput}
        backgroundColor="white"
        borderColor={C.border}
        borderWidth={1}
        borderRadius={10}
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={12}
        height={44}
        pressStyle={{ backgroundColor: '#F9FAFB' }}
        cursor="pointer"
      >
        <Text
          color={value ? C.text : C.placeholder}
          fontWeight="500"
          fontSize={14}
          numberOfLines={1}
          flex={1}
          textAlign="left"
        >
          {value ? formatDisplayDate(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={C.muted} />
      </XStack>

      {showManualInput && (
        <Modal
          visible={showManualInput}
          animationType="slide"
          transparent={true}
          onRequestClose={handleCancel}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <YStack
              flex={1}
              justifyContent="center"
              alignItems="center"
              backgroundColor="rgba(0,0,0,0.4)"
              padding="$4"
            >
              <TouchableWithoutFeedback>
                <YStack
                  backgroundColor="white"
                  borderRadius={16}
                  padding={16}
                  width="100%"
                  maxWidth={400}
                  borderWidth={1}
                  borderColor={C.border}
                >
                  <YStack gap={12}>
                    <Text color={C.text} fontSize={18} fontWeight="700" textAlign="center">
                      Enter Date
                    </Text>

                    <Fieldset gap={6}>
                      <Label htmlFor="dateInput" fontSize={13} fontWeight="600" color={C.label} lineHeight={18}>
                        Date (YYYY-MM-DD)
                      </Label>
                      <Input
                        id="dateInput"
                        value={tempValue}
                        onChangeText={handleDateChange}
                        placeholder="2024-01-15"
                        keyboardType="numbers-and-punctuation"
                        {...inputStyle}
                        fontSize={16}
                        fontWeight="600"
                        textAlign="center"
                      />
                    </Fieldset>

                    <Text fontSize={12} color={C.muted} textAlign="center">
                      Format: YYYY-MM-DD (e.g., 2024-01-15)
                    </Text>

                    {tempValue && !validateDate(tempValue) ? (
                      <XStack alignItems="center" justifyContent="center" gap={6}>
                        <Ionicons name="alert-circle-outline" size={16} color={C.danger} />
                        <Text fontSize={13} color={C.danger}>
                          Invalid date format
                        </Text>
                      </XStack>
                    ) : null}

                    {tempValue && validateDate(tempValue) ? (
                      <XStack
                        alignItems="center"
                        justifyContent="center"
                        gap={6}
                        backgroundColor={C.accentTint}
                        padding={8}
                        borderRadius={10}
                      >
                        <Ionicons name="checkmark-circle" size={16} color={C.accent} />
                        <Text fontSize={13} color={C.text} fontWeight="600">
                          {formatDisplayDate(tempValue)}
                        </Text>
                      </XStack>
                    ) : null}

                    <XStack gap={12} marginTop={4}>
                      <Button
                        flex={1}
                        backgroundColor="white"
                        borderColor={C.border}
                        borderWidth={1}
                        borderRadius={10}
                        onPress={handleCancel}
                        pressStyle={{ backgroundColor: '#F9FAFB', borderColor: C.border }}
                      >
                        <Text color={C.text} fontWeight="600">Cancel</Text>
                      </Button>
                      <Button
                        flex={1}
                        backgroundColor={C.accent}
                        borderWidth={0}
                        borderRadius={10}
                        onPress={handleConfirm}
                        disabled={!validateDate(tempValue)}
                        opacity={validateDate(tempValue) ? 1 : 0.5}
                        pressStyle={{ backgroundColor: '$orange10' }}
                      >
                        <Text color="white" fontWeight="700">Confirm</Text>
                      </Button>
                    </XStack>
                  </YStack>
                </YStack>
              </TouchableWithoutFeedback>
            </YStack>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </YStack>
  );
};

// Enhanced Date Filter Modal with Quick Presets
const DateFilterModal = ({
  visible,
  onClose,
  onApplyFilters,
  currentFilters,
}: {
  visible: boolean;
  onClose: () => void;
  onApplyFilters: (filters: { startDate?: string; endDate?: string }) => void;
  currentFilters: { startDate?: string; endDate?: string };
}) => {
  const [startDate, setStartDate] = useState<string>(currentFilters.startDate || '');
  const [endDate, setEndDate] = useState<string>(currentFilters.endDate || '');
  const datePresets = getDatePresets();

  const handleApply = () => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        Alert.alert('Invalid Date Range', 'Start date cannot be after end date');
        return;
      }
    }

    onApplyFilters({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    onClose();
  };

  const handleClear = () => {
    setStartDate('');
    setEndDate('');
    onApplyFilters({});
    onClose();
  };

  const applyQuickFilter = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  const formatDisplayDate = (dateString?: string) => {
    if (!dateString) return 'Not selected';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getQuickFilterButtons = () => [
    {
      label: 'Last 3 Days',
      start: datePresets.last3Days,
      onPress: () => applyQuickFilter(datePresets.last3Days, datePresets.current),
      description: 'Last 3 days including today'
    },
    {
      label: 'Last Week',
      start: datePresets.lastWeek,
      onPress: () => applyQuickFilter(datePresets.lastWeek, datePresets.current),
      description: 'Last 7 days including today'
    },
    {
      label: 'Last Month',
      start: datePresets.lastMonth,
      onPress: () => applyQuickFilter(datePresets.lastMonth, datePresets.current),
      description: 'Last 30 days including today'
    },
    {
      label: 'Last 3 Months',
      start: datePresets.last3Months,
      onPress: () => applyQuickFilter(datePresets.last3Months, datePresets.current),
      description: 'Last 90 days including today'
    },
    {
      label: 'This Month',
      start: datePresets.startOfMonth,
      onPress: () => applyQuickFilter(datePresets.startOfMonth, datePresets.current),
      description: 'From start of month to today'
    },
    {
      label: 'This Year',
      start: datePresets.startOfYear,
      onPress: () => applyQuickFilter(datePresets.startOfYear, datePresets.current),
      description: 'From start of year to today'
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <YStack
          flex={1}
          justifyContent="center"
          alignItems="center"
          backgroundColor="rgba(0,0,0,0.4)"
          padding="$4"
        >
          <TouchableWithoutFeedback>
            <YStack
              backgroundColor="white"
              borderRadius={16}
              padding={16}
              width="100%"
              maxWidth={400}
              borderWidth={1}
              borderColor={C.border}
              maxHeight="90%"
            >
              <ScrollView showsVerticalScrollIndicator={false}>
                <YStack gap={16}>
                  <XStack alignItems="center" justifyContent="space-between">
                    <Text color={C.text} fontSize={18} fontWeight="700">
                      Filter by Date Range
                    </Text>
                    <Button
                      size="$2"
                      circular
                      chromeless
                      borderWidth={0}
                      onPress={onClose}
                      icon={<Ionicons name="close" size={20} color={C.muted} />}
                    />
                  </XStack>

                  <YStack gap={8}>
                    <Text fontSize={13} fontWeight="600" color={C.label}>
                      Quick Filters
                    </Text>
                    <XStack flexWrap="wrap" gap={8}>
                      {getQuickFilterButtons().map((filter, index) => {
                        const selected = startDate === filter.start && endDate === datePresets.current;
                        return (
                          <XStack
                            key={index}
                            onPress={filter.onPress}
                            backgroundColor={selected ? C.accentTint : 'white'}
                            borderColor={selected ? C.accent : C.border}
                            borderWidth={1}
                            borderRadius={999}
                            paddingHorizontal={12}
                            paddingVertical={8}
                            pressStyle={{ opacity: 0.8 }}
                            cursor="pointer"
                          >
                            <Text color={selected ? C.accent : C.text} fontWeight="600" fontSize={13}>
                              {filter.label}
                            </Text>
                          </XStack>
                        );
                      })}
                    </XStack>
                  </YStack>

                  <YStack gap={12}>
                    <Text fontSize={13} fontWeight="600" color={C.label}>
                      Custom Date Range
                    </Text>

                    <Fieldset gap={6}>
                      <Label htmlFor="startDate" fontSize={13} fontWeight="500" color={C.muted} lineHeight={18}>
                        Start Date
                      </Label>
                      <DateInput
                        value={startDate}
                        onDateChange={setStartDate}
                        placeholder="Select start date"
                      />
                    </Fieldset>

                    <Fieldset gap={6}>
                      <Label htmlFor="endDate" fontSize={13} fontWeight="500" color={C.muted} lineHeight={18}>
                        End Date
                      </Label>
                      <DateInput
                        value={endDate}
                        onDateChange={setEndDate}
                        placeholder="Select end date"
                      />
                    </Fieldset>

                    {startDate && endDate ? (
                      <XStack
                        alignItems="center"
                        justifyContent="center"
                        gap={6}
                        backgroundColor={C.accentTint}
                        padding={10}
                        borderRadius={10}
                      >
                        <Ionicons name="calendar-outline" size={16} color={C.accent} />
                        <Text fontSize={13} fontWeight="600" color={C.text}>
                          {formatDisplayDate(startDate)} to {formatDisplayDate(endDate)}
                        </Text>
                      </XStack>
                    ) : null}
                  </YStack>

                  <XStack gap={12}>
                    <Button
                      flex={1}
                      backgroundColor="white"
                      borderColor={C.border}
                      borderWidth={1}
                      borderRadius={10}
                      onPress={handleClear}
                      pressStyle={{ backgroundColor: '#F9FAFB', borderColor: C.border }}
                    >
                      <Text color={C.text} fontWeight="600">Clear All</Text>
                    </Button>
                    <Button
                      flex={1}
                      backgroundColor={C.accent}
                      borderWidth={0}
                      borderRadius={10}
                      pressStyle={{ backgroundColor: '$orange10' }}
                      onPress={handleApply}
                      disabled={!startDate && !endDate}
                      opacity={!startDate && !endDate ? 0.5 : 1}
                    >
                      <Text color="white" fontWeight="700">
                        {startDate && endDate ? 'Apply Filters' : 'Select Dates'}
                      </Text>
                    </Button>
                  </XStack>
                </YStack>
              </ScrollView>
            </YStack>
          </TouchableWithoutFeedback>
        </YStack>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const BatchDetails = ({ batches }: { batches: SellItemBatch[] }) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!batches || batches.length === 0) {
    return null;
  }

  return (
    <YStack>
      <XStack
        onPress={() => setShowDetails(!showDetails)}
        alignSelf="flex-start"
        alignItems="center"
        gap={4}
        paddingHorizontal={10}
        paddingVertical={4}
        borderRadius={999}
        borderWidth={1}
        borderColor={C.border}
        backgroundColor="white"
        pressStyle={{ backgroundColor: '#F9FAFB' }}
        cursor="pointer"
      >
        <Ionicons name="cube-outline" size={14} color={C.muted} />
        <Text color={C.label} fontSize={12} fontWeight="600">
          {batches.length} batch{batches.length > 1 ? 'es' : ''}
        </Text>
        <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={14} color={C.muted} />
      </XStack>

      {showDetails && (
        <YStack marginTop={8} gap={6}>
          {batches.map((batchItem) => (
            <XStack
              key={batchItem.id}
              backgroundColor="#F9FAFB"
              borderWidth={1}
              borderColor={C.border}
              padding={8}
              borderRadius={8}
              justifyContent="space-between"
              alignItems="center"
            >
              <YStack flex={1}>
                <Text fontSize={12} fontWeight="600" color={C.text}>
                  Batch #{batchItem.batch?.batchNumber || batchItem.batchId?.slice(-6) || 'N/A'}
                </Text>
                <Text fontSize={12} color={C.muted}>
                  Qty: {batchItem.quantity}
                </Text>
              </YStack>
              {batchItem.batch?.expiryDate ? (
                <Text fontSize={12} color={C.muted}>
                  {new Date(batchItem.batch.expiryDate).toLocaleDateString()}
                </Text>
              ) : null}
            </XStack>
          ))}
        </YStack>
      )}
    </YStack>
  );
};

const ConvertConfirmationModal = ({
  visible,
  onClose,
  onConfirm,
  sell,
  isConverting,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  sell: Sell | null;
  isConverting: boolean;
}) => {
  if (!sell) return null;

  const canConvert = !sell.locked && ['PENDING', 'APPROVED', 'NOT_APPROVED'].includes(sell.saleStatus);

  if (!canConvert) {
    return (
      <Modal
        visible={visible}
        animationType="fade"
        transparent={true}
        onRequestClose={onClose}
      >
        <YStack
          flex={1}
          justifyContent="center"
          alignItems="center"
          backgroundColor="rgba(0,0,0,0.4)"
          padding="$4"
        >
          <YStack
            backgroundColor="white"
            borderRadius={16}
            padding={20}
            width="100%"
            maxWidth={400}
            borderWidth={1}
            borderColor={C.border}
          >
            <YStack gap={12} alignItems="center">
              <YStack
                width={48}
                height={48}
                borderRadius={999}
                backgroundColor="#FEE2E2"
                alignItems="center"
                justifyContent="center"
              >
                <Ionicons name="alert-circle-outline" size={26} color={C.danger} />
              </YStack>
              <Text color={C.text} fontSize={18} fontWeight="700" textAlign="center">
                Cannot Convert Order
              </Text>
              <Text color={C.muted} fontSize={14} textAlign="center">
                {sell.locked
                  ? 'This order is locked and cannot be converted.'
                  : `Orders with status "${sell.saleStatus}" cannot be converted. Only pending or approved orders can be converted.`
                }
              </Text>
              <Button
                width="100%"
                backgroundColor="white"
                borderColor={C.border}
                borderWidth={1}
                borderRadius={10}
                onPress={onClose}
                pressStyle={{ backgroundColor: '#F9FAFB', borderColor: C.border }}
              >
                <Text color={C.text} fontWeight="600">Close</Text>
              </Button>
            </YStack>
          </YStack>
        </YStack>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <YStack
        flex={1}
        justifyContent="center"
        alignItems="center"
        backgroundColor="rgba(0,0,0,0.4)"
        padding="$4"
      >
        <YStack
          backgroundColor="white"
          borderRadius={16}
          padding={20}
          width="100%"
          maxWidth={400}
          borderWidth={1}
          borderColor={C.border}
        >
          <YStack gap={16}>
            <YStack alignItems="center" gap={8}>
              <YStack
                width={48}
                height={48}
                borderRadius={999}
                backgroundColor={C.accentTint}
                alignItems="center"
                justifyContent="center"
              >
                <Ionicons name="cart-outline" size={24} color={C.accent} />
              </YStack>
              <Text color={C.text} fontSize={18} fontWeight="700" textAlign="center">
                Convert Order to Cart
              </Text>
              <Text fontSize={13} color={C.muted} textAlign="center">
                This will convert the order back to a shopping cart
              </Text>
            </YStack>

            <YStack
              gap={8}
              borderWidth={1}
              borderColor={C.border}
              borderRadius={12}
              padding={12}
            >
              <InfoRow label="Invoice">
                <Text color={C.text} fontWeight="600">{sell.invoiceNo}</Text>
              </InfoRow>
              <InfoRow label="Status">
                <StatusPill status={sell.saleStatus} label={sell.saleStatus} />
              </InfoRow>
              <InfoRow label="Items">
                <Text color={C.text} fontWeight="600">{sell.totalProducts || sell.items?.length || 0}</Text>
              </InfoRow>
              <InfoRow label="Total">
                <Text fontWeight="700" color={C.accent}>{formatMoney(sell.grandTotal)}</Text>
              </InfoRow>
            </YStack>

            <XStack gap={12}>
              <Button
                flex={1}
                backgroundColor="white"
                borderColor={C.border}
                borderWidth={1}
                borderRadius={10}
                onPress={onClose}
                disabled={isConverting}
                pressStyle={{ backgroundColor: '#F9FAFB', borderColor: C.border }}
              >
                <Text color={C.text} fontWeight="600">Cancel</Text>
              </Button>
              <Button
                flex={1}
                backgroundColor={C.accent}
                borderWidth={0}
                borderRadius={10}
                onPress={onConfirm}
                disabled={isConverting}
                pressStyle={{ backgroundColor: '$orange10' }}
              >
                {isConverting ? (
                  <XStack gap={8} alignItems="center">
                    <Spinner size="small" color="white" />
                    <Text color="white" fontWeight="700">Converting...</Text>
                  </XStack>
                ) : (
                  <Text color="white" fontWeight="700">Convert</Text>
                )}
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </YStack>
    </Modal>
  );
};

const SellDetailModal = ({
  sell,
  visible,
  onClose,
  onConvertToCart,
  isConverting,
  onReturnCorrection,
}: {
  sell: Sell;
  visible: boolean;
  onClose: () => void;
  onConvertToCart: () => void;
  isConverting: boolean;
  onReturnCorrection: () => void;
}) => {
  const getStatusText = (status: string) => {
    switch (status) {
      case 'DELIVERED': return 'Delivered';
      case 'NOT_APPROVED': return 'Not Approved';
      case 'PARTIALLY_DELIVERED': return 'Partially Delivered';
      case 'APPROVED': return 'Approved';
      case 'CANCELLED': return 'Cancelled';
      case 'RETURNED': return 'Returned';
      case 'PENDING': return 'Pending';
      default: return status;
    }
  };

  const getItemStatusText = (status: string) => {
    switch (status) {
      case 'DELIVERED': return 'Delivered';
      case 'PENDING': return 'Pending';
      case 'REJECTED': return 'Rejected';
      case 'CANCELLED': return 'Cancelled';
      case 'RETURNED': return 'Returned';
      default: return status;
    }
  };

  const getProductName = (item: SellItem) => {
    return lineItemName(item?.product, item?.subProduct, `Product ${item?.productId?.slice(-8) || 'Unknown'}`);
  };

  const getShopName = (item: SellItem) => {
    return item?.shop?.name || 'Unknown Shop';
  };

  const getUnitOfMeasure = (item: SellItem) => {
    return item?.unitOfMeasure?.name || item?.unitOfMeasure?.symbol || 'unit';
  };

  const getItemBatches = (item: SellItem) => {
    return item?.batches || [];
  };

  const canConvert = !sell.locked && ['PENDING', 'APPROVED', 'NOT_APPROVED'].includes(sell.saleStatus);
  // Same rule as the web: returns are raised against delivered sales
  const canRequestCorrection = sell.saleStatus === 'DELIVERED';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <YStack
        flex={1}
        backgroundColor="rgba(0,0,0,0.4)"
        justifyContent="flex-end"
      >
        <YStack
          backgroundColor="white"
          borderTopLeftRadius={20}
          borderTopRightRadius={20}
          padding={16}
          maxHeight="85%"
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <YStack gap={16}>
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={C.text} fontSize={20} fontWeight="700">Order Details</Text>
                <XStack gap={8} alignItems="center">
                  {canConvert && (
                    <Button
                      size="$3"
                      backgroundColor={C.accent}
                      borderWidth={0}
                      borderRadius={10}
                      onPress={onConvertToCart}
                      disabled={isConverting}
                      pressStyle={{ backgroundColor: '$orange10' }}
                      icon={isConverting ? undefined : <Ionicons name="cart-outline" size={16} color="white" />}
                    >
                      {isConverting ? (
                        <Spinner size="small" color="white" />
                      ) : (
                        <Text color="white" fontWeight="700" fontSize={13}>
                          Convert to Cart
                        </Text>
                      )}
                    </Button>
                  )}
                  <Button
                    size="$3"
                    circular
                    backgroundColor="white"
                    borderColor={C.border}
                    borderWidth={1}
                    onPress={onClose}
                    pressStyle={{ backgroundColor: '#F9FAFB', borderColor: C.border }}
                    icon={<Ionicons name="close" size={18} color={C.text} />}
                  />
                </XStack>
              </XStack>

              <YStack gap={10} borderWidth={1} borderColor={C.border} borderRadius={12} padding={14}>
                <InfoRow label="Invoice No">
                  <Text color={C.text} fontWeight="600">{sell.invoiceNo}</Text>
                </InfoRow>
                <InfoRow label="Date">
                  <Text color={C.text}>
                    {new Date(sell.saleDate).toLocaleDateString()}
                  </Text>
                </InfoRow>
                <InfoRow label="Status">
                  <StatusPill status={sell.saleStatus} label={getStatusText(sell.saleStatus)} />
                </InfoRow>
                {sell.locked && (
                  <InfoRow label="Locked">
                    <XStack alignItems="center" gap={4}>
                      <Ionicons name="lock-closed-outline" size={14} color={C.danger} />
                      <Text color={C.danger} fontWeight="600">Yes</Text>
                    </XStack>
                  </InfoRow>
                )}
                {sell.branch && (
                  <InfoRow label="Branch">
                    <Text color={C.text}>{sell.branch.name}</Text>
                  </InfoRow>
                )}
                {sell.customer && (
                  <InfoRow label="Customer">
                    <Text color={C.text} fontWeight="600">{sell.customer.name}</Text>
                  </InfoRow>
                )}
                <InfoRow label="Total Products">
                  <Text color={C.text}>{sell.totalProducts}</Text>
                </InfoRow>
              </YStack>

              {canRequestCorrection && (
                <Button
                  backgroundColor="white"
                  borderColor={C.accent}
                  borderWidth={1}
                  borderRadius={10}
                  onPress={onReturnCorrection}
                  pressStyle={{ backgroundColor: C.accentTint, borderColor: C.accent }}
                  icon={<Ionicons name="return-down-back-outline" size={18} color={C.accent} />}
                >
                  <Text color={C.accent} fontWeight="700">Return Sell Correction</Text>
                </Button>
              )}

              <YStack gap={10}>
                <Text fontWeight="700" color={C.text} fontSize={16}>
                  Items ({sell.items?.length || 0})
                </Text>
                {sell.items?.map((item, index) => (
                  <YStack
                    key={item?.id || index}
                    gap={10}
                    borderWidth={1}
                    borderColor={C.border}
                    borderRadius={12}
                    padding={12}
                    backgroundColor="white"
                  >
                    <XStack justifyContent="space-between" alignItems="flex-start" gap={12}>
                      <AppImage
                        path={item?.subProduct?.imageUrl || item?.product?.imageUrl || item?.product?.image}
                        size={52}
                        radius={10}
                        bordered
                        zoomable
                        title={getProductName(item)}
                      />
                      <YStack flex={1} gap={2}>
                        <Text fontWeight="700" color={C.text} numberOfLines={2}>
                          {getProductName(item)}
                        </Text>
                        <Text fontSize={12} color={C.muted}>
                          Shop: {getShopName(item)}
                        </Text>
                        <Text fontSize={12} color={C.muted}>
                          Unit: {getUnitOfMeasure(item)}
                        </Text>
                      </YStack>
                      <YStack alignItems="flex-end" gap={2}>
                        <Text fontWeight="600" color={C.text}>
                          {formatMoney(item?.unitPrice)}
                        </Text>
                        <Text fontSize={12} color={C.muted}>
                          x{item?.quantity || 0}
                        </Text>
                      </YStack>
                    </XStack>

                    {getItemBatches(item).length > 0 && (
                      <BatchDetails batches={getItemBatches(item)} />
                    )}

                    <XStack justifyContent="space-between" alignItems="center">
                      <StatusPill
                        status={item?.itemSaleStatus || 'PENDING'}
                        label={getItemStatusText(item?.itemSaleStatus || 'PENDING')}
                      />
                      <Text fontWeight="700" color={C.text}>
                        {formatMoney(item?.totalPrice)}
                      </Text>
                    </XStack>
                  </YStack>
                ))}
              </YStack>

              {/* Returns / corrections raised on this sale, shown apart from the items */}
              {visible && <SellCorrectionsList sellId={sell.id} />}

              <YStack gap={8} borderWidth={1} borderColor={C.border} borderRadius={12} padding={14}>
                <InfoRow label="Subtotal">
                  <Text color={C.text}>{formatMoney(sell.subTotal)}</Text>
                </InfoRow>
                <InfoRow label="Discount">
                  <Text color={C.danger}>-{formatMoney(sell.discount)}</Text>
                </InfoRow>
                <InfoRow label="VAT">
                  <Text color={C.text}>{formatMoney(sell.vat)}</Text>
                </InfoRow>
                <XStack
                  justifyContent="space-between"
                  alignItems="center"
                  borderTopWidth={1}
                  borderTopColor={C.border}
                  paddingTop={10}
                  marginTop={2}
                >
                  <Text fontWeight="700" color={C.text} fontSize={16}>Grand Total</Text>
                  <Text fontWeight="800" color={C.accent} fontSize={18}>
                    {formatMoney(sell.grandTotal)}
                  </Text>
                </XStack>
                {sell.NetTotal ? (
                  <InfoRow label="Net Total">
                    <Text color={C.text}>{formatMoney(sell.NetTotal)}</Text>
                  </InfoRow>
                ) : null}
              </YStack>

              {sell.notes ? (
                <YStack gap={6} borderWidth={1} borderColor={C.border} borderRadius={12} padding={14}>
                  <Text fontWeight="600" color={C.label}>Notes</Text>
                  <Text color={C.text}>{sell.notes}</Text>
                </YStack>
              ) : null}
            </YStack>
          </ScrollView>
        </YStack>
      </YStack>
    </Modal>
  );
};

// UPDATED: OrderScreen component with React Query instead of Zustand
const OrderScreen = () => {
  // Local state for filters
  const [filters, setFilters] = useState<GetAllSellsUserParams>({
    startDate: undefined,
    endDate: undefined,
    customerName: undefined,
    status: undefined,
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSell, setSelectedSell] = useState<Sell | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [sellToConvert, setSellToConvert] = useState<Sell | null>(null);
  const [correctionSellId, setCorrectionSellId] = useState<string | null>(null);

  // React Query hooks
  const { data, isLoading, error, refetch } = useUserSells(filters);
  const convertMutation = useConvertOrderToCart();
  const queryClient = useQueryClient();

  // Access data
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sells = data?.sells || [];
  const totalCount = data?.count || 0;
  // const meta = data?.meta || {};

  // UPDATED: Check if any filters are active
  const statusFilter = filters.status || 'all';
  const customerFilter = filters.customerName;
  const hasActiveFilters = statusFilter !== 'all' || customerFilter || searchQuery || filters.startDate || filters.endDate;

  // Filter sells locally based on search query
  const filteredSells = useMemo(() => {
    return sells.filter(sell => {
      if (!searchQuery) return true;
      
      const matchesSearch = 
        sell.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sell.invoiceNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sell.customer?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sell.items?.some(item => 
          item?.product?.name?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      
      return matchesSearch;
    });
  }, [sells, searchQuery]);

  // Refresh sells data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error.message || 'Failed to fetch sales');
    }
  }, [error]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleApplyDateFilters = useCallback((newFilters: { startDate?: string; endDate?: string }) => {
    setFilters(prev => ({
      ...prev,
      startDate: newFilters.startDate,
      endDate: newFilters.endDate,
    }));
  }, []);

  const handleStatusFilterChange = useCallback((status: string) => {
    setFilters(prev => ({
      ...prev,
      status: status === 'all' ? undefined : status,
    }));
  }, []);

  const handleCustomerFilterChange = useCallback((customerName?: string) => {
    setFilters(prev => ({
      ...prev,
      customerName: customerName,
    }));
  }, []);

  const handleResetAllFilters = useCallback(() => {
    setFilters({
      startDate: undefined,
      endDate: undefined,
      customerName: undefined,
      status: undefined,
    });
    setSearchQuery('');
    setShowFilterModal(false);
    
    Alert.alert('Filters Reset', 'All filters have been cleared');
  }, []);

  const handleViewDetails = useCallback((sell: Sell) => {
    setSelectedSell(sell);
    setShowDetailModal(true);
  }, []);

  const handleConvertToCart = useCallback((sell: Sell) => {
    setSellToConvert(sell);
    setShowConvertConfirm(true);
  }, []);

  const confirmConvertToCart = useCallback(async () => {
    if (!sellToConvert) return;

    try {
      const result = await convertMutation.mutateAsync(sellToConvert.id);
      
      Alert.alert(
        'Success',
        result.message || 'Order converted to cart successfully!',
        [{ text: 'OK', onPress: () => {
          setShowConvertConfirm(false);
          setSellToConvert(null);
          if (selectedSell?.id === sellToConvert.id) {
            setShowDetailModal(false);
            setSelectedSell(null);
          }
        }}]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to convert order to cart');
    }
  }, [sellToConvert, convertMutation, selectedSell?.id]);

  // Format date range for display
  const formatDateRangeDisplay = useCallback(() => {
    if (!filters.startDate && !filters.endDate) return null;
    
    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    };

    if (filters.startDate && filters.endDate) {
      return `${formatDate(filters.startDate)} - ${formatDate(filters.endDate)}`;
    } else if (filters.startDate) {
      return `From ${formatDate(filters.startDate)}`;
    } else if (filters.endDate) {
      return `Until ${formatDate(filters.endDate)}`;
    }
  }, [filters.startDate, filters.endDate]);

  // Group sells by date
  const sellsByDate = useMemo(() => {
    return filteredSells.reduce((acc, sell) => {
      const date = new Date(sell.saleDate).toLocaleDateString();
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(sell);
      return acc;
    }, {} as Record<string, Sell[]>);
  }, [filteredSells]);

  // Helper functions
  const getStatusText = useCallback((status: string) => {
    switch(status) {
      case 'DELIVERED': return 'Delivered';
      case 'NOT_APPROVED': return 'Not Approved';
      case 'PARTIALLY_DELIVERED': return 'Partially Delivered';
      case 'APPROVED': return 'Approved';
      case 'CANCELLED': return 'Cancelled';
      case 'RETURNED': return 'Returned';
      case 'PENDING': return 'Pending';
      default: return status;
    }
  }, []);

  const hasBatches = useCallback((sell: Sell) => {
    return sell.items?.some(item => item.batches?.length > 0) || false;
  }, []);

  const getProductDisplayNames = useCallback((sell: Sell) => {
    if (!sell.items?.length) return 'No items';
    
    const names = sell.items.slice(0, 3).map(item => lineItemName(item.product, item.subProduct, 'Unknown'));
    if (sell.items.length > 3) {
      return `${names.join(', ')} and ${sell.items.length - 3} more...`;
    }
    return names.join(', ');
  }, []);

  const canConvertSell = useCallback((sell: Sell) => {
    return !sell.locked && ['PENDING', 'APPROVED', 'NOT_APPROVED'].includes(sell.saleStatus);
  }, []);

  if (isLoading && !refreshing && sells.length === 0) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="white">
        <Spinner size="large" color={C.accent} />
        <Text marginTop={16} color={C.muted} fontSize={15}>
          Loading your sales...
        </Text>
      </YStack>
    );
  }

  const dateRangeLabel = formatDateRangeDisplay();

  return (
    <YStack flex={1} backgroundColor="white">
      <ScrollView
        flex={1}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.accent]} tintColor={C.accent} />
        }
      >
        {/* Screen header */}
        <YStack
          paddingHorizontal={16}
          paddingTop={16}
          paddingBottom={12}
          borderBottomWidth={1}
          borderBottomColor={C.border}
          backgroundColor="white"
          gap={2}
        >
          <Text fontSize={24} fontWeight="700" color={C.text}>
            My Sales
          </Text>
          <Text fontSize={13} color={C.muted}>
            Orders you have created
          </Text>
        </YStack>

        <YStack gap={12} padding={16}>
          {/* Summary */}
          <YStack
            backgroundColor="white"
            borderWidth={1}
            borderColor={C.border}
            borderRadius={14}
            padding={16}
            {...softShadow}
          >
            {sells.length === 0 ? (
              <YStack alignItems="center" gap={8} paddingVertical={16}>
                <YStack
                  width={56}
                  height={56}
                  borderRadius={999}
                  backgroundColor={C.accentTint}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Ionicons name="receipt-outline" size={26} color={C.accent} />
                </YStack>
                <Text fontSize={16} fontWeight="700" color={C.text} textAlign="center">
                  No sales found
                </Text>
                {hasActiveFilters ? (
                  <Text
                    onPress={handleResetAllFilters}
                    color={C.accent}
                    fontWeight="600"
                    fontSize={14}
                    textAlign="center"
                  >
                    Try adjusting your filters
                  </Text>
                ) : (
                  <Text fontSize={14} color={C.muted} textAlign="center">
                    Your sales will appear here
                  </Text>
                )}
              </YStack>
            ) : (
              <YStack gap={10} width="100%">
                <XStack justifyContent="space-between" alignItems="center" width="100%">
                  <XStack alignItems="center" gap={8}>
                    <Ionicons name="receipt-outline" size={18} color={C.accent} />
                    <Text fontSize={14} color={C.label}>
                      Total Sales
                    </Text>
                  </XStack>
                  <Text fontSize={20} fontWeight="800" color={C.text}>
                    {totalCount}
                  </Text>
                </XStack>
                {filteredSells.length !== totalCount ? (
                  <XStack justifyContent="space-between" alignItems="center" width="100%">
                    <Text fontSize={14} color={C.label}>
                      Filtered Sales
                    </Text>
                    <Text fontSize={16} fontWeight="700" color={C.accent}>
                      {filteredSells.length}
                    </Text>
                  </XStack>
                ) : null}
                {customerFilter ? (
                  <XStack alignItems="center" gap={6}>
                    <Ionicons name="person-outline" size={14} color={C.muted} />
                    <Text fontSize={13} color={C.muted}>
                      Customer: {customerFilter}
                    </Text>
                  </XStack>
                ) : null}
                {dateRangeLabel ? (
                  <XStack alignItems="center" gap={6}>
                    <Ionicons name="calendar-outline" size={14} color={C.muted} />
                    <Text fontSize={13} color={C.muted}>
                      {dateRangeLabel}
                    </Text>
                  </XStack>
                ) : null}
              </YStack>
            )}
          </YStack>

          {/* Filters Section */}
          {sells.length > 0 && (
            <YStack
              backgroundColor="white"
              borderWidth={1}
              borderColor={C.border}
              borderRadius={14}
              padding={16}
              gap={12}
              {...softShadow}
            >
              <XStack justifyContent="space-between" alignItems="center">
                <Text fontSize={16} fontWeight="700" color={C.text}>
                  Filters
                </Text>
                {hasActiveFilters ? (
                  <XStack
                    onPress={handleResetAllFilters}
                    alignItems="center"
                    gap={4}
                    paddingHorizontal={10}
                    paddingVertical={6}
                    borderRadius={8}
                    pressStyle={{ opacity: 0.7 }}
                    cursor="pointer"
                  >
                    <Ionicons name="refresh-outline" size={16} color={C.accent} />
                    <Text color={C.accent} fontWeight="600" fontSize={13}>
                      Reset All
                    </Text>
                  </XStack>
                ) : null}
              </XStack>

              {/* Search */}
              <Fieldset gap={6}>
                <Label htmlFor="search" fontSize={13} fontWeight="600" color={C.label} lineHeight={18}>
                  Search
                </Label>
                <XStack
                  alignItems="center"
                  borderWidth={1}
                  borderColor={C.border}
                  borderRadius={10}
                  backgroundColor="white"
                  paddingLeft={12}
                >
                  <Ionicons name="search-outline" size={18} color={C.muted} />
                  <Input
                    id="search"
                    flex={1}
                    placeholder="Order ID, invoice, customer or product..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    borderWidth={0}
                    backgroundColor="transparent"
                    color={C.text}
                    placeholderTextColor={C.placeholder}
                    focusStyle={{ borderWidth: 0 }}
                  />
                </XStack>
              </Fieldset>

              {/* UPDATED: Customer Filter - simple input box */}
              <CustomerFilter
                value={customerFilter}
                onValueChange={handleCustomerFilterChange}
              />

              {/* Status Filter */}
              <Fieldset gap={6}>
                <Label htmlFor="status" fontSize={13} fontWeight="600" color={C.label} lineHeight={18}>
                  Status
                </Label>
                <StatusSelect
                  value={statusFilter}
                  onValueChange={handleStatusFilterChange}
                />
              </Fieldset>

              {/* Filter Actions */}
              <XStack gap={8}>
                <Button
                  flex={1}
                  backgroundColor="white"
                  borderColor={C.border}
                  borderWidth={1}
                  borderRadius={10}
                  onPress={() => setShowFilterModal(true)}
                  pressStyle={{ backgroundColor: '#F9FAFB', borderColor: C.border }}
                  icon={<Ionicons name="calendar-outline" size={16} color={C.accent} />}
                >
                  <Text color={C.text} fontWeight="600">Date Range</Text>
                </Button>
                <Button
                  backgroundColor="white"
                  borderColor={C.danger}
                  borderWidth={1}
                  borderRadius={10}
                  onPress={handleResetAllFilters}
                  pressStyle={{ backgroundColor: '#FEF2F2', borderColor: C.danger }}
                  icon={<Ionicons name="trash-outline" size={16} color={C.danger} />}
                >
                  <Text color={C.danger} fontWeight="600">Clear All</Text>
                </Button>
              </XStack>

              {/* Active Filters Summary */}
              {hasActiveFilters ? (
                <YStack gap={6}>
                  <Text fontSize={12} fontWeight="600" color={C.muted}>
                    Active filters
                  </Text>
                  <XStack flexWrap="wrap" gap={6}>
                    {customerFilter ? (
                      <Badge>Customer: {customerFilter}</Badge>
                    ) : null}
                    {statusFilter !== 'all' ? (
                      <Badge>Status</Badge>
                    ) : null}
                    {searchQuery ? (
                      <Badge>Search</Badge>
                    ) : null}
                    {filters.startDate && filters.endDate ? (
                      <Badge>Date Range</Badge>
                    ) : null}
                  </XStack>
                </YStack>
              ) : null}
            </YStack>
          )}

          {/* Sales by Date */}
          {Object.entries(sellsByDate).map(([date, dateSells]) => (
            <YStack key={date} gap={10}>
              <XStack alignItems="center" gap={8} paddingHorizontal={4} marginTop={4}>
                <Ionicons name="calendar-outline" size={16} color={C.muted} />
                <Text fontSize={15} fontWeight="700" color={C.text}>
                  {date}
                </Text>
                <Badge>
                  {dateSells.length} {dateSells.length === 1 ? 'sale' : 'sales'}
                </Badge>
              </XStack>

              {dateSells.map((sell) => (
                <YStack
                  key={sell.id}
                  backgroundColor="white"
                  borderWidth={1}
                  borderColor={C.border}
                  borderRadius={14}
                  padding={14}
                  gap={12}
                  {...softShadow}
                  onPress={() => handleViewDetails(sell)}
                  pressStyle={{ backgroundColor: '#FAFAFA' }}
                  cursor="pointer"
                >
                  <XStack justifyContent="space-between" alignItems="flex-start" gap={12}>
                    <YStack flex={1} gap={4}>
                      <Text fontSize={15} fontWeight="700" color={C.text}>
                        {sell.invoiceNo}
                      </Text>
                      {sell.customer ? (
                        <XStack alignItems="center" gap={6}>
                          <Ionicons name="person-outline" size={14} color={C.muted} />
                          <Text fontSize={14} color={C.text} numberOfLines={1} flexShrink={1}>
                            {sell.customer.name}
                          </Text>
                        </XStack>
                      ) : null}
                      <XStack alignItems="center" gap={6}>
                        <Ionicons name="time-outline" size={14} color={C.muted} />
                        <Text fontSize={12} color={C.muted}>
                          {new Date(sell.saleDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })} at {new Date(sell.saleDate).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </Text>
                      </XStack>
                    </YStack>
                    <YStack alignItems="flex-end" gap={6}>
                      <StatusPill status={sell.saleStatus} label={getStatusText(sell.saleStatus)} />
                      {hasBatches(sell) ? (
                        <XStack alignItems="center" gap={4}>
                          <Ionicons name="cube-outline" size={13} color={C.muted} />
                          <Text fontSize={12} color={C.muted}>Batches</Text>
                        </XStack>
                      ) : null}
                      {sell.locked ? (
                        <XStack alignItems="center" gap={4}>
                          <Ionicons name="lock-closed-outline" size={13} color={C.danger} />
                          <Text fontSize={12} color={C.danger} fontWeight="600">Locked</Text>
                        </XStack>
                      ) : null}
                    </YStack>
                  </XStack>

                  <XStack
                    justifyContent="space-between"
                    alignItems="center"
                    borderTopWidth={1}
                    borderTopColor="#F3F4F6"
                    paddingTop={10}
                  >
                    <Text fontSize={14} color={C.label}>
                      Total
                    </Text>
                    <Text fontSize={17} fontWeight="800" color={C.accent}>
                      {formatMoney(sell.grandTotal)}
                    </Text>
                  </XStack>

                  <XStack gap={8}>
                    <Button
                      flex={1}
                      size="$3"
                      backgroundColor="white"
                      borderColor={C.border}
                      borderWidth={1}
                      borderRadius={10}
                      onPress={() => handleViewDetails(sell)}
                      pressStyle={{ backgroundColor: '#F9FAFB', borderColor: C.border }}
                      icon={<Ionicons name="eye-outline" size={16} color={C.text} />}
                    >
                      <Text color={C.text} fontWeight="600" fontSize={13}>
                        View Details
                      </Text>
                    </Button>

                    {canConvertSell(sell) && (
                      <Button
                        flex={1}
                        size="$3"
                        backgroundColor={C.accent}
                        borderWidth={0}
                        borderRadius={10}
                        onPress={() => handleConvertToCart(sell)}
                        pressStyle={{ backgroundColor: '$orange10' }}
                        icon={<Ionicons name="create-outline" size={16} color="white" />}
                      >
                        <Text color="white" fontWeight="700" fontSize={13}>
                          Edit
                        </Text>
                      </Button>
                    )}
                  </XStack>
                </YStack>
              ))}
            </YStack>
          ))}
        </YStack>
      </ScrollView>

      {/* Keep all modals as they were */}
      <DateFilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onApplyFilters={handleApplyDateFilters}
        currentFilters={filters}
      />

      {selectedSell && (
        <SellDetailModal
          sell={selectedSell}
          visible={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedSell(null);
          }}
          onConvertToCart={() => handleConvertToCart(selectedSell)}
          isConverting={convertMutation.isPending}
          onReturnCorrection={() => {
            const sellId = selectedSell.id;
            setShowDetailModal(false);
            setSelectedSell(null);
            // iOS cannot show a second modal until the first has closed
            setTimeout(() => setCorrectionSellId(sellId), Platform.OS === 'ios' ? 400 : 0);
          }}
        />
      )}

      <SellCorrectionSheet
        sellId={correctionSellId ?? undefined}
        visible={!!correctionSellId}
        onClose={() => setCorrectionSellId(null)}
        onCreated={() => refetch()}
      />

      {sellToConvert && (
        <ConvertConfirmationModal
          visible={showConvertConfirm}
          onClose={() => {
            setShowConvertConfirm(false);
            setSellToConvert(null);
          }}
          onConfirm={confirmConvertToCart}
          sell={sellToConvert}
          isConverting={convertMutation.isPending}
        />
      )}
    </YStack>
  );
};

// Small neutral pill used for counts and active-filter chips
const Badge = ({ children }: { children: React.ReactNode }) => (
  <YStack
    backgroundColor={C.accentTint}
    paddingHorizontal={8}
    paddingVertical={2}
    borderRadius={999}
    alignItems="center"
    justifyContent="center"
  >
    <Text fontSize={12} fontWeight="600" color="#C2410C">
      {children}
    </Text>
  </YStack>
);

export default OrderScreen;
