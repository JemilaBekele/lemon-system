/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { findDuplicateLineMessage } from '@/lib/duplicate-lines';
import { useRouter } from 'next/navigation';
import Select from 'react-select';
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
import { IPurchase } from '@/models/purchase';
import { IProduct, IProductBatch, ISubProduct } from '@/models/Product';
import { getStores } from '@/service/store';
import {
  getProductBatches,
  getProducts,
  getSubProductsByProductId
} from '@/service/Product';
import { createPurchase, updatePurchase } from '@/service/purchase';
import { ISupplier } from '@/models/supplier';
import { getSupplier } from '@/service/supplier';
import { useCallback, useEffect, useState } from 'react';
import { IconTrash, IconPlus } from '@tabler/icons-react';
import { Modal } from '@/components/ui/modal';
import CreateSupplierModal from './suppliyer';
import CreateProductBatchModal from './batchcreate';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';

// TypeScript interfaces for form values - removed unitOfMeasureId
interface FormItemValues {
  productId: string;
  subProductId?: string;
  batchId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface FormValues {
  invoiceNo: string;
  supplierId: string;
  storeId: string;
  purchaseDate: string;
  notes?: string;
  items: FormItemValues[];
}

interface PurchaseFormProps {
  initialData: IPurchase | null;
  isEdit?: boolean;
}

export default function PurchaseForm({
  initialData,
  isEdit = false
}: PurchaseFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<ISupplier[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [products, setProducts] = useState<IProduct[]>([]);
  const [batches, setBatches] = useState<{ [key: string]: IProductBatch[] }>(
    {}
  );
  const [subProducts, setSubProducts] = useState<{
    [key: string]: ISubProduct[];
  }>({});
  const [isMounted, setIsMounted] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedProductForBatch, setSelectedProductForBatch] =
    useState<string>('');
  const [selectedSubProductForBatch, setSelectedSubProductForBatch] =
    useState<string>('');
  // Row whose "+" opened the batch modal; it gets the new batch
  const [batchRowIndex, setBatchRowIndex] = useState<number | null>(null);
  const [loadingBatches, setLoadingBatches] = useState<{
    [key: string]: boolean;
  }>({});
  const [loadingSubProducts, setLoadingSubProducts] = useState<{
    [key: string]: boolean;
  }>({});
  const router = useRouter();

  const form = useForm<FormValues>({
    defaultValues: {
      invoiceNo: initialData?.invoiceNo || '',
      supplierId: initialData?.supplierId?.toString() || '',
      storeId: initialData?.storeId?.toString() || '',
      purchaseDate: initialData?.purchaseDate
        ? new Date(initialData.purchaseDate).toISOString().split('T')[0]
        : format(new Date(), 'yyyy-MM-dd'),
      notes: initialData?.notes || '',
      items:
        initialData?.items?.map((item) => ({
          ...item,
          productId: item.productId.toString(),
          subProductId: item.subProductId?.toString() || '',
          batchId: item.batchId.toString(),
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice)
        })) || []
    },
    mode: 'onChange'
  });

