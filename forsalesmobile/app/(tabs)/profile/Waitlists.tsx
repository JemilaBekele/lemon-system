import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Alert,
  RefreshControl,
  Modal,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  XStack,
  YStack,
  Button,
  ScrollView,
  Spinner,
  Image,
} from 'tamagui';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney } from '@/(utils)/format';

// React Query imports for Waitlist
import { 
  useWaitlistItems,
  useRemoveFromWaitlist,
  useConvertWaitlistToCart,
  type WaitlistItem,
  
} from '@/(services)/api/WaitlistCart';

import { useDispatch, useSelector } from 'react-redux';
import { clearCartAction, fetchMyCart, selectCart, selectCartCustomerId } from '@/(redux)/CART';
import { selectCustomers, setCurrentCustomer } from '@/(redux)/customer';
import { lineItemName } from '@/(utils)/itemName';
import AppImage from '@/components/AppImage';
// import { useQueryClient } from '@tanstack/react-query';

// FIXED: Updated helper functions to use the correct quantity
// FIXED: Updated helper functions to use the CART ITEM quantity, not waitlist quantity
const getItemQuantity = (item: WaitlistItem): number => {
  // Always use cartItem quantity, not the waitlist item quantity
  // The waitlist item quantity is always 1, but cartItem has the actual quantity

  if (item.cartItem?.quantity !== undefined && item.cartItem?.quantity !== null) {
    return Number(item.cartItem.quantity);
  }
 
  // Fallback if cartItem is not available
  return item.quantity || 1;
};

const getItemUnitPrice = (item: WaitlistItem): number => {
  return item.cartItem?.unitPrice || 0;
};

const getItemTotalPrice = (item: WaitlistItem): number => {
  const quantity = getItemQuantity(item);
  const unitPrice = getItemUnitPrice(item);
  return quantity * unitPrice;
};


// Group waitlist items by customer - CLIENT-SIDE GROUPING with safety checks
const groupWaitlistByCustomer = (items: WaitlistItem[] | undefined): Record<string, WaitlistItem[]> => {
  if (!items || !Array.isArray(items)) {
    return {};
  }
  
  const grouped: Record<string, WaitlistItem[]> = {};
  
  items.forEach((item, index) => {
    try {
      const customerId = item?.customerId || 'unknown';
      
      if (!grouped[customerId]) {
        grouped[customerId] = [];
      }
      grouped[customerId].push(item);
    } catch (error) {
      console.error(`❌ Error processing waitlist item at index ${index}:`, error, item);
    }
  });
  
  return grouped;
};

// Calculate customer totals
const calculateCustomerTotals = (items: WaitlistItem[]) => {
  if (!items || !Array.isArray(items)) {
    return { totalItems: 0, totalQuantity: 0, totalValue: 0 };
  }
  
  const totalItems = items.length;
  const totalQuantity = items.reduce((sum, item) => sum + getItemQuantity(item), 0);
  const totalValue = items.reduce((sum, item) => sum + getItemTotalPrice(item), 0);
  
  return { totalItems, totalQuantity, totalValue };
};

// Shared presentation helpers
const CARD = {
  backgroundColor: 'white',
  borderWidth: 1,
  borderColor: '#E5E7EB',
  borderRadius: 16,
} as const;

const SOFT_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
} as const;

const SecondaryButton = ({
  label,
  icon,
  onPress,
  disabled,
  tone = 'default',
  flex,
}: {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger' | 'accent';
  flex?: number;
}) => {
  const color = tone === 'danger' ? '#DC2626' : tone === 'accent' ? '#FF6B00' : '#111827';
  const border = tone === 'danger' ? '#FECACA' : tone === 'accent' ? '#FF6B00' : '#E5E7EB';
  return (
    <Button
      size="$3"
      flex={flex}
      backgroundColor="white"
      borderWidth={1}
      borderColor={border}
      borderRadius={10}
      pressStyle={{ backgroundColor: '#F9FAFB', borderColor: border }}
      onPress={onPress}
      disabled={disabled}
      opacity={disabled ? 0.5 : 1}
      icon={icon ? <Ionicons name={icon} size={16} color={color} /> : undefined}
    >
      <Text color={color} fontWeight="600" fontSize={13}>
        {label}
      </Text>
    </Button>
  );
};

const PrimaryButton = ({
  label,
  icon,
  onPress,
  disabled,
  loading,
  flex,
}: {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  flex?: number;
}) => (
  <Button
    size="$3"
    flex={flex}
    backgroundColor="$orange9"
    borderWidth={0}
    borderRadius={10}
    pressStyle={{ backgroundColor: '#E65F00' }}
    onPress={onPress}
    disabled={disabled}
    opacity={disabled && !loading ? 0.5 : 1}
    icon={!loading && icon ? <Ionicons name={icon} size={16} color="white" /> : undefined}
  >
    {loading ? (
      <Spinner size="small" color="white" />
    ) : (
      <Text color="white" fontWeight="700" fontSize={13}>
        {label}
      </Text>
    )}
  </Button>
);

