import { TopSellingProduct } from '@/(services)/api/topSellingProducts';
import { Category } from '@/(services)/api/catagory';
import React, { useEffect, useState, useCallback } from 'react';
import { 
  Text, 
  XStack, 
  YStack, 
  Button, 
  ScrollView,
  Spinner,
  Image,
  Input,
} from 'tamagui';
import { useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney } from '@/(utils)/format';
import { useCategoriesStore, selectCategories, selectCategoriesLoading } from '@/(store)/useCategoriesStore';
import { useTopSellingProducts } from '@/hooks/useTopSellingProducts';
import debounce from 'lodash/debounce';
import AppImage from '@/components/AppImage'; // You'll need to install lodash or create a debounce utility

// Custom debounce hook
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  
  return debouncedValue;
};

const TopSellingProductsComponent = () => {
  const router = useRouter();
  
  // State for filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [visibleProducts, setVisibleProducts] = useState(6);
  const [searchFocused, setSearchFocused] = useState(false);
  
  // Use debounced search term (500ms delay)
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  
  // Build params object for the query - use debounced search term
  const params = {
    ...(debouncedSearchTerm.trim() && { searchTerm: debouncedSearchTerm.trim() }),
    ...(selectedCategory && { categoryId: selectedCategory }),
  };
  
  // Use React Query hook - ALWAYS FETCH (no enabled condition)
  const { 
    data, 
    isLoading, 
    isError, 
    error, 
    refetch 
  } = useTopSellingProducts(params);
  
  // Extract products from data
  const products = data?.products || [];
  const totalCount = data?.count || 0;
  
  // Categories store (keeping Zustand for categories)
  const categories = useCategoriesStore(selectCategories);
  const categoriesLoading = useCategoriesStore(selectCategoriesLoading);
  const fetchCategories = useCategoriesStore((state) => state.fetchCategories);

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Handle search button click
  const handleSearchClick = () => {
    setVisibleProducts(6);
    // No need to refetch - React Query will automatically refetch when params change
  };

  // Handle search input change
  const handleSearch = (text: string) => {
    setSearchTerm(text);
  };

  // Handle clear search
  const handleClearSearch = () => {
    setSearchTerm('');
    setSelectedCategory(null);
    setVisibleProducts(6);
    // No need to manually refetch - React Query handles it
  };

  // Debounced refetch function (only for manual trigger if needed)
  const debouncedRefetch = useCallback(
    debounce(() => {
      refetch();
    }, 300),
    [refetch]
  );

  // Use products directly from API response
  const displayedProducts = products.slice(0, visibleProducts);

  const handleCategoryPress = (categoryId: string, categoryName: string) => {
    router.push({
      pathname: '/home/subcategories' as any,
      params: { 
        categoryId,
        categoryName 
      }
    });
  };

  // Handle category selection for filtering
  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setVisibleProducts(6);
    // The hook will automatically refetch when params change
  };

  // Navigate directly to product details page
  const handleViewDetails = (product: TopSellingProduct) => {
    router.push({
      pathname: '/home/ProductDetails/[id]' as any,
      params: { 
        id: product.product.id,
        productId: product.product.id,
        productName: product.product.name,
        productGeneric: product.product.generic || '',
        productPrice: product.product.sellPrice,
        productImage: product.product.imageUrl,
      }
    });
  };

  // Check if we have any active filters
  const hasActiveFilters = debouncedSearchTerm.trim() !== '' || selectedCategory !== null;
  const isSearching = isLoading && hasActiveFilters;

  // Show loading state only when we have filters and are loading
  if ((isSearching || categoriesLoading) && (!data || hasActiveFilters)) return (
    <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="#FFFFFF">
      <Spinner size="large" color="#FF6B00" />
      <Text marginTop="$3" color="#6B7280" fontSize={14} fontWeight="500">
        {debouncedSearchTerm || selectedCategory ? 'Searching products...' : 'Loading products...'}
      </Text>
    </YStack>
  );

  if (isError) return (
    <YStack flex={1} justifyContent="center" alignItems="center" padding={16} gap={12} backgroundColor="#FFFFFF">
      <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
      <Text color="#111827" textAlign="center" fontSize={16} fontWeight="700">
        Could not load products
      </Text>
      <Text color="#6B7280" textAlign="center" fontSize={14}>
        {error?.message || 'Failed to load products'}
      </Text>
      <Button
        onPress={() => refetch()}
        backgroundColor="#FF6B00"
        borderWidth={0}
        borderRadius={12}
        pressStyle={{ backgroundColor: "#EA580C" }}
      >
        <Text color="white" fontWeight="700">Try Again</Text>
      </Button>
    </YStack>
  );

  const variantCount = (item: TopSellingProduct) =>
    item.product.subProductCount ?? item.product.subProducts?.length ?? 0;

  return (
    <ScrollView
      flex={1}
      showsVerticalScrollIndicator={false}
      backgroundColor="#FFFFFF"
    >
      <YStack gap={20} padding={16}>
        {/* Header */}
        <YStack gap={4}>
          <Text fontSize={24} fontWeight="800" color="#111827">
            Products
          </Text>
          <Text fontSize={14} color="#6B7280">
            Search the catalog or browse by category
          </Text>
        </YStack>

        {/* Search Bar */}
        <YStack gap={8}>
          <XStack alignItems="center" gap={8}>
            <XStack
              flex={1}
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
                placeholder="Search products..."
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
                onSubmitEditing={handleSearchClick}
                returnKeyType="search"
              />
              {hasActiveFilters ? (
                <TouchableOpacity
                  onPress={handleClearSearch}
                  disabled={isLoading}
                  style={{ paddingHorizontal: 10, paddingVertical: 8 }}
                  accessibilityLabel="Clear search and filters"
                >
                  <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              ) : null}
            </XStack>
            <Button
              backgroundColor="#FF6B00"
              borderWidth={0}
              borderRadius={12}
              onPress={handleSearchClick}
              pressStyle={{ backgroundColor: "#EA580C" }}
              disabled={isLoading}
            >
              <Text color="white" fontWeight="700">
                {isLoading ? "..." : "Search"}
              </Text>
            </Button>
          </XStack>

          {/* Active filters indicator */}
          {hasActiveFilters ? (
            <Text fontSize={13} color="#6B7280">
              {debouncedSearchTerm && selectedCategory
                ? `Searching for "${debouncedSearchTerm}" in selected category`
                : debouncedSearchTerm
                  ? `Searching for: "${debouncedSearchTerm}"`
                  : 'Showing filtered by category'
              }
              {totalCount > 0 ? ` • ${totalCount} results` : ''}
            </Text>
          ) : null}

          {/* Note from API */}
          {data?.note ? (
            <Text fontSize={13} color="#6B7280" fontStyle="italic">
              {data.note}
            </Text>
          ) : null}
        </YStack>

        {/* Categories */}
        {categories.length > 0 ? (
          <YStack gap={12}>
            <Text fontSize={18} fontWeight="700" color="#111827">
              Categories
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 16 }}
            >
              <XStack gap={8}>
                {categories.map((category: Category) => {
                  const selected = selectedCategory === category.id;
                  return (
                    <TouchableOpacity
                      key={category.id}
                      activeOpacity={0.7}
                      onPress={() => handleCategoryPress(category.id, category.name)}
                    >
                      <XStack
                        alignItems="center"
                        gap={8}
                        paddingLeft={category.image ? 6 : 14}
                        paddingRight={14}
                        paddingVertical={category.image ? 6 : 8}
                        borderRadius={999}
                        borderWidth={1}
                        backgroundColor={selected ? "#FFF7ED" : "#FFFFFF"}
                        borderColor={selected ? "#FF6B00" : "#E5E7EB"}
                      >
                        {category.image ? (
                          <AppImage path={category.image} size={28} radius={14} zoomable title={category.name} />
                        ) : null}
                        <Text
                          fontSize={14}
                          fontWeight="600"
                          color={selected ? "#FF6B00" : "#111827"}
                        >
                          {category.name}
                        </Text>
                      </XStack>
                    </TouchableOpacity>
                  );
                })}
              </XStack>
            </ScrollView>
          </YStack>
        ) : null}

        {/* Products Grid */}
        <YStack gap={12}>
          {products.length > 0 ? (
            <>
              <XStack alignItems="center" justifyContent="space-between">
                <Text fontSize={18} fontWeight="700" color="#111827">
                  {selectedCategory
                    ? 'Products in this category'
                    : debouncedSearchTerm
                      ? 'Search Results'
                      : 'Top Selling Products'
                  }
                </Text>
                <XStack backgroundColor="#FFF7ED" paddingHorizontal={10} paddingVertical={2} borderRadius={999}>
                  <Text fontSize={12} fontWeight="700" color="#FF6B00">
                    {products.length}
                  </Text>
                </XStack>
              </XStack>

              <XStack flexWrap="wrap" justifyContent="space-between" rowGap={12}>
                {displayedProducts.map((item: TopSellingProduct) => (
                  <TouchableOpacity
                    key={item.product.id}
                    style={{ width: '48.5%' }}
                    activeOpacity={0.8}
                    onPress={() => handleViewDetails(item)}
                  >
                    <YStack
                      width="100%"
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
                        <AppImage path={item.product.imageUrl} size={96} radius={8} resizeMode="contain" zoomable title={item.product.name} />
                      </YStack>

                      {/* Info */}
                      <YStack gap={2}>
                        {/* Full name, never cut off */}
                        <Text fontSize={14} fontWeight="700" color="#111827">
                          {item.product.name}
                        </Text>
                        {item.product.generic ? (
                          <Text fontSize={12} color="#6B7280" numberOfLines={1}>
                            {item.product.generic}
                          </Text>
                        ) : null}
                      </YStack>

                      <Text fontSize={15} fontWeight="800" color="#FF6B00">
                        {formatMoney(item.product.sellPrice)}
                      </Text>

                      {/* Category badge */}
                      <XStack gap={4} flexWrap="wrap">
                        <XStack backgroundColor="#F3F4F6" paddingHorizontal={8} paddingVertical={2} borderRadius={999}>
                          <Text fontSize={10} fontWeight="500" color="#374151" numberOfLines={1}>
                            {item.product.category.name}
                          </Text>
                        </XStack>
                        {variantCount(item) > 0 ? (
                          <XStack backgroundColor="#FFF7ED" paddingHorizontal={8} paddingVertical={2} borderRadius={999}>
                            <Text fontSize={10} fontWeight="700" color="#C2410C">
                              {variantCount(item)} variants
                            </Text>
                          </XStack>
                        ) : null}
                      </XStack>
                    </YStack>
                  </TouchableOpacity>
                ))}
              </XStack>
            </>
          ) : (
            <YStack alignItems="center" paddingVertical={40} paddingHorizontal={16} gap={12} backgroundColor="#FFFFFF" borderRadius={14} borderWidth={1} borderColor="#E5E7EB">
              <Ionicons name="cube-outline" size={36} color="#9CA3AF" />
              <Text fontSize={15} color="#111827" textAlign="center" fontWeight="600">
                {debouncedSearchTerm
                  ? `No products found for "${debouncedSearchTerm}"`
                  : selectedCategory
                    ? 'No products found in this category'
                    : 'No top-selling products available at the moment'
                }
              </Text>
              {hasActiveFilters ? (
                <Button
                  onPress={handleClearSearch}
                  backgroundColor="#FFFFFF"
                  borderColor="#E5E7EB"
                  borderWidth={1}
                  borderRadius={12}
                  pressStyle={{ backgroundColor: "#F9FAFB" }}
                >
                  <Text color="#111827" fontWeight="600">Clear Filters</Text>
                </Button>
              ) : null}
            </YStack>
          )}
        </YStack>

        {/* Load More Button - Only show if we have more products */}
        {products.length > visibleProducts ? (
          <YStack alignItems="center" paddingBottom={16}>
            <Button
              onPress={() => setVisibleProducts(prev => prev + 6)}
              backgroundColor="#FFFFFF"
              borderColor="#E5E7EB"
              borderWidth={1}
              borderRadius={12}
              pressStyle={{ backgroundColor: "#F9FAFB" }}
              paddingHorizontal={20}
            >
              <Text color="#111827" fontWeight="600" fontSize={14}>
                Load more ({products.length - visibleProducts} remaining)
              </Text>
            </Button>
          </YStack>
        ) : null}
      </YStack>
    </ScrollView>
  );
};

export default TopSellingProductsComponent;