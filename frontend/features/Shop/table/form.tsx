/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import SelectReac from 'react-select';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { ISell, ISellItem, ItemSaleStatus } from '@/models/Sell';
import { IAdditionalPrice, IProduct, ISubProduct } from '@/models/Product';
import { ICustomer } from '@/models/customer';
import { updateSell } from '@/service/Sell';
import { getCustomer } from '@/service/customer';
import { ActivegetProducts, getProductByShops } from '@/service/Product';
import { getShopsBasedOnUser } from '@/service/shop';
import { IShop } from '@/models/shop';
import { IProductShopAvailability } from '../list';

// Schema for sell update (excluding status fields)
const formSchema = z.object({
  customerId: z.string().optional(),
  branchId: z.string().optional(),
  notes: z.string().optional(),
  saleDate: z.string().min(1, 'Sale date is required'),
  discount: z.coerce.number().min(0, 'Discount cannot be negative'),
  vat: z.coerce.number().min(0, 'VAT cannot be negative')
});

// Extended sell item type for form handling with subproduct support
interface FormSellItem
  extends Omit<
    ISellItem,
    'id' | 'sellId' | 'createdAt' | 'updatedAt' | 'subProduct' | 'subProductId'
  > {
  id?: string;
  tempId: string;

  selectedPrice?: number;
  priceLabel?: string;
  availableQuantity?: number;

  subProductId?: string | null;

  subProduct?: {
    id: string;
    name: string;
    subProductCode: string;
  } | null;
}


// Extended product type with subproducts
interface ExtendedProduct extends IProduct {
  subProducts?: ISubProduct[];
}

// Option type for react-select
interface ProductOption {
  value: string;
  label: string;
  data: {
    type: 'product' | 'subproduct';
    productId: string;
    subProductId?: string;
    product: ExtendedProduct;
    subProduct?: ISubProduct;
    name: string;
    unitOfMeasureId: string;
  };
  searchText: string;
}