const DetailRow = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <XStack justifyContent="space-between" alignItems="flex-start" gap={12} paddingVertical={6}>
    <Text fontSize={14} color="#6B7280">{label}</Text>
    <Text
      flex={1}
      textAlign="right"
      fontSize={14}
      fontWeight={accent ? '700' : '600'}
      color={accent ? '#FF6B00' : '#111827'}
    >
      {value}
    </Text>
  </XStack>
);

// Customer Section Component
const CustomerWaitlistSection = ({
  customerName,
  customerId,
  items,
  expanded,
  onToggle,
  onViewDetails,
  onConvertToCart,
  onConvertAllToCart,
  onRemoveFromWaitlist,
  onRemoveAllForCustomer,
  conversionLoading,
  convertAllLoading,
  removeAllLoading,
}: {
  customerName: string;
  customerId: string;
  items: WaitlistItem[];
  expanded: boolean;
  onToggle: () => void;
  onViewDetails: (item: WaitlistItem) => void;
  onConvertToCart: (itemId: string) => void;
  onConvertAllToCart: (customerId: string) => void;
  onRemoveFromWaitlist: (itemId: string) => void;
  onRemoveAllForCustomer: (customerId: string) => void;
  conversionLoading: boolean;
  convertAllLoading: boolean;
  removeAllLoading: boolean;
}) => {
  const { totalItems, totalQuantity, totalValue } = calculateCustomerTotals(items);

  // Safety check for empty items
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <YStack {...CARD} {...SOFT_SHADOW} padding={16} gap={12}>
      {/* Customer Header - Clickable to expand/collapse */}
      <TouchableOpacity onPress={onToggle}>
        <XStack justifyContent="space-between" alignItems="center" gap={12}>
          <YStack
            width={40}
            height={40}
            borderRadius={20}
            backgroundColor="#FFF7ED"
            alignItems="center"
            justifyContent="center"
          >
            <Ionicons name="person-outline" size={18} color="#FF6B00" />
          </YStack>
          <YStack flex={1} gap={2}>
            <Text fontSize={16} fontWeight="700" color="#111827" numberOfLines={1}>
              {customerName}
            </Text>
            <Text fontSize={13} color="#6B7280">
              {totalItems} items · {totalQuantity} units
            </Text>
          </YStack>
          <YStack alignItems="flex-end" gap={2}>
            <Text fontSize={15} fontWeight="700" color="#FF6B00">
              {formatMoney(totalValue)}
            </Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" />
          </YStack>
        </XStack>
      </TouchableOpacity>

      {/* Action Buttons - Always visible in header */}
      <XStack gap={8}>
        <SecondaryButton
          flex={1}
          tone="danger"
          icon="trash-outline"
          label={removeAllLoading ? 'Removing...' : 'Remove All'}
          onPress={() => onRemoveAllForCustomer(customerId)}
          disabled={removeAllLoading}
        />
        <PrimaryButton
          flex={1}
          icon="cart-outline"
          label={`Convert All (${totalItems})`}
          onPress={() => onConvertAllToCart(customerId)}
          disabled={convertAllLoading || conversionLoading}
          loading={convertAllLoading}
        />
      </XStack>

      {/* Expanded Content */}
      {expanded && (
        <YStack gap={10} borderTopWidth={1} borderTopColor="#F3F4F6" paddingTop={12}>
          {items.map((item) => {
            // Safety check for each item
            if (!item) return null;

            const quantity = getItemQuantity(item);
            const product = item.cartItem?.product;
            const shop = item.cartItem?.shop;

            return (
              <YStack
                key={item.id || Math.random().toString()}
                backgroundColor="white"
                borderColor="#E5E7EB"
                borderWidth={1}
                borderRadius={12}
                padding={12}
                gap={10}
              >
                {/* Product Info */}
                <XStack gap={12} alignItems="flex-start">
                  {product?.imageUrl ? (
                    <AppImage path={item.cartItem?.subProduct?.imageUrl || product.imageUrl} size={52} radius={10} bordered zoomable title={lineItemName(product, item.cartItem?.subProduct)} />
                  ) : (
                    <YStack
                      width={52}
                      height={52}
                      borderRadius={10}
                      backgroundColor="#F9FAFB"
                      borderWidth={1}
                      borderColor="#E5E7EB"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Ionicons name="cube-outline" size={20} color="#9CA3AF" />
                    </YStack>
                  )}
                  <YStack flex={1} gap={4}>
                    <Text fontSize={14} fontWeight="600" color="#111827" numberOfLines={2}>
                      {lineItemName(product, item.cartItem?.subProduct)}
                    </Text>
                    <XStack gap={12} flexWrap="wrap" alignItems="center">
                      <Text fontSize={13} color="#374151">
                        Qty: {quantity}
                      </Text>
                      {shop ? (
                        <XStack alignItems="center" gap={4}>
                          <Ionicons name="storefront-outline" size={14} color="#6B7280" />
                          <Text fontSize={13} color="#6B7280">{shop.name}</Text>
                        </XStack>
                      ) : null}
                    </XStack>
                    {item.createdAt ? (
                      <XStack alignItems="center" gap={4}>
                        <Ionicons name="calendar-outline" size={13} color="#9CA3AF" />
                        <Text fontSize={12} color="#6B7280">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </Text>
                      </XStack>
                    ) : null}
                  </YStack>
                  <Text fontSize={14} fontWeight="700" color="#111827">
                    {formatMoney(getItemTotalPrice(item))}
                  </Text>
                </XStack>

                {/* Action Buttons */}
                <XStack gap={8}>
                  <SecondaryButton
                    flex={1}
                    icon="eye-outline"
                    label="Details"
                    onPress={() => onViewDetails(item)}
                  />
                  <Button
                    size="$3"
                    backgroundColor="white"
                    borderWidth={1}
                    borderColor="#FECACA"
                    borderRadius={10}
                    pressStyle={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA' }}
                    onPress={() => onRemoveFromWaitlist(item.id)}
                    icon={<Ionicons name="trash-outline" size={16} color="#DC2626" />}
                    aria-label="Remove item"
                  />
                </XStack>
              </YStack>
            );
          })}
        </YStack>
      )}
    </YStack>
  );
};

