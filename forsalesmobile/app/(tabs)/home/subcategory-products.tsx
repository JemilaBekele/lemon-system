import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ScrollView,
  Text,
  Button,
  Spinner,
  YStack,
  XStack,
  Image,
  Input,
} from 'tamagui';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney } from '@/(utils)/format';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getProductsBySubCategoryId, Product } from '@/(services)/api/subcatagorypro';
import AppImage from '@/components/AppImage';

export default function SubcategoryProductsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();
  
  const subCategoryId = params.subCategoryId as string;
  const subCategoryName = params.subCategoryName as string;

  // Local state
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleProducts, setVisibleProducts] = useState(6);
  const [searchFocused, setSearchFocused] = useState(false);

  // Use React Query for data fetching
const {
  data: productsData,
  isLoading,
  error,
  refetch,
} = useQuery({
  queryKey: ['subcategory-products', subCategoryId],
  queryFn: () => getProductsBySubCategoryId(subCategoryId),
  enabled: !!subCategoryId, // Only run query if subCategoryId exists
  staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  gcTime: 10 * 60 * 1000, // Keep cache for 10 minutes (formerly cacheTime)
});

  const products = productsData?.products || [];

  const handleBack = () => {
    router.back();
  };

  const handleLoadMore = () => {
    setVisibleProducts(prev => prev + 6);
  };

  const handleSearch = (text: string) => {
    setSearchTerm(text);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setVisibleProducts(6);
  };

  const handleRetry = () => {
    refetch();
  };

  const handleCardClick = (currentIndex: number) => {
    const currentProduct = displayedProducts[currentIndex];
    
    if (!currentProduct) {
      console.log('Current product not found');
      return;
    }
    
    // Prefetch product details if needed
    queryClient.prefetchQuery({
      queryKey: ['product-details', currentProduct.id],
      queryFn: () => Promise.resolve(currentProduct), // You would replace this with actual API call
    });
    
    // Navigate to the CURRENT product details
    router.push({
      pathname: '/home/ProductDetails/[id]' as any,
      params: { 
        id: currentProduct.id,
        productId: currentProduct.id,
        productName: currentProduct.name,
        productGeneric: currentProduct.generic || '',
        productPrice: currentProduct.sellPrice,
        productImage: currentProduct.imageUrl,
        productCode: currentProduct.productCode,
        productDescription: currentProduct.description || '',
        categoryName: currentProduct.category?.name || '',
        subCategoryName: currentProduct.subCategory?.name || '',
        unitOfMeasure: currentProduct.unitOfMeasure?.name || '',
      }
    });
  };

  // Filter products based on search term
  const filteredProducts = products.filter(product => 
    searchTerm === '' ||
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.generic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.productCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const displayedProducts = filteredProducts.slice(0, visibleProducts);

  if (isLoading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="#FFFFFF">
        <Spinner size="large" color="#FF6B00" />
        <Text marginTop="$3" color="#6B7280" fontSize={14} fontWeight="500">
          Loading products...
        </Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding={16} gap={12} backgroundColor="#FFFFFF">
        <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
        <Text color="#111827" textAlign="center" fontSize={16} fontWeight="700">
          Could not load products
        </Text>
        <Text color="#6B7280" textAlign="center" fontSize={14}>
          {error.message || 'Failed to load products'}
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

  return (
    <ScrollView
      flex={1}
      showsVerticalScrollIndicator={false}
      backgroundColor="#FFFFFF"
    >
      <YStack gap={20} padding={16}>
        {/* Header Section */}
        <YStack gap={8} paddingBottom={12} borderBottomWidth={1} borderBottomColor="#E5E7EB">
          <TouchableOpacity onPress={handleBack} style={{ alignSelf: 'flex-start' }} accessibilityLabel="Go back">
            <XStack alignItems="center" gap={4} paddingVertical={4}>
              <Ionicons name="chevron-back" size={18} color="#FF6B00" />
              <Text color="#FF6B00" fontWeight="600" fontSize={14}>Back</Text>
            </XStack>
          </TouchableOpacity>
          <Text fontSize={24} fontWeight="800" color="#111827">
            {subCategoryName}
          </Text>
          <Text fontSize={14} color="#6B7280">
            {products.length} products available
          </Text>
        </YStack>

        {/* Search Bar */}
        <YStack gap={8}>
          <XStack
            alignItems="center"
            backgroundColor="#FFFFFF"
            borderWidth={1}
            borderColor={searchFocused ? "#FF6B00" : "#E5E7EB"}
            borderRadius={12}
            paddingLeft={12}
          >
            <Ionicons name="search" size={18} color="#6B7280" />
            <Input
              flex={1}
              placeholder={`Search in ${subCategoryName}...`}
              value={searchTerm}
              onChangeText={handleSearch}
              backgroundColor="transparent"
              borderWidth={0}
              paddingHorizontal={10}
              fontSize={15}
              color="#111827"
              placeholderTextColor="#9CA3AF"
              focusStyle={{ borderWidth: 0 }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            {searchTerm ? (
              <TouchableOpacity
                onPress={handleClearSearch}
                style={{ paddingHorizontal: 10, paddingVertical: 8 }}
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            ) : null}
          </XStack>
          {searchTerm ? (
            <Text fontSize={13} color="#6B7280">
              Showing results for: &quot;{searchTerm}&quot;
            </Text>
          ) : null}
        </YStack>

        {/* Products Grid */}
        <XStack flexWrap="wrap" justifyContent="space-between" rowGap={12}>
          {displayedProducts.map((product: Product, index: number) => (
            <YStack key={product.id} width="48.5%">
              <TouchableOpacity activeOpacity={0.8} onPress={() => handleCardClick(index)}>
                <YStack
                  backgroundColor="#FFFFFF"
                  borderWidth={1}
                  borderColor="#E5E7EB"
                  borderRadius={14}
                  padding={12}
                  gap={8}
                  shadowColor="#000"
                  shadowOpacity={0.05}
                  shadowRadius={4}
                  shadowOffset={{ width: 0, height: 1 }}
                >
                  {/* Product Image */}
                  <YStack
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor="#F9FAFB"
                    borderRadius={10}
                    height={110}
                  >
                    <AppImage path={product.imageUrl} size={96} radius={8} resizeMode="contain" zoomable title={product.name} />
                  </YStack>

                  {/* Product Info */}
                  <YStack gap={2}>
                    {/* Full name, never cut off */}
                    <Text fontSize={14} fontWeight="700" color="#111827">
                      {product.name}
                    </Text>
                    {product.generic ? (
                      <Text fontSize={12} color="#6B7280" numberOfLines={1}>
                        {product.generic}
                      </Text>
                    ) : null}
                  </YStack>

                  <Text fontSize={15} fontWeight="800" color="#FF6B00">
                    {formatMoney(product.sellPrice)}
                  </Text>

                  {product.category ? (
                    <XStack>
                      <XStack backgroundColor="#F3F4F6" paddingHorizontal={8} paddingVertical={2} borderRadius={999}>
                        <Text fontSize={10} fontWeight="500" color="#374151" numberOfLines={1}>
                          {product.category.name}
                        </Text>
                      </XStack>
                    </XStack>
                  ) : null}
                </YStack>
              </TouchableOpacity>
            </YStack>
          ))}
        </XStack>

        {/* Load More Button */}
        {filteredProducts.length > visibleProducts ? (
          <YStack alignItems="center" paddingBottom={16}>
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
                Load more ({filteredProducts.length - visibleProducts} remaining)
              </Text>
            </Button>
          </YStack>
        ) : null}

        {/* Empty State */}
        {products.length === 0 ? (
          <YStack alignItems="center" paddingVertical={40} paddingHorizontal={16} gap={12} backgroundColor="#FFFFFF" borderRadius={14} borderWidth={1} borderColor="#E5E7EB">
            <Ionicons name="cube-outline" size={36} color="#9CA3AF" />
            <Text fontSize={16} color="#111827" textAlign="center" fontWeight="700">
              No products found
            </Text>
            <Text fontSize={14} color="#6B7280" textAlign="center">
              There are no products available in {subCategoryName} at the moment.
            </Text>
            <Button
              onPress={handleBack}
              backgroundColor="#FF6B00"
              borderWidth={0}
              borderRadius={12}
              pressStyle={{ backgroundColor: "#EA580C" }}
              paddingHorizontal={20}
            >
              <Text color="white" fontWeight="700" fontSize={14}>Go Back to Subcategories</Text>
            </Button>
          </YStack>
        ) : null}

        {/* No Search Results */}
        {products.length > 0 && filteredProducts.length === 0 ? (
          <YStack alignItems="center" paddingVertical={40} paddingHorizontal={16} gap={12} backgroundColor="#FFFFFF" borderRadius={14} borderWidth={1} borderColor="#E5E7EB">
            <Ionicons name="search-outline" size={36} color="#9CA3AF" />
            <Text fontSize={16} color="#111827" textAlign="center" fontWeight="700">
              No products found for &quot;{searchTerm}&quot;
            </Text>
            <Text fontSize={14} color="#6B7280" textAlign="center">
              Try adjusting your search terms
            </Text>
            <Button
              onPress={handleClearSearch}
              backgroundColor="#FFFFFF"
              borderColor="#E5E7EB"
              borderWidth={1}
              borderRadius={12}
              pressStyle={{ backgroundColor: "#F9FAFB" }}
              paddingHorizontal={20}
            >
              <Text color="#111827" fontWeight="600" fontSize={14}>Clear Search</Text>
            </Button>
          </YStack>
        ) : null}
      </YStack>
    </ScrollView>
  );
}
