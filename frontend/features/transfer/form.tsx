/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { findDuplicateLineMessage } from '@/lib/duplicate-lines';
import { useRouter } from 'next/navigation';
import Select from 'react-select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select as ShadcnSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { getStores, getStoresall } from '@/service/store';
import { getShops, getShopsall } from '@/service/shop';
import { createTransfer, updateTransfer } from '@/service/transfer';
import { useEffect, useMemo, useState } from 'react';
import { IconTrash } from '@tabler/icons-react';
import { ITransfer, TransferEntityType } from '@/models/transfer';
import { getAvailableProductsBySource } from '@/service/productBatchService';
import { IUnitOfMeasure } from '@/models/UnitOfMeasure';

interface FormData {
  reference?: string;
  sourceType: TransferEntityType;
  sourceStoreId?: string;
  sourceShopId?: string;
  destinationType: TransferEntityType;
  destStoreId?: string;
  destShopId?: string;
  notes?: string;
  items: Array<{
    productId: string;
    subProductId?: string;
    batchId: string;
    quantity: number;
  }>;
}

interface TransferFormProps {
  initialData: ITransfer | null;
  isEdit?: boolean;
}

interface StockItem {
  id: string;
  storeId?: string;
  shopId?: string;
  batchId: string;
  quantity: number;
  status: string;
  unitOfMeasureId: string;
  createdAt: string;
  updatedAt: string;
  store?: {
    id: string;
    name: string;
    branchId: string;
  };
  shop?: {
    id: string;
    name: string;
    branchId: string;
  };
  batch: {
    id: string;
    batchNumber: string;
    expiryDate: string | null;
    price: number | null;
    subProduct: {
      id: string;
      name: string;
      subProductCode: string;
      imageUrl: string;
      isActive: boolean;
    } | null; // Subproduct can be null if it's a main product
  };
  product: {
    id: string;
    productCode: string;
    name: string;
    generic: string | null;
    description: string | null;
    sellPrice: number | null;
    imageUrl: string;
    isActive: boolean;
    category: any;
    subCategory: any | null;
    unitOfMeasure: IUnitOfMeasure;
  };
  unitOfMeasure: IUnitOfMeasure;
  availableQuantity: number;
  conversionFactor: number;
}

type TOption = { value: string; label: string };

type TProductIndex = {
  productOptions: TOption[];
  products: Map<
    string,
    {
      unitOfMeasure: IUnitOfMeasure | null;
      subProductOptions: TOption[];
      mainBatches: TOption[];
    }
  >;
  // key: `${productId}|${subProductId}`
  subProductBatches: Map<string, TOption[]>;
  batchQuantity: Map<string, number>;
};

const DARK_SELECT_STYLES = {
  control: (base: any) => ({
    ...base,
    backgroundColor: '#1f2937',
    borderColor: '#374151',
    color: '#f9fafb'
  }),
  menu: (base: any) => ({
    ...base,
    backgroundColor: '#1f2937',
    color: '#f9fafb'
  }),
  option: (base: any, state: any) => ({
    ...base,
    backgroundColor: state.isFocused ? '#374151' : '#1f2937',
    color: '#f9fafb'
  }),
  singleValue: (base: any) => ({
    ...base,
    color: '#f9fafb'
  }),
  input: (base: any) => ({
    ...base,
    color: '#f9fafb'
  }),
  placeholder: (base: any) => ({
    ...base,
    color: '#9ca3af'
  })
};

const EMPTY_ITEM = { productId: '', subProductId: '', batchId: '', quantity: 1 };
const MAX_VISIBLE_OPTIONS = 50;

