import React, { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ScrollView,
  Text,
  Button,
  Spinner,
  YStack,
  XStack,
} from 'tamagui';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSubCategoriesByCategory, SubCategoryList } from '@/(services)/api/subcatagorypro';
import AppImage from '@/components/AppImage';

export default function SubcategoriesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const categoryId = params.categoryId as string;
  const categoryName = params.categoryName as string;

  // Local state
  const [subCategories, setSubCategories] = useState<SubCategoryList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleSubCategories, setVisibleSubCategories] = useState(8);

  // Reset visible products when category changes
  useEffect(() => {
    setVisibleSubCategories(8);
  }, [categoryId]);

   const fetchSubCategories = useCallback(async () => {
    if (!categoryId) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await getSubCategoriesByCategory(categoryId);
      setSubCategories(response.subCategories || []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch subcategories");
      setSubCategories([]);
    } finally {
      setLoading(false);
    }
  }, [categoryId]); // categoryId is the only dependency

  useEffect(() => {
    if (categoryId) {
      fetchSubCategories();
    }

    return () => {
      // Cleanup if needed
    };
  }, [categoryId, fetchSubCategories]); 

  const handleSubCategoryPress = (subCategoryId: string, subCategoryName: string) => {
    // Navigate directly to products page for this subcategory
    router.push({
      pathname: '/home/subcategory-products' as any,
      params: {
        subCategoryId,
        subCategoryName,
        categoryId,
        categoryName
      }
    });
  };

  const handleBack = () => {
    router.back();
  };

  const handleLoadMore = () => {
    setVisibleSubCategories(prev => prev + 8);
  };

  const handleRetry = () => {
    if (categoryId) {
      fetchSubCategories();
    }
  };

  // Custom Badge component
  const Badge = ({ children, backgroundColor, ...props }: any) => (
    <YStack
      backgroundColor={backgroundColor}
      paddingHorizontal="$2"
      paddingVertical="$1"
      borderRadius="$2"
      alignItems="center"
      justifyContent="center"
      {...props}
    >
      {children}
    </YStack>
  );

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="#FFFFFF">
        <Spinner size="large" color="#FF6B00" />
        <Text marginTop="$3" color="#6B7280" fontSize={14} fontWeight="500">
          Loading subcategories...
        </Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding={16} gap={12} backgroundColor="#FFFFFF">
        <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
        <Text color="#111827" textAlign="center" fontSize={16} fontWeight="700">
          Could not load subcategories
        </Text>
        <Text color="#6B7280" textAlign="center" fontSize={14}>
          {error}
        </Text>
        <XStack gap={8}>
          <Button
            onPress={handleBack}
            backgroundColor="#FFFFFF"
            borderColor="#E5E7EB"
            borderWidth={1}
            borderRadius={12}
            pressStyle={{ backgroundColor: "#F9FAFB" }}
          >
            <Text color="#111827" fontWeight="600">Go Back</Text>
          </Button>
          <Button
            onPress={handleRetry}
            backgroundColor="#FF6B00"
            borderWidth={0}
            borderRadius={12}
            pressStyle={{ backgroundColor: "#EA580C" }}
          >
            <Text color="white" fontWeight="700">Try Again</Text>
          </Button>
        </XStack>
      </YStack>
    );
  }

  const displayedSubCategories = subCategories.slice(0, visibleSubCategories);

  return (
    <ScrollView flex={1} showsVerticalScrollIndicator={false} backgroundColor="#FFFFFF">
      <YStack gap={20} padding={16}>
        {/* Header Section */}
        <YStack gap={8} paddingBottom={12} borderBottomWidth={1} borderBottomColor="#E5E7EB">
          <TouchableOpacity onPress={handleBack} style={{ alignSelf: 'flex-start' }} accessibilityLabel="Back to categories">
            <XStack alignItems="center" gap={4} paddingVertical={4}>
              <Ionicons name="chevron-back" size={18} color="#FF6B00" />
              <Text color="#FF6B00" fontWeight="600" fontSize={14}>Back to Categories</Text>
            </XStack>
          </TouchableOpacity>
          <Text fontSize={24} fontWeight="800" color="#111827">
            {categoryName || 'Category'}
          </Text>
          <Text fontSize={14} color="#6B7280">
            Browse subcategories and products
          </Text>
        </YStack>

        {/* Subcategories heading */}
        <XStack justifyContent="space-between" alignItems="center">
          <YStack flex={1}>
            <Text fontSize={18} fontWeight="700" color="#111827">
              Subcategories
            </Text>
            <Text fontSize={13} color="#6B7280" marginTop={2}>
              {subCategories.length} subcategories available
            </Text>
          </YStack>
          <Badge backgroundColor="#FFF7ED" borderRadius={999} paddingHorizontal={10}>
            <Text fontSize={12} color="#FF6B00" fontWeight="700">
              {displayedSubCategories.length} of {subCategories.length}
            </Text>
          </Badge>
        </XStack>

        {/* Subcategories Grid - TWO COLUMN LAYOUT */}
        {subCategories.length > 0 ? (
          <YStack gap={12}>
            <XStack flexWrap="wrap" justifyContent="space-between" rowGap={12}>
              {displayedSubCategories.map((subCategory) => (
                <YStack key={subCategory.id} width="48.5%">
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleSubCategoryPress(subCategory.id, subCategory.name)}
                    style={{ flex: 1 }}
                  >
                    <YStack
                      flex={1}
                      minHeight={110}
                      backgroundColor="#FFFFFF"
                      borderWidth={1}
                      borderColor="#E5E7EB"
                      borderRadius={14}
                      padding={12}
                      gap={10}
                      justifyContent="space-between"
                      shadowColor="#000"
                      shadowOpacity={0.05}
                      shadowRadius={4}
                      shadowOffset={{ width: 0, height: 1 }}
                    >
                      <YStack gap={8}>
                        {subCategory.image ? (
                          <AppImage path={subCategory.image} width={140} height={84} radius={10} zoomable title={subCategory.name} />
                        ) : (
                          <YStack
                            width={32}
                            height={32}
                            borderRadius={8}
                            backgroundColor="#FFF7ED"
                            alignItems="center"
                            justifyContent="center"
                          >
                            <Ionicons name="pricetags-outline" size={16} color="#FF6B00" />
                          </YStack>
                        )}
                        <Text
                          fontSize={14}
                          fontWeight="700"
                          numberOfLines={2}
                          lineHeight={18}
                          color="#111827"
                        >
                          {subCategory.name}
                        </Text>
                      </YStack>

                      {/* View Products link */}
                      <XStack alignItems="center" gap={2}>
                        <Text fontSize={13} color="#FF6B00" fontWeight="600">
                          View Products
                        </Text>
                        <Ionicons name="chevron-forward" size={14} color="#FF6B00" />
                      </XStack>
                    </YStack>
                  </TouchableOpacity>
                </YStack>
              ))}
            </XStack>

            {/* Load More Button */}
            {subCategories.length > visibleSubCategories ? (
              <YStack alignItems="center" paddingVertical={8}>
                <Button
                  onPress={handleLoadMore}
                  backgroundColor="#FFFFFF"
                  borderColor="#E5E7EB"
                  borderWidth={1}
                  borderRadius={12}
                  pressStyle={{ backgroundColor: "#F9FAFB" }}
                  paddingHorizontal={20}
                >
                  <Text color="#111827" fontWeight="600" fontSize={14}>
                    Load more ({subCategories.length - visibleSubCategories} remaining)
                  </Text>
                </Button>
              </YStack>
            ) : null}
          </YStack>
        ) : (
          <YStack alignItems="center" paddingVertical={40} paddingHorizontal={16} gap={12} backgroundColor="#FFFFFF" borderRadius={14} borderWidth={1} borderColor="#E5E7EB">
            <Ionicons name="folder-open-outline" size={36} color="#9CA3AF" />
            <Text fontSize={16} color="#111827" textAlign="center" fontWeight="700">
              No subcategories found
            </Text>
            <Text fontSize={14} color="#6B7280" textAlign="center">
              {categoryName ? `There are no subcategories available for ${categoryName} at the moment.` : 'No subcategories available.'}
            </Text>
            <Button
              onPress={handleBack}
              backgroundColor="#FF6B00"
              borderWidth={0}
              borderRadius={12}
              pressStyle={{ backgroundColor: "#EA580C" }}
              paddingHorizontal={20}
            >
              <Text color="white" fontWeight="700" fontSize={14}>Go Back to Categories</Text>
            </Button>
          </YStack>
        )}
      </YStack>
    </ScrollView>
  );
}