  // Calculate totals
  const items = form.watch('items');
  const grandTotal = items.reduce(
    (total, item) => total + item.quantity * item.unitPrice,
    0
  );
  const totalProducts = items.filter((item) => item.productId).length;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch suppliers, stores, products
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [suppliersData, storesData, productsData] = await Promise.all([
          getSupplier(),
          getStores(),
          getProducts()
        ]);
        setSuppliers(suppliersData);
        setStores(storesData);
        setProducts(productsData);
      } catch  {
        toast.error('Failed to load suppliers, stores, or products');
      }
    };
    fetchData();
  }, []);

  const fetchSubProducts = useCallback(
    async (productId: string) => {
      if (!productId) return;

      if (!subProducts[productId] && !loadingSubProducts[productId]) {
        setLoadingSubProducts((prev) => ({ ...prev, [productId]: true }));
        try {
          const subProductsData = await getSubProductsByProductId(productId);
          setSubProducts((prev) => ({ ...prev, [productId]: subProductsData || [] }));
        } catch  {
          toast.error('Failed to load subproducts');
          setSubProducts((prev) => ({ ...prev, [productId]: [] }));
        } finally {
          setLoadingSubProducts((prev) => ({ ...prev, [productId]: false }));
        }
      }
    },
    [subProducts, loadingSubProducts]
  );

  const fetchBatches = useCallback(
    async (productId: string, subProductId?: string) => {
      if (!productId) return;

      const cacheKey = subProductId ? `${productId}-${subProductId}` : productId;

      if (!batches[cacheKey] && !loadingBatches[cacheKey]) {
        setLoadingBatches((prev) => ({ ...prev, [cacheKey]: true }));
        try {
          const batchData = await getProductBatches(productId, subProductId);
          setBatches((prev) => ({ ...prev, [cacheKey]: batchData || [] }));
        } catch  {
          toast.error('Failed to load batches');
          setBatches((prev) => ({ ...prev, [cacheKey]: [] }));
        } finally {
          setLoadingBatches((prev) => ({ ...prev, [cacheKey]: false }));
        }
      }
    },
    [batches, loadingBatches]
  );

  // Removed fetchUnitsOfMeasure

  useEffect(() => {
    items.forEach((item) => {
      if (
        item.productId &&
        !subProducts[item.productId] &&
        !loadingSubProducts[item.productId]
      ) {
        fetchSubProducts(item.productId);
      }
    });
  }, [
    items,
    subProducts,
    loadingSubProducts,
    fetchSubProducts
  ]);

  useEffect(() => {
    items.forEach((item) => {
      if (item.productId) {
        const currentCacheKey = item.subProductId 
          ? `${item.productId}-${item.subProductId}` 
          : item.productId;

        if (!batches[currentCacheKey] && !loadingBatches[currentCacheKey]) {
          fetchBatches(item.productId, item.subProductId);
        }

        if (item.subProductId && batches[item.productId]) {
          setBatches((prev) => {
            const newBatches = { ...prev };
            delete newBatches[item.productId];
            return newBatches;
          });
        }
      }
    });
  }, [items, batches, loadingBatches, fetchBatches]);

  const handleSupplierCreated = () => {
    setShowSupplierModal(false);
    getSupplier()
      .then(setSuppliers)
      .catch(() => {
        toast.error('Failed to refresh suppliers');
      });
  };

  const handleBatchCreated = async (createdBatch?: {
    id: string | number;
    productId?: string;
    subProductId?: string | null;
  }) => {
    setShowBatchModal(false);

    if (selectedProductForBatch) {
      try {
        const cacheKey = selectedSubProductForBatch
          ? `${selectedProductForBatch}-${selectedSubProductForBatch}`
          : selectedProductForBatch;

        setLoadingBatches((prev) => ({
          ...prev,
          [cacheKey]: true
        }));

        setBatches((prev) => {
          const newBatches = { ...prev };
          delete newBatches[cacheKey];
          return newBatches;
        });

        const batchData = await getProductBatches(
          selectedProductForBatch, 
          selectedSubProductForBatch
        );
        setBatches((prev) => ({
          ...prev,
          [cacheKey]: batchData || []
        }));

        // Select the new batch on the row that opened the modal, replacing
        // any batch already chosen there. The modal lets the user switch
        // product, so only do it when the batch belongs to that row's
        // product / sub-product.
        const currentItems = form.getValues('items');
        const row =
          batchRowIndex !== null ? currentItems[batchRowIndex] : undefined;
        if (
          createdBatch?.id &&
          row &&
          (!createdBatch.productId ||
            createdBatch.productId === row.productId) &&
          (createdBatch.subProductId || '') === (row.subProductId || '')
        ) {
          const updatedItems = [...currentItems];
          updatedItems[batchRowIndex!] = {
            ...row,
            batchId: createdBatch.id.toString()
          };
          form.setValue('items', updatedItems);
          form.clearErrors(`items.${batchRowIndex!}.batchId`);
        }

        toast.success('Batch created successfully');
      } catch {
        toast.error('Failed to refresh batches');
      } finally {
        const cacheKey = selectedSubProductForBatch 
          ? `${selectedProductForBatch}-${selectedSubProductForBatch}`
          : selectedProductForBatch;
        
        setLoadingBatches((prev) => ({
          ...prev,
          [cacheKey]: false
        }));
      }
    }
  };

  const openBatchModalForProduct = (
    rowIndex: number,
    productId: string,
    subProductId?: string
  ) => {
    setBatchRowIndex(rowIndex);
    setSelectedProductForBatch(productId);
    setSelectedSubProductForBatch(subProductId || '');
    setShowBatchModal(true);
  };

  const updateItemTotal = (index: number) => {
    const items = form.getValues('items');
    const item = items[index];
    const totalPrice = item.quantity * item.unitPrice;

    const updatedItems = [...items];
    updatedItems[index] = { ...item, totalPrice };
    form.setValue('items', updatedItems);
  };

  const validateForm = (data: FormValues): { isValid: boolean; errors: Record<string, string> } => {
    const errors: Record<string, string> = {};
    
    // Validate invoiceNo
    if (!data.invoiceNo || data.invoiceNo.trim() === '') {
      errors.invoiceNo = 'Invoice No is required';
    }

    // Validate supplierId
    if (!data.supplierId || data.supplierId.trim() === '') {
      errors.supplierId = 'Supplier is required';
    }

    // Validate storeId
    if (!data.storeId || data.storeId.trim() === '') {
      errors.storeId = 'Store is required';
    }

    // Validate purchaseDate
    if (!data.purchaseDate || data.purchaseDate.trim() === '') {
      errors.purchaseDate = 'Purchase Date is required';
    }

    // Validate items
    if (data.items.length === 0) {
      errors.items = 'At least one item is required';
    }

    // Validate each item
    data.items.forEach((item, index) => {
      if (!item.productId || item.productId.trim() === '') {
        errors[`items.${index}.productId`] = 'Product is required';
      }

      if (!item.batchId || item.batchId.trim() === '') {
        errors[`items.${index}.batchId`] = 'Batch is required';
      }

      if (item.quantity <= 0 || isNaN(item.quantity)) {
        errors[`items.${index}.quantity`] = 'Quantity must be greater than 0';
      } else if (!Number.isInteger(item.quantity)) {
        errors[`items.${index}.quantity`] = 'Quantity must be a whole number';
      }

      if (item.unitPrice < 0 || isNaN(item.unitPrice)) {
        errors[`items.${index}.unitPrice`] = 'Unit price must be positive';
      }

      if (item.totalPrice < 0 || isNaN(item.totalPrice)) {
        errors[`items.${index}.totalPrice`] = 'Total price must be positive';
      }
    });

    return { isValid: Object.keys(errors).length === 0, errors };
  };

  const onSubmit = async (data: FormValues) => {
    const duplicateMessage = findDuplicateLineMessage(data.items);
    if (duplicateMessage) {
      toast.error(duplicateMessage);
      return;
    }

    // Clear all errors first
    form.clearErrors();

    // Validate form
    const { isValid, errors } = validateForm(data);
    
    if (!isValid) {
      // Set errors on form
      Object.entries(errors).forEach(([field, message]) => {
        // Handle nested field errors
        if (field.startsWith('items.')) {
          // For nested errors, we need to use the field path
          const fieldPath = field as any;
          form.setError(fieldPath, {
            type: 'manual',
            message
          });
        } else {
          form.setError(field as any, {
            type: 'manual',
            message
          });
        }
      });
      // On a long purchase the highlighted row may be off screen
      toast.error('Some items need fixing. Check the highlighted rows.');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        ...data,
        items: data.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          subProductId: item.subProductId?.trim() ? item.subProductId : undefined
        }))
      };

      if (isEdit && initialData?.id) {
        await updatePurchase(initialData.id, payload);
        toast.success('Purchase updated successfully');
      } else {
        await createPurchase(payload);
        toast.success('Purchase created successfully');
      }
      router.push('/dashboard/purchase');
      router.refresh();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        'An error occurred while saving purchase.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

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

  const darkStyles = {
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

  if (!isMounted) {
    return (
      <Card className='mx-auto w-full'>
        <CardHeader>
          <CardTitle className='text-left text-2xl font-bold'>
            {isEdit ? 'Edit Purchase' : 'Create Purchase'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div>Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className='mx-auto w-full'>
        <CardHeader>
          <CardTitle className='text-left text-2xl font-bold'>
            {isEdit ? 'Edit Purchase' : 'Create Purchase'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
              {/* Invoice No */}
              <div className='space-y-2'>
                <Label htmlFor='invoiceNo'>Invoice No</Label>
                <Input 
                  id='invoiceNo'
                  placeholder='Enter invoice number' 
                  {...form.register('invoiceNo', {
                    required: 'Invoice No is required'
                  })}
                />
                {form.formState.errors.invoiceNo && (
                  <p className='text-sm font-medium text-destructive'>
                    {form.formState.errors.invoiceNo.message}
                  </p>
                )}
              </div>

              {/* Supplier */}
              <div className='space-y-2'>
                <Label htmlFor='supplier'>Supplier</Label>
                <div className='flex gap-2'>
                  <div className='flex-1'>
                    <Select
                      instanceId='supplier-select'
                      options={suppliers.map((supplier) => ({
                        value: supplier?.id?.toString() ?? '',
                        label: supplier?.name ?? 'Unnamed Supplier'
                      }))}
                      onChange={(newValue) =>
                        form.setValue('supplierId', newValue?.value || '')
                      }
                      value={suppliers
                        .map((s) => ({
                          value: s?.id?.toString() ?? '',
                          label: s?.name ?? 'Unnamed Supplier'
                        }))
                        .find((s) => s.value === form.getValues('supplierId'))}
                      placeholder='Search for a supplier'
                      isSearchable
                      styles={isDark ? darkStyles : {}}
                    />
                  </div>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => setShowSupplierModal(true)}
                  >
                    <IconPlus size={16} />
                  </Button>
                </div>
                {form.formState.errors.supplierId && (
                  <p className='text-sm font-medium text-destructive'>
                    {form.formState.errors.supplierId.message}
                  </p>
                )}
              </div>

              {/* Store */}
              <div className='space-y-2'>
                <Label htmlFor='store'>Store</Label>
                <ShadcnSelect
                  value={form.getValues('storeId')}
                  onValueChange={(value: string) => form.setValue('storeId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select a store' />
                  </SelectTrigger>
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
                {form.formState.errors.storeId && (
                  <p className='text-sm font-medium text-destructive'>
                    {form.formState.errors.storeId.message}
                  </p>
                )}
              </div>

              {/* Purchase Date */}
              <div className='space-y-2'>
                <Label htmlFor='purchaseDate'>Purchase Date</Label>
                <Input 
                  id='purchaseDate'
                  type='date' 
                  {...form.register('purchaseDate', {
                    required: 'Purchase Date is required'
                  })}
                />
                {form.formState.errors.purchaseDate && (
                  <p className='text-sm font-medium text-destructive'>
                    {form.formState.errors.purchaseDate.message}
                  </p>
                )}
              </div>

              {/* Notes */}
              <div className='space-y-2'>
                <Label htmlFor='notes'>Notes</Label>
                <Input 
                  id='notes'
                  placeholder='Enter notes (optional)' 
                  {...form.register('notes')}
                />
              </div>
            </div>

            {/* Items Section - Updated column layout without Unit column */}
            <div className='space-y-4'>
              <Label>Items</Label>
              <div className='grid grid-cols-8 gap-4 text-sm font-semibold'>
                <div>Product</div>
                <div>Subproduct</div>
                <div>Batch</div>
                <div>Quantity</div>
                <div>Purchase Price</div>
                <div>Total</div>
                <div className='col-span-2'>Action</div>
              </div>

              {items.map((item, index) => {
                const batchCacheKey = item.subProductId 
                  ? `${item.productId}-${item.subProductId}`
                  : item.productId;

                return (
                  <div
                    key={index}
                    className='grid grid-cols-8 items-center gap-4'
                  >
                    {/* Product */}
                    <div>
                      <Select
                        instanceId={`product-select-${index}`}
                        options={products.map((product) => ({
                          value: product.id.toString(),
                          label: product.name
                        }))}
                        onChange={(newValue) => {
                          const newItems = [...items];
                          newItems[index].productId = newValue?.value || '';
                          newItems[index].subProductId = '';
                          newItems[index].batchId = '';
                          form.setValue('items', newItems);
                          if (newValue?.value) {
                            fetchSubProducts(newValue.value);
                            fetchBatches(newValue.value);
                          }
                        }}
                        value={products
                          .map((p) => ({
                            value: p.id.toString(),
                            label: p.name
                          }))
                          .find((p) => p.value === item.productId)}
                        placeholder='Search product'
                        isSearchable
                        styles={isDark ? darkStyles : {}}
                      />
                      {form.formState.errors.items?.[index]?.productId && (
                        <p className='mt-1 text-xs text-destructive'>
                          {form.formState.errors.items[index]?.productId?.message}
                        </p>
                      )}
                    </div>

                    {/* Subproduct */}
                    <div>
                      <Select
                        instanceId={`subproduct-select-${index}`}
                        options={
                          Array.isArray(subProducts[item.productId])
                            ? subProducts[item.productId].map(
                                (subProduct) => ({
                                  value: subProduct.id.toString(),
                                  label: subProduct.name
                                })
                              )
                            : []
                        }
                        onChange={(newValue) => {
                          const newItems = [...items];
                          const newSubProductId = newValue?.value || '';
                          newItems[index].subProductId = newSubProductId;
                          newItems[index].batchId = '';
                          form.setValue('items', newItems);
                          
                          if (item.productId) {
                            fetchBatches(item.productId, newSubProductId);
                          }
                        }}
                        value={
                          Array.isArray(subProducts[item.productId])
                            ? subProducts[item.productId]
                                .map((sp) => ({
                                  value: sp.id.toString(),
                                  label: sp.name
                                }))
                                ?.find(
                                  (sp) => sp.value === item.subProductId
                                )
                            : undefined
                        }
                        placeholder={
                          loadingSubProducts[item.productId]
                            ? 'Loading subproducts...'
                            : item.productId
                            ? 'Select subproduct (optional)'
                            : 'Select product first'
                        }
                        isSearchable
                        isDisabled={
                          !item.productId ||
                          loadingSubProducts[item.productId]
                        }
                        isLoading={loadingSubProducts[item.productId]}
                        styles={isDark ? darkStyles : {}}
                        noOptionsMessage={() => 'No subproducts available'}
                        isClearable
                      />
                    </div>

                    {/* Batch */}
                    <div className='flex gap-2'>
                      <div className='flex-1'>
                        <Select
                          key={`batch-${item.productId}-${item.subProductId || 'no-subproduct'}`}
                          instanceId={`batch-select-${index}`}
                          options={
                            Array.isArray(batches[batchCacheKey])
                              ? batches[batchCacheKey].map(
                                  (batch) => ({
                                    value: batch.id.toString(),
                                    label: `${batch.batchNumber}`
                                  })
                                )
                              : []
                          }
                          onChange={(newValue) => {
                            const newItems = [...items];
                            newItems[index].batchId = newValue?.value || '';
                            form.setValue('items', newItems);
                          }}
                          value={
                            Array.isArray(batches[batchCacheKey])
                              ? batches[batchCacheKey]
                                  .map((b) => ({
                                    value: b.id.toString(),
                                    label: `${b.batchNumber}`
                                  }))
                                  ?.find(
                                    (b) => b.value === item.batchId
                                  )
                              : undefined
                          }
                          placeholder={
                            loadingBatches[batchCacheKey]
                              ? 'Loading batches...'
                              : item.productId
                              ? 'Select batch'
                              : 'Select product first'
                          }
                          isSearchable
                          isDisabled={
                            !item.productId ||
                            loadingBatches[batchCacheKey]
                          }
                          isLoading={loadingBatches[batchCacheKey]}
                          styles={isDark ? darkStyles : {}}
                          noOptionsMessage={() =>
                            'No batches available'
                          }
                        />
                      </div>
                      {item.productId && (
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() =>
                            openBatchModalForProduct(
                              index,
                              item.productId,
                              item.subProductId
                            )
                          }
                          title='Create new batch'
                          disabled={loadingBatches[batchCacheKey]}
                        >
                          {loadingBatches[batchCacheKey] ? (
                            <div className='animate-spin'>⟳</div>
                          ) : (
                            <IconPlus size={16} />
                          )}
                        </Button>
                      )}
                    </div>
                    {form.formState.errors.items?.[index]?.batchId && (
                      <p className='mt-1 text-xs text-destructive'>
                        {form.formState.errors.items[index]?.batchId?.message}
                      </p>
                    )}

                    {/* Quantity */}
                    <div>
                      <Input
                        type='number'
                        placeholder='Qty'
                        min={1}
                        step={1}
                        // Blank until entered, so no row is saved with a
                        // quantity nobody typed
                        value={item.quantity || ''}
                        // Scrolling a long list must not change the number
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => {
                          const newItems = [...items];
                          const quantity = Number(e.target.value);
                          newItems[index].quantity = isNaN(quantity)
                            ? 0
                            : quantity;
                          newItems[index].totalPrice =
                            newItems[index].quantity *
                            newItems[index].unitPrice;
                          form.setValue('items', newItems);
                          updateItemTotal(index);
                        }}
                      />
                      {form.formState.errors.items?.[index]?.quantity && (
                        <p className='mt-1 text-xs text-destructive'>
                          {form.formState.errors.items[index]?.quantity?.message}
                        </p>
                      )}
                    </div>

                    {/* Unit Price */}
                    <div>
                      <Input
                        type='number'
                        placeholder='Price'
                        value={item.unitPrice}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => {
                          const newItems = [...items];
                          const unitPrice = Number(e.target.value);
                          newItems[index].unitPrice = isNaN(unitPrice)
                            ? 0
                            : unitPrice;
                          newItems[index].totalPrice =
                            newItems[index].quantity *
                            newItems[index].unitPrice;
                          form.setValue('items', newItems);
                          updateItemTotal(index);
                        }}
                      />
                      {form.formState.errors.items?.[index]?.unitPrice && (
                        <p className='mt-1 text-xs text-destructive'>
                          {form.formState.errors.items[index]?.unitPrice?.message}
                        </p>
                      )}
                    </div>

                    {/* Total Price */}
                    <div className='flex items-center justify-center'>
                      <span className='text-sm font-medium'>
                        {(item.quantity * item.unitPrice).toFixed(2)}
                      </span>
                    </div>

                    {/* Delete Button */}
                    <div className='col-span-2'>
                      <Button
                        type='button'
                        variant='destructive'
                        size='sm'
                        onClick={() => {
                          const newItems = [...items];
                          newItems.splice(index, 1);
                          form.setValue('items', newItems);
                        }}
                        disabled={items.length <= 1}
                      >
                        <IconTrash size={16} />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Summary Row - Updated column spans */}
              <div className='grid grid-cols-8 items-center gap-4 border-t pt-4'>
                <div className='col-span-5 text-right font-semibold'>
                  Summary:
                </div>
                <div className='text-center text-lg font-bold'>
                  {grandTotal.toFixed(2)}
                </div>
                <div className='col-span-2'></div>
              </div>

              <div className='grid grid-cols-8 items-center gap-4'>
                <div className='col-span-6 text-sm'>
                  Total Products: {totalProducts}
                </div>
                <div className='col-span-2 text-right'>
                  <Button
                    type='button'
                    onClick={() => {
                      form.setValue('items', [
                        ...items,
                        {
                          productId: '',
                          subProductId: '',
                          batchId: '',
                          quantity: 0,
                          unitPrice: 0,
                          totalPrice: 0
                        }
                      ]);
                    }}
                  >
                    Add Item
                  </Button>
                </div>
              </div>
            </div>

            {/* Grand Total Display */}
            <div className='rounded-lg p-4'>
              <div className='flex items-center justify-between'>
                <div className='text-lg font-semibold'>Grand Total</div>
                <div className='text-2xl font-bold text-green-600'>
                  {grandTotal.toFixed(2)}
                </div>
              </div>
            </div>

            <div className='flex justify-end gap-2'>
              <Button type='submit' disabled={isLoading}>
                {isEdit ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Supplier Creation Modal */}
      <Modal
        isOpen={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        title='Create New Supplier'
        description={''}
      >
        <CreateSupplierModal
          closeModal={() => setShowSupplierModal(false)}
          onSuccess={handleSupplierCreated}
        />
      </Modal>

      {/* Product Batch Creation Modal */}
      <Modal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        title='Create Product Batch'
        description={''}
      >
        <CreateProductBatchModal
          closeModal={() => setShowBatchModal(false)}
          initialProductId={selectedProductForBatch}
          initialSubProductId={selectedSubProductForBatch}
          onSuccess={handleBatchCreated}
        />
      </Modal>
    </>
  );
}