// Build every lookup the rows need in one pass, so rendering a row never
// re-scans the whole stock list.
const buildProductIndex = (
  stockItems: StockItem[],
  keepBatchIds: Set<string>
): TProductIndex => {
  const productOptions: TOption[] = [];
  const products: TProductIndex['products'] = new Map();
  const subProductBatches = new Map<string, TOption[]>();
  const batchQuantity = new Map<string, number>();
  const seenSub = new Set<string>();

  for (const item of stockItems) {
    if (!item?.product || !item.batch) continue;
    // Nothing to transfer from an empty batch (unless this transfer already uses it)
    if (!(Number(item.quantity) > 0) && !keepBatchIds.has(item.batchId)) continue;

    const productId = item.product.id.toString();
    let product = products.get(productId);
    if (!product) {
      product = {
        unitOfMeasure: item.product.unitOfMeasure || null,
        subProductOptions: [],
        mainBatches: []
      };
      products.set(productId, product);
      productOptions.push({
        value: productId,
        label: `${item.product.name} (${item.product.productCode})`
      });
    }

    const batch = { value: item.batchId, label: item.batch.batchNumber };
    if (!batchQuantity.has(item.batchId)) {
      batchQuantity.set(item.batchId, Number(item.quantity) || 0);
    }

    const sub = item.batch.subProduct;
    if (sub) {
      const subId = sub.id.toString();
      const key = `${productId}|${subId}`;
      if (!seenSub.has(key)) {
        seenSub.add(key);
        product.subProductOptions.push({ value: subId, label: sub.name });
      }
      const list = subProductBatches.get(key) || [];
      list.push(batch);
      subProductBatches.set(key, list);
    } else {
      product.mainBatches.push(batch);
    }
  }

  productOptions.sort((a, b) => a.label.localeCompare(b.label));
  return { productOptions, products, subProductBatches, batchQuantity };
};

// Large stores have thousands of products; rendering them all makes the
// dropdown slow to open. Show only the best matches for what was typed.
const limitOptions = (options: TOption[], input: string): TOption[] => {
  const term = input.trim().toLowerCase();
  if (!term) return options.slice(0, MAX_VISIBLE_OPTIONS);
  const starts: TOption[] = [];
  const contains: TOption[] = [];
  for (const option of options) {
    const label = option.label.toLowerCase();
    if (label.startsWith(term)) starts.push(option);
    else if (label.includes(term)) contains.push(option);
    if (starts.length >= MAX_VISIBLE_OPTIONS) break;
  }
  return [...starts, ...contains].slice(0, MAX_VISIBLE_OPTIONS);
};

function ProductSelect({
  index,
  options,
  value,
  onChange,
  isLoading,
  styles
}: {
  index: number;
  options: TOption[];
  value: TOption | null;
  onChange: (value: string) => void;
  isLoading: boolean;
  styles: any;
}) {
  const [input, setInput] = useState('');
  const visible = useMemo(() => limitOptions(options, input), [options, input]);

  return (
    <Select
      instanceId={`product-select-${index}`}
      options={visible}
      inputValue={input}
      onInputChange={(next, meta) => {
        if (meta.action === 'input-change') setInput(next);
        else if (meta.action === 'menu-close' || meta.action === 'set-value')
          setInput('');
      }}
      // Options are already filtered above
      filterOption={null}
      onChange={(newValue: any) => onChange(newValue?.value || '')}
      value={value}
      placeholder={isLoading ? 'Loading products...' : 'Search product'}
      noOptionsMessage={() =>
        options.length === 0 ? 'No stock in this source' : 'No matching product'
      }
      isSearchable
      isDisabled={isLoading}
      isLoading={isLoading}
      styles={styles}
    />
  );
}

