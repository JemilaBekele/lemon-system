import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Alert,
  RefreshControl,
  Modal,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
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
  Image,
  Input,
  Fieldset,
  Label,
  TextArea,
} from 'tamagui';
import { Ionicons } from '@expo/vector-icons';
import type { AppDispatch } from '@/(redux)/store';
import { formatMoney } from '@/(utils)/format';

// Shared look: white surfaces, black text, orange accent only
const COLORS = {
  accent: '#FF6B00',
  accentPressed: '#E55F00',
  tint: '#FFF7ED',
  text: '#111827',
  label: '#374151',
  muted: '#6B7280',
  placeholder: '#9CA3AF',
  border: '#E5E7EB',
  danger: '#DC2626',
  dangerTint: '#FEF2F2',
  pressed: '#F9FAFB',
};

const inputProps = {
  borderWidth: 1,
  borderRadius: 12,
  borderColor: COLORS.border,
  backgroundColor: 'white',
  color: COLORS.text,
  placeholderTextColor: COLORS.placeholder,
  focusStyle: { borderColor: COLORS.accent },
} as const;

const primaryButtonProps = {
  backgroundColor: COLORS.accent,
  borderWidth: 0,
  borderRadius: 12,
  pressStyle: { backgroundColor: COLORS.accentPressed },
} as const;

const secondaryButtonProps = {
  backgroundColor: 'white',
  borderColor: COLORS.border,
  borderWidth: 1,
  borderRadius: 12,
  pressStyle: { backgroundColor: COLORS.pressed },
} as const;

const dangerButtonProps = {
  backgroundColor: 'white',
  borderColor: COLORS.danger,
  borderWidth: 1,
  borderRadius: 12,
  pressStyle: { backgroundColor: COLORS.dangerTint },
} as const;

const modalCardProps = {
  backgroundColor: 'white',
  borderRadius: 16,
  padding: 16,
  width: '100%',
  maxWidth: 400,
  borderWidth: 1,
  borderColor: COLORS.border,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 4,
} as const;

const summaryBoxProps = {
  backgroundColor: '#F9FAFB',
  borderWidth: 1,
  borderColor: COLORS.border,
  borderRadius: 12,
  padding: 16,
} as const;

// Redux imports
import {
  fetchMyCart,
  updateCartItemQuantity,
  removeCartItem,
  clearUserCart,
  checkoutUserCart,
  selectCartItems,
  selectCartLoading,
  selectCartError,
  selectCartTotalItems,
  selectCartTotalAmount,
  selectIsCartEmpty,
  selectCheckoutLoading,
  incrementItemQuantity,
  removeItemOptimistic,
  clearError,
  updateItemPriceOptimistic,
  updateCartItemPrice,
  clearCartAction,
  selectCart,
  selectCartCustomerId,
} from '@/(redux)/CART';

// Updated Customer Redux imports with search functionality
import {
  fetchCustomers,
  createCustomerAction,
  selectCustomers,
  selectCustomersLoading,
  selectCreateCustomerLoading,
  selectCreateCustomerError,
  clearError as clearCustomerError,
  // Add any new selectors you might need from the updated slice
  // selectIsSearchResults,
  // selectIsTopCustomers,
  // selectIsDefaultCustomers,
  // selectCustomerMetadata,
} from '@/(redux)/customer';

import {
  addItemsToWaitlistAction,
  clearError as clearWaitlistError,
  selectBulkAddLoading,
  selectBulkAddError,
} from '@/(redux)/WaitlistCart';

// Import the actual CartItem type from your API
import type { CartItem as ApiCartItem } from '@/(services)/api/CART';
import type { CreateCustomerData } from '@/(services)/api/customer';
import api from '@/(utils)/config';
import { lineItemName } from '@/(utils)/itemName';
import AppImage from '@/components/AppImage';

// Create a compatible type for our component
interface CartItem extends Omit<ApiCartItem, 'product' | 'shop' | 'batch'> {
  product?: {
    id: string;
    name: string;
    image?: string;
    imageUrl?: string | null;
    unitOfMeasure?: {
      id: string;
      name?: string;
    };
  };
  shop?: {
    id: string;
    name?: string;
  };
}

