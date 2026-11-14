import React, { useState, useCallback, memo } from 'react';
import { Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch } from 'react-redux';
import {
  Text,
  XStack,
  YStack,
  Button,
  ScrollView,
  Spinner,
  Avatar,
} from 'tamagui';
import { Ionicons } from '@expo/vector-icons';
import { useAppSelector } from '@/(redux)/hooks';
import type { AppDispatch } from '@/(redux)/store';
import { 
  logout, 
  logoutAction, 
  selectUserName, 
  selectAuthLoading, 
  selectUser 
} from "@/(redux)/authSlice";

type ProfileRoute = 'Profile' | 'Password' | 'Waitlists';

// 1. MEMOIZED SUB-COMPONENTS
// This prevents the menu items from re-rendering unless their props actually change.
const ProfileMenuItem = memo(({ 
  icon, 
  title, 
  onPress, 
  isDestructive = false,
  showArrow = true,
  disabled = false,
  isLast = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  onPress: () => void;
  isDestructive?: boolean;
  showArrow?: boolean;
  disabled?: boolean;
  isLast?: boolean;
}) => (
  <XStack
    alignItems="center"
    justifyContent="space-between"
    paddingHorizontal={16}
    paddingVertical={14}
    backgroundColor="white"
    borderBottomWidth={isLast ? 0 : 1}
    borderBottomColor="#F3F4F6"
    onPress={disabled ? undefined : onPress}
    opacity={disabled ? 0.5 : 1}
    pressStyle={{ backgroundColor: '#F9FAFB' }}
    cursor="pointer"
  >
    <XStack alignItems="center" gap={12}>
      <YStack
        width={36}
        height={36}
        borderRadius={10}
        alignItems="center"
        justifyContent="center"
        backgroundColor={isDestructive ? '#FEF2F2' : '#FFF7ED'}
      >
        <Ionicons name={icon} size={18} color={isDestructive ? '#DC2626' : '#FF6B00'} />
      </YStack>
      <Text fontSize={15} color={isDestructive ? '#DC2626' : '#111827'} fontWeight="600">
        {title}
      </Text>
    </XStack>
    {showArrow ? <Ionicons name="chevron-forward" size={18} color="#9CA3AF" /> : null}
  </XStack>
));

// Add this to fix ESLint react/display-name
ProfileMenuItem.displayName = 'ProfileMenuItem';

const UserInfoCard = memo(({ label, value }: { label: string; value: string }) => (
  <XStack justifyContent="space-between" alignItems="center" paddingVertical={10}>
    <Text fontSize={14} color="#6B7280">{label}</Text>
    <Text fontSize={14} color="#111827" fontWeight="600">{value}</Text>
  </XStack>
));

// Add this to fix ESLint react/display-name
UserInfoCard.displayName = 'UserInfoCard';