export default function TransferForm({
  initialData,
  isEdit = false
}: TransferFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [stores, setStores] = useState<any[]>([]);
  const [shops, setShops] = useState<any[]>([]);
  const [disstores, setDisstores] = useState<any[]>([]);
  const [disshops, setDisshops] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingStoresShops, setLoadingStoresShops] = useState(true);

  const router = useRouter();

  const form = useForm<FormData>({
    defaultValues: {
      reference: initialData?.reference || '',
      sourceType: initialData?.sourceType || TransferEntityType.STORE,
      sourceStoreId: initialData?.sourceStoreId || '',
      sourceShopId: initialData?.sourceShopId || '',
      destinationType: initialData?.destinationType || TransferEntityType.STORE,
      destStoreId: initialData?.destStoreId || '',
      destShopId: initialData?.destShopId || '',
      notes: initialData?.notes || '',
      items: initialData?.items?.map((item) => ({
        productId: item.productId || '',
        subProductId: item.subProductId || '',
        batchId: item.batchId.toString(),
        quantity: Number(item.quantity)
      })) || [{ ...EMPTY_ITEM }]
    }
  });

  const sourceType = form.watch('sourceType');
  const sourceStoreId = form.watch('sourceStoreId');
  const sourceShopId = form.watch('sourceShopId');
  const destinationType = form.watch('destinationType');
  const destStoreId = form.watch('destStoreId');
  const destShopId = form.watch('destShopId');

  const sourceId =
    sourceType === TransferEntityType.STORE ? sourceStoreId : sourceShopId;

  // Batches this transfer already uses stay selectable in edit mode
  const initialBatchIds = useMemo(
    () => new Set((initialData?.items || []).map((i) => i.batchId.toString())),
    [initialData]
  );

  const productIndex = useMemo(
    () => buildProductIndex(stockItems, initialBatchIds),
    [stockItems, initialBatchIds]
  );

  // Fetch stores and shops
  useEffect(() => {
    let cancelled = false;
    Promise.all([getStores(), getShops(), getStoresall(), getShopsall()])
      .then(([sourceStores, sourceShops, allStores, allShops]) => {
        if (cancelled) return;
        setStores(sourceStores || []);
        setShops(sourceShops || []);
        setDisstores(allStores || []);
        setDisshops(allShops || []);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load stores or shops');
      })
      .finally(() => {
        if (!cancelled) setLoadingStoresShops(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the source's stock as soon as a source is picked. A newer pick
  // cancels the older request so its result never overwrites the new one.
  useEffect(() => {
    if (!sourceId) {
      setStockItems([]);
      setLoadingProducts(false);
      return;
    }

    let cancelled = false;
    setLoadingProducts(true);
    getAvailableProductsBySource(sourceType, sourceId)
      .then((data) => {
        if (!cancelled) setStockItems(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Failed to load items from source');
          setStockItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceType, sourceId]);

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    return () => observer.disconnect();
  }, []);

  const selectStyles = isDark ? DARK_SELECT_STYLES : {};

  // Changing the source invalidates every chosen batch
  const resetItems = () => {
    form.setValue('items', [{ ...EMPTY_ITEM }]);
  };

  // Destination lists without the location picked as source
  const destStoreOptions =
    sourceType === TransferEntityType.STORE && sourceStoreId
      ? disstores.filter((store) => store.id.toString() !== sourceStoreId)
      : disstores;
  const destShopOptions =
    sourceType === TransferEntityType.SHOP && sourceShopId
      ? disshops.filter((shop) => shop.id.toString() !== sourceShopId)
      : disshops;

  // Clear a destination that just became the source
  useEffect(() => {
    if (
      sourceType === TransferEntityType.STORE &&
      destinationType === TransferEntityType.STORE &&
      sourceStoreId &&
      destStoreId === sourceStoreId
    ) {
      form.setValue('destStoreId', '');
    }
    if (
      sourceType === TransferEntityType.SHOP &&
      destinationType === TransferEntityType.SHOP &&
      sourceShopId &&
      destShopId === sourceShopId
    ) {
      form.setValue('destShopId', '');
    }
  }, [
    form,
    sourceType,
    destinationType,
    sourceStoreId,
    sourceShopId,
    destStoreId,
    destShopId
  ]);

const onSubmit = async (data: FormData) => {
  const duplicateMessage = findDuplicateLineMessage(data.items);
  if (duplicateMessage) {
    toast.error(duplicateMessage);
    return;
  }

  setIsLoading(true);
  try {

    // Validate source
    if (data.sourceType === TransferEntityType.STORE && !data.sourceStoreId) {
      toast.error('Source store is required');
      setIsLoading(false);
      return;
    }

    if (data.sourceType === TransferEntityType.SHOP && !data.sourceShopId) {
      toast.error('Source shop is required');
      setIsLoading(false);
      return;
    }

    // Validate destination
    if (data.destinationType === TransferEntityType.STORE && !data.destStoreId) {
      toast.error('Destination store is required');
      setIsLoading(false);
      return;
    }

    if (data.destinationType === TransferEntityType.SHOP && !data.destShopId) {
      toast.error('Destination shop is required');
      setIsLoading(false);
      return;
    }

    // Check if source and destination are the same
    if (
      (data.sourceType === TransferEntityType.STORE && 
       data.destinationType === TransferEntityType.STORE && 
       data.sourceStoreId === data.destStoreId) ||
      (data.sourceType === TransferEntityType.SHOP && 
       data.destinationType === TransferEntityType.SHOP && 
       data.sourceShopId === data.destShopId)
    ) {
      toast.error('Source and destination cannot be the same');
      setIsLoading(false);
      return;
    }

    // Validate items and format them for backend
    const validItems = data.items.filter(
      (item) => item.batchId && item.quantity > 0 && item.productId
    );
    

    // If no valid items, show error
    if (validItems.length === 0) {
      toast.error('Please add at least one valid item');
      setIsLoading(false);
      return;
    }

    // Format items for backend - productId is always required
    // When subProductId is present, send both productId and subProductId
    const formattedItems = validItems.map((item) => {
      if (item.subProductId) {
        // When subproduct is selected, send both productId and subProductId
        return {
          productId: item.productId!.toString(), // Product ID is required
          subProductId: item.subProductId!.toString(),
          batchId: item.batchId.toString(),
          quantity: Number(item.quantity)
        };
      } else {
        // When no subproduct, send only productId
        return {
          productId: item.productId!.toString(),
          batchId: item.batchId.toString(),
          quantity: Number(item.quantity)
        };
      }
    });


    // Clean the payload
    const cleanedPayload = {
      ...data,
      reference: data.reference?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      sourceStoreId: data.sourceStoreId || undefined,
      sourceShopId: data.sourceShopId || undefined,
      destStoreId: data.destStoreId || undefined,
      destShopId: data.destShopId || undefined,
      items: formattedItems
    };

    
    let transferId: string | undefined;

    if (isEdit && initialData?.id) {
      await updateTransfer(initialData.id, cleanedPayload);
      transferId = initialData.id;
      toast.success('Transfer updated successfully');
    } else {
      const newTransfer = await createTransfer(cleanedPayload);
      transferId = newTransfer.transfer.id;
      toast.success('Transfer created successfully');
    }

    if (transferId) {
      router.push(`/dashboard/Transfer/view?id=${transferId}`);
    }
    router.refresh();
  } catch (error: any) {
    console.error('Transfer creation error:', error);
    const message =
      error?.response?.data?.message ||
      error?.message ||
      'An error occurred while saving transfer.';
    toast.error(message);
  } finally {
    setIsLoading(false);
  }
};

  // Show loading state while stores/shops are loading
  if (loadingStoresShops) {
    return (
      <Card className='mx-auto w-full'>
        <CardHeader>
          <CardTitle className='text-left text-2xl font-bold'>
            {isEdit ? 'Edit Transfer' : 'Create Transfer'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center py-8'>
            <div className='text-center'>
              <div className='border-primary mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2'></div>
              <div>Loading stores and shops...</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='mx-auto w-full'>
      <CardHeader>
        <CardTitle className='text-left text-2xl font-bold'>
          {isEdit ? 'Edit Transfer' : 'Create Transfer'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='reference'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter transfer reference'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Empty column for spacing - aligns with Source/Destination Type column */}
              <div></div>
            </div>

            {/* Source and Destination Section - Aligned in same columns */}
            <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
              {/* Source Column */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Source</h3>

                <FormField
                  control={form.control}
                  name='sourceType'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <ShadcnSelect
                        value={field.value}
                        onValueChange={(value: TransferEntityType) => {
                          field.onChange(value);
                          if (value === TransferEntityType.STORE) {
                            form.setValue('sourceShopId', '');
                          } else {
                            form.setValue('sourceStoreId', '');
                          }
                          resetItems();
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select source type' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={TransferEntityType.STORE}>
                            Store
                          </SelectItem>
                          <SelectItem value={TransferEntityType.SHOP}>
                            Shop
                          </SelectItem>
                        </SelectContent>
                      </ShadcnSelect>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {sourceType === TransferEntityType.STORE && (
                  <FormField
                    control={form.control}
                    name='sourceStoreId'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Store</FormLabel>
                        <ShadcnSelect
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            resetItems();
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select source store' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {stores.map((store) => (
                              <SelectItem
                                key={store.id}
                                value={store.id.toString()}
                              >
                                {store.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </ShadcnSelect>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {sourceType === TransferEntityType.SHOP && (
                  <FormField
                    control={form.control}
                    name='sourceShopId'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shop</FormLabel>
                        <ShadcnSelect
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            resetItems();
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select source shop' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {shops.map((shop) => (
                              <SelectItem
                                key={shop.id}
                                value={shop.id.toString()}
                              >
                                {shop.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </ShadcnSelect>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Destination Column */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Destination</h3>

                <FormField
                  control={form.control}
                  name='destinationType'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <ShadcnSelect
                        value={field.value}
                        onValueChange={(value: TransferEntityType) => {
                          field.onChange(value);
                          if (value === TransferEntityType.STORE) {
                            form.setValue('destShopId', '');
                          } else {
                            form.setValue('destStoreId', '');
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select destination type' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={TransferEntityType.STORE}>
                            Store
                          </SelectItem>
                          <SelectItem value={TransferEntityType.SHOP}>
                            Shop
                          </SelectItem>
                        </SelectContent>
                      </ShadcnSelect>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {destinationType === TransferEntityType.STORE && (
                  <FormField
                    control={form.control}
                    name='destStoreId'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Store</FormLabel>
                        <ShadcnSelect
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select destination store' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {destStoreOptions.map((store) => (
                              <SelectItem
                                key={store.id}
                                value={store.id.toString()}
                              >
                                {store.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </ShadcnSelect>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {destinationType === TransferEntityType.SHOP && (
                  <FormField
                    control={form.control}
                    name='destShopId'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shop</FormLabel>
                        <ShadcnSelect
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select destination shop' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {destShopOptions.map((shop) => (
                              <SelectItem
                                key={shop.id}
                                value={shop.id.toString()}
                              >
                                {shop.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </ShadcnSelect>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            <FormField
              control={form.control}
              name='items'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Items</FormLabel>
                  <FormControl>
                    <div className='space-y-4'>
                      {/* Updated grid columns */}
                      <div className='grid grid-cols-6 gap-4 text-sm font-semibold text-gray-700 dark:text-gray-300'>
                        <div>Product</div>
                        <div>Subproduct</div>
                        <div>Batch</div>
                        <div>Quantity</div>
                        <div>Unit</div>
                        <div>Action</div>
                      </div>

                      {field.value.map((item, index) => {
                        const { productId, subProductId, batchId } = item;
                        const product = productId
                          ? productIndex.products.get(productId)
                          : undefined;
                        const hasSubProducts =
                          !!product && product.subProductOptions.length > 0;
                        const availableQuantity =
                          productIndex.batchQuantity.get(batchId) ?? 0;
                        const maxQuantity = Math.floor(availableQuantity);

                        const selectedProduct =
                          productIndex.productOptions.find(
                            (p) => p.value === productId
                          ) || null;
                        const subProductOptions = product?.subProductOptions ?? [];
                        const selectedSubProduct =
                          subProductOptions.find(
                            (sp) => sp.value === subProductId
                          ) || null;

                        const batchOptions: TOption[] = !product
                          ? []
                          : subProductId
                            ? productIndex.subProductBatches.get(
                                `${productId}|${subProductId}`
                              ) ?? []
                            : product.mainBatches;
                        const selectedBatch =
                          batchOptions.find((b) => b.value === batchId) || null;

                        const updateRow = (
                          patch: Partial<FormData['items'][number]>
                        ) => {
                          const newItems = field.value.map((row, i) =>
                            i === index ? { ...row, ...patch } : row
                          );
                          field.onChange(newItems);
                        };

                        return (
                          <div
                            key={index}
                            className='grid grid-cols-6 items-center gap-4'
                          >
                            {/* Product Selector */}
                            <div>
                              <ProductSelect
                                index={index}
                                options={productIndex.productOptions}
                                value={selectedProduct}
                                onChange={(value) =>
                                  updateRow({
                                    productId: value,
                                    subProductId: '',
                                    batchId: '',
                                    quantity: 1
                                  })
                                }
                                isLoading={loadingProducts}
                                styles={selectStyles}
                              />
                            </div>

                            {/* Subproduct Selector - Only show if product has subproducts */}
                            <div>
                              {hasSubProducts ? (
                                <Select
                                  instanceId={`subproduct-select-${index}`}
                                  options={subProductOptions}
                                  onChange={(newValue: any) =>
                                    updateRow({
                                      subProductId: newValue?.value || '',
                                      batchId: '',
                                      quantity: 1
                                    })
                                  }
                                  value={selectedSubProduct}
                                  placeholder='Select subproduct'
                                  isSearchable
                                  isClearable={product.mainBatches.length > 0}
                                  isDisabled={loadingProducts}
                                  isLoading={loadingProducts}
                                  styles={selectStyles}
                                />
                              ) : (
                                <div className='text-muted-foreground border-input bg-muted rounded-md border px-3 py-2 text-sm'>
                                  No subproducts
                                </div>
                              )}
                            </div>

                            {/* Batch Selector */}
                            <div>
                              <Select
                                instanceId={`batch-select-${index}`}
                                options={batchOptions}
                                onChange={(newValue: any) =>
                                  updateRow({ batchId: newValue?.value || '' })
                                }
                                value={selectedBatch}
                                placeholder={
                                  !productId
                                    ? 'Select product first'
                                    : hasSubProducts &&
                                        !subProductId &&
                                        batchOptions.length === 0
                                      ? 'Select subproduct first'
                                      : batchOptions.length === 0
                                        ? 'No batches available'
                                        : 'Select batch'
                                }
                                isSearchable
                                isDisabled={
                                  !productId ||
                                  batchOptions.length === 0 ||
                                  loadingProducts
                                }
                                isLoading={loadingProducts}
                                styles={selectStyles}
                              />
                            </div>

                            {/* Quantity Input */}
                            <div>
                              <Input
                                type='number'
                                placeholder='Qty'
                                value={item.quantity}
                                min={1}
                                max={maxQuantity}
                                onChange={(e) => {
                                  const quantity = Number(e.target.value);
                                  updateRow({
                                    quantity: Math.min(
                                      isNaN(quantity) ? 0 : quantity,
                                      maxQuantity
                                    )
                                  });
                                }}
                                disabled={!batchId || loadingProducts}
                              />
                              {batchId && !loadingProducts && (
                                <div className='text-muted-foreground mt-1 text-xs'>
                                  Max: {maxQuantity}
                                </div>
                              )}
                            </div>

                            {/* Unit of Measure Display */}
                            <div className='text-muted-foreground text-sm'>
                              {product?.unitOfMeasure ? (
                                product.unitOfMeasure.name
                              ) : (
                                <span className='text-gray-400'>Select product</span>
                              )}
                            </div>

                            {/* Delete Button */}
                            <div>
                              <Button
                                type='button'
                                variant='destructive'
                                size='sm'
                                onClick={() => {
                                  field.onChange(
                                    field.value.filter((_, i) => i !== index)
                                  );
                                }}
                                disabled={field.value.length <= 1}
                              >
                                <IconTrash size={16} />
                              </Button>
                            </div>
                          </div>
                        );
                      })}

                      <div className='flex justify-end'>
                        <Button
                          type='button'
                          onClick={() => {
                            field.onChange([
                              ...field.value,
                              { productId: '', subProductId: '', batchId: '', quantity: 1 }
                            ]);
                          }}
                          disabled={loadingProducts}
                        >
                          {loadingProducts ? (
                            <div className='flex items-center gap-2'>
                              <div className='h-4 w-4 animate-spin rounded-full border-b-2 border-white'></div>
                              Loading...
                            </div>
                          ) : (
                            'Add Item'
                          )}
                        </Button>
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='notes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Input placeholder='Enter notes (optional)' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='flex justify-end gap-2'>
              <Button
                type='submit'
                disabled={isLoading}
                className='min-w-24'
              >
                {isLoading ? (
                  <div className='flex items-center gap-2'>
                    <div className='h-4 w-4 animate-spin rounded-full border-b-2 border-white'></div>
                    {isEdit ? 'Updating...' : 'Creating...'}
                  </div>
                ) : isEdit ? (
                  'Update Transfer'
                ) : (
                  'Create Transfer'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}