// Custom Modal Components using React Native Modal
const QuantityUpdateModal = ({
  item,
  visible,
  onClose,
  onUpdateQuantity,
}: {
  item: CartItem;
  visible: boolean;
  onClose: () => void;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
}) => {
  const [quantity, setQuantity] = useState(item.quantity.toString());

  const handleSave = () => {
    const newQuantity = parseInt(quantity) || 1;
    if (newQuantity < 1) {
      Alert.alert('Error', 'Quantity must be at least 1');
      return;
    }
    onUpdateQuantity(item.id, newQuantity);
    onClose();
  };

  const handleIncrement = () => {
    const newQuantity = parseInt(quantity) + 1;
    setQuantity(newQuantity.toString());
  };

  const handleDecrement = () => {
    const newQuantity = Math.max(1, parseInt(quantity) - 1);
    setQuantity(newQuantity.toString());
  };

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
          backgroundColor="rgba(0,0,0,0.5)"
          padding="$4"
        >
          <TouchableWithoutFeedback>
            <YStack {...modalCardProps}>
              <YStack gap={16}>
                <Text fontSize={20} fontWeight="700" color={COLORS.text} textAlign="center">
                  Update Quantity
                </Text>

                <YStack {...summaryBoxProps} gap={4} alignItems="center">
                  <Text fontSize={16} fontWeight="600" color={COLORS.text} textAlign="center">
                    {lineItemName(item.product, item.subProduct)}
                  </Text>
                  <Text fontSize={13} color={COLORS.muted}>
                    Current: {item.quantity} units
                  </Text>
                </YStack>

                <Fieldset gap={12}>
                  <Label htmlFor="quantity" fontSize={14} fontWeight="600" color={COLORS.label}>
                    New Quantity
                  </Label>
                  <XStack justifyContent="center" alignItems="center" gap={16}>
                    <Button
                      {...secondaryButtonProps}
                      circular
                      width={44}
                      height={44}
                      padding={0}
                      onPress={handleDecrement}
                      icon={<Ionicons name="remove" size={20} color={COLORS.text} />}
                    />

                    <Input
                      id="quantity"
                      {...inputProps}
                      width={100}
                      value={quantity}
                      onChangeText={setQuantity}
                      keyboardType="numeric"
                      textAlign="center"
                      fontSize={20}
                      fontWeight="700"
                    />

                    <Button
                      {...secondaryButtonProps}
                      circular
                      width={44}
                      height={44}
                      padding={0}
                      onPress={handleIncrement}
                      icon={<Ionicons name="add" size={20} color={COLORS.accent} />}
                    />
                  </XStack>
                </Fieldset>

                <XStack gap={12}>
                  <Button flex={1} {...secondaryButtonProps} onPress={onClose}>
                    <Text color={COLORS.text} fontWeight="600">Cancel</Text>
                  </Button>
                  <Button flex={1} {...primaryButtonProps} onPress={handleSave}>
                    <Text color="white" fontWeight="700">Update</Text>
                  </Button>
                </XStack>
              </YStack>
            </YStack>
          </TouchableWithoutFeedback>
        </YStack>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const PriceUpdateModal = ({
  item,
  visible,
  onClose,
  onUpdatePrice,
}: {
  item: CartItem;
  visible: boolean;
  onClose: () => void;
  onUpdatePrice: (itemId: string, price: number) => void;
}) => {
  const [price, setPrice] = useState(item.unitPrice.toString());
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      (e) => {
        setKeyboardOffset(e.endCoordinates.height / 2);
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => {
        setKeyboardOffset(0);
      }
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  const handleSave = () => {
    const newPrice = parseFloat(price);
    if (isNaN(newPrice) || newPrice <= 0) {
      Alert.alert('Error', 'Please enter a valid price');
      return;
    }
    onUpdatePrice(item.id, newPrice);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <YStack 
            flex={1} 
            justifyContent="center" 
            alignItems="center" 
            padding="$4"
            backgroundColor="rgba(0,0,0,0.4)"
            style={{
              transform: [{ translateY: -keyboardOffset }]
            }}
          >
            <TouchableWithoutFeedback>
              <YStack {...modalCardProps}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <YStack gap={16}>
                    <Text fontSize={20} fontWeight="700" color={COLORS.text} textAlign="center">
                      Update Unit Price
                    </Text>

                    <YStack {...summaryBoxProps} gap={4} alignItems="center">
                      <Text fontSize={16} fontWeight="600" color={COLORS.text} textAlign="center">
                        {lineItemName(item.product, item.subProduct)}
                      </Text>
                      <Text fontSize={13} color={COLORS.muted} textAlign="center">
                        Current: {formatMoney(item.unitPrice)}
                      </Text>
                    </YStack>

                    <Fieldset gap={8}>
                      <Label htmlFor="price" fontSize={14} fontWeight="600" color={COLORS.label}>
                        New Unit Price (ETB)
                      </Label>
                      <Input
                        id="price"
                        {...inputProps}
                        value={price}
                        onChangeText={setPrice}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        fontSize={20}
                        fontWeight="700"
                        textAlign="center"
                        minHeight={48}
                        autoFocus={true}
                        returnKeyType="done"
                        onSubmitEditing={handleSave}
                      />
                    </Fieldset>

                    <XStack gap={12}>
                      <Button flex={1} {...secondaryButtonProps} onPress={onClose}>
                        <Text color={COLORS.text} fontWeight="600">Cancel</Text>
                      </Button>
                      <Button flex={1} {...primaryButtonProps} onPress={handleSave}>
                        <Text color="white" fontWeight="700">Update Price</Text>
                      </Button>
                    </XStack>
                  </YStack>
                </ScrollView>
              </YStack>
            </TouchableWithoutFeedback>
          </YStack>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// Add Customer Modal Component
const AddCustomerModal = ({
  visible,
  onClose,
  onCreateCustomer,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  onCreateCustomer: (customerData: CreateCustomerData) => void;
  loading: boolean;
}) => {
  const [formData, setFormData] = useState<CreateCustomerData>({
    name: '',
    phone1: '',
    companyName: '',
    phone2: '',
    tinNumber: '',
    address: '',
  });

  const handleSave = () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Customer name is required');
      return;
    }
    if (!formData.phone1.trim()) {
      Alert.alert('Error', 'Phone number is required');
      return;
    }

    // Same rules as the web POS: phone numbers are exactly 10 digits
    const phone1 = formData.phone1.replace(/D/g, '');
    const phone2 = (formData.phone2 || '').replace(/D/g, '');
    if (phone1.length !== 10) {
      Alert.alert('Error', 'Phone number must be exactly 10 digits');
      return;
    }
    if (phone2 && phone2.length !== 10) {
      Alert.alert('Error', 'Second phone number must be exactly 10 digits');
      return;
    }

    onCreateCustomer({
      name: formData.name.trim(),
      phone1,
      phone2: phone2 || undefined,
      companyName: formData.companyName?.trim() || undefined,
      tinNumber: formData.tinNumber?.trim() || undefined,
      address: formData.address?.trim() || undefined,
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone1: '',
      companyName: '',
      phone2: '',
      tinNumber: '',
      address: '',
    });
  };

  const handleClose = () => {
    Keyboard.dismiss(); // Dismiss keyboard first
    resetForm();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
      statusBarTranslucent={true}
    >
      {/* Only dismiss keyboard when tapping on background */}
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
        >
          <YStack 
            flex={1} 
            justifyContent="center" 
            alignItems="center" 
            backgroundColor="rgba(0,0,0,0.5)"
            padding="$4"
          >
            {/* Prevent background tap from closing modal */}
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <YStack
                {...modalCardProps}
                maxHeight="85%" // Increased max height
                minHeight={300} // Minimum height
              >
                {/* ScrollView with proper keyboard handling */}
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled" // Important: prevents keyboard dismiss on scroll
                  contentContainerStyle={{ flexGrow: 1 }}
                  nestedScrollEnabled={true}
                >
                  <YStack gap={14}>
                    {/* Header with Close Button */}
                    <XStack justifyContent="space-between" alignItems="center">
                      <XStack alignItems="center" gap={8} flex={1}>
                        <Ionicons name="person-add-outline" size={20} color={COLORS.accent} />
                        <Text fontSize={20} fontWeight="700" color={COLORS.text}>
                          Add New Customer
                        </Text>
                      </XStack>
                      <TouchableOpacity
                        onPress={handleClose}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="close" size={22} color={COLORS.muted} />
                      </TouchableOpacity>
                    </XStack>

                    {/* Required fields indicator */}
                    <XStack alignItems="center" gap={4}>
                      <Text fontSize={12} color={COLORS.danger}>*</Text>
                      <Text fontSize={12} color={COLORS.muted}>
                        Required fields
                      </Text>
                    </XStack>

                    <Fieldset gap={6}>
                      <XStack alignItems="center" gap={4}>
                        <Label
                          htmlFor="name"
                          fontSize={14}
                          fontWeight="600"
                          color={COLORS.label}
                        >
                          Customer Name
                        </Label>
                        <Text fontSize={12} color={COLORS.danger}>*</Text>
                      </XStack>
                      <Input
                        id="name"
                        {...inputProps}
                        value={formData.name}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                        placeholder="Enter customer name"
                        fontSize={15}
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onSubmitEditing={() => {
                          // Focus next field - you can use refs for this
                        }}
                      />
                    </Fieldset>

                    <Fieldset gap={6}>
                      <XStack alignItems="center" gap={4}>
                        <Label
                          htmlFor="phone1"
                          fontSize={14}
                          fontWeight="600"
                          color={COLORS.label}
                        >
                          Phone Number
                        </Label>
                        <Text fontSize={12} color={COLORS.danger}>*</Text>
                      </XStack>
                      <Input
                        id="phone1"
                        {...inputProps}
                        value={formData.phone1}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, phone1: text }))}
                        placeholder="Enter primary phone number"
                        keyboardType="phone-pad"
                        fontSize={15}
                        returnKeyType="next"
                      />
                    </Fieldset>

                    <Fieldset gap={6}>
                      <Label
                        htmlFor="companyName"
                        fontSize={14}
                        fontWeight="600"
                        color={COLORS.label}
                      >
                        Company Name
                      </Label>
                      <Input
                        id="companyName"
                        {...inputProps}
                        value={formData.companyName}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, companyName: text }))}
                        placeholder="Enter company name (optional)"
                        fontSize={15}
                        returnKeyType="next"
                      />
                    </Fieldset>

                    <Fieldset gap={6}>
                      <Label
                        htmlFor="phone2"
                        fontSize={14}
                        fontWeight="600"
                        color={COLORS.label}
                      >
                        Secondary Phone
                      </Label>
                      <Input
                        id="phone2"
                        {...inputProps}
                        value={formData.phone2}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, phone2: text }))}
                        placeholder="Enter secondary phone (optional)"
                        keyboardType="phone-pad"
                        fontSize={15}
                        returnKeyType="next"
                      />
                    </Fieldset>

                    <Fieldset gap={6}>
                      <Label
                        htmlFor="tinNumber"
                        fontSize={14}
                        fontWeight="600"
                        color={COLORS.label}
                      >
                        TIN Number
                      </Label>
                      <Input
                        id="tinNumber"
                        {...inputProps}
                        value={formData.tinNumber}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, tinNumber: text }))}
                        placeholder="Enter TIN number (optional)"
                        fontSize={15}
                        returnKeyType="next"
                      />
                    </Fieldset>

                    <Fieldset gap={6}>
                      <Label
                        htmlFor="address"
                        fontSize={14}
                        fontWeight="600"
                        color={COLORS.label}
                      >
                        Address
                      </Label>
                      <TextArea
                        id="address"
                        {...inputProps}
                        value={formData.address}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, address: text }))}
                        placeholder="Enter address (optional)"
                        numberOfLines={3}
                        textAlignVertical="top"
                        minHeight={90}
                        fontSize={15}
                        padding={12}
                        returnKeyType="done"
                        blurOnSubmit={true}
                        onSubmitEditing={() => Keyboard.dismiss()}
                      />
                    </Fieldset>

                    {/* Action Buttons */}
                    <XStack gap={12} marginTop={4}>
                      <Button
                        flex={1}
                        {...secondaryButtonProps}
                        onPress={handleClose}
                        disabled={loading}
                        height={48}
                      >
                        <Text color={COLORS.text} fontWeight="600">Cancel</Text>
                      </Button>
                      <Button
                        flex={1}
                        {...primaryButtonProps}
                        onPress={handleSave}
                        disabled={loading}
                        opacity={loading ? 0.7 : 1}
                        height={48}
                      >
                        {loading ? (
                          <XStack alignItems="center" gap={8}>
                            <Spinner size="small" color="white" />
                            <Text color="white" fontWeight="600">Adding...</Text>
                          </XStack>
                        ) : (
                          <XStack alignItems="center" gap={6}>
                            <Ionicons name="checkmark" size={18} color="white" />
                            <Text color="white" fontWeight="700">Add Customer</Text>
                          </XStack>
                        )}
                      </Button>
                    </XStack>

                    {/* Quick Save Shortcut Info */}
                    <XStack justifyContent="center">
                      <Text fontSize={12} color={COLORS.muted} textAlign="center">
                        Tip: Press &quot;Enter&quot; or &quot;Return&quot; to quickly move between fields
                      </Text>
                    </XStack>
                  </YStack>
                </ScrollView>
              </YStack>
            </TouchableWithoutFeedback>
          </YStack>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// Discount and Notes Modal Component