export default function SalesUpdateForm({
  initialData,
  pageTitle,
  products: initialProducts
}: {
  initialData: ISell | null;
  pageTitle: string;
  products: IProduct[];
}) {
  const router = useRouter();
  const [customers, setCustomers] = useState<ICustomer[]>([]);
  const [shops, setShops] = useState<IShop[]>([]);
  const [products, setProducts] = useState<ExtendedProduct[]>(initialProducts as ExtendedProduct[]);
  const [cartItems, setCartItems] = useState<FormSellItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Updated state for product/subproduct selection
  const [selectedItemType, setSelectedItemType] = useState<'product' | 'subproduct' | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ExtendedProduct | null>(null);
  const [selectedSubProduct, setSelectedSubProduct] = useState<ISubProduct | null>(null);
  const [selectedShop, setSelectedShop] = useState<IShop | null>(null);
  const [shopAvailability, setShopAvailability] = useState<IProductShopAvailability | null>(null);
  const [selectedPriceOption, setSelectedPriceOption] = useState<string>('custom');
  const [customPrice, setCustomPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingItem, setEditingItem] = useState<FormSellItem | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: useMemo(
      () => ({
        customerId: initialData?.customerId || '',
        branchId: initialData?.branchId || '',
        notes: initialData?.notes || '',
        saleDate: initialData?.saleDate
          ? new Date(initialData.saleDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        discount: initialData?.discount || 0,
        vat: initialData?.vat || 0
      }),
      [initialData]
    )
  });

  const discount =
    useWatch({
      control: form.control,
      name: 'discount'
    }) || 0;

  const vat =
    useWatch({
      control: form.control,
      name: 'vat'
    }) || 0;

  const calculatedTotals = useMemo(() => {
    const subTotal = cartItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const discountValue = Number(discount) || 0;
    const vatValue = Number(vat) || 0;
    const grandTotal = subTotal - discountValue + vatValue;

    return {
      subTotal,
      discount: discountValue,
      vat: vatValue,
      grandTotal,
      totalProducts: cartItems.length
    };
  }, [cartItems, discount, vat]);

  // Fetch additional data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const customersData = await getCustomer();
        setCustomers(customersData);

        const shopsData = await getShopsBasedOnUser();
        setShops(shopsData);

        const productsData = await ActivegetProducts();
        setProducts(productsData as ExtendedProduct[]);
      } catch {
        toast.error('Failed to load required data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Initialize cart items from initial data
  useEffect(() => {
    if (initialData?.items) {
      const formattedItems: FormSellItem[] = initialData.items.map((item) => ({
        ...item,
        tempId: item.id,
        selectedPrice: item.unitPrice,
        priceLabel: item.subProductId ? 'SubProduct Price' : 'Base Price',
        availableQuantity: item.quantity,
        subProductId: item.subProductId,
        subProduct: item.subProduct
      }));
      setCartItems(formattedItems);
    }
  }, [initialData]);

  // Fetch shop availability when product/subproduct is selected
  useEffect(() => {
    const fetchShopAvailability = async () => {
      if (!selectedProduct) return;

      try {
        setLoading(true);
        // Pass subProductId if a subproduct is selected
        const availabilityData = await getProductByShops(
          selectedProduct.id,
          selectedSubProduct?.id
        );
        setShopAvailability(availabilityData);
      } catch {
        toast.error('Failed to fetch product availability');
      } finally {
        setLoading(false);
      }
    };

    if (selectedProduct) {
      fetchShopAvailability();
    }
  }, [selectedProduct, selectedSubProduct]);

  const getAvailableStockForSelectedShop = useCallback((): number => {
    if (!selectedShop || !shopAvailability) return 0;

    const shopStock = shopAvailability.shops.find(
      (shop) => shop.shopId === selectedShop.id
    );
    return shopStock?.quantity || 0;
  }, [selectedShop, shopAvailability]);

  const getAdditionalPricesForSelectedShop = useCallback((): IAdditionalPrice[] => {
    if (!selectedShop || !shopAvailability) return [];

    const shopStock = shopAvailability.shops.find(
      (shop) => shop.shopId === selectedShop.id
    );
    return shopStock?.additionalPrices || [];
  }, [selectedShop, shopAvailability]);

  const getUnitPrice = useCallback((): number => {
    if (!selectedProduct) return 0;

    if (selectedPriceOption === 'custom') {
      return parseFloat(customPrice) || 0;
    } else {
      const additionalPrice = getAdditionalPricesForSelectedShop().find(
        (option) => option.id === selectedPriceOption
      );
      return additionalPrice?.price || 0;
    }
  }, [
    selectedProduct,
    selectedPriceOption,
    customPrice,
    getAdditionalPricesForSelectedShop
  ]);

  const handleQuantityChange = useCallback(
    (newQuantity: number) => {
      const availableStock = getAvailableStockForSelectedShop();

      if (newQuantity < 1) {
        setQuantity(1);
        return;
      }

      if (newQuantity > availableStock) {
        setQuantity(availableStock);
        return;
      }

      setQuantity(newQuantity);
    },
    [getAvailableStockForSelectedShop]
  );

  const resetProductModal = useCallback(() => {
    setEditingItem(null);
    setSelectedItemType(null);
    setSelectedProduct(null);
    setSelectedSubProduct(null);
    setSelectedShop(null);
    setSelectedPriceOption('custom');
    setCustomPrice('');
    setShopAvailability(null);
    setQuantity(1);
  }, []);

  const handleAddProductToCart = useCallback(() => {
    if (!selectedProduct || !selectedShop) return;

    const unitPrice = getUnitPrice();
    
    // Determine price label
    let priceLabel = 'Custom Price';
    if (selectedPriceOption !== 'custom') {
      const additionalPrice = getAdditionalPricesForSelectedShop().find(
        (opt) => opt.id === selectedPriceOption
      );
      priceLabel = additionalPrice?.label || 'Additional Price';
    }

    const availableQuantity = getAvailableStockForSelectedShop();

    if (editingItem) {
      // Update existing item
      const updatedItem: FormSellItem = {
        ...editingItem,
        productId: selectedProduct.id,
        subProductId: selectedSubProduct?.id || null,
        shopId: selectedShop.id,
        unitOfMeasureId: selectedProduct.unitOfMeasureId,
        quantity,
        unitPrice,
        totalPrice: unitPrice * quantity,
        product: selectedProduct,
        subProduct: selectedSubProduct || undefined,
        shop: selectedShop,
        unitOfMeasure: selectedProduct.unitOfMeasure,
        selectedPrice: unitPrice,
        priceLabel,
        availableQuantity
      };

      setCartItems((prev) =>
        prev.map((item) =>
          item.tempId === editingItem.tempId ? updatedItem : item
        )
      );
    } else {
      // Add new item
      const newItem: FormSellItem = {
        tempId: `new-${Date.now()}`,
        productId: selectedProduct.id,
        subProductId: selectedSubProduct?.id || null,
        shopId: selectedShop.id,
        unitOfMeasureId: selectedProduct.unitOfMeasureId,
        itemSaleStatus: ItemSaleStatus.PENDING,
        quantity,
        unitPrice,
        totalPrice: unitPrice * quantity,
        product: selectedProduct,
        subProduct: selectedSubProduct || undefined,
        shop: selectedShop,
        unitOfMeasure: selectedProduct.unitOfMeasure,
        selectedPrice: unitPrice,
        priceLabel,
        availableQuantity
      };

      setCartItems((prev) => [...prev, newItem]);
    }

    resetProductModal();
    setShowProductModal(false);
  }, [
    selectedProduct,
    selectedSubProduct,
    selectedShop,
    getUnitPrice,
    selectedPriceOption,
    getAdditionalPricesForSelectedShop,
    getAvailableStockForSelectedShop,
    editingItem,
    quantity,
    resetProductModal
  ]);

  const handleEditItem = useCallback((item: FormSellItem) => {
    setEditingItem(item);
    
    // Find the product and subproduct
    const product = products.find(p => p.id === item.productId) || null;
    const subProduct = item.subProductId 
      ? product?.subProducts?.find(sp => sp.id === item.subProductId) 
      : null;
    
    setSelectedProduct(product);
    setSelectedSubProduct(subProduct || null);
    setSelectedItemType(subProduct ? 'subproduct' : 'product');
    setSelectedShop(item.shop || null);
    setCustomPrice(item.unitPrice.toString());
    setQuantity(item.quantity);
    setSelectedPriceOption('custom');
    setShowProductModal(true);
  }, [products]);

  const updateCartItem = useCallback(
    (tempId: string, updates: Partial<FormSellItem>) => {
      setCartItems((prev) =>
        prev.map((item) =>
          item.tempId === tempId ? { ...item, ...updates } : item
        )
      );
    },
    []
  );

  const removeCartItem = useCallback((tempId: string) => {
    setCartItems((prev) => prev.filter((item) => item.tempId !== tempId));
  }, []);

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    if (cartItems.length === 0) {
      toast.error('Please add at least one product to the sale');
      return;
    }

    try {
      setLoading(true);
      const subTotal = cartItems.reduce(
        (sum, item) => sum + item.totalPrice,
        0
      );
      const discountValue = Number(data.discount) || 0;
      const vatValue = Number(data.vat) || 0;
      const grandTotal = subTotal - discountValue + vatValue;
      
      const updateData = {
        ...data,
        items: cartItems.map((item) => ({
          id: item.id,
          productId: item.productId,
          subProductId: item.subProductId,
          shopId: item.shopId,
          unitOfMeasureId: item.unitOfMeasureId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          itemSaleStatus: item.itemSaleStatus
        })),
        totalProducts: calculatedTotals.totalProducts,
        subTotal: calculatedTotals.subTotal,
        discount: discountValue,
        vat: vatValue,
        grandTotal: grandTotal,
        NetTotal: grandTotal
      };

      await updateSell(initialData!.id, updateData);
      toast.success('Sale updated successfully');
      router.refresh();
      router.push('/dashboard/Sell');
    } catch (error: any) {
      toast.error(error?.message || 'Error updating sale');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = useCallback((price: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB'
    }).format(price);
  }, []);

  // Generate product options with subproducts
  const productOptions = useMemo(() => {
    const options: ProductOption[] = [];

    products.forEach((product) => {
      // Add main product option
      options.push({
        value: product.id,
        label: `${product.name} ${product.generic ? `(${product.generic})` : ''} [Product]`,
        data: {
          type: 'product',
          productId: product.id,
          product,
          name: product.name,
          unitOfMeasureId: product.unitOfMeasureId
        },
        searchText: `${product.name} ${product.generic || ''} ${product.productCode} product`.toLowerCase()
      });

      // Add subproduct options if they exist
      if (product.subProducts && product.subProducts.length > 0) {
        product.subProducts.forEach((subProduct) => {
          if (subProduct.isActive) {
            options.push({
              value: `${product.id}-${subProduct.id}`,
              label: `${product.name} - ${subProduct.name} [SubProduct]`,
              data: {
                type: 'subproduct',
                productId: product.id,
                subProductId: subProduct.id,
                product,
                subProduct,
                name: `${product.name} - ${subProduct.name}`,
                unitOfMeasureId: product.unitOfMeasureId
              },
              searchText: `${product.name} ${subProduct.name} ${product.generic || ''} ${product.productCode} subproduct`.toLowerCase()
            });
          }
        });
      }
    });

    return options;
  }, [products]);

  const handleProductSelect = useCallback((selectedOption: ProductOption | null) => {
    if (!selectedOption) {
      setSelectedItemType(null);
      setSelectedProduct(null);
      setSelectedSubProduct(null);
      setSelectedShop(null);
      return;
    }

    const { type, product, subProduct } = selectedOption.data;
    
    setSelectedItemType(type);
    setSelectedProduct(product);
    setSelectedSubProduct(subProduct || null);
    setSelectedShop(null);
    setCustomPrice('');
    setSelectedPriceOption('custom');
  }, []);

  if (!initialData) {
    return <div>Loading...</div>;
  }

  const availableStock = getAvailableStockForSelectedShop();
  const unitPrice = getUnitPrice();
  const totalPrice = unitPrice * quantity;
  const additionalPrices = getAdditionalPricesForSelectedShop();

  return (
    <Card className='mx-auto w-full'>
      <CardHeader>
        <CardTitle className='flex items-center justify-between'>
          <span>{pageTitle}</span>
          <span className='text-sm font-normal text-gray-500'>
            Invoice: {initialData.invoiceNo}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            {/* Basic Information */}
            <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
              <div className='space-y-4'>
                <FormField
                  name='customerId'
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select customer' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers.map((customer) => (
                            <SelectItem
                              key={customer.id}
                              value={customer.id ?? ''}
                            >
                              {customer.name}{' '}
                              {customer.companyName &&
                                `- ${customer.companyName}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name='saleDate'
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sale Date</FormLabel>
                      <FormControl>
                        <Input type='date' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='space-y-4'>
                <FormField
                  name='discount'
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discount</FormLabel>
                      <FormControl>
                        <Input type='number' min='0' step='0.01' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name='vat'
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VAT</FormLabel>
                      <FormControl>
                        <Input type='number' min='0' step='0.01' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Notes */}
            <FormField
              name='notes'
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder='Additional notes...' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Add Product Button */}
            <div className='flex items-center justify-between'>
              <FormLabel className='text-lg'>Products</FormLabel>
              <Button
                type='button'
                onClick={() => setShowProductModal(true)}
                className='bg-blue-600 hover:bg-blue-700'
              >
                Add Product
              </Button>
            </div>

            {/* Cart Items */}
            <div className='space-y-4'>
              {cartItems.length === 0 ? (
                <div className='rounded-lg border py-8 text-center text-gray-500'>
                  No products added to the sale. Click &quot;Add Product&quot;
                  to start.
                </div>
              ) : (
                <div className='space-y-3'>
                  {cartItems.map((item) => (
                    <div
                      key={item.tempId}
                      className='grid grid-cols-1 items-center gap-4 rounded-lg border p-4 md:grid-cols-12'
                    >
                      {/* Product Info */}
                      <div className='md:col-span-3'>
                        <p className='font-medium'>
                          {item.product?.name}
                          {item.subProduct && (
                            <span className='ml-1 text-sm text-gray-600'>
                              - {item.subProduct.name}
                            </span>
                          )}
                        </p>
                        <p className='text-sm text-gray-500'>
                          {item.shop?.name}
                        </p>
                        <p className='text-xs text-blue-600'>
                          {item.priceLabel}
                        </p>
                      </div>

                      {/* Quantity */}
                      <div className='md:col-span-2'>
                        <FormLabel className='text-sm'>Quantity</FormLabel>
                        <Input
                          type='number'
                          min='1'
                          value={item.quantity}
                          onChange={(e) =>
                            updateCartItem(item.tempId, {
                              quantity: Number(e.target.value),
                              totalPrice:
                                item.unitPrice * Number(e.target.value)
                            })
                          }
                        />
                      </div>

                      {/* Unit Price */}
                      <div className='md:col-span-2'>
                        <FormLabel className='text-sm'>Unit Price</FormLabel>
                        <Input
                          type='number'
                          min='0'
                          step='0.01'
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateCartItem(item.tempId, {
                              unitPrice: Number(e.target.value),
                              totalPrice: Number(e.target.value) * item.quantity
                            })
                          }
                        />
                      </div>

                      {/* Total Price */}
                      <div className='md:col-span-2'>
                        <FormLabel className='text-sm'>Total</FormLabel>
                        <p className='font-medium'>
                          {formatPrice(item.totalPrice)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className='flex gap-2 md:col-span-3'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => handleEditItem(item)}
                        >
                          Edit
                        </Button>
                        <Button
                          type='button'
                          variant='destructive'
                          size='sm'
                          onClick={() => removeCartItem(item.tempId)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Summary */}
            <div className='space-y-2 border-t pt-4'>
              <div className='flex justify-between'>
                <span>Subtotal:</span>
                <span>{formatPrice(calculatedTotals.subTotal)}</span>
              </div>
              <div className='flex justify-between'>
                <span>Discount:</span>
                <span>-{formatPrice(calculatedTotals.discount)}</span>
              </div>
              <div className='flex justify-between'>
                <span>VAT:</span>
                <span>+{formatPrice(calculatedTotals.vat)}</span>
              </div>
              <div className='flex justify-between border-t pt-2 text-lg font-bold'>
                <span>Grand Total:</span>
                <span>{formatPrice(calculatedTotals.grandTotal)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className='flex flex-col justify-end space-y-2 pt-4 sm:flex-row sm:space-y-0 sm:space-x-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => router.back()}
                className='w-full sm:w-auto'
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type='submit'
                className='w-full sm:w-auto'
                disabled={loading || cartItems.length === 0}
              >
                {loading ? 'Updating...' : 'Update Sale'}
              </Button>
            </div>
          </form>
        </Form>

        {/* Product Selection Modal */}
        <Modal
          title={editingItem ? 'Edit Product' : 'Add Product to Sale'}
          description={
            editingItem
              ? 'Update the product, shop, quantity, and price for this sale item'
              : 'Select a product, shop, quantity, and price to add to the sale'
          }
          isOpen={showProductModal}
          onClose={() => {
            setShowProductModal(false);
            resetProductModal();
          }}
          size='xl'
        >
          <div className='space-y-4'>
            {/* Product/SubProduct Selection */}
            <div className="space-y-2">
              <Label>Search Product or SubProduct</Label>
              <SelectReac
                options={productOptions}
                value={
                  selectedProduct
                    ? productOptions.find(opt => 
                        opt.data.type === selectedItemType &&
                        opt.data.productId === selectedProduct.id &&
                        (selectedItemType === 'subproduct' 
                          ? opt.data.subProductId === selectedSubProduct?.id
                          : !opt.data.subProductId)
                      ) || null
                    : null
                }
                onChange={handleProductSelect}
                filterOption={(option, inputValue) => {
                  if (!inputValue) return true;
                  const searchTerm = inputValue.toLowerCase();
                  return option.data.searchText.includes(searchTerm);
                }}
                placeholder="Type to search products/subproducts..."
                isClearable
                isSearchable
                noOptionsMessage={() => 'No products found'}
                styles={{
                  control: (base) => ({
                    ...base,
                    minHeight: '40px',
                  }),
                }}
                className="react-select-container"
                classNamePrefix="react-select"
              />
              {selectedItemType === 'subproduct' && selectedSubProduct && (
                <p className="text-sm text-blue-600 mt-1">
                  Selected SubProduct: {selectedSubProduct.name}
                </p>
              )}
            </div>

            {/* Shop Availability Overview */}
            {selectedProduct && !selectedShop && shopAvailability && (
              <div className='space-y-3'>
                <Label className='font-semibold'>
                  {selectedItemType === 'subproduct' ? 'SubProduct' : 'Product'} Availability Overview
                </Label>
                <div className='overflow-hidden rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Shop Name</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Available Quantity</TableHead>
                        <TableHead>Base Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shopAvailability.shops.map((shop) => (
                        <TableRow key={shop.shopId}>
                          <TableCell className='font-medium'>
                            {shop.shopName}
                          </TableCell>
                          <TableCell>{shop.branchName}</TableCell>
                          <TableCell className='font-bold text-green-600'>
                            {shop.quantity} units
                          </TableCell>
                          <TableCell className='font-bold text-blue-600'>
                            {formatPrice(shop.totalPrice || 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Shop Selection */}
            {selectedProduct && (
              <div className='space-y-2'>
                <Label>Select Shop</Label>
                <Select
                  value={selectedShop?.id || ''}
                  onValueChange={(value) => {
                    const shop = shops.find((s) => s.id === value);
                    setSelectedShop(shop || null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select a shop' />
                  </SelectTrigger>
                  <SelectContent>
                    {shops.map((shop) => (
                      <SelectItem key={shop.id} value={shop.id}>
                        {shop.name}{' '}
                        {shop.branch?.name && `(${shop.branch.name})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Price Selection */}
            {selectedShop && selectedProduct && (
              <div className='space-y-4'>
                <div className='space-y-2'>
                  <Label>Unit Price</Label>
                  <Input
                    type='number'
                    min='0'
                    step='0.01'
                    value={customPrice}
                    onChange={(e) => {
                      setSelectedPriceOption('custom');
                      setCustomPrice(e.target.value);
                    }}
                    placeholder='Enter unit price'
                  />
                </div>

                {additionalPrices.length > 0 && (
                  <div className='space-y-2'>
                    <Label>Recommended Prices</Label>
                    <div className='flex flex-wrap gap-2'>
                      {additionalPrices.map((option) => (
                        <Button
                          key={option.id}
                          type='button'
                          variant={
                            selectedPriceOption === option.id
                              ? 'default'
                              : 'outline'
                          }
                          size='sm'
                          onClick={() => {
                            setSelectedPriceOption(option.id);
                            setCustomPrice(option.price.toString());
                          }}
                        >
                          {option.label}: {formatPrice(option.price)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quantity Input */}
            {selectedShop && (
              <div className='space-y-2'>
                <Label>Quantity</Label>
                <Input
                  type='number'
                  min='1'
                  max={availableStock}
                  value={quantity}
                  onChange={(e) => handleQuantityChange(Number(e.target.value))}
                />
                <p
                  className={`text-sm ${quantity > availableStock ? 'font-semibold text-red-600' : 'text-gray-500'}`}
                >
                  Available: {availableStock} units
                  {quantity > availableStock &&
                    ' - Quantity exceeds available stock!'}
                </p>
              </div>
            )}

            {/* Price Summary */}
            {selectedShop && (
              <div className='rounded-md border bg-gray-50 p-4'>
                <h4 className='mb-3 font-semibold'>Order Summary</h4>
                <div className='space-y-2'>
                  <div className='flex justify-between'>
                    <span className='font-medium'>Unit Price:</span>
                    <span className='font-bold text-green-600'>
                      {formatPrice(unitPrice)}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span className='font-medium'>Quantity:</span>
                    <span>{quantity}</span>
                  </div>
                  <div className='border-t pt-2'>
                    <div className='flex justify-between font-bold'>
                      <span>Total:</span>
                      <span className='text-blue-600'>
                        {formatPrice(totalPrice)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Add to Cart Button */}
            {selectedShop && (
              <div className='flex justify-end'>
                <Button
                  onClick={handleAddProductToCart}
                  disabled={
                    !selectedShop ||
                    quantity > availableStock ||
                    quantity <= 0 ||
                    availableStock === 0
                  }
                >
                  {editingItem ? 'Update Product' : 'Add to Sale'}
                </Button>
              </div>
            )}
          </div>
        </Modal>
      </CardContent>
    </Card>
  );
}