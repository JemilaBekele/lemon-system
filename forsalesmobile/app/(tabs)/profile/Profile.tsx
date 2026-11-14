import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import {
  ScrollView,
  YStack,
  Input,
  Fieldset,
  Label,
  Button,
  Text,
  XStack,
  Spinner
} from 'tamagui';
import { Ionicons } from '@expo/vector-icons';

const cardStyle = {
  backgroundColor: 'white',
  borderWidth: 1,
  borderColor: '#E5E7EB',
  borderRadius: 16,
  padding: 16,
} as const;

const inputStyle = (hasError: boolean, editable: boolean) => ({
  borderWidth: 1,
  borderColor: hasError ? '#DC2626' : '#E5E7EB',
  borderRadius: 12,
  backgroundColor: editable ? 'white' : '#F9FAFB',
  color: '#111827',
  placeholderTextColor: '#9CA3AF',
  focusStyle: { borderColor: hasError ? '#DC2626' : '#FF6B00' },
  height: 46,
  fontSize: 15,
}) as const;

const CheckRow = ({ ok, label }: { ok: boolean; label: string }) => (
  <XStack alignItems="center" gap={8}>
    <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={ok ? '#FF6B00' : '#9CA3AF'} />
    <Text color="#374151" fontSize={13}>{label}</Text>
  </XStack>
);
import { useDispatch } from 'react-redux';
import { useAppSelector } from '@/(redux)/hooks';
import { updateUserByIdAction, clearError } from '@/(redux)/authSlice';
import type { AppDispatch } from '@/(redux)/store';

export default function ProfileInfo() {
  const dispatch = useDispatch<AppDispatch>();
  const { user, loading, error } = useAppSelector((state) => state.auth);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });
  
  const [validationErrors, setValidationErrors] = useState({
    name: '',
    email: '',
    phone: '',
  });
  
  const [isEditing, setIsEditing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
      });
    }
  }, [user]);

  // Clear errors when component unmounts or when error changes
  useEffect(() => {
    if (error) {
      Alert.alert('Error', error);
      dispatch(clearError());
    }
  }, [error, dispatch]);

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  const validateForm = () => {
    const errors = {
      name: '',
      email: '',
      phone: '',
    };

    let isValid = true;

    // Name validation
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
      isValid = false;
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters long';
      isValid = false;
    }

    // Email validation
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
      isValid = false;
    }

   

    setValidationErrors(errors);
    return isValid;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error for this field when user starts typing
    if (validationErrors[field as keyof typeof validationErrors]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleUpdate = async () => {
    if (!validateForm()) {
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'User ID not found');
      return;
    }

    try {
      // Prepare update data - only include name, email, and phone fields
      const updatedData: Record<string, any> = {};
      
      if (formData.name !== user.name) updatedData.name = formData.name;
      if (formData.email !== user.email) updatedData.email = formData.email;
      if (formData.phone !== user.phone) updatedData.phone = formData.phone;

      // Only make API call if there are changes
      if (Object.keys(updatedData).length > 0) {
        await dispatch(updateUserByIdAction({
          userID: user.id,
          updatedData,
        })).unwrap();

        // Success
        setShowSuccess(true);
        setIsEditing(false);
        Alert.alert('Success', 'Profile updated successfully!');
      } else {
        Alert.alert('Info', 'No changes made to the profile');
        setIsEditing(false);
      }

    } catch (error) {
      // Error is handled by the useEffect above
      console.error('Profile update failed:', error);
    }
  };

  const handleCancel = () => {
    // Reset form to original user data
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
      });
    }
    setValidationErrors({
      name: '',
      email: '',
      phone: '',
    });
    setIsEditing(false);
  };

  const hasChanges = 
    formData.name !== user?.name ||
    formData.email !== user?.email ||
    formData.phone !== user?.phone;

  const isFormValid = 
    formData.name.trim() && 
    formData.email.trim() && 
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);

  return (
    <ScrollView flex={1} backgroundColor="white">
      <YStack flex={1} padding={16} gap={16}>
        <YStack>
          <Text fontSize={22} fontWeight="700" color="#111827">
            Account Information
          </Text>
          <Text fontSize={14} color="#6B7280">
            Update your personal information
          </Text>
        </YStack>

        {/* Success Message */}
        {showSuccess && (
          <XStack
            alignItems="center"
            gap={8}
            backgroundColor="#DCFCE7"
            borderRadius={12}
            padding={12}
          >
            <Ionicons name="checkmark-circle" size={18} color="#166534" />
            <Text color="#166534" fontWeight="600" fontSize={14}>
              Profile updated successfully!
            </Text>
          </XStack>
        )}

        <YStack {...cardStyle} gap={16}>
          {/* Name Field */}
          <Fieldset gap={6}>
            <Label htmlFor="name" color="#374151" fontSize={14} fontWeight="600" lineHeight={18}>
              Full Name *
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChangeText={(text) => handleInputChange('name', text)}
              {...inputStyle(!!validationErrors.name, isEditing)}
              placeholder="Enter your full name"
              editable={isEditing}
            />
            {validationErrors.name ? (
              <Text color="#DC2626" fontSize={12}>
                {validationErrors.name}
              </Text>
            ) : null}
          </Fieldset>

          {/* Email Field */}
          <Fieldset gap={6}>
            <Label htmlFor="email" color="#374151" fontSize={14} fontWeight="600" lineHeight={18}>
              Email Address *
            </Label>
            <Input
              id="email"
              value={formData.email}
              onChangeText={(text) => handleInputChange('email', text)}
              {...inputStyle(!!validationErrors.email, isEditing)}
              placeholder="Enter your email address"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={isEditing}
            />
            {validationErrors.email ? (
              <Text color="#DC2626" fontSize={12}>
                {validationErrors.email}
              </Text>
            ) : null}
          </Fieldset>

          {/* Phone Field */}
          <Fieldset gap={6}>
            <Label htmlFor="phone" color="#374151" fontSize={14} fontWeight="600" lineHeight={18}>
              Phone Number
            </Label>
            <Input
              id="phone"
              value={formData.phone}
              onChangeText={(text) => handleInputChange('phone', text)}
              {...inputStyle(!!validationErrors.phone, isEditing)}
              placeholder="Enter your phone number"
              keyboardType="phone-pad"
              editable={isEditing}
            />
            {validationErrors.phone ? (
              <Text color="#DC2626" fontSize={12}>
                {validationErrors.phone}
              </Text>
            ) : null}
          </Fieldset>

          {/* Read-only Information */}
          {!isEditing && (
            <YStack
              borderWidth={1}
              borderColor="#F3F4F6"
              backgroundColor="#F9FAFB"
              borderRadius={12}
              paddingHorizontal={12}
            >
              <XStack justifyContent="space-between" paddingVertical={10}>
                <Text color="#6B7280" fontSize={14}>Role</Text>
                <Text color="#111827" fontSize={14} fontWeight="600">
                  {user?.role || 'N/A'}
                </Text>
              </XStack>
              <YStack height={1} backgroundColor="#E5E7EB" />
              <XStack justifyContent="space-between" paddingVertical={10}>
                <Text color="#6B7280" fontSize={14}>Branch</Text>
                <Text color="#111827" fontSize={14} fontWeight="600">
                  {user?.branch?.name || 'N/A'}
                </Text>
              </XStack>
            </YStack>
          )}

          {/* Action Buttons */}
          {isEditing ? (
            <XStack gap={12}>
              <Button
                flex={1}
                backgroundColor="white"
                borderWidth={1}
                borderColor="#E5E7EB"
                borderRadius={12}
                pressStyle={{ backgroundColor: '#F9FAFB' }}
                onPress={handleCancel}
                disabled={loading}
              >
                <Text color="#111827" fontWeight="600">Cancel</Text>
              </Button>
              <Button
                flex={1}
                backgroundColor="$orange9"
                borderWidth={0}
                borderRadius={12}
                pressStyle={{ backgroundColor: '#E65F00' }}
                opacity={!isFormValid || !hasChanges || loading ? 0.5 : 1}
                onPress={handleUpdate}
                disabled={!isFormValid || !hasChanges || loading}
              >
                {loading ? (
                  <XStack alignItems="center" gap={8}>
                    <Spinner size="small" color="white" />
                    <Text color="white" fontWeight="700">Updating...</Text>
                  </XStack>
                ) : (
                  <Text color="white" fontWeight="700">Save Changes</Text>
                )}
              </Button>
            </XStack>
          ) : (
            <Button
              backgroundColor="$orange9"
              borderWidth={0}
              borderRadius={12}
              pressStyle={{ backgroundColor: '#E65F00' }}
              onPress={() => setIsEditing(true)}
              icon={<Ionicons name="create-outline" size={18} color="white" />}
            >
              <Text color="white" fontWeight="700">Edit Profile</Text>
            </Button>
          )}
        </YStack>

        {/* Form Status */}
        {isEditing && (
          <YStack {...cardStyle} padding={12} gap={6}>
            <Text fontSize={14} fontWeight="600" color="#111827">
              Form status
            </Text>
            <CheckRow ok={!!isFormValid} label="All required fields are valid" />
            <CheckRow ok={hasChanges} label="Changes made to form" />
          </YStack>
        )}

        {/* User Information Note */}
        <XStack gap={8} alignItems="flex-start" paddingHorizontal={4}>
          <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
          <Text flex={1} fontSize={12} color="#6B7280">
            * Required fields. Only name, email, and phone can be updated. Other information is managed by administrators.
          </Text>
        </XStack>
      </YStack>
    </ScrollView>
  );
}
