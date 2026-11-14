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
import { changePasswordAction, clearError } from '@/(redux)/authSlice';
import type { AppDispatch } from '@/(redux)/store';

export default function PasswordChange() {
  const dispatch = useDispatch<AppDispatch>();
  const { loading, error } = useAppSelector((state) => state.auth);
  
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  
  const [validationErrors, setValidationErrors] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  
  const [showSuccess, setShowSuccess] = useState(false);

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
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    };

    let isValid = true;

    // Only basic validation for testing
    if (!formData.currentPassword.trim()) {
      errors.currentPassword = 'Current password is required';
      isValid = false;
    }

    if (!formData.newPassword.trim()) {
      errors.newPassword = 'New password is required';
      isValid = false;
    }

    if (!formData.confirmPassword.trim()) {
      errors.confirmPassword = 'Please confirm your new password';
      isValid = false;
    } else if (formData.newPassword !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
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

  const handleChangePassword = async () => {
    if (!validateForm()) {
      return;
    }
    try {
      await dispatch(changePasswordAction({
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      })).unwrap();

      // Success
      setShowSuccess(true);
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setValidationErrors({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });

      Alert.alert('Success', 'Password changed successfully!');

    } catch (error) {
      // Error is handled by the useEffect above
      console.error('Password change failed:', error);
    }
  };

  // Simplified validation - only check if all fields are filled and passwords match
  const isFormValid = 
    formData.currentPassword.trim() && 
    formData.newPassword.trim() && 
    formData.confirmPassword.trim() &&
    formData.newPassword === formData.confirmPassword;

  return (
    <ScrollView flex={1} backgroundColor="white">
      <YStack flex={1} padding={16} gap={16}>
        <YStack>
          <Text fontSize={22} fontWeight="700" color="#111827">
            Change Password
          </Text>
          <Text fontSize={14} color="#6B7280">
            Update your password (any password is allowed for testing)
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
              Password changed successfully!
            </Text>
          </XStack>
        )}

        <YStack {...cardStyle} gap={16}>
          {/* Current Password */}
          <Fieldset gap={6}>
            <Label htmlFor="currentPassword" color="#374151" fontSize={14} fontWeight="600" lineHeight={18}>
              Current Password
            </Label>
            <Input
              id="currentPassword"
              secureTextEntry
              value={formData.currentPassword}
              onChangeText={(text) => handleInputChange('currentPassword', text)}
              {...inputStyle(!!validationErrors.currentPassword, true)}
              placeholder="Enter your current password"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {validationErrors.currentPassword ? (
              <Text color="#DC2626" fontSize={12}>
                {validationErrors.currentPassword}
              </Text>
            ) : null}
          </Fieldset>

          {/* New Password */}
          <Fieldset gap={6}>
            <Label htmlFor="newPassword" color="#374151" fontSize={14} fontWeight="600" lineHeight={18}>
              New Password
            </Label>
            <Input
              id="newPassword"
              secureTextEntry
              value={formData.newPassword}
              onChangeText={(text) => handleInputChange('newPassword', text)}
              {...inputStyle(!!validationErrors.newPassword, true)}
              placeholder="Enter any new password (testing)"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {validationErrors.newPassword ? (
              <Text color="#DC2626" fontSize={12}>
                {validationErrors.newPassword}
              </Text>
            ) : null}
          </Fieldset>

          {/* Confirm Password */}
          <Fieldset gap={6}>
            <Label htmlFor="confirmPassword" color="#374151" fontSize={14} fontWeight="600" lineHeight={18}>
              Confirm New Password
            </Label>
            <Input
              id="confirmPassword"
              secureTextEntry
              value={formData.confirmPassword}
              onChangeText={(text) => handleInputChange('confirmPassword', text)}
              {...inputStyle(!!validationErrors.confirmPassword, true)}
              placeholder="Confirm your new password"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {validationErrors.confirmPassword ? (
              <Text color="#DC2626" fontSize={12}>
                {validationErrors.confirmPassword}
              </Text>
            ) : null}
          </Fieldset>

          {/* Simple Requirements */}
          <YStack
            backgroundColor="#F9FAFB"
            borderWidth={1}
            borderColor="#F3F4F6"
            borderRadius={12}
            padding={12}
            gap={6}
          >
            <Text fontSize={13} fontWeight="600" color="#374151">
              Basic requirements
            </Text>
            <CheckRow ok={!!formData.currentPassword} label="Current password entered" />
            <CheckRow ok={!!formData.newPassword} label="New password entered" />
            <CheckRow
              ok={formData.newPassword === formData.confirmPassword && !!formData.newPassword}
              label="Passwords match"
            />
          </YStack>

          {/* Submit Button */}
          <Button
            backgroundColor="$orange9"
            borderWidth={0}
            borderRadius={12}
            pressStyle={{ backgroundColor: '#E65F00' }}
            opacity={isFormValid ? 1 : 0.5}
            onPress={handleChangePassword}
            disabled={!isFormValid || loading}
            height={48}
          >
            {loading ? (
              <XStack alignItems="center" gap={8}>
                <Spinner size="small" color="white" />
                <Text color="white" fontWeight="700">Changing Password...</Text>
              </XStack>
            ) : (
              <Text color="white" fontWeight="700">Change Password</Text>
            )}
          </Button>

          {/* Clear Button */}
          <Button
            backgroundColor="white"
            borderWidth={1}
            borderColor="#E5E7EB"
            borderRadius={12}
            pressStyle={{ backgroundColor: '#F9FAFB' }}
            onPress={() => {
              setFormData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
              });
              setValidationErrors({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
              });
            }}
            disabled={loading}
          >
            <Text color="#111827" fontWeight="600">Clear Form</Text>
          </Button>
        </YStack>

        {/* Testing Notice */}
        <YStack {...cardStyle} gap={6}>
          <XStack alignItems="center" gap={8}>
            <Ionicons name="flask-outline" size={18} color="#FF6B00" />
            <Text fontSize={15} fontWeight="700" color="#111827">
              Testing Mode
            </Text>
          </XStack>
          <Text fontSize={13} color="#374151">
            • Any password is allowed (no complexity requirements)
          </Text>
          <Text fontSize={13} color="#374151">
            • Minimum 1 character passwords work
          </Text>
          <Text fontSize={13} color="#374151">
            • Same as current password is allowed
          </Text>
          <Text fontSize={12} color="#6B7280" fontStyle="italic">
            This is for testing purposes only
          </Text>
        </YStack>
      </YStack>
    </ScrollView>
  );
}