const Profile = () => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  // 2. ATOMIC SELECTORS
  // Using specific selectors prevents re-rendering the whole screen when the token changes
  const fullName = useAppSelector(selectUserName) || 'Guest';
  const user = useAppSelector(selectUser);
  const loading = useAppSelector(selectAuthLoading);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 3. USECALLBACK FOR STABLE FUNCTIONS
  const handleNavigation = useCallback((route: ProfileRoute) => {
    router.push(`/(tabs)/profile/${route}` as any);
  }, [router]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      setShowLogoutModal(false);
      
      // We clear the state immediately to make it feel instant
      await dispatch(logout()).unwrap();
      router.replace("/(auth)/login");
    } catch {
      dispatch(logoutAction());
      router.replace("/(auth)/login");
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (loading && !isLoggingOut) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="white">
        <Spinner size="large" color="$orange9" />
      </YStack>
    );
  }

  const roleValue = typeof user?.role === 'string' ? user.role : user?.role?.name || 'User';
  const branchValue = typeof user?.branch === 'string' ? user.branch : user?.branch?.name || 'Not assigned';

  return (
    <YStack flex={1} backgroundColor="white">
      <ScrollView flex={1} showsVerticalScrollIndicator={false}>
        <YStack gap={16} padding={16}>
          <YStack paddingBottom={4}>
            <Text fontSize={24} fontWeight="700" color="#111827">Profile</Text>
            <Text fontSize={14} color="#6B7280">Your account and settings</Text>
          </YStack>

          <YStack
            backgroundColor="white"
            borderWidth={1}
            borderColor="#E5E7EB"
            borderRadius={16}
            padding={16}
            gap={16}
            shadowColor="#000"
            shadowOpacity={0.05}
            shadowRadius={6}
            shadowOffset={{ width: 0, height: 2 }}
          >
            <XStack alignItems="center" gap={14}>
              <Avatar circular size="$7" backgroundColor="#FFF7ED">
                <Avatar.Image source={{ uri: 'https://th.bing.com/th/id/OIP.fFF1AOaet4ZcLFBIfM9SGAHaHa?pid=ImgDet&w=191&h=191&c=7' }} />
                <Avatar.Fallback backgroundColor="#FFF7ED" alignItems="center" justifyContent="center">
                  <Text color="#FF6B00" fontSize={22} fontWeight="700">{fullName.charAt(0).toUpperCase()}</Text>
                </Avatar.Fallback>
              </Avatar>
              <YStack flex={1} gap={2}>
                <Text fontSize={18} fontWeight="700" color="#111827" numberOfLines={1}>{fullName}</Text>
                {user?.email ? (
                  <Text fontSize={14} color="#6B7280" numberOfLines={1}>{user.email}</Text>
                ) : null}
              </YStack>
            </XStack>

            <YStack borderTopWidth={1} borderTopColor="#F3F4F6">
              <UserInfoCard label="Role" value={roleValue} />
              <YStack height={1} backgroundColor="#F3F4F6" />
              <UserInfoCard label="Branch" value={branchValue} />
            </YStack>
          </YStack>

          <YStack gap={8}>
            <Text fontSize={13} fontWeight="600" color="#6B7280" textTransform="uppercase" paddingHorizontal={4}>
              Account Settings
            </Text>
            <YStack
              backgroundColor="white"
              borderWidth={1}
              borderColor="#E5E7EB"
              borderRadius={16}
              overflow="hidden"
            >
              <ProfileMenuItem icon="person-outline" title="Account Information" onPress={() => handleNavigation('Profile')} disabled={isLoggingOut} />
              <ProfileMenuItem icon="lock-closed-outline" title="Change Password" onPress={() => handleNavigation('Password')} disabled={isLoggingOut} />
              <ProfileMenuItem icon="time-outline" title="Waitlist Information" onPress={() => handleNavigation('Waitlists')} disabled={isLoggingOut} isLast />
            </YStack>
          </YStack>

          <YStack
            backgroundColor="white"
            borderWidth={1}
            borderColor="#E5E7EB"
            borderRadius={16}
            overflow="hidden"
          >
            <ProfileMenuItem icon="log-out-outline" title="Log Out" onPress={() => setShowLogoutModal(true)} isDestructive showArrow={false} disabled={isLoggingOut} isLast />
          </YStack>
        </YStack>
      </ScrollView>

      {/* 4. LAZY MODAL RENDERING */}
      {showLogoutModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowLogoutModal(false)}>
           <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="rgba(0,0,0,0.5)">
             <YStack backgroundColor="white" borderRadius={16} padding={20} width="85%" maxWidth={400}>
                <YStack gap={12} alignItems="center">
                  <YStack width={48} height={48} borderRadius={24} backgroundColor="#FEF2F2" alignItems="center" justifyContent="center">
                    <Ionicons name="log-out-outline" size={22} color="#DC2626" />
                  </YStack>
                  <Text fontSize={18} fontWeight="700" color="#111827">Log Out?</Text>
                  <Text fontSize={14} color="#6B7280" textAlign="center">Are you sure you want to log out?</Text>
                  <XStack gap={12} width="100%" marginTop={8}>
                    <Button
                      flex={1}
                      backgroundColor="white"
                      borderWidth={1}
                      borderColor="#E5E7EB"
                      borderRadius={12}
                      pressStyle={{ backgroundColor: '#F9FAFB' }}
                      onPress={() => setShowLogoutModal(false)}
                    >
                      <Text color="#111827" fontWeight="600">Cancel</Text>
                    </Button>
                    <Button
                      flex={1}
                      backgroundColor="#DC2626"
                      borderWidth={0}
                      borderRadius={12}
                      pressStyle={{ backgroundColor: '#B91C1C' }}
                      onPress={handleLogout}
                      disabled={isLoggingOut}
                    >
                      {isLoggingOut ? <Spinner color="white" /> : <Text color="white" fontWeight="700">Log Out</Text>}
                    </Button>
                  </XStack>
                </YStack>
             </YStack>
           </YStack>
        </Modal>
      )}
    </YStack>
  );
};

export default Profile;