const DiscountNotesModal = ({
  visible,
  onClose,
  onApply,
  currentDiscount,
  currentNotes,
  totalAmount,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: (discount: number, notes: string) => void | Promise<void>;
  currentDiscount: number;
  currentNotes: string;
  totalAmount: number;
  loading: boolean;
}) => {
  const [discountInput, setDiscountInput] = useState(currentDiscount.toString());
  const [notesInput, setNotesInput] = useState(currentNotes);

  const handleApply = () => {
    const discountValue = discountInput.trim() ? parseFloat(discountInput) : 0;
    
    if (discountValue < 0) {
      Alert.alert('Error', 'Discount cannot be negative');
      return;
    }
    
    if (discountValue > totalAmount) {
      Alert.alert('Error', 'Discount cannot be greater than total amount');
      return;
    }
    
    onApply(discountValue, notesInput);
  };

  const calculateDiscountedTotal = () => {
    const discountValue = discountInput.trim() ? parseFloat(discountInput) : 0;
    return Math.max(0, totalAmount - discountValue);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <YStack 
            flex={1} 
            justifyContent="center" 
            alignItems="center" 
            backgroundColor="rgba(0,0,0,0.5)"
            padding="$4"
          >
            <YStack {...modalCardProps}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <YStack gap={16}>
                  <Text fontSize={20} fontWeight="700" color={COLORS.text} textAlign="center">
                    Apply Discount & Notes
                  </Text>

                  <YStack {...summaryBoxProps} gap={8}>
                    <XStack justifyContent="space-between">
                      <Text fontSize={14} color={COLORS.label}>Cart Total</Text>
                      <Text fontSize={14} fontWeight="600" color={COLORS.text}>
                        {formatMoney(totalAmount)}
                      </Text>
                    </XStack>
                    {discountInput.trim() && !isNaN(parseFloat(discountInput)) ? (
                      <YStack gap={8}>
                        <XStack justifyContent="space-between">
                          <Text fontSize={14} color={COLORS.label}>Discount</Text>
                          <Text fontSize={14} fontWeight="600" color={COLORS.danger}>
                            -{formatMoney(parseFloat(discountInput))}
                          </Text>
                        </XStack>
                        <XStack
                          justifyContent="space-between"
                          borderTopWidth={1}
                          borderTopColor={COLORS.border}
                          paddingTop={8}
                        >
                          <Text fontSize={15} fontWeight="700" color={COLORS.text}>New Total</Text>
                          <Text fontSize={16} fontWeight="800" color={COLORS.accent}>
                            {formatMoney(calculateDiscountedTotal())}
                          </Text>
                        </XStack>
                      </YStack>
                    ) : null}
                  </YStack>

                  <Fieldset gap={6}>
                    <Label htmlFor="discount" fontSize={14} fontWeight="600" color={COLORS.label}>
                      Discount Amount (ETB)
                    </Label>
                    <Input
                      id="discount"
                      {...inputProps}
                      value={discountInput}
                      onChangeText={setDiscountInput}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      fontSize={15}
                    />
                    <Text fontSize={12} color={COLORS.muted}>
                      Leave empty for no discount
                    </Text>
                  </Fieldset>

                  <Fieldset gap={6}>
                    <Label htmlFor="notes" fontSize={14} fontWeight="600" color={COLORS.label}>
                      Order Notes
                    </Label>
                    <TextArea
                      id="notes"
                      {...inputProps}
                      value={notesInput}
                      onChangeText={setNotesInput}
                      placeholder="Add any notes for this order (optional)"
                      numberOfLines={4}
                      textAlignVertical="top"
                      minHeight={100}
                      fontSize={15}
                      padding={12}
                    />
                  </Fieldset>

                  <XStack gap={12}>
                    <Button
                      flex={1}
                      {...secondaryButtonProps}
                      onPress={onClose}
                      disabled={loading}
                    >
                      <Text color={COLORS.text} fontWeight="600">Cancel</Text>
                    </Button>
                    <Button
                      flex={1}
                      {...primaryButtonProps}
                      onPress={handleApply}
                      disabled={loading}
                    >
                      {loading ? (
                        <Spinner size="small" color="white" />
                      ) : (
                        <Text color="white" fontWeight="600">Apply</Text>
                      )}
                    </Button>
                  </XStack>
                </YStack>
              </ScrollView>
            </YStack>
          </YStack>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// Add to Waitlist Confirmation Modal
const AddToWaitlistModal = ({
  visible,
  onClose,
  onConfirm,
  loading,
  cartInfo,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  cartInfo: {
    totalItems: number;
    totalAmount: number;
    customerName?: string;
  };
}) => {
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
        padding="$4"
      >
        <YStack {...modalCardProps}>
          <YStack gap={16}>
            <XStack alignItems="center" justifyContent="center" gap={8}>
              <Ionicons name="time-outline" size={20} color={COLORS.accent} />
              <Text fontSize={20} fontWeight="700" color={COLORS.text}>
                Add to Waitlist
              </Text>
            </XStack>

            <YStack {...summaryBoxProps} gap={8}>
              <Text fontSize={15} fontWeight="700" color={COLORS.text}>
                Cart Summary
              </Text>
              <XStack justifyContent="space-between">
                <Text fontSize={14} color={COLORS.label}>Items</Text>
                <Text fontSize={14} fontWeight="600" color={COLORS.text}>{cartInfo.totalItems}</Text>
              </XStack>
              <XStack justifyContent="space-between">
                <Text fontSize={14} color={COLORS.label}>Total</Text>
                <Text fontSize={14} fontWeight="700" color={COLORS.accent}>
                  {formatMoney(cartInfo.totalAmount)}
                </Text>
              </XStack>
              {cartInfo.customerName ? (
                <XStack justifyContent="space-between">
                  <Text fontSize={14} color={COLORS.label}>Customer</Text>
                  <Text fontSize={14} fontWeight="600" color={COLORS.text} numberOfLines={1} flexShrink={1}>
                    {cartInfo.customerName}
                  </Text>
                </XStack>
              ) : null}
            </YStack>

            <Text fontSize={13} color={COLORS.muted} textAlign="center">
              This will move your cart to the waitlist. You can retrieve it later from the waitlist section.
            </Text>

            <XStack gap={12}>
              <Button
                flex={1}
                {...secondaryButtonProps}
                onPress={onClose}
                disabled={loading}
              >
                <Text color={COLORS.text} fontWeight="600">Cancel</Text>
              </Button>
              <Button
                flex={1}
                {...primaryButtonProps}
                onPress={onConfirm}
                disabled={loading}
              >
                {loading ? (
                  <Spinner size="small" color="white" />
                ) : (
                  <Text color="white" fontWeight="600">Add to Waitlist</Text>
                )}
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </YStack>
    </Modal>
  );
};

const CartListViewScreen = () => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  // Redux state
  const cart = useSelector(selectCart);
  const cartCustomerId = useSelector(selectCartCustomerId);
  const cartItems = useSelector(selectCartItems);
  const loading = useSelector(selectCartLoading);
  const error = useSelector(selectCartError);
  const totalItems = useSelector(selectCartTotalItems);
  const totalAmount = useSelector(selectCartTotalAmount);
  const isEmpty = useSelector(selectIsCartEmpty);
  const checkoutLoading = useSelector(selectCheckoutLoading);

  // Customer state
  const customers = useSelector(selectCustomers);
  const customersLoading = useSelector(selectCustomersLoading);
  const createCustomerLoading = useSelector(selectCreateCustomerLoading);
  const createCustomerError = useSelector(selectCreateCustomerError);

  // Waitlist state - BULK OPERATIONS ONLY
  const waitlistLoading = useSelector(selectBulkAddLoading);
  const waitlistError = useSelector(selectBulkAddError);

  // Discount and Notes state
  const [discount, setDiscount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [showDiscountNotesModal, setShowDiscountNotesModal] = useState(false);
  
  // Local state
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CartItem | null>(null);
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  
  // Customer search state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Filter customers based on search query
  const filteredCustomers = React.useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    
    const query = customerSearchQuery.toLowerCase().trim();
    return customers.filter(customer => 
      customer.name?.toLowerCase().includes(query) ||
      customer.phone1?.toLowerCase().includes(query) ||
      customer.phone2?.toLowerCase().includes(query) ||
      customer.companyName?.toLowerCase().includes(query)
    );
  }, [customers, customerSearchQuery]);

  // A cart that already belongs to a customer (e.g. converted from their
  // waitlist) starts with that customer selected
  useEffect(() => {
    if (cartCustomerId) setSelectedCustomerId(cartCustomerId);
  }, [cartCustomerId]);

  // Load cart data and customers on component mount
  useEffect(() => {
    dispatch(fetchMyCart());
    // Fetch customers without search query initially
    dispatch(fetchCustomers());
  }, [dispatch]);

  // Refresh cart data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      dispatch(fetchMyCart());
    }, [dispatch])
  );

  // Effect for searching customers when search query changes
  useEffect(() => {
    if (customerSearchQuery.trim() || customerSearchQuery === '') {
      // Debounce the search to avoid too many API calls
      const timeoutId = setTimeout(() => {
        dispatch(fetchCustomers(customerSearchQuery));
      }, 300); // 300ms debounce

      return () => clearTimeout(timeoutId);
    }
  }, [customerSearchQuery, dispatch]);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error);
      dispatch(clearError());
    }
    if (createCustomerError) {
      Alert.alert('Error', createCustomerError);
      dispatch(clearCustomerError());
    }
    if (waitlistError) {
      Alert.alert('Error', waitlistError);
      dispatch(clearWaitlistError());
    }
  }, [error, createCustomerError, waitlistError, dispatch]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      dispatch(fetchMyCart()),
      dispatch(fetchCustomers(customerSearchQuery))
    ]);
    setRefreshing(false);
  };

  const handleUpdateQuantity = async (itemId: string, quantity: number) => {
    try {
      // Optimistic update
      dispatch(incrementItemQuantity(itemId));
      
      await dispatch(updateCartItemQuantity({ cartItemId: itemId, quantity })).unwrap();
      Alert.alert('Success', 'Quantity updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update quantity');
      // Refresh to revert optimistic update
      dispatch(fetchMyCart());
    }
  };

  const handleUpdatePrice = async (itemId: string, price: number) => {
    try {
      // Prevent duplicate calls
      if (updatingItems.current.has(itemId)) {
        return;
      }

      // Add to updating set
      updatingItems.current.add(itemId);

      const currentItem = cartItems.find(item => item.id === itemId);
      if (!currentItem) {
        Alert.alert('Error', 'Item not found in cart');
        updatingItems.current.delete(itemId);
        return;
      }

      // Optimistic update
      dispatch(updateItemPriceOptimistic({ 
        itemId, 
        unitPrice: price
      }));
      
      await dispatch(updateCartItemPrice({ 
        cartItemId: itemId, 
        unitPrice: price 
      })).unwrap();
      
      Alert.alert('Success', 'Price updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update price');
      dispatch(fetchMyCart());
    } finally {
      // Always remove from updating set
      updatingItems.current.delete(itemId);
    }
  };

  // Add this ref to track updating items
  const updatingItems = useRef(new Set());

  const handleRemoveItem = (item: CartItem) => {
    Alert.alert(
      'Remove Item',
      `Are you sure you want to remove ${lineItemName(item.product, item.subProduct)} from your cart?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // Optimistic update
              dispatch(removeItemOptimistic(item.id));
              
              await dispatch(removeCartItem(item.id)).unwrap();
              Alert.alert('Success', 'Item removed from cart');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove item');
              // Refresh to revert optimistic update
              dispatch(fetchMyCart());
            }
          },
        },
      ]
    );
  };

  const handleClearCart = () => {
    if (isEmpty) return;

    Alert.alert(
      'Clear Cart',
      'Are you sure you want to remove all items from your cart?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(clearUserCart()).unwrap();
              dispatch(clearCartAction());
              
              // Clear customer selection when cart is cleared
              setSelectedCustomerId('');
              setDiscount('');
              setNotes('');
              
              Alert.alert('Success', 'Cart cleared successfully');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to clear cart');
            }
          },
        },
      ]
    );
  };

  const handleCreateCustomer = async (customerData: CreateCustomerData) => {
    try {
      const result = await dispatch(createCustomerAction(customerData)).unwrap();
      setShowAddCustomerModal(false);
      Alert.alert('Success', 'Customer created successfully');
      // Auto-select the newly created customer
      setSelectedCustomerId(result.customer.id);
      // Refresh customers list to include the new one
      dispatch(fetchCustomers(customerSearchQuery));
    } catch {
      // Error handled by Redux and displayed in useEffect
    }
  };

  // Function to apply discount and notes
  const handleApplyDiscountNotes = async (discountValue: number, notesText: string) => {
    if (!selectedCustomerId) {
      Alert.alert('Error', 'Please select a customer first');
      return;
    }

    try {
      // Get cart ID from first item
      const cartId = cartItems[0]?.cartId;
      if (!cartId) {
        Alert.alert('Error', 'Cannot find cart ID');
        return;
      }

      // Update cart with discount and notes
      await api.put(`/carts/assign/customer/${cartId}`, {
        customerId: selectedCustomerId,
        discount: discountValue,
        notes: notesText
      });

      // Update local state
      setDiscount(discountValue.toString());
      setNotes(notesText);
      
      // Refresh cart to get updated total
      dispatch(fetchMyCart());
      
      setShowDiscountNotesModal(false);
      Alert.alert('Success', 'Discount and notes applied to cart');
    } catch (error: any) {
      console.log(error)
      Alert.alert('Error', error.message || 'Failed to apply discount and notes');
    }
  };

  // BULK WAITLIST FUNCTIONALITY
  const handleAddToWaitlist = async (cartItemIds: string[], note?: string) => {
    try {
      if (cartItemIds.length === 0) {
        Alert.alert('Error', 'No items selected');
        return;
      }

      if (!selectedCustomerId) {
        Alert.alert(
          'Select Customer',
          'Please select a customer before moving items to waitlist.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Select Customer',
              onPress: () => {
                setShowCustomerModal(true);
                setSearchQuery('');
              },
            },
          ]
        );
        return;
      }

      // Call bulk add to waitlist action WITH customerId
      const result = await dispatch(addItemsToWaitlistAction({ 
        cartItemIds,
        note: note || `Items moved to waitlist`,
        customerId: selectedCustomerId
      })).unwrap();
      
      // Show success message
      if (result.data.successfulItems > 0) {
        Alert.alert(
          'Success', 
          `Successfully added ${result.data.successfulItems} item(s) to waitlist!`,
          [
                         { text: 'OK', style: 'cancel' },

          ]
        );
        
        // IMPORTANT: Clear cart data from Redux after moving to waitlist
        dispatch(clearCartAction()); // This clears cart AND customer data
        
        // Also clear local state
        setSelectedCustomerId('');
        setDiscount('');
        setNotes('');
        setSelectedItems([]);
        setSelectMode(false);
        
        // If there were failures, show them
        if (result.data.failedItems > 0 && result.data.errors) {
          setTimeout(() => {
            Alert.alert(
              'Partial Success',
              `${result.data.failedItems} item(s) failed to add to waitlist.`,
              result.data.errors?.map(error => ({
                text: `${error.productName}: ${error.error}`,
              }))
            );
          }, 1000);
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add items to waitlist');
    }
  };

  // Update the handleBulkAddToWaitlist function:
  const handleBulkAddToWaitlist = async () => {
    if (cartItems.length === 0) {
      Alert.alert('Error', 'Cart is empty');
      return;
    }

    if (!selectedCustomerId) {
      Alert.alert(
        'Select Customer',
        'Please select a customer before moving items to waitlist.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Select Customer',
            onPress: () => {
              setShowCustomerModal(true);
              setSearchQuery('');
            },
          },
        ]
      );
      return;
    }

    // Get all cart item IDs
    const cartItemIds = cartItems.map(item => item.id);
    
    await handleAddToWaitlist(cartItemIds, 'Entire cart moved to waitlist');
    
    setShowWaitlistModal(false);
  };

  // Also update the handleAddSelectedToWaitlist function:
  const handleAddSelectedToWaitlist = async () => {
    if (selectedItems.length === 0) {
      Alert.alert('Error', 'Please select items first');
      return;
    }
    
    await handleAddToWaitlist(selectedItems, 'Selected items moved to waitlist');
  };

  // Toggle item selection
  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleCheckout = () => {
    if (isEmpty) {
      Alert.alert('Cart Empty', 'Your cart is empty. Add some items before checkout.');
      return;
    }

    if (!selectedCustomerId) {
      Alert.alert(
        'Select Customer',
        'Please select a customer before proceeding to checkout.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Select Customer',
            onPress: () => {
              setShowCustomerModal(true);
              setSearchQuery('');
            },
          },
        ]
      );
      return;
    }

    const selectedCustomer = (customers.find(c => c.id === selectedCustomerId) ??
      (cart?.customer && cart.customer.id === selectedCustomerId ? cart.customer : undefined));
    const discountValue = discount ? parseFloat(discount) : 0;
    const notesText = notes || '';

    Alert.alert(
      'Proceed to Checkout',
      `Customer: ${selectedCustomer?.name}\n` +
      `Items: ${totalItems}\n` +
      `Subtotal: ${formatMoney(totalAmount)}\n` +
      (discountValue > 0 ? `Discount: -${formatMoney(discountValue)}\n` : '') +
      `Final Total: ${formatMoney(totalAmount - discountValue)}\n` +
      (notesText ? `Notes: ${notesText}` : ''),
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: discountValue > 0 || notesText ? 'Edit Discount/Notes' : 'Add Discount/Notes',
          onPress: () => setShowDiscountNotesModal(true),
        },
        {
          text: 'Checkout',
          onPress: async () => {
            try {
              await dispatch(checkoutUserCart({
                customerId: selectedCustomerId,
                paymentMethod: 'cash',
                discount: discountValue > 0 ? discountValue : undefined,
                notes: notesText || undefined,
              })).unwrap();

              Alert.alert(
                'Order Placed!',
                `Order has been placed successfully for ${selectedCustomer?.name}.\n` +
                (discountValue > 0 ? `Discount applied: ${formatMoney(discountValue)}\n` : '') +
                (notesText ? `Notes: ${notesText}` : ''),
                [
                  {
                    text: 'Continue Shopping',
                    onPress: () => {
                      setSelectedCustomerId('');
                      setDiscount('');
                      setNotes('');
                      router.push('/home');
                    },
                  },
                ]
              );
            } catch (error: any) {
              Alert.alert('Checkout Failed', error.message || 'Failed to process checkout');
            }
          },
        },
      ]
    );
  };

  const openQuantityModal = (item: CartItem) => {
    setSelectedItem(item);
    setShowQuantityModal(true);
  };

  const openPriceModal = (item: CartItem) => {
    setSelectedItem(item);
    setShowPriceModal(true);
  };

  // Group items by shop
  const itemsByShop = cartItems.reduce((acc, item) => {
    const shopName = item.shop?.name || 'Unknown Shop';
    if (!acc[shopName]) {
      acc[shopName] = [];
    }
    acc[shopName].push(item as CartItem);
    return acc;
  }, {} as Record<string, CartItem[]>);

  // Get selected customer name
  const selectedCustomer = (customers.find(c => c.id === selectedCustomerId) ??
      (cart?.customer && cart.customer.id === selectedCustomerId ? cart.customer : undefined));

  // Custom Badge Component (light orange pill)
  const Badge = ({ children, ...props }: any) => (
    <YStack
      backgroundColor={COLORS.tint}
      paddingHorizontal={8}
      paddingVertical={2}
      borderRadius={999}
      alignItems="center"
      justifyContent="center"
      {...props}
    >
      <Text fontSize={12} fontWeight="700" color="#C2410C">
        {children}
      </Text>
    </YStack>
  );

  const discountValueDisplay = discount ? parseFloat(discount) : 0;

  if (loading && !refreshing && cartItems.length === 0) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="white">
        <Spinner size="large" color={COLORS.accent} />
        <Text marginTop={16} color={COLORS.muted} fontSize={15} fontWeight="500">
          Loading your cart...
        </Text>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="white">
      {/* Screen header */}
      <XStack
        backgroundColor="white"
        paddingHorizontal={16}
        paddingTop={16}
        paddingBottom={12}
        borderBottomWidth={1}
        borderBottomColor={COLORS.border}
        alignItems="center"
        justifyContent="space-between"
      >
        <YStack>
          <Text fontSize={24} fontWeight="700" color={COLORS.text}>
            My Cart
          </Text>
          <Text fontSize={13} color={COLORS.muted}>
            {isEmpty ? 'No items yet' : `${totalItems} ${totalItems === 1 ? 'item' : 'items'} in cart`}
          </Text>
        </YStack>
        <Ionicons name="cart-outline" size={24} color={COLORS.accent} />
      </XStack>

      <ScrollView
        flex={1}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[COLORS.accent]} tintColor={COLORS.accent} />
        }
      >
        <YStack gap={12} padding={16}>
          {isEmpty ? (
            <YStack alignItems="center" gap={12} paddingVertical={48} paddingHorizontal={16}>
              <YStack
                width={72}
                height={72}
                borderRadius={36}
                backgroundColor={COLORS.tint}
                alignItems="center"
                justifyContent="center"
              >
                <Ionicons name="cart-outline" size={34} color={COLORS.accent} />
              </YStack>
              <Text fontSize={18} fontWeight="700" color={COLORS.text} textAlign="center">
                Your cart is empty
              </Text>
              <Text fontSize={14} color={COLORS.muted} textAlign="center">
                Add some products to get started
              </Text>
              <Button
                marginTop={8}
                {...primaryButtonProps}
                paddingHorizontal={24}
                onPress={() => router.push('/home')}
              >
                <Text color="white" fontWeight="700">Start Shopping</Text>
              </Button>
            </YStack>
          ) : (
            /* Cart summary card */
            <YStack
              backgroundColor="white"
              borderWidth={1}
              borderColor={COLORS.border}
              borderRadius={16}
              padding={16}
              gap={12}
            >
              {/* Customer Selection */}
              <YStack gap={6}>
                <Text fontSize={13} fontWeight="600" color={COLORS.label}>
                  Customer
                </Text>
                <XStack
                  alignItems="center"
                  gap={10}
                  padding={12}
                  borderRadius={12}
                  borderWidth={1}
                  borderColor={selectedCustomerId ? COLORS.accent : COLORS.border}
                  backgroundColor={selectedCustomerId ? COLORS.tint : 'white'}
                  pressStyle={{ opacity: 0.8 }}
                  onPress={() => {
                    setCustomerSearchQuery('');
                    setShowCustomerModal(true);
                  }}
                >
                  <Ionicons
                    name={selectedCustomerId ? 'person' : 'person-add-outline'}
                    size={18}
                    color={selectedCustomerId ? COLORS.accent : COLORS.muted}
                  />
                  <Text
                    flex={1}
                    color={selectedCustomerId ? COLORS.text : COLORS.muted}
                    fontWeight={selectedCustomerId ? '600' : '400'}
                    fontSize={15}
                    numberOfLines={1}
                  >
                    {selectedCustomerId
                      ? (customers.find(c => c.id === selectedCustomerId) ??
      (cart?.customer && cart.customer.id === selectedCustomerId ? cart.customer : undefined))?.name || 'Selected'
                      : 'Select Customer'
                    }
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
                </XStack>
              </YStack>

              {/* Discount/Notes Button */}
              {selectedCustomerId ? (
                <XStack
                  alignItems="center"
                  gap={8}
                  alignSelf="flex-start"
                  paddingHorizontal={12}
                  paddingVertical={8}
                  borderRadius={10}
                  borderWidth={1}
                  borderColor={COLORS.border}
                  backgroundColor="white"
                  pressStyle={{ backgroundColor: COLORS.pressed }}
                  onPress={() => setShowDiscountNotesModal(true)}
                >
                  <Ionicons name="pricetag-outline" size={16} color={COLORS.accent} />
                  <Text color={COLORS.text} fontWeight="600" fontSize={13}>
                    {discount ? `Discount: -${formatMoney(parseFloat(discount))}` : 'Add Discount/Notes'}
                  </Text>
                </XStack>
              ) : null}

              <YStack gap={8} borderTopWidth={1} borderTopColor={COLORS.border} paddingTop={12}>
                <XStack justifyContent="space-between">
                  <Text fontSize={14} color={COLORS.label}>
                    Total Items
                  </Text>
                  <Text fontSize={14} fontWeight="700" color={COLORS.text}>
                    {totalItems}
                  </Text>
                </XStack>

                {/* Discount Display */}
                {discount && parseFloat(discount) > 0 ? (
                  <XStack justifyContent="space-between">
                    <Text fontSize={14} color={COLORS.label}>
                      Discount
                    </Text>
                    <Text fontSize={14} fontWeight="600" color={COLORS.danger}>
                      -{formatMoney(parseFloat(discount))}
                    </Text>
                  </XStack>
                ) : null}

                <XStack justifyContent="space-between" alignItems="center">
                  <Text fontSize={15} fontWeight="700" color={COLORS.text}>
                    Total Amount
                  </Text>
                  <Text fontSize={20} fontWeight="800" color={COLORS.accent}>
                    {formatMoney(totalAmount - discountValueDisplay)}
                  </Text>
                </XStack>
              </YStack>

              {/* Selected items count */}
              {selectMode && selectedItems.length > 0 ? (
                <XStack alignItems="center" gap={8}>
                  <Badge>
                    {selectedItems.length} selected
                  </Badge>
                  <Button
                    size="$3"
                    {...primaryButtonProps}
                    onPress={handleAddSelectedToWaitlist}
                    disabled={waitlistLoading}
                  >
                    {waitlistLoading ? (
                      <Spinner size="small" color="white" />
                    ) : (
                      <XStack alignItems="center" gap={6}>
                        <Ionicons name="time-outline" size={16} color="white" />
                        <Text color="white" fontWeight="700" fontSize={13}>
                          Add Selected to Waitlist
                        </Text>
                      </XStack>
                    )}
                  </Button>
                </XStack>
              ) : null}
            </YStack>
          )}

          {/* Cart Items by Shop */}
          {!isEmpty && Object.entries(itemsByShop).map(([shopName, items]) => (
            <YStack key={shopName} gap={12} marginTop={4}>
              {/* Shop Header */}
              <XStack alignItems="center" gap={8}>
                <Ionicons name="storefront-outline" size={18} color={COLORS.muted} />
                <Text fontSize={16} fontWeight="700" color={COLORS.text}>
                  {shopName}
                </Text>
                <Badge>
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </Badge>
              </XStack>

              {/* Items for this shop */}
              {items.map((item) => (
                <YStack
                  key={item.id}
                  backgroundColor="white"
                  borderWidth={1}
                  borderColor={selectMode && selectedItems.includes(item.id) ? COLORS.accent : COLORS.border}
                  borderRadius={16}
                  padding={16}
                  gap={12}
                  shadowColor="#000"
                  shadowOffset={{ width: 0, height: 1 }}
                  shadowOpacity={0.05}
                  shadowRadius={4}
                  elevation={1}
                  opacity={selectMode && !selectedItems.includes(item.id) ? 0.7 : 1}
                >
                  {/* Product Header with Selection Checkbox */}
                  <XStack gap={12} alignItems="flex-start">
                    {selectMode ? (
                      <TouchableOpacity onPress={() => toggleItemSelection(item.id)}>
                        <YStack
                          width={24}
                          height={24}
                          borderRadius={6}
                          backgroundColor={selectedItems.includes(item.id) ? COLORS.accent : 'white'}
                          alignItems="center"
                          justifyContent="center"
                          borderWidth={1}
                          borderColor={selectedItems.includes(item.id) ? COLORS.accent : COLORS.border}
                        >
                          {selectedItems.includes(item.id) ? (
                            <Ionicons name="checkmark" size={16} color="white" />
                          ) : null}
                        </YStack>
                      </TouchableOpacity>
                    ) : null}

                    {item?.subProduct?.imageUrl || item?.product?.imageUrl || item?.product?.image ? (
                      <AppImage path={item.subProduct?.imageUrl || item.product?.imageUrl || item.product?.image} size={64} radius={12} bordered zoomable title={lineItemName(item.product, item.subProduct)} />
                    ) : null}
                    <YStack flex={1} gap={4}>
                      <Text fontSize={15} fontWeight="700" color={COLORS.text} numberOfLines={2}>
                        {lineItemName(item?.product, item?.subProduct)}
                      </Text>

                      {item.product?.unitOfMeasure ? (
                        <Text fontSize={13} color={COLORS.muted}>
                          Unit: {item?.product?.unitOfMeasure?.name || 'N/A'}
                        </Text>
                      ) : null}
                    </YStack>
                  </XStack>

                  {/* Quantity and Price Row */}
                  <XStack justifyContent="space-between" alignItems="center">
                    <YStack gap={4}>
                      <Text fontSize={12} color={COLORS.muted} fontWeight="500">
                        Quantity
                      </Text>
                      <XStack
                        alignItems="center"
                        gap={8}
                        paddingHorizontal={10}
                        paddingVertical={6}
                        borderRadius={10}
                        borderWidth={1}
                        borderColor={COLORS.border}
                        pressStyle={{ backgroundColor: COLORS.pressed }}
                        opacity={selectMode ? 0.5 : 1}
                        onPress={selectMode ? undefined : () => openQuantityModal(item)}
                      >
                        <Text fontSize={15} fontWeight="700" color={COLORS.text}>
                          {item?.quantity}
                        </Text>
                        <Ionicons name="create-outline" size={16} color={COLORS.accent} />
                      </XStack>
                    </YStack>

                    <YStack alignItems="flex-end" gap={4}>
                      <Text fontSize={12} color={COLORS.muted} fontWeight="500">
                        Unit Price
                      </Text>
                      <XStack
                        alignItems="center"
                        gap={8}
                        paddingHorizontal={10}
                        paddingVertical={6}
                        borderRadius={10}
                        borderWidth={1}
                        borderColor={COLORS.border}
                        pressStyle={{ backgroundColor: COLORS.pressed }}
                        opacity={selectMode ? 0.5 : 1}
                        onPress={selectMode ? undefined : () => openPriceModal(item)}
                      >
                        <Text fontSize={15} fontWeight="700" color={COLORS.text}>
                          {formatMoney(item.unitPrice || 0)}
                        </Text>
                        <Ionicons name="create-outline" size={16} color={COLORS.accent} />
                      </XStack>
                    </YStack>
                  </XStack>

                  {/* Total Price */}
                  <XStack
                    justifyContent="space-between"
                    alignItems="center"
                    borderTopWidth={1}
                    borderTopColor={COLORS.border}
                    paddingTop={12}
                  >
                    {/* Action Buttons - Hidden in select mode */}
                    {!selectMode ? (
                      <XStack
                        alignItems="center"
                        gap={6}
                        paddingHorizontal={12}
                        paddingVertical={6}
                        borderRadius={10}
                        borderWidth={1}
                        borderColor={COLORS.danger}
                        backgroundColor="white"
                        pressStyle={{ backgroundColor: COLORS.dangerTint }}
                        onPress={() => handleRemoveItem(item)}
                      >
                        <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                        <Text color={COLORS.danger} fontWeight="600" fontSize={13}>
                          Remove
                        </Text>
                      </XStack>
                    ) : (
                      <Text fontSize={14} color={COLORS.label}>Total</Text>
                    )}
                    <YStack alignItems="flex-end">
                      {!selectMode ? (
                        <Text fontSize={12} color={COLORS.muted}>Total</Text>
                      ) : null}
                      <Text fontSize={16} fontWeight="800" color={COLORS.text}>
                        {formatMoney(item.totalPrice || 0)}
                      </Text>
                    </YStack>
                  </XStack>
                </YStack>
              ))}
            </YStack>
          ))}

          {/* Cart Actions - Hidden in select mode */}
          {!isEmpty && !selectMode ? (
            <YStack gap={12} marginTop={8}>
              {/* Checkout Button */}
              <Button
                {...primaryButtonProps}
                onPress={handleCheckout}
                disabled={checkoutLoading}
                opacity={checkoutLoading ? 0.7 : 1}
                height={52}
              >
                {checkoutLoading ? (
                  <Spinner size="small" color="white" />
                ) : (
                  <XStack alignItems="center" gap={8}>
                    <Ionicons name="bag-check-outline" size={20} color="white" />
                    <Text color="white" fontWeight="700" fontSize={16}>
                      Checkout · {formatMoney(totalAmount - discountValueDisplay)}
                    </Text>
                  </XStack>
                )}
              </Button>

              <XStack gap={12}>
                {/* Waitlist Button */}
                <Button
                  flex={1}
                  {...secondaryButtonProps}
                  onPress={() => {
                    if (!selectedCustomerId) {
                      Alert.alert(
                        'Select Customer',
                        'Please select a customer before moving cart to waitlist.',
                        [
                          {
                            text: 'Cancel',
                            style: 'cancel',
                          },
                          {
                            text: 'Select Customer',
                            onPress: () => {
                              setShowCustomerModal(true);
                              setSearchQuery('');
                            },
                          },
                        ]
                      );
                      return;
                    }
                    setShowWaitlistModal(true);
                  }}
                  height={48}
                  disabled={waitlistLoading}
                >
                  {waitlistLoading ? (
                    <Spinner size="small" color={COLORS.accent} />
                  ) : (
                    <XStack alignItems="center" gap={6}>
                      <Ionicons name="time-outline" size={18} color={COLORS.accent} />
                      <Text color={COLORS.text} fontWeight="600" fontSize={14}>
                        Move to Waitlist
                      </Text>
                    </XStack>
                  )}
                </Button>

                {/* Clear Cart Button */}
                <Button
                  flex={1}
                  {...dangerButtonProps}
                  onPress={handleClearCart}
                  height={48}
                >
                  <XStack alignItems="center" gap={6}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                    <Text color={COLORS.danger} fontWeight="600" fontSize={14}>
                      Clear Cart
                    </Text>
                  </XStack>
                </Button>
              </XStack>

              {!selectedCustomerId ? (
                <XStack justifyContent="center" alignItems="center" gap={6}>
                  <Ionicons name="information-circle-outline" size={16} color={COLORS.muted} />
                  <Text fontSize={12} color={COLORS.muted} textAlign="center">
                    Select a customer to enable checkout and waitlist
                  </Text>
                </XStack>
              ) : null}
            </YStack>
          ) : null}
        </YStack>
      </ScrollView>

      {/* Customer Selection Modal with Search */}
      <Modal
        visible={showCustomerModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowCustomerModal(false);
          setCustomerSearchQuery('');
        }}
      >
        <YStack
          flex={1}
          justifyContent="center"
          alignItems="center"
          backgroundColor="rgba(0,0,0,0.5)"
          padding="$4"
        >
          <YStack {...modalCardProps} maxHeight="80%">
            <YStack gap={14}>
              <XStack alignItems="center" justifyContent="space-between">
                <Text fontSize={20} fontWeight="700" color={COLORS.text}>
                  Select Customer
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowCustomerModal(false);
                    setCustomerSearchQuery('');
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={22} color={COLORS.muted} />
                </TouchableOpacity>
              </XStack>

              {/* Search Input */}
              <XStack
                alignItems="center"
                gap={8}
                borderWidth={1}
                borderColor={COLORS.border}
                borderRadius={12}
                paddingHorizontal={12}
                backgroundColor="white"
              >
                <Ionicons name="search" size={18} color={COLORS.placeholder} />
                <Input
                  flex={1}
                  placeholder="Search by name or phone..."
                  placeholderTextColor={COLORS.placeholder}
                  value={customerSearchQuery}
                  onChangeText={setCustomerSearchQuery}
                  borderWidth={0}
                  backgroundColor="transparent"
                  color={COLORS.text}
                  paddingHorizontal={0}
                  focusStyle={{ borderWidth: 0 }}
                  autoFocus={true}
                />
              </XStack>

              {customersLoading ? (
                <YStack alignItems="center" padding={16}>
                  <Spinner size="large" color={COLORS.accent} />
                  <Text marginTop={8} color={COLORS.muted}>Loading customers...</Text>
                </YStack>
              ) : filteredCustomers.length === 0 ? (
                <YStack alignItems="center" padding={16} gap={12}>
                  <Ionicons name="people-outline" size={32} color={COLORS.placeholder} />
                  <Text color={COLORS.muted} textAlign="center">
                    {customerSearchQuery ? 'No customers found matching your search.' : 'No customers found. Please add a customer first.'}
                  </Text>
                  <Button
                    {...primaryButtonProps}
                    onPress={() => {
                      setShowCustomerModal(false);
                      setShowAddCustomerModal(true);
                    }}
                  >
                    <Text color="white" fontWeight="700">Add New Customer</Text>
                  </Button>
                </YStack>
              ) : (
                <ScrollView maxHeight={400} showsVerticalScrollIndicator={false}>
                  <YStack gap={8}>
                    {filteredCustomers.map((customer) => {
                      const isSelected = selectedCustomerId === customer.id;
                      return (
                        <XStack
                          key={customer.id}
                          alignItems="center"
                          gap={12}
                          padding={12}
                          backgroundColor={isSelected ? COLORS.tint : 'white'}
                          borderColor={isSelected ? COLORS.accent : COLORS.border}
                          borderWidth={1}
                          borderRadius={12}
                          onPress={() => {
                            setSelectedCustomerId(customer.id);
                            setShowCustomerModal(false);
                            setCustomerSearchQuery('');
                          }}
                          pressStyle={{ backgroundColor: isSelected ? COLORS.tint : COLORS.pressed }}
                        >
                          <YStack flex={1} gap={4}>
                            <Text color={COLORS.text} fontWeight="600" fontSize={15}>
                              {customer.name}
                            </Text>
                            <XStack gap={12} alignItems="center" flexWrap="wrap">
                              {customer.phone1 ? (
                                <XStack alignItems="center" gap={4}>
                                  <Ionicons name="call-outline" size={14} color={COLORS.muted} />
                                  <Text color={COLORS.muted} fontSize={13}>
                                    {customer?.phone1}
                                  </Text>
                                </XStack>
                              ) : null}
                              {customer.companyName ? (
                                <XStack alignItems="center" gap={4}>
                                  <Ionicons name="business-outline" size={14} color={COLORS.muted} />
                                  <Text color={COLORS.muted} fontSize={13}>
                                    {customer?.companyName}
                                  </Text>
                                </XStack>
                              ) : null}
                            </XStack>
                          </YStack>
                          {isSelected ? (
                            <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
                          ) : null}
                        </XStack>
                      );
                    })}
                  </YStack>
                </ScrollView>
              )}

              {/* Discount/Notes Apply Button */}
              {selectedCustomerId ? (
                <Button
                  {...secondaryButtonProps}
                  borderColor={COLORS.accent}
                  onPress={() => {
                    setShowCustomerModal(false);
                    setCustomerSearchQuery('');
                    setShowDiscountNotesModal(true);
                  }}
                >
                  <XStack alignItems="center" gap={6}>
                    <Ionicons name="pricetag-outline" size={16} color={COLORS.accent} />
                    <Text color={COLORS.accent} fontWeight="700">
                      Apply Discount & Notes
                    </Text>
                  </XStack>
                </Button>
              ) : null}

              <XStack gap={12}>
                <Button
                  flex={1}
                  {...secondaryButtonProps}
                  onPress={() => {
                    setShowCustomerModal(false);
                    setCustomerSearchQuery('');
                  }}
                >
                  <Text color={COLORS.text} fontWeight="600">Cancel</Text>
                </Button>
                <Button
                  flex={1}
                  {...primaryButtonProps}
                  onPress={() => {
                    setShowCustomerModal(false);
                    setShowAddCustomerModal(true);
                    setCustomerSearchQuery('');
                  }}
                >
                  <XStack alignItems="center" gap={6}>
                    <Ionicons name="add" size={18} color="white" />
                    <Text color="white" fontWeight="700">Add New</Text>
                  </XStack>
                </Button>
              </XStack>
            </YStack>
          </YStack>
        </YStack>
      </Modal>

      {/* Add Customer Modal */}
      <AddCustomerModal
        visible={showAddCustomerModal}
        onClose={() => setShowAddCustomerModal(false)}
        onCreateCustomer={handleCreateCustomer}
        loading={createCustomerLoading}
      />

      {/* Discount and Notes Modal */}
      <DiscountNotesModal
        visible={showDiscountNotesModal}
        onClose={() => setShowDiscountNotesModal(false)}
        onApply={handleApplyDiscountNotes}
        currentDiscount={discount ? parseFloat(discount) : 0}
        currentNotes={notes}
        totalAmount={totalAmount}
        loading={false}
      />

      {/* Add to Waitlist Modal */}
      <AddToWaitlistModal
        visible={showWaitlistModal}
        onClose={() => setShowWaitlistModal(false)}
        onConfirm={handleBulkAddToWaitlist}
        loading={waitlistLoading}
        cartInfo={{
          totalItems,
          totalAmount: totalAmount - (discount ? parseFloat(discount) : 0),
          customerName: selectedCustomer?.name
        }}
      />

      {/* Update Modals */}
      {selectedItem && (
        <>
          <QuantityUpdateModal
            item={selectedItem}
            visible={showQuantityModal}
            onClose={() => {
              setShowQuantityModal(false);
              setSelectedItem(null);
            }}
            onUpdateQuantity={handleUpdateQuantity}
          />

          <PriceUpdateModal
            item={selectedItem}
            visible={showPriceModal}
            onClose={() => {
              setShowPriceModal(false);
              setSelectedItem(null);
            }}
            onUpdatePrice={handleUpdatePrice}
          />
        </>
      )}
    </YStack>
  );
};

export default CartListViewScreen;