const WaitlistItemDetailModal = ({
  item,
  visible,
  onClose,
  onRemoveFromWaitlist,
  onConvertToCart,
  removingFromWaitlist,
  convertingToCart,
}: {
  item: WaitlistItem;
  visible: boolean;
  onClose: () => void;
  onRemoveFromWaitlist: (itemId: string) => void;
  onConvertToCart: (itemId: string) => void;
  removingFromWaitlist: boolean;
  convertingToCart: boolean;
}) => {
  // Safe price formatting
  const formatPrice = (price: any): string => {
    if (price === null || price === undefined) return 'N/A';
    const numPrice = Number(price);
    return isNaN(numPrice) ? 'N/A' : formatMoney(numPrice);
  };

  const quantity = getItemQuantity(item);
  const unitPrice = getItemUnitPrice(item);
  const totalPrice = getItemTotalPrice(item);

  // Get product from cartItem
  const product = item.cartItem?.product;
  const shop = item.cartItem?.shop;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <YStack
        flex={1}
        justifyContent="center"
        alignItems="center"
        backgroundColor="rgba(0,0,0,0.5)"
        padding={16}
      >
        <YStack
          backgroundColor="white"
          borderRadius={16}
          padding={20}
          width="100%"
          maxWidth={500}
          maxHeight="80%"
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <YStack gap={16}>
              <XStack justifyContent="space-between" alignItems="center">
                <Text fontSize={18} fontWeight="700" color="#111827">
                  Waitlist Item Details
                </Text>
                <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color="#6B7280" />
                </TouchableOpacity>
              </XStack>

              {/* Product Details */}
              {product ? (
                <XStack gap={12} alignItems="flex-start">
                  {product.imageUrl ? (
                    <AppImage path={item.cartItem?.subProduct?.imageUrl || product.imageUrl} size={64} radius={12} bordered zoomable title={lineItemName(product, item.cartItem?.subProduct)} />
                  ) : null}
                  <YStack flex={1} gap={4}>
                    <Text fontSize={15} fontWeight="700" color="#111827">
                      {lineItemName(product, item.cartItem?.subProduct)}
                    </Text>
                    {product.unitOfMeasure ? (
                      <Text fontSize={13} color="#6B7280">
                        Unit: {product.unitOfMeasure.name}
                      </Text>
                    ) : null}
                    {/* Safe price display */}
                    <Text fontSize={14} fontWeight="700" color="#111827">
                      {formatPrice(product.sellPrice)}
                    </Text>
                  </YStack>
                </XStack>
              ) : null}

              {/* Item Header Info */}
              <YStack {...CARD} borderRadius={12} paddingHorizontal={12} paddingVertical={6}>
                {item.customer ? (
                  <DetailRow label="Customer" value={item.customer?.name || 'N/A'} />
                ) : null}
                <DetailRow label="Quantity" value={String(quantity)} />
                {shop ? <DetailRow label="Shop" value={shop.name ?? "N/A"} /> : null}
                <DetailRow
                  label="Created"
                  value={item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}
                />
              </YStack>

              {/* Price Details */}
              <YStack gap={8}>
                <Text fontSize={15} fontWeight="700" color="#111827">
                  Price Details
                </Text>
                <YStack {...CARD} borderRadius={12} paddingHorizontal={12} paddingVertical={6}>
                  <DetailRow label="Unit Price" value={formatPrice(unitPrice)} />
                  <YStack height={1} backgroundColor="#F3F4F6" />
                  <DetailRow label="Total Price" value={formatPrice(totalPrice)} accent />
                  {item.cartItem?.notes ? (
                    <DetailRow label="Notes" value={item.cartItem.notes} />
                  ) : null}
                </YStack>
              </YStack>

              {/* Action Buttons */}
              <XStack gap={12}>
                <SecondaryButton flex={1} label="Close" onPress={onClose} />
                <Button
                  size="$3"
                  flex={1}
                  backgroundColor="white"
                  borderWidth={1}
                  borderColor="#DC2626"
                  borderRadius={10}
                  pressStyle={{ backgroundColor: '#FEF2F2', borderColor: '#DC2626' }}
                  onPress={() => onRemoveFromWaitlist(item.id)}
                  disabled={removingFromWaitlist}
                  icon={removingFromWaitlist ? undefined : <Ionicons name="trash-outline" size={16} color="#DC2626" />}
                >
                  {removingFromWaitlist ? (
                    <Spinner size="small" color="#DC2626" />
                  ) : (
                    <Text color="#DC2626" fontWeight="600" fontSize={13}>Remove</Text>
                  )}
                </Button>
              </XStack>
            </YStack>
          </ScrollView>
        </YStack>
      </YStack>
    </Modal>
  );
};

