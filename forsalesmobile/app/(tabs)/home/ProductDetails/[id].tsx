import React, { useState } from 'react'; 
import { useDispatch } from 'react-redux';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  XStack,
  YStack,
  Button,
  ScrollView,
  Spinner,
  Separator,
  Image,
  Input,
} from 'tamagui';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney } from '@/(utils)/format';
import type { AppDispatch } from '@/(redux)/store';
import { useQuery } from '@tanstack/react-query';

// Redux imports for cart
import {
  addItemToUserCart,
  fetchMyCart,
} from '@/(redux)/CART';

// Import the API service
import { 
  getProductBatchesByShopsForUser,
  ShopBatchInfo,
  AdditionalPrice,
  ProductBatchesForUserResponse,
  SubProductOption,
} from '@/(services)/api/productBatchesService';
import AppImage from '@/components/AppImage';

// Types
interface PriceOption {
  id: string;
  label: string;
  price: number;
  type?: 'default' | 'additional' | 'custom';
}

interface SelectedShopInfo {
  shopId: string;
  shopName: string;
  branchName?: string;
  quantity: number;
  basePrice: number | null;
  totalPrice: number | null;
  additionalPrices: AdditionalPrice[];
}

// Helper function to safely get number value
const safeNumber = (value: any): number => {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
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

// Listed prices for a shop: its additional prices only. Selling at one of
// these is auto-approved by the backend; the standard sell price is not
// offered (same as the web POS), and a custom price needs approval.
const getPriceOptions = (shop: SelectedShopInfo): PriceOption[] =>
  (shop.additionalPrices || [])
    .map((ap: AdditionalPrice) => ({
      id: ap.id,
      label: ap.label || "Additional Price",
      price: safeNumber(ap.price),
      type: "additional" as const,
    }))
    .filter((p) => p.price > 0);

// Price Selection Modal
const PriceSelectionModal = ({ 
  selectedShop, 
  selectedPriceOption: initialPriceOption,
  visible, 
  onClose, 
  onAddToCart 
}: {
  selectedShop: SelectedShopInfo | null;
  selectedPriceOption: PriceOption | null;
  visible: boolean;
  onClose: () => void;
  onAddToCart: (cartData: {
    shop: SelectedShopInfo;
    priceOption: PriceOption;
    quantity: number;
    notes: string;
  }) => void;
}) => {
  const [selectedPriceOption, setSelectedPriceOption] = useState<PriceOption | null>(initialPriceOption);
  const [customPrice, setCustomPrice] = useState(initialPriceOption?.price?.toString() || '');
  const [quantityInput, setQuantityInput] = useState<string>(''); // Changed to string for empty state
  const [notes, ] = useState('');

  // Set initial selected price option if provided
  React.useEffect(() => {
    if (initialPriceOption) {
      setSelectedPriceOption(initialPriceOption);
      setCustomPrice(initialPriceOption.price.toString());
    }
  }, [initialPriceOption]);

  if (!selectedShop) return null;

  // Safely create price options with fallbacks - ensure all prices are numbers
  const priceOptions: PriceOption[] = getPriceOptions(selectedShop);

  const handleSelectPrice = (priceOption: PriceOption) => {
    setSelectedPriceOption(priceOption);
    setCustomPrice(priceOption.price.toString());
  };

  const handleCustomPriceChange = (price: string) => {
    setCustomPrice(price);
    const numericPrice = parseFloat(price) || 0;
    if (numericPrice > 0) {
      setSelectedPriceOption({
        id: 'custom',
        label: 'Custom Price',
        price: numericPrice,
        type: 'custom'
      });
    }
  };

  const handleQuantityInputChange = (text: string) => {
    // Allow empty string or numbers
    if (text === '' || /^\d*$/.test(text)) {
      setQuantityInput(text);
    }
  };

  const handleQuantityIncrement = () => {
    const currentValue = parseInt(quantityInput) || 0;
    const newValue = Math.min(selectedShop.quantity, currentValue + 1);
    setQuantityInput(newValue.toString());
  };

  const handleQuantityDecrement = () => {
    const currentValue = parseInt(quantityInput) || 0;
    if (currentValue > 1) {
      setQuantityInput((currentValue - 1).toString());
    } else {
      // If it's 1, clear to empty string
      setQuantityInput('');
    }
  };

  const handleAddToCart = () => {
    const finalPrice = parseFloat(customPrice) || (selectedPriceOption?.price || 0);
    
    if (finalPrice <= 0) {
      Alert.alert('Error', 'Please enter a valid unit price');
      return;
    }

    // Parse quantity with validation
    const quantity = parseInt(quantityInput);
    if (isNaN(quantity) || quantity <= 0) {
      Alert.alert('Error', 'Please enter a valid quantity (minimum 1)');
      return;
    }

    if (quantity > selectedShop.quantity) {
      Alert.alert('Error', `Only ${selectedShop.quantity} units available`);
      return;
    }

    const finalPriceOption: PriceOption = selectedPriceOption || {
      id: 'custom',
      label: 'Custom Price',
      price: finalPrice,
      type: 'custom'
    };

    onAddToCart({
      shop: selectedShop,
      priceOption: {
        ...finalPriceOption,
        price: finalPrice
      },
      quantity: quantity,
      notes: notes
    });
  };

  const finalPrice = parseFloat(customPrice) || (selectedPriceOption?.price || 0);
  const parsedQuantity = parseInt(quantityInput) || 0;
  const showOrderSummary = finalPrice > 0 && parsedQuantity > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Use KeyboardAvoidingView to lift content when keyboard appears */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
              <Text fontSize={20} fontWeight="700" color={C.text}>Add to Cart</Text>
              <Text fontSize={13} color={C.muted} numberOfLines={1}>{selectedShop.shopName}</Text>
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

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <YStack gap={16} padding={16} paddingBottom={32}>
              {/* Shop Info */}
              <YStack gap={8} borderWidth={1} borderColor={C.border} borderRadius={12} padding={14}>
                <XStack justifyContent="space-between" alignItems="center">
                  <XStack alignItems="center" gap={6}>
                    <Ionicons name="storefront-outline" size={16} color={C.muted} />
                    <Text color={C.label}>Shop</Text>
                  </XStack>
                  <Text fontWeight="600" color={C.text}>{selectedShop.shopName}</Text>
                </XStack>
                {selectedShop.branchName ? (
                  <XStack justifyContent="space-between" alignItems="center">
                    <Text color={C.label}>Branch</Text>
                    <Text color={C.text}>{selectedShop.branchName}</Text>
                  </XStack>
                ) : null}
                <XStack justifyContent="space-between" alignItems="center">
                  <Text color={C.label}>Available</Text>
                  <Text color={C.text} fontWeight="700">{selectedShop.quantity} units</Text>
                </XStack>
              </YStack>

              {/* Price Options */}
              <YStack gap={8}>
                <Text fontWeight="600" color={C.label} fontSize={14}>Select price option</Text>
                {priceOptions.map((option) => {
                  const selected = selectedPriceOption?.id === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      onPress={() => handleSelectPrice(option)}
                      activeOpacity={0.8}
                    >
                      <XStack
                        backgroundColor={selected ? C.accentTint : 'white'}
                        borderColor={selected ? C.accent : C.border}
                        borderWidth={1}
                        borderRadius={12}
                        padding={14}
                        justifyContent="space-between"
                        alignItems="center"
                        gap={12}
                      >
                        <XStack flex={1} alignItems="center" gap={10}>
                          <Ionicons
                            name={selected ? 'radio-button-on' : 'radio-button-off'}
                            size={20}
                            color={selected ? C.accent : C.placeholder}
                          />
                          <YStack flex={1}>
                            <Text fontWeight="600" color={C.text}>
                              {option.label}
                            </Text>
                            <Text color={C.muted} fontSize={12}>
                              Additional price
                            </Text>
                          </YStack>
                        </XStack>
                        <Text fontWeight="700" color={selected ? C.accent : C.text} fontSize={16}>
                          {formatMoney(option.price)}
                        </Text>
                      </XStack>
                    </TouchableOpacity>
                  );
                })}
              </YStack>

              {/* Custom Price Input */}
              <YStack gap={6}>
                <Text fontWeight="600" color={C.label} fontSize={14}>Unit price (ETB)</Text>
                <Input
                  value={customPrice}
                  onChangeText={handleCustomPriceChange}
                  keyboardType="decimal-pad"
                  placeholder="Enter unit price"
                  placeholderTextColor={C.placeholder}
                  fontSize={16}
                  fontWeight="600"
                  color={C.text}
                  backgroundColor="white"
                  borderColor={C.border}
                  borderWidth={1}
                  borderRadius={10}
                  focusStyle={{ borderColor: C.accent }}
                />
                <Text fontSize={12} color={C.muted}>
                  You can use a preset price above or enter your own custom price
                </Text>
              </YStack>

              {/* Quantity Selection */}
              <YStack gap={8}>
                <Text fontWeight="600" color={C.label} fontSize={14}>Quantity</Text>
                <XStack justifyContent="center" alignItems="center" gap={16}>
                  <Button
                    size="$4"
                    circular
                    backgroundColor="white"
                    borderColor={C.border}
                    borderWidth={1}
                    onPress={handleQuantityDecrement}
                    disabled={quantityInput === '' && parseInt(quantityInput) <= 0}
                    pressStyle={{ backgroundColor: '#F9FAFB', borderColor: C.border }}
                    icon={<Ionicons name="remove" size={20} color={C.text} />}
                  />

                  <Input
                    width={90}
                    value={quantityInput}
                    onChangeText={handleQuantityInputChange}
                    keyboardType="numeric"
                    textAlign="center"
                    fontSize={18}
                    fontWeight="700"
                    color={C.text}
                    backgroundColor="white"
                    borderWidth={1}
                    borderRadius={10}
                    borderColor={C.border}
                    focusStyle={{ borderColor: C.accent }}
                    placeholder="Qty"
                    placeholderTextColor={C.placeholder}
                  />

                  <Button
                    size="$4"
                    circular
                    backgroundColor="white"
                    borderColor={C.border}
                    borderWidth={1}
                    onPress={handleQuantityIncrement}
                    disabled={parseInt(quantityInput) >= selectedShop.quantity}
                    pressStyle={{ backgroundColor: '#F9FAFB', borderColor: C.border }}
                    icon={<Ionicons name="add" size={20} color={C.accent} />}
                  />
                </XStack>
                <Text fontSize={12} color={C.muted} textAlign="center">
                  Maximum: {selectedShop.quantity} units
                </Text>
              </YStack>

              {/* Order Summary */}
              {showOrderSummary ? (
                <YStack gap={8} borderWidth={1} borderColor={C.border} borderRadius={12} padding={14}>
                  <Text fontSize={15} fontWeight="700" color={C.text}>
                    Order Summary
                  </Text>
                  <XStack justifyContent="space-between">
                    <Text color={C.label}>Unit price</Text>
                    <Text fontWeight="600" color={C.text}>
                      {formatMoney(finalPrice)}
                    </Text>
                  </XStack>
                  <XStack justifyContent="space-between">
                    <Text color={C.label}>Quantity</Text>
                    <Text fontWeight="600" color={C.text}>{parsedQuantity}</Text>
                  </XStack>
                  <Separator borderColor={C.border} />
                  <XStack justifyContent="space-between" alignItems="center">
                    <Text fontSize={16} fontWeight="700" color={C.text}>
                      Total
                    </Text>
                    <Text fontSize={18} fontWeight="800" color={C.accent}>
                      {formatMoney(finalPrice * parsedQuantity)}
                    </Text>
                  </XStack>
                </YStack>
              ) : null}

              {/* Add to Cart Button */}
              <Button
                onPress={handleAddToCart}
                backgroundColor={C.accent}
                borderWidth={0}
                borderRadius={12}
                height={50}
                disabled={finalPrice <= 0 || parsedQuantity <= 0}
                opacity={finalPrice <= 0 || parsedQuantity <= 0 ? 0.5 : 1}
                pressStyle={{ backgroundColor: '$orange10' }}
                icon={<Ionicons name="cart-outline" size={20} color="white" />}
              >
                <Text color="white" fontWeight="700" fontSize={16}>
                  Add to Cart
                </Text>
              </Button>
            </YStack>
          </ScrollView>
        </YStack>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const ProductDetailScreen = () => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const params = useLocalSearchParams();

  // Get product data from navigation params
  const productId = params.productId as string;
  const productName = params.productName as string;
  const productImage = params.productImage as string;

  // Local state
  const [selectedShopForModal, setSelectedShopForModal] = useState<SelectedShopInfo | null>(null);
  const [selectedPriceOption, setSelectedPriceOption] = useState<PriceOption | null>(null);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [selectedSubProductId, setSelectedSubProductId] = useState<string | null>(null);

  // Product-level stock, plus the list of variants (sub-products)
  const {
    data: batchesData,
    isLoading: batchesLoading,
    error: batchesError,
    refetch: refetchBatches,
  } = useQuery<ProductBatchesForUserResponse>({
    queryKey: ['product-batches', productId],
    queryFn: () => getProductBatchesByShopsForUser(productId),
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
  });

  const subProducts: SubProductOption[] = batchesData?.subProducts || [];
  const hasVariants = subProducts.length > 0;

  // Stock and prices for the selected variant
  const {
    data: variantData,
    isLoading: variantLoading,
    error: variantError,
    refetch: refetchVariant,
  } = useQuery<ProductBatchesForUserResponse>({
    queryKey: ['product-batches', productId, selectedSubProductId],
    queryFn: () => getProductBatchesByShopsForUser(productId, selectedSubProductId),
    enabled: !!productId && !!selectedSubProductId,
    staleTime: 60 * 1000,
  });

  const selectedSubProduct = subProducts.find((sp) => sp.id === selectedSubProductId) || null;
  const activeData = hasVariants ? variantData : batchesData;
  const shops = activeData?.batches?.shops || [];
  const hasStock = activeData?.batches?.hasStock || false;

  // Load cart data
  React.useEffect(() => {
    dispatch(fetchMyCart());
  }, [dispatch]);

  const handleOpenPriceModal = (shop: SelectedShopInfo, priceOption?: PriceOption) => {
    setSelectedShopForModal(shop);
    setSelectedPriceOption(priceOption || null);
    setShowPriceModal(true);
  };

  const handleClosePriceModal = () => {
    setShowPriceModal(false);
    setSelectedShopForModal(null);
    setSelectedPriceOption(null);
  };

  const handleAddToCart = async (cartData: {
    shop: SelectedShopInfo;
    priceOption: PriceOption;
    quantity: number;
    notes: string;
  }) => {
    if (hasVariants && !selectedSubProductId) {
      Alert.alert('Select a variant', 'Please choose which variant you are selling.');
      return;
    }

    try {
      const cartItemData = {
        productId: productId,
        subProductId: selectedSubProductId || undefined,
        shopId: cartData.shop.shopId,
        quantity: cartData.quantity,
        unitPrice: cartData.priceOption.price,
        notes: cartData.notes
      };

      await dispatch(addItemToUserCart(cartItemData)).unwrap();

      Alert.alert(
        'Success',
        'Item added to cart successfully!',
        [
          {
            text: 'Continue Shopping',
            onPress: () => router.push('/home' as any),
          },
          {
            text: 'Go to Cart',
            onPress: () => router.push('/Cart' as any),
          },
        ]
      );

      handleClosePriceModal();

    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add item to cart');
    }
  };

  // Small stock pill (light tint, dark text)
  const Badge = ({ children }: { children: React.ReactNode }) => (
    <YStack
      backgroundColor="#DCFCE7"
      paddingHorizontal={10}
      paddingVertical={3}
      borderRadius={999}
      alignItems="center"
      justifyContent="center"
    >
      <Text fontSize={12} fontWeight="700" color="#166534">
        {children}
      </Text>
    </YStack>
  );

  if (batchesLoading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="white">
        <Spinner size="large" color={C.accent} />
        <Text marginTop={16} color={C.muted} fontSize={15}>
          Loading product details...
        </Text>
      </YStack>
    );
  }

  if (batchesError) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding={16} gap={12} backgroundColor="white">
        <Ionicons name="alert-circle-outline" size={40} color={C.danger} />
        <Text color={C.text} textAlign="center" fontSize={15} fontWeight="600">
          {(batchesError as Error).message || 'Failed to load product batches'}
        </Text>
        <Button
          onPress={() => refetchBatches()}
          backgroundColor={C.accent}
          borderWidth={0}
          borderRadius={10}
          pressStyle={{ backgroundColor: '$orange10' }}
          icon={<Ionicons name="refresh" size={16} color="white" />}
        >
          <Text color="white" fontWeight="700">Retry</Text>
        </Button>
      </YStack>
    );
  }

  const handleBack = () => {
    router.back();
  };

  if (!hasVariants && !hasStock) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding={16} gap={8} backgroundColor="white">
        <Ionicons name="cube-outline" size={40} color={C.muted} />
        <Text color={C.text} textAlign="center" fontSize={16} fontWeight="700">
          No stock available for this product
        </Text>
        <Text color={C.muted} textAlign="center">
          Please check back later or contact support.
        </Text>
      </YStack>
    );
  }

  const headerImage = selectedSubProduct?.imageUrl || productImage;

  return (
    <YStack flex={1} backgroundColor="white">
      <ScrollView flex={1} showsVerticalScrollIndicator={false}>
        <YStack gap={16} padding={16}>
          {/* Back */}
          <XStack
            onPress={handleBack}
            alignSelf="flex-start"
            alignItems="center"
            gap={4}
            paddingVertical={6}
            paddingRight={8}
            pressStyle={{ opacity: 0.6 }}
            cursor="pointer"
          >
            <Ionicons name="arrow-back" size={20} color={C.text} />
            <Text color={C.text} fontWeight="600" fontSize={15}>Back</Text>
          </XStack>

          {/* Product Header */}
          <YStack
            backgroundColor="white"
            borderWidth={1}
            borderColor={C.border}
            borderRadius={16}
            padding={16}
            gap={12}
            alignItems="center"
            {...softShadow}
          >
            {headerImage ? (
              <AppImage
                path={headerImage}
                size={120}
                radius={12}
                bordered
                zoomable
                title={selectedSubProduct ? `${productName} · ${selectedSubProduct.name}` : productName}
              />
            ) : (
              <YStack
                width={120}
                height={120}
                borderRadius={12}
                backgroundColor="#F9FAFB"
                borderWidth={1}
                borderColor={C.border}
                alignItems="center"
                justifyContent="center"
              >
                <Ionicons name="image-outline" size={36} color={C.placeholder} />
              </YStack>
            )}
            <Text fontSize={20} fontWeight="700" color={C.text} textAlign="center">
              {productName}
            </Text>
            {selectedSubProduct ? (
              <Text color={C.muted} fontSize={14} textAlign="center">
                {selectedSubProduct.name} · {selectedSubProduct.subProductCode}
              </Text>
            ) : null}
          </YStack>

          {/* Variant picker */}
          {hasVariants && (
            <YStack gap={8}>
              <Text fontSize={16} fontWeight="700" color={C.text}>Choose a variant</Text>
              <Text fontSize={12} color={C.muted}>Tap a photo to view it full screen</Text>
              <XStack flexWrap="wrap" gap={10}>
                {subProducts.map((sp) => {
                  const selected = sp.id === selectedSubProductId;
                  return (
                    <YStack
                      key={sp.id}
                      width={104}
                      padding={8}
                      gap={6}
                      borderRadius={12}
                      borderWidth={selected ? 2 : 1}
                      backgroundColor={selected ? C.accentTint : 'white'}
                      borderColor={selected ? C.accent : C.border}
                      alignItems="center"
                      pressStyle={{ opacity: 0.8 }}
                      cursor="pointer"
                      onPress={() => setSelectedSubProductId(sp.id)}
                    >
                      <AppImage
                        path={sp.imageUrl}
                        size={84}
                        radius={8}
                        resizeMode="contain"
                        zoomable
                        title={`${productName} · ${sp.name}`}
                      />
                      <Text
                        color={selected ? C.accent : C.text}
                        fontWeight="600"
                        fontSize={13}
                        textAlign="center"
                      >
                        {sp.name}
                      </Text>
                      <Text color={C.muted} fontSize={11} numberOfLines={1}>
                        {sp.subProductCode}
                      </Text>
                    </YStack>
                  );
                })}
              </XStack>
            </YStack>
          )}

          {/* Available Shops List */}
          {hasVariants && !selectedSubProductId ? (
            <XStack
              borderWidth={1}
              borderColor={C.border}
              borderRadius={12}
              padding={16}
              gap={8}
              alignItems="center"
              justifyContent="center"
              backgroundColor="#F9FAFB"
            >
              <Ionicons name="information-circle-outline" size={18} color={C.muted} />
              <Text color={C.label} textAlign="center" fontWeight="500">
                Pick a variant to see stock and prices
              </Text>
            </XStack>
          ) : hasVariants && variantLoading ? (
            <YStack alignItems="center" padding={16}>
              <Spinner size="large" color={C.accent} />
            </YStack>
          ) : hasVariants && variantError ? (
            <YStack alignItems="center" padding={16} gap={12}>
              <Text color={C.danger} textAlign="center" fontWeight="600">
                {(variantError as Error).message || 'Failed to load variant stock'}
              </Text>
              <Button
                onPress={() => refetchVariant()}
                backgroundColor={C.accent}
                borderWidth={0}
                borderRadius={10}
                pressStyle={{ backgroundColor: '$orange10' }}
                icon={<Ionicons name="refresh" size={16} color="white" />}
              >
                <Text color="white" fontWeight="700">Retry</Text>
              </Button>
            </YStack>
          ) : !hasStock ? (
            <XStack
              borderWidth={1}
              borderColor={C.border}
              borderRadius={12}
              padding={16}
              gap={8}
              alignItems="center"
              justifyContent="center"
            >
              <Ionicons name="cube-outline" size={18} color={C.muted} />
              <Text color={C.label} textAlign="center" fontWeight="500">
                No stock available for this variant in your shops
              </Text>
            </XStack>
          ) : (
          <YStack gap={12}>
            <Text fontSize={18} fontWeight="700" color={C.text}>Available Shops</Text>

            {shops.map((shop: ShopBatchInfo) => {
              const shopPriceOptions: PriceOption[] = getPriceOptions(shop);

              return (
                <YStack
                  key={shop.shopId}
                  backgroundColor="white"
                  borderWidth={1}
                  borderColor={C.border}
                  borderRadius={14}
                  padding={14}
                  gap={12}
                  {...softShadow}
                >
                  <XStack justifyContent="space-between" alignItems="center" gap={12}>
                    <XStack flex={1} alignItems="center" gap={10}>
                      <YStack
                        width={36}
                        height={36}
                        borderRadius={10}
                        backgroundColor={C.accentTint}
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Ionicons name="storefront-outline" size={18} color={C.accent} />
                      </YStack>
                      <YStack flex={1}>
                        <Text fontWeight="700" fontSize={16} color={C.text}>{shop.shopName}</Text>
                        {shop.branchName ? (
                          <Text fontSize={12} color={C.muted}>{shop.branchName}</Text>
                        ) : null}
                      </YStack>
                    </XStack>
                    <Badge>
                      {shop.quantity} {shop.unitOfMeasure?.symbol || shop.unitOfMeasure?.name || ''} in stock
                    </Badge>
                  </XStack>

                  <YStack gap={8}>
                    {/* Listed prices (additional prices for this shop) */}
                    {shopPriceOptions.map((p) => (
                      <XStack
                        key={p.id}
                        backgroundColor="white"
                        borderColor={C.border}
                        borderWidth={1}
                        borderRadius={10}
                        paddingHorizontal={12}
                        paddingVertical={12}
                        justifyContent="space-between"
                        alignItems="center"
                        pressStyle={{ backgroundColor: C.accentTint, borderColor: C.accent }}
                        cursor="pointer"
                        onPress={() => handleOpenPriceModal(shop, p)}
                      >
                        <XStack alignItems="center" gap={8} flex={1}>
                          <Ionicons name="pricetag-outline" size={16} color={C.muted} />
                          <Text color={C.label} fontSize={14}>{p.label}</Text>
                        </XStack>
                        <XStack alignItems="center" gap={6}>
                          <Text fontWeight="700" fontSize={15} color={C.accent}>{formatMoney(p.price)}</Text>
                          <Ionicons name="chevron-forward" size={16} color={C.placeholder} />
                        </XStack>
                      </XStack>
                    ))}

                    {/* Custom Price */}
                    <Button
                      backgroundColor="white"
                      borderColor={C.accent}
                      borderWidth={1}
                      borderRadius={10}
                      pressStyle={{ backgroundColor: C.accentTint, borderColor: C.accent }}
                      onPress={() => handleOpenPriceModal(shop)}
                      icon={<Ionicons name="create-outline" size={16} color={C.accent} />}
                    >
                      <Text color={C.accent} fontWeight="700">Custom Price</Text>
                    </Button>
                  </YStack>
                </YStack>
              );
            })}
          </YStack>
          )}
        </YStack>
      </ScrollView>

      {/* Price Selection Modal */}
      <PriceSelectionModal
        selectedShop={selectedShopForModal}
        selectedPriceOption={selectedPriceOption}
        visible={showPriceModal}
        onClose={handleClosePriceModal}
        onAddToCart={handleAddToCart}
      />
    </YStack>
  );
};

export default ProductDetailScreen;