const ConfirmShell = ({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) => (
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
      backgroundColor="rgba(0,0,0,0.5)"
      padding={16}
    >
      <YStack
        backgroundColor="white"
        borderRadius={16}
        padding={20}
        width="100%"
        maxWidth={400}
      >
        <YStack gap={12} alignItems="center">
          <YStack
            width={48}
            height={48}
            borderRadius={24}
            backgroundColor="#FEF2F2"
            alignItems="center"
            justifyContent="center"
          >
            <Ionicons name="warning-outline" size={22} color="#DC2626" />
          </YStack>
          {children}
        </YStack>
      </YStack>
    </YStack>
  </Modal>
);

const ConfirmButtons = ({
  onClose,
  onConfirm,
  loading,
  confirmLabel,
}: {
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  confirmLabel: string;
}) => (
  <XStack gap={12} width="100%" marginTop={4}>
    <Button
      flex={1}
      backgroundColor="white"
      borderWidth={1}
      borderColor="#E5E7EB"
      borderRadius={12}
      pressStyle={{ backgroundColor: '#F9FAFB' }}
      onPress={onClose}
      disabled={loading}
    >
      <Text color="#111827" fontWeight="600">Cancel</Text>
    </Button>
    <Button
      flex={1}
      backgroundColor="#DC2626"
      borderWidth={0}
      borderRadius={12}
      onPress={onConfirm}
      disabled={loading}
      pressStyle={{ backgroundColor: '#B91C1C' }}
    >
      {loading ? (
        <Spinner size="small" color="white" />
      ) : (
        <Text color="white" fontWeight="700" numberOfLines={1}>{confirmLabel}</Text>
      )}
    </Button>
  </XStack>
);

// Remove Confirmation Modal
const RemoveConfirmationModal = ({
  item,
  visible,
  onClose,
  onConfirm,
  loading,
}: {
  item: WaitlistItem;
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) => {
  const product = item.cartItem?.product;
  const quantity = getItemQuantity(item);

  return (
    <ConfirmShell visible={visible} onClose={onClose}>
      <Text fontSize={18} fontWeight="700" textAlign="center" color="#111827">
        Remove from Waitlist?
      </Text>

      <Text textAlign="center" fontSize={14} color="#6B7280">
        Are you sure you want to remove this item from waitlist?
      </Text>

      <YStack
        backgroundColor="#F9FAFB"
        borderWidth={1}
        borderColor="#F3F4F6"
        padding={12}
        borderRadius={12}
        width="100%"
        gap={4}
        alignItems="center"
      >
        <Text fontWeight="700" color="#111827" textAlign="center">
          {lineItemName(product, item.cartItem?.subProduct)}
        </Text>
        <Text fontSize={13} color="#374151">Quantity: {quantity}</Text>
        {item.customer ? (
          <Text fontSize={13} color="#374151">Customer: {item.customer.name}</Text>
        ) : null}
      </YStack>

      <Text fontSize={12} color="#6B7280" textAlign="center">
        This action cannot be undone.
      </Text>

      <ConfirmButtons onClose={onClose} onConfirm={onConfirm} loading={loading} confirmLabel="Remove" />
    </ConfirmShell>
  );
};

// Remove All Confirmation Modal
const RemoveAllConfirmationModal = ({
  visible,
  onClose,
  onConfirm,
  loading,
  itemCount,
  customerName,
  type,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  itemCount: number;
  customerName?: string;
  type: 'all' | 'customer';
}) => {
  const title = type === 'all'
    ? 'Remove All Waitlist Items?'
    : `Remove All Items for ${customerName}?`;

  const description = type === 'all'
    ? 'Are you sure you want to remove ALL items from your waitlist?'
    : `Are you sure you want to remove ALL items from ${customerName}'s waitlist?`;

  return (
    <ConfirmShell visible={visible} onClose={onClose}>
      <Text fontSize={18} fontWeight="700" textAlign="center" color="#111827">
        {title}
      </Text>

      <Text textAlign="center" fontSize={14} color="#6B7280">
        {description}
      </Text>

      <YStack
        backgroundColor="#F9FAFB"
        borderWidth={1}
        borderColor="#F3F4F6"
        padding={12}
        borderRadius={12}
        width="100%"
        gap={4}
        alignItems="center"
      >
        <Text fontWeight="700" color="#111827" textAlign="center">
          Total Items: {itemCount}
        </Text>
        <Text fontSize={13} color="#6B7280" textAlign="center">
          This action will permanently remove all selected waitlist items
        </Text>
      </YStack>

      <Text fontSize={12} color="#DC2626" textAlign="center" fontWeight="600">
        This action cannot be undone!
      </Text>

      <ConfirmButtons
        onClose={onClose}
        onConfirm={onConfirm}
        loading={loading}
        confirmLabel={type === 'all' ? 'Remove All' : `Remove All for ${customerName}`}
      />
    </ConfirmShell>
  );
};

const WaitlistScreen = () => {
  const router = useRouter();
  const dispatch = useDispatch();
  // const queryClient = useQueryClient();

  // React Query hooks
  const { 
    data: waitlistData, 
    isLoading: waitlistLoading, 
    error: waitlistError,
    refetch: refetchWaitlists
  } = useWaitlistItems();
  
  const removeMutation = useRemoveFromWaitlist();
  const convertMutation = useConvertWaitlistToCart();

  // Redux state
  const cart = useSelector(selectCart);
  const cartCustomerId = useSelector(selectCartCustomerId);
  const customers = useSelector(selectCustomers);

  // Local state
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WaitlistItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showRemoveAllModal, setShowRemoveAllModal] = useState(false);
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});
  const [convertAllLoading, setConvertAllLoading] = useState<Record<string, boolean>>({});
  const [removeAllLoading, setRemoveAllLoading] = useState<Record<string, boolean>>({});
  const [removeAllType, setRemoveAllType] = useState<'all' | 'customer' | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Safely group items by customer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const waitlistItemsArray = Array.isArray(waitlistData) ? waitlistData : [];
  const groupedByCustomer = groupWaitlistByCustomer(waitlistItemsArray);
  
  // Calculate totals with safety checks
  const totalQuantity = waitlistItemsArray.reduce((sum, item) => sum + getItemQuantity(item), 0);
  const totalValue = waitlistItemsArray.reduce((sum, item) => sum + getItemTotalPrice(item), 0);
  const itemCount = waitlistItemsArray.length;
  const handleback= () => {
    router.push({
      pathname: '/profile' as any,
    });
  };
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetchWaitlists();
    } catch  {
      Alert.alert('Error', 'Failed to refresh waitlist');
    } finally {
      setRefreshing(false);
    }
  };

  const handleViewDetails = (item: WaitlistItem) => {
    setSelectedItem(item);
    setShowDetailModal(true);
  };

  const handleRemoveFromWaitlist = (itemId: string) => {
    const item = waitlistItemsArray.find(i => i?.id === itemId);
    if (item) {
      setSelectedItem(item);
      setShowRemoveModal(true);
    }
  };

  const confirmRemoveFromWaitlist = async () => {
    if (!selectedItem) return;

    try {
      await removeMutation.mutateAsync(selectedItem.id);
      
      setShowRemoveModal(false);
      setShowDetailModal(false);
      setSelectedItem(null);
      Alert.alert('Success', 'Item removed from waitlist');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to remove item from waitlist');
    }
  };

  // Handle removing all items for a specific customer
  const handleRemoveAllForCustomer = (customerId: string) => {
    const customerItems = groupedByCustomer[customerId] || [];
    if (customerItems.length === 0) {
      Alert.alert('Info', 'No items found for this customer');
      return;
    }
    
    setSelectedCustomerId(customerId);
    setRemoveAllType('customer');
    setShowRemoveAllModal(true);
  };

  // Handle removing all items from entire waitlist
  const handleRemoveAllItems = () => {
    if (waitlistItemsArray.length === 0) {
      Alert.alert('Info', 'Your waitlist is already empty');
      return;
    }
    
    setSelectedCustomerId(null);
    setRemoveAllType('all');
    setShowRemoveAllModal(true);
  };

  const confirmRemoveAll = async () => {
    try {
      if (removeAllType === 'all') {
        // Remove all items from waitlist
        setRemoveAllLoading(prev => ({ ...prev, 'all': true }));
        
        // Remove each item individually
        const itemIds = waitlistItemsArray.map(item => item.id).filter(Boolean);
        
        await Promise.all(
          itemIds.map(itemId => removeMutation.mutateAsync(itemId))
        );
        
        Alert.alert('Success', `All ${itemCount} items removed from waitlist`);
      } else if (removeAllType === 'customer' && selectedCustomerId) {
        // Remove all items for specific customer
        setRemoveAllLoading(prev => ({ ...prev, [selectedCustomerId]: true }));
        
        const customerItems = groupedByCustomer[selectedCustomerId] || [];
        const itemIds = customerItems.map(item => item.id).filter(Boolean);
        const customerName = customerItems[0]?.customer?.name || 'Customer';
        
        await Promise.all(
          itemIds.map(itemId => removeMutation.mutateAsync(itemId))
        );
        
        Alert.alert('Success', `All items for ${customerName} removed from waitlist`);
      }
      
      setShowRemoveAllModal(false);
      setRemoveAllType(null);
      setSelectedCustomerId(null);
      
    } catch  {
      Alert.alert('Error', 'Failed to remove items');
    } finally {
      // Clear all loading states
      setRemoveAllLoading({});
    }
  };

  // A waitlist only moves into an empty cart. Load the latest cart first (the
  // copy in memory can be stale) and stop if anything is in it.
  const ensureCartIsEmpty = async (): Promise<boolean> => {
    let latestCart: any = cart;
    try {
      const result: any = await (dispatch(fetchMyCart() as any) as any).unwrap();
      latestCart = result?.cart ?? null;
    } catch {
      // Could not refresh; fall back to the cart we already have
    }

    const count = latestCart?.items?.length || 0;
    if (count === 0) return true;

    const cartCustomer =
      latestCart?.customer?.name ||
      customers.find(c => c.id === (latestCart?.customerId || cartCustomerId))?.name;
    Alert.alert(
      'Cart is not empty',
      `Your cart already has ${count} item${count === 1 ? '' : 's'}` +
        (cartCustomer ? ` for ${cartCustomer}` : '') +
        '.\n\nCheck out or clear the cart before converting a waitlist.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Go to Cart', onPress: () => router.push('/Cart') },
      ]
    );
    return false;
  };

  const handleConvertToCart = async (itemId: string) => {
    try {
      // Get the waitlist item
      const waitlistItem = waitlistItemsArray.find(item => item.id === itemId);
      if (!waitlistItem) {
        Alert.alert('Error', 'Waitlist item not found');
        return;
      }

      // Get waitlist customer ID
      const waitlistCustomerId = waitlistItem.customerId;
      if (!waitlistCustomerId) {
        Alert.alert('Error', 'Waitlist item has no customer assigned');
        return;
      }

      if (!(await ensureCartIsEmpty())) return;

      await proceedWithConversion(itemId, waitlistCustomerId);
      
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add item to cart');
    }
  };

  // Helper function to handle conversion
  const proceedWithConversion = async (itemId: string, customerId: string) => {
    try {
      const result = await convertMutation.mutateAsync(customerId);

      // Refresh the cart so it shows the items and the customer
      dispatch(fetchMyCart() as any);

      Alert.alert('Success', result.message || 'Item added to cart successfully');
      setShowDetailModal(false);
      setSelectedItem(null);
      
      // Refresh waitlist data
      refetchWaitlists();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add item to cart');
    }
  };

  // Handle converting ALL waitlist items for a customer
  const handleConvertAllToCart = async (customerId: string) => {
    try {
      const customerItems = groupedByCustomer[customerId] || [];
      if (customerItems.length === 0) {
        Alert.alert('Info', 'No items found for this customer');
        return;
      }

      if (!(await ensureCartIsEmpty())) return;

      await proceedWithBulkConversion(customerId, customerItems);
      
    } catch (error: any) {
      Alert.alert(
        'Error', 
        error.message || 'Failed to convert items to cart. Please try again.'
      );
    }
  };

  // Helper function for bulk conversion
  const proceedWithBulkConversion = async (customerId: string, customerItems: WaitlistItem[]) => {
    setConvertAllLoading(prev => ({ ...prev, [customerId]: true }));

    try {
      const waitlistCustomer = customerItems[0]?.customer;
      
      if (waitlistCustomer) {
        setSelectedCustomerId(customerId);
        
        const fullCustomer = customers.find(c => c.id === customerId);
        if (fullCustomer) {
          dispatch(setCurrentCustomer(fullCustomer));
        }
      }
      
      // Perform conversion
      await convertMutation.mutateAsync(customerId);

      // Refresh the cart so it shows the items and the customer
      dispatch(fetchMyCart() as any);

      Alert.alert('Success', `All items converted to cart successfully`);
      
      // Refresh waitlist data
      await refetchWaitlists();
      
    } catch (error: any) {
      Alert.alert(
        'Could not move to cart',
        error?.response?.data?.message ||
          error?.message ||
          'Your cart has existing items. Clear it before converting this waitlist.'
      );
    } finally {
      setConvertAllLoading(prev => ({ ...prev, [customerId]: false }));
    }
  };

  const toggleCustomerExpansion = (customerId: string) => {
    setExpandedCustomers(prev => ({
      ...prev,
      [customerId]: !prev[customerId]
    }));
  };

  // Expand all customers by default on first load
  React.useEffect(() => {
    if (waitlistItemsArray.length > 0 && Object.keys(expandedCustomers).length === 0) {
      const initialExpanded: Record<string, boolean> = {};
      Object.keys(groupedByCustomer).forEach(customerId => {
        initialExpanded[customerId] = true;
      });
      setExpandedCustomers(initialExpanded);
    }
  }, [waitlistItemsArray, expandedCustomers, groupedByCustomer]);

  // Handle errors
  React.useEffect(() => {
    if (waitlistError) {
      Alert.alert('Error', waitlistError.message || 'Failed to load waitlist');
    }
  }, [waitlistError]);

  if (waitlistLoading && !refreshing && waitlistItemsArray.length === 0) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="white">
        <Spinner size="large" color="$orange9" />
        <Text marginTop={16} color="#6B7280" fontSize={15} fontWeight="600">
          Loading waitlist...
        </Text>
      </YStack>
    );
  }

  // Check if we have valid data to display
  const hasValidData = waitlistItemsArray.length > 0;

  // Get customer name for modal if removing for a specific customer
  const getCustomerNameForModal = () => {
    if (removeAllType === 'customer' && selectedCustomerId) {
      const customerItems = groupedByCustomer[selectedCustomerId] || [];
      if (customerItems.length > 0) {
        return customerItems[0]?.customer?.name || 'Customer';
      }
    }
    return '';
  };

  // Get item count for modal
  const getItemCountForModal = () => {
    if (removeAllType === 'all') {
      return itemCount;
    } else if (removeAllType === 'customer' && selectedCustomerId) {
      const customerItems = groupedByCustomer[selectedCustomerId] || [];
      return customerItems.length;
    }
    return 0;
  };

  const allExpanded = Object.values(expandedCustomers).every(v => v);

  return (
    <YStack flex={1} backgroundColor="white">
      {/* Screen Header */}
      <XStack
        alignItems="center"
        gap={12}
        paddingHorizontal={16}
        paddingVertical={12}
        backgroundColor="white"
        borderBottomWidth={1}
        borderBottomColor="#F3F4F6"
      >
        <TouchableOpacity onPress={handleback} accessibilityLabel="Back">
          <YStack
            width={36}
            height={36}
            borderRadius={10}
            borderWidth={1}
            borderColor="#E5E7EB"
            alignItems="center"
            justifyContent="center"
          >
            <Ionicons name="arrow-back" size={18} color="#111827" />
          </YStack>
        </TouchableOpacity>
        <YStack flex={1}>
          <Text fontSize={22} fontWeight="700" color="#111827">
            My Waitlist
          </Text>
          <Text fontSize={13} color="#6B7280">
            Items saved for later, grouped by customer
          </Text>
        </YStack>
      </XStack>

      <ScrollView
        flex={1}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#FF6B00']} tintColor="#FF6B00" />
        }
      >
        <YStack gap={12} padding={16}>
          {!hasValidData ? (
            <YStack {...CARD} alignItems="center" gap={10} paddingVertical={32} paddingHorizontal={16}>
              <YStack
                width={56}
                height={56}
                borderRadius={28}
                backgroundColor="#FFF7ED"
                alignItems="center"
                justifyContent="center"
              >
                <Ionicons name="time-outline" size={26} color="#FF6B00" />
              </YStack>
              <Text fontSize={17} fontWeight="700" color="#111827" textAlign="center">
                Your waitlist is empty
              </Text>
              <Text fontSize={14} color="#6B7280" textAlign="center">
                Add items from your cart to see them here
              </Text>
              <YStack marginTop={8}>
                <PrimaryButton
                  icon="cart-outline"
                  label="Go to Cart"
                  onPress={() => router.push('/Cart')}
                />
              </YStack>
            </YStack>
          ) : (
            <YStack {...CARD} {...SOFT_SHADOW} padding={16} gap={14}>
              {/* Summary Stats */}
              <XStack gap={8}>
                <YStack flex={1} gap={2}>
                  <Text fontSize={12} color="#6B7280">Customers</Text>
                  <Text fontSize={18} fontWeight="700" color="#111827">
                    {Object.keys(groupedByCustomer).length}
                  </Text>
                </YStack>
                <YStack flex={1} gap={2}>
                  <Text fontSize={12} color="#6B7280">Items</Text>
                  <Text fontSize={18} fontWeight="700" color="#111827">
                    {itemCount}
                  </Text>
                </YStack>
                <YStack flex={1} gap={2}>
                  <Text fontSize={12} color="#6B7280">Quantity</Text>
                  <Text fontSize={18} fontWeight="700" color="#111827">
                    {totalQuantity}
                  </Text>
                </YStack>
              </XStack>
              <XStack
                justifyContent="space-between"
                alignItems="center"
                borderTopWidth={1}
                borderTopColor="#F3F4F6"
                paddingTop={12}
              >
                <Text fontSize={14} fontWeight="600" color="#374151">
                  Total Value
                </Text>
                <Text fontSize={20} fontWeight="800" color="#FF6B00">
                  {formatMoney(totalValue)}
                </Text>
              </XStack>

              {/* Quick Actions */}
              <XStack gap={8} flexWrap="wrap">
                <SecondaryButton
                  icon={allExpanded ? 'contract-outline' : 'expand-outline'}
                  label={allExpanded ? 'Collapse All' : 'Expand All'}
                  onPress={() => {
                    const newExpanded: Record<string, boolean> = {};
                    Object.keys(groupedByCustomer).forEach(customerId => {
                      newExpanded[customerId] = !allExpanded;
                    });
                    setExpandedCustomers(newExpanded);
                  }}
                />
                <SecondaryButton
                  tone="accent"
                  icon="cart-outline"
                  label="View Cart"
                  onPress={() => router.push('/Cart')}
                />
                <SecondaryButton
                  tone="danger"
                  icon="trash-outline"
                  label="Remove All Items"
                  onPress={handleRemoveAllItems}
                />
              </XStack>
            </YStack>
          )}

          {/* Customer Grouped Waitlist Items */}
          {hasValidData && Object.entries(groupedByCustomer).map(([customerId, customerItems]) => {
            if (!customerItems || customerItems.length === 0) return null;

            const customer = customerItems[0]?.customer;
            const customerName = (customer?.name || 'Unknown Customer').trim();
            return (
              <CustomerWaitlistSection
                key={customerId}
                customerName={customerName}
                customerId={customerId}
                items={customerItems}
                expanded={!!expandedCustomers[customerId]}
                onToggle={() => toggleCustomerExpansion(customerId)}
                onViewDetails={handleViewDetails}
                onConvertToCart={handleConvertToCart}
                onConvertAllToCart={handleConvertAllToCart}
                onRemoveFromWaitlist={handleRemoveFromWaitlist}
                onRemoveAllForCustomer={handleRemoveAllForCustomer}
                conversionLoading={convertMutation.isPending}
                convertAllLoading={convertAllLoading[customerId] || false}
                removeAllLoading={removeAllLoading[customerId] || false}
              />
            );
          })}
        </YStack>
      </ScrollView>

      {/* Detail Modal */}
      {selectedItem && (
        <WaitlistItemDetailModal
          item={selectedItem}
          visible={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedItem(null);
          }}
          onRemoveFromWaitlist={handleRemoveFromWaitlist}
          onConvertToCart={handleConvertToCart}
          removingFromWaitlist={removeMutation.isPending && removeMutation.variables === selectedItem.id}
          convertingToCart={convertMutation.isPending}
        />
      )}
      
      {/* Remove Confirmation Modal */}
      {selectedItem && (
        <RemoveConfirmationModal
          item={selectedItem}
          visible={showRemoveModal}
          onClose={() => {
            setShowRemoveModal(false);
            setSelectedItem(null);
          }}
          onConfirm={confirmRemoveFromWaitlist}
          loading={removeMutation.isPending}
        />
      )}
      
      {/* Remove All Confirmation Modal */}
      {removeAllType && (
        <RemoveAllConfirmationModal
          visible={showRemoveAllModal}
          onClose={() => {
            setShowRemoveAllModal(false);
            setRemoveAllType(null);
            setSelectedCustomerId(null);
          }}
          onConfirm={confirmRemoveAll}
          loading={removeAllType === 'all' 
            ? removeAllLoading['all'] || false 
            : selectedCustomerId 
              ? removeAllLoading[selectedCustomerId] || false 
              : false
          }
          itemCount={getItemCountForModal()}
          customerName={getCustomerNameForModal()}
          type={removeAllType}
        />
      )}
    </YStack>
  );
};

export default WaitlistScreen;