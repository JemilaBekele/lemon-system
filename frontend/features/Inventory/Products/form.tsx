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
import { useForm, useFieldArray, Control } from 'react-hook-form';
import { createProduct, updateProduct } from '@/service/Product';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { IProduct } from '@/models/Product';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { IUnitOfMeasure } from '@/models/UnitOfMeasure';
import Select, { SingleValue } from 'react-select';
import { Modal } from '@/components/ui/modal';
import { getUnitsOfMeasure } from '@/service/UnitOfMeasure';
import UnitOfMeasureForm from '../UnitOfMeasure/form';
import { RefreshCw, Plus, Trash2, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { IShop } from '@/models/shop';
import { Checkbox } from '@/components/ui/checkbox';

// One price in the form. It can apply to several shops; no shops ticked
// means every shop. It is saved as one row per shop.
interface PriceFormData {
  label: string;
  price: number | null; // null = box left empty (saved as 0)
  shopIds: string[];
}

// Merge stored rows (one per shop) that share a label and price into one form
// entry with several shops. Rows without a shop stay their own entry.
const groupPricesByShop = (
  prices: { label?: string; price: number | string; shopId?: string | null }[],
  fallbackLabel: (index: number) => string
): PriceFormData[] => {
  const groups = new Map<string, PriceFormData>();
  prices.forEach((price, index) => {
    const label = price.label || fallbackLabel(index);
    const amount = Number(price.price) || 0;
    const key = `${label.toLowerCase()}|${amount}|${price.shopId ? 'shop' : 'all'}`;
    const group = groups.get(key);
    if (group) {
      if (price.shopId) group.shopIds.push(price.shopId);
    } else {
      groups.set(key, {
        label,
        price: amount,
        shopIds: price.shopId ? [price.shopId] : []
      });
    }
  });
  return [...groups.values()];
};

// Append prices as one row per ticked shop (or one row with no shop)
const appendPrices = (
  formData: FormData,
  keyPrefix: string,
  prices: PriceFormData[]
) => {
  let row = 0;
  prices.forEach((price) => {
    const shopIds = price.shopIds?.length ? price.shopIds : [''];
    shopIds.forEach((shopId) => {
      const key = `${keyPrefix}[${row}]`;
      formData.append(`${key}[label]`, price.label.trim());
      formData.append(`${key}[price]`, String(price.price ?? 0));
      if (shopId) formData.append(`${key}[shopId]`, shopId);
      row += 1;
    });
  });
};

// Tick the shops a price applies to; none ticked means all shops
function ShopCheckboxes({
  shops,
  value,
  onChange
}: {
  shops: SelectOption[];
  value: string[];
  onChange: (shopIds: string[]) => void;
}) {
  const selected = value || [];
  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap gap-x-4 gap-y-2 rounded-md border p-2'>
        {shops.map((shop) => (
          <label
            key={shop.value}
            className='flex cursor-pointer items-center gap-2 text-sm'
          >
            <Checkbox
              checked={selected.includes(shop.value)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...selected, shop.value]
                    : selected.filter((id) => id !== shop.value)
                )
              }
            />
            {shop.label}
          </label>
        ))}
        {shops.length === 0 && (
          <span className='text-muted-foreground text-sm'>No shops</span>
        )}
      </div>
      <p className='text-muted-foreground text-xs'>
        {selected.length === 0
          ? 'No shop ticked: applies to all shops'
          : `Applies to ${selected.length} shop${selected.length > 1 ? 's' : ''}`}
      </p>
    </div>
  );
}

interface SubProductFormData {
  name: string;
  imageUrl: string;
  isActive: boolean;
  sellPrice: number | null; // this sub-product's sell price
  ecommercePrice: number | null; // price in the e-commerce shop
  additionalPrices: PriceFormData[]; // this sub-product's own prices
  tempId?: string; // For tracking during form submission
  // Note: subProductCode is removed from UI but will be generated in backend
}

interface ProductFormValues {
  productCode: string;
  name: string;
  generic?: string;
  description?: string;
  categoryId: string;
  subCategoryId?: string;
  unitOfMeasureId: string;
  sellPrice: number | null;
  ecommercePrice: number | null; // price in the e-commerce shop
  warningQuantity: number | null; // null = box left empty (saved as 0)
  imageUrl: string;
  isActive: boolean;
  additionalPrices: PriceFormData[];
  subProducts: SubProductFormData[];
}

interface SelectOption {
  value: string;
  label: string;
}

interface ProductFormProps {
  initialData: IProduct | null;
  pageTitle: string;
  categories?: { id: string; name: string }[];
  subCategories?: {
    category: any; id: string; name: string; categoryId: string 
}[];
  unitsOfMeasure?: IUnitOfMeasure[];
  shops?: IShop[];
}

// Optional price input: an empty box means "not set" (null)
function PriceInput({
  value,
  onChange,
  placeholder
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  placeholder: string;
}) {
  return (
    <Input
      type='number'
      step='0.01'
      min='0'
      placeholder={placeholder}
      value={value === null || value === undefined ? '' : value}
      onChange={(e) =>
        onChange(e.target.value === '' ? null : parseFloat(e.target.value))
      }
      onWheel={(e) => e.currentTarget.blur()}
    />
  );
}

// Additional prices of one sub-product (label, price, optional shop)
function SubProductPricesEditor({
  control,
  subIndex,
  shopOptions
}: {
  control: Control<ProductFormValues>;
  subIndex: number;
  shopOptions: SelectOption[];
}) {
  const pricesArray = useFieldArray({
    control,
    name: `subProducts.${subIndex}.additionalPrices` as const
  });

  return (
    <div className='space-y-3 border-t pt-4'>
      <div className='flex items-center justify-between'>
        <span className='text-sm font-medium'>Additional Prices</span>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() =>
            pricesArray.append({
              label: '',
              price: null,
              shopIds: []
            })
          }
          className='flex items-center gap-2'
        >
          <Plus className='h-4 w-4' />
          Add Price
        </Button>
      </div>

      {pricesArray.fields.length === 0 && (
        <p className='text-muted-foreground text-sm'>
          No additional prices for this sub-product.
        </p>
      )}

      {pricesArray.fields.map((priceField, priceIndex) => (
        <div
          key={priceField.id}
          className='grid grid-cols-1 items-end gap-3 rounded-md border p-3 md:grid-cols-12'
        >
          <div className='md:col-span-3'>
            <FormField
              control={control}
              name={`subProducts.${subIndex}.additionalPrices.${priceIndex}.label`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input placeholder='Enter label' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className='md:col-span-3'>
            <FormField
              control={control}
              name={`subProducts.${subIndex}.additionalPrices.${priceIndex}.price`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price</FormLabel>
                  <FormControl>
                    <PriceInput
                      value={field.value}
                      onChange={field.onChange}
                      placeholder='0.00'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className='md:col-span-4'>
            <FormField
              control={control}
              name={`subProducts.${subIndex}.additionalPrices.${priceIndex}.shopIds`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shops</FormLabel>
                  <FormControl>
                    <ShopCheckboxes
                      shops={shopOptions}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className='md:col-span-2'>
            <Button
              type='button'
              variant='destructive'
              size='sm'
              onClick={() => pricesArray.remove(priceIndex)}
              className='w-full'
            >
              <Trash2 className='h-4 w-4' />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProductForm({
  initialData,
  pageTitle,
  categories = [],
  subCategories: initialSubCategories = [],
  unitsOfMeasure: initialUnits = [],
  shops: initialShops = []
}: ProductFormProps) {
  const router = useRouter();
  const [mainProductPreview, setMainProductPreview] = useState<string | null>(null);
  const [subProductPreviews, setSubProductPreviews] = useState<{[key: string]: string}>({});
  const [isRefreshingUnits, setIsRefreshingUnits] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [unitsOfMeasure, setUnitsOfMeasure] = useState<IUnitOfMeasure[]>(
    initialUnits || []
  );
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [subCategories, setSubCategories] = useState<
    { id: string; name: string; categoryId: string }[]
  >(initialSubCategories || []);

  const shops = initialShops;

  const defaultValues = useMemo<ProductFormValues>(
    () => ({
      productCode: initialData?.productCode || '',
      name: initialData?.name || '',
      generic: initialData?.generic || '',
      description: initialData?.description || '',
      categoryId: initialData?.categoryId || '',
      subCategoryId: initialData?.subCategoryId || '',
      unitOfMeasureId: initialData?.unitOfMeasureId || '',
      sellPrice: initialData?.sellPrice || null,
      ecommercePrice:
        initialData?.ecommercePrice !== null &&
        initialData?.ecommercePrice !== undefined
          ? Number(initialData.ecommercePrice)
          : null,
      // Empty box for a new product; a saved value (even 0) shows as is
      warningQuantity: initialData?.warningQuantity ?? null,
      imageUrl: initialData?.imageUrl || '',
      isActive: initialData?.isActive ?? true,
      additionalPrices: initialData?.AdditionalPrice
        ? groupPricesByShop(
            initialData.AdditionalPrice,
            (index) => `Label ${index + 1}`
          )
        : [
            { label: '', price: null, shopIds: [] },
            { label: '', price: null, shopIds: [] }
          ],
      subProducts: initialData?.subProducts?.map(sub => ({
        name: sub.name,
        imageUrl: sub.imageUrl || '',
        isActive: sub.isActive,
        sellPrice:
          sub.sellPrice !== null && sub.sellPrice !== undefined
            ? Number(sub.sellPrice)
            : null,
        ecommercePrice:
          sub.ecommercePrice !== null && sub.ecommercePrice !== undefined
            ? Number(sub.ecommercePrice)
            : null,
        additionalPrices: groupPricesByShop(
          sub.additionalPrices || [],
          () => ''
        ),
        tempId: sub.id // Store original ID for reference
      })) || []
    }),
    [initialData]
  );

  const form = useForm<ProductFormValues>({
    defaultValues
  });

  const additionalPricesArray = useFieldArray({
    control: form.control,
    name: 'additionalPrices'
  });

  const subProductsArray = useFieldArray({
    control: form.control,
    name: 'subProducts'
  });

  // Check if there are any subproducts
  const hasSubProducts = subProductsArray.fields.length > 0;

  // Filter subcategories when category changes
  const selectedCategoryId = form.watch('categoryId');

  useEffect(() => {
  if (!selectedCategoryId) {
    setSubCategories([]);
    form.setValue('subCategoryId', '');
    return;
  }

  // Filter subcategories - handle both nested category object and direct categoryId
  const filteredSubCategories = initialSubCategories.filter((sub) => {
    // Check if sub has nested category object or direct categoryId property
    const catId = sub.category?.id || sub.categoryId;
    return catId === selectedCategoryId;
  });

  setSubCategories(filteredSubCategories);

  // Reset subcategory if the current one doesn't belong to the selected category
  const currentSubCategoryId = form.getValues('subCategoryId');
  if (currentSubCategoryId) {
    const isValidSubCategory = filteredSubCategories.some(
      (sub) => sub.id === currentSubCategoryId
    );
    if (!isValidSubCategory) {
      form.setValue('subCategoryId', '');
    }
  }
}, [selectedCategoryId, form, initialSubCategories]);

  // Handle main product image preview
  useEffect(() => {
    if (initialData?.imageUrl) {
      setMainProductPreview(initialData.imageUrl);
    } else {
      setMainProductPreview(null);
    }
  }, [initialData]);

  // Handle subproduct images preview
  useEffect(() => {
    if (initialData?.subProducts) {
      const previews: {[key: string]: string} = {};
      initialData.subProducts.forEach(sub => {
        if (sub.imageUrl) {
          previews[sub.id] = sub.imageUrl;
        }
      });
      setSubProductPreviews(previews);
    }
  }, [initialData]);

  const unitOptions: SelectOption[] = useMemo(
    () =>
      (unitsOfMeasure || []).map((unit) => ({
        value: unit.id,
        label: `${unit.name}${unit.symbol ? ` (${unit.symbol})` : ''}`
      })),
    [unitsOfMeasure]
  );

  const shopOptions: SelectOption[] = useMemo(
    () =>
      (shops || []).map((shop) => ({
        value: shop.id,
        label: shop.name
      })),
    [shops]
  );

  const categoryOptions: SelectOption[] = useMemo(
    () => (categories || []).map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );

  const subCategoryOptions: SelectOption[] = useMemo(
    () =>
      (subCategories || []).map((sub) => ({
        value: sub.id,
        label: sub.name
      })),
    [subCategories]
  );

  const refetchUnits = async () => {
    try {
      setIsRefreshingUnits(true);
      const data = await getUnitsOfMeasure();
      setUnitsOfMeasure(data || []);
      toast.success('Units of measure refreshed');
    } catch  {
      toast.error('Failed to refresh units');
    } finally {
      setIsRefreshingUnits(false);
    }
  };

  const handleMainImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setMainProductPreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      form.setValue('imageUrl', file.name);
    } else {
      if (initialData?.imageUrl) {
        setMainProductPreview(initialData.imageUrl);
      }
    }
  };

  const handleSubProductImageChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const tempId = `temp_${index}`;
        setSubProductPreviews(prev => ({
          ...prev,
          [tempId]: reader.result as string
        }));
        form.setValue(`subProducts.${index}.imageUrl`, file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeSubProductImage = (index: number) => {
    const tempId = `temp_${index}`;
    setSubProductPreviews(prev => {
      const newPreviews = { ...prev };
      delete newPreviews[tempId];
      return newPreviews;
    });
    form.setValue(`subProducts.${index}.imageUrl`, '');
    
    // Clear file input
    const fileInput = document.getElementById(`subproduct-image-${index}`) as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const addSubProduct = () => {
    const newIndex = subProductsArray.fields.length;
    
    subProductsArray.append({
      name: `Subproduct ${newIndex + 1}`,
      imageUrl: '',
      isActive: true,
      sellPrice: null,
      ecommercePrice: null,
      additionalPrices: []
    });
  };

  const removeSubProduct = (index: number) => {
    const subProduct = subProductsArray.fields[index];
    if (subProduct.tempId) {
      setSubProductPreviews(prev => {
        const newPreviews = { ...prev };
        delete newPreviews[subProduct.tempId!];
        return newPreviews;
      });
    }
    subProductsArray.remove(index);
  };

  const onSubmit = async (data: ProductFormValues) => {
    try {
      const formData = new FormData();

      // Convert boolean values properly
      const processedData = {
        ...data,
        isActive:
          typeof data.isActive === 'string'
            ? data.isActive === 'true'
            : Boolean(data.isActive),
        subProducts: data.subProducts.map(sub => ({
          ...sub,
          isActive: typeof sub.isActive === 'string' ? sub.isActive === 'true' : Boolean(sub.isActive)
        }))
      };

      const {
        additionalPrices,
        subProducts,
        sellPrice,
        ecommercePrice,
        warningQuantity,
        ...formValues
      } = processedData;

      // With sub-products the prices belong to each sub-product, so the
      // product's own sell and e-commerce prices are cleared
      const hasSubs = subProducts.length > 0;
      const priceText = (price: number | null | undefined) =>
        price === null || price === undefined ? '' : String(price);
      formData.append('sellPrice', hasSubs ? '' : priceText(sellPrice));

      // An empty box means no warning level
      formData.append('warningQuantity', String(warningQuantity ?? 0));

      // Sent even when empty, so clearing the box clears the price
      formData.append(
        'ecommercePrice',
        hasSubs ? '' : priceText(ecommercePrice)
      );

      // Append main product data
      Object.entries(formValues).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (typeof value === 'boolean') {
            formData.append(key, value.toString());
          } else {
            formData.append(key, value.toString());
          }
        }
      });

      // Only append additional prices if there are NO subproducts
      if (subProducts.length === 0) {
        appendPrices(formData, 'additionalPrices', additionalPrices);
      }

      // Append subproducts (without subProductCode - will be generated in backend)
      subProducts.forEach((subProduct, index) => {
        formData.append(`subProducts[${index}][name]`, subProduct.name);
        formData.append(`subProducts[${index}][isActive]`, subProduct.isActive.toString());
        formData.append(
          `subProducts[${index}][sellPrice]`,
          priceText(subProduct.sellPrice)
        );
        formData.append(
          `subProducts[${index}][ecommercePrice]`,
          subProduct.ecommercePrice === null ||
            subProduct.ecommercePrice === undefined
            ? ''
            : String(subProduct.ecommercePrice)
        );
        
        // Check if this is an existing subproduct that was edited
        if (subProduct.tempId && !subProduct.tempId.startsWith('temp_')) {
          formData.append(`subProducts[${index}][id]`, subProduct.tempId);
        }

        // This sub-product's own prices (the marker lets an empty list clear them)
        formData.append(`subProducts[${index}][hasAdditionalPrices]`, '1');
        appendPrices(
          formData,
          `subProducts[${index}][additionalPrices]`,
          (subProduct.additionalPrices || []).filter(
            (price) => price.label && price.label.trim() !== ''
          )
        );
      });

      // Handle main product image
      const mainImageInput = document.getElementById('main-product-image') as HTMLInputElement;
      if (mainImageInput?.files?.[0]) {
        formData.append('image', mainImageInput.files[0]);
      }

      // Handle subproduct images
      subProducts.forEach((_, index) => {
        const subImageInput = document.getElementById(`subproduct-image-${index}`) as HTMLInputElement;
        if (subImageInput?.files?.[0]) {
          formData.append(`subproduct_image_${index}`, subImageInput.files[0]);
        }
      });

      setIsUploading(true);

      if (initialData?.id) {
        await updateProduct(initialData.id, formData);
        toast.success('Product updated successfully');
        router.push(`/dashboard/Products`);
      } else {
        const createdProduct = await createProduct(formData);
        console.log('createdProduct', createdProduct);
        toast.success('Product created successfully');
        router.push(
          `/dashboard/Products/ProductBatch?id=${createdProduct.product.product.id}`
        );
      }
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || 'Error saving product');
    } finally {
      setIsUploading(false);
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

  const addAdditionalPrice = () => {
    additionalPricesArray.append({
      label: '',
      price: null,
      shopIds: []
    });
  };

  return (
    <>
      <Card className='mx-auto w-full'>
        <CardHeader>
          <CardTitle>{pageTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
              <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                {/* Left Column */}
                <div className='space-y-4'>
                  <FormField
                    name='productCode'
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Code</FormLabel>
                        <FormControl>
                          <Input placeholder='e.g., PRD001' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name='name'
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder='e.g., Paracetamol 500mg'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name='generic'
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Generic Name</FormLabel>
                        <FormControl>
                          <Input placeholder='e.g., Acetaminophen' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name='description'
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder='Product description...'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* Sub-products carry their own prices, so the product-level ones are hidden */}
                  {!hasSubProducts && (
                  <>
                  <FormField
                    name='sellPrice'
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Standard Sell Price</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            step='0.01'
                            min='0'
                            placeholder='Enter sell price'
                            value={field.value === null ? '' : field.value}
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(
                                value === '' ? null : parseFloat(value)
                              );
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name='ecommercePrice'
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-commerce Price</FormLabel>
                        <FormControl>
                          <PriceInput
                            value={field.value}
                            onChange={field.onChange}
                            placeholder='Price in the online shop'
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  </>
                  )}
                  <FormField
                    name='warningQuantity'
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warning Quantity</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            step='1'
                            min='0'
                            placeholder='e.g. 20'
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const value = parseInt(e.target.value, 10);
                              field.onChange(
                                Number.isNaN(value) || value < 0 ? null : value
                              );
                            }}
                          />
                        </FormControl>
                        <div className='text-muted-foreground text-sm'>
                          Low-stock alert when total stock (all batches,
                          stores and shops) reaches this number. 0 = no alert.
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Active Status Switch */}
                  <FormField
                    control={form.control}
                    name='isActive'
                    render={({ field }) => (
                      <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                        <div className='space-y-0.5'>
                          <FormLabel>Product Status</FormLabel>
                          <div className='text-muted-foreground text-sm'>
                            {field.value
                              ? 'Product is active and visible'
                              : 'Product is inactive and hidden'}
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Right Column */}
                <div className='space-y-4'>
                  <FormField
                    name='unitOfMeasureId'
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className='flex items-center justify-between'>
                          <span>Unit of Measure</span>
                          <div className='flex gap-2'>
                            <Button
                              type='button'
                              variant='outline'
                              size='sm'
                              onClick={refetchUnits}
                              disabled={isRefreshingUnits}
                              className='h-8 w-8 p-0'
                              title='Refresh units'
                            >
                              <RefreshCw
                                className={`h-4 w-4 ${isRefreshingUnits ? 'animate-spin' : ''}`}
                              />
                            </Button>
                            <Button
                              type='button'
                              variant='link'
                              size='sm'
                              onClick={() => setIsUnitModalOpen(true)}
                            >
                              + Add New
                            </Button>
                          </div>
                        </FormLabel>
                        <FormControl>
                          <Select
                            options={unitOptions}
                            value={
                              unitOptions.find(
                                (option) => option.value === field.value
                              ) || null
                            }
                            onChange={(selectedOption) => {
                              field.onChange(selectedOption?.value || '');
                            }}
                            onBlur={field.onBlur}
                            placeholder='Search or select a unit...'
                            isSearchable
                            isClearable
                            className='react-select-container'
                            classNamePrefix='react-select'
                            styles={isDark ? darkStyles : {}}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name='categoryId'
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <Select
                            options={categoryOptions}
                            onChange={(option) => field.onChange(option?.value)}
                            value={
                              categoryOptions.find(
                                (c) => c.value === field.value
                              ) || null
                            }
                            placeholder='Select a category'
                            styles={isDark ? darkStyles : {}}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name='subCategoryId'
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subcategory (Optional)</FormLabel>
                        <FormControl>
                          <Select
                            isDisabled={!selectedCategoryId}
                            options={subCategoryOptions}
                            onChange={(
                              option: SingleValue<{
                                value: string;
                                label: string;
                              }>
                            ) => field.onChange(option?.value)}
                            value={
                              field.value
                                ? subCategoryOptions.find(
                                    (s) => s.value === field.value
                                  ) || null
                                : null
                            }
                            placeholder={
                              !selectedCategoryId
                                ? 'Select a category first'
                                : subCategoryOptions.length === 0
                                  ? 'No subcategories available'
                                  : 'Select a subcategory'
                            }
                            styles={isDark ? darkStyles : {}}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Main Product Image Upload Section */}
                  <FormItem>
                    <FormLabel>Product Image</FormLabel>
                    <div className='flex flex-col gap-4'>
                      {mainProductPreview && (
                        <div className='relative h-48 w-full overflow-hidden rounded-md border'>
                          <Image
                            src={mainProductPreview}
                            alt='Product preview'
                            fill
                            className='object-contain'
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                      <Input
                        id='main-product-image'
                        type='file'
                        accept='image/*'
                        onChange={handleMainImageChange}
                      />
                      {initialData?.imageUrl && !mainProductPreview && (
                        <p className='text-muted-foreground text-sm'>
                          Current image: {initialData.imageUrl}
                        </p>
                      )}
                    </div>
                    <FormMessage>
                      {form.formState.errors.imageUrl?.message}
                    </FormMessage>
                  </FormItem>
                </div>
              </div>

              {/* SubProducts Section */}
              <div className='border-t pt-6'>
                <div className='mb-4 flex items-center justify-between'>
                  <CardTitle className='text-lg'>Sub Products</CardTitle>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={addSubProduct}
                    className='flex items-center gap-2'
                  >
                    <Plus className='h-4 w-4' />
                    Add Sub Product
                  </Button>
                </div>

                <div className='space-y-4'>
                  {subProductsArray.fields.map((field, index) => {
                    const tempId = field.tempId || `temp_${index}`;
                    const preview = subProductPreviews[tempId];
                    
                    return (
                      <div
                        key={field.id}
                        className='rounded-lg border p-4 space-y-4'
                      >
                        <div className='flex items-center justify-between'>
                          <h4 className='font-medium'>Sub Product {index + 1}</h4>
                          <Button
                            type='button'
                            variant='ghost'
                            size='sm'
                            onClick={() => removeSubProduct(index)}
                            className='h-8 w-8 p-0'
                          >
                            <X className='h-4 w-4' />
                          </Button>
                        </div>

                        <div className='grid grid-cols-1 md:grid-cols-12 gap-4'>
                          {/* Sub Product Name - 6 columns */}
                          <div className='md:col-span-6'>
                            <FormField
                              control={form.control}
                              name={`subProducts.${index}.name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Name</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder={`e.g., Small, Large, Vanilla`}
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* Active Status - 3 columns */}
                          <div className='md:col-span-3'>
                            <FormField
                              control={form.control}
                              name={`subProducts.${index}.isActive`}
                              render={({ field }) => (
                                <FormItem className='flex flex-col'>
                                  <FormLabel className='mb-2'>Status</FormLabel>
                                  <FormControl>
                                    <div className='flex items-center space-x-2'>
                                      <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                      />
                                      <span className='text-sm'>
                                        {field.value ? 'Active' : 'Inactive'}
                                      </span>
                                    </div>
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* Image Upload - 3 columns */}
                          <div className='md:col-span-3'>
                            <FormField
                              control={form.control}
                              name={`subProducts.${index}.imageUrl`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Image</FormLabel>
                                  <div className='space-y-2'>
                                    {preview && (
                                      <div className='relative h-32 w-full overflow-hidden rounded-md border'>
                                        <Image
                                          src={preview}
                                          alt={`Subproduct ${index + 1} preview`}
                                          fill
                                          className='object-contain'
                                        />
                                        <Button
                                          type='button'
                                          variant='destructive'
                                          size='sm'
                                          onClick={() => removeSubProductImage(index)}
                                          className='absolute right-2 top-2 h-6 w-6 p-0'
                                        >
                                          <X className='h-3 w-3' />
                                        </Button>
                                      </div>
                                    )}
                                    <Input
                                      id={`subproduct-image-${index}`}
                                      type='file'
                                      accept='image/*'
                                      onChange={(e) => handleSubProductImageChange(index, e)}
                                    />
                                  </div>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                          <FormField
                            control={form.control}
                            name={`subProducts.${index}.sellPrice`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Sell Price</FormLabel>
                                <FormControl>
                                  <PriceInput
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder='Enter sell price'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`subProducts.${index}.ecommercePrice`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>E-commerce Price</FormLabel>
                                <FormControl>
                                  <PriceInput
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder='Price in the online shop'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <SubProductPricesEditor
                          control={form.control}
                          subIndex={index}
                          shopOptions={shopOptions}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Message when Sub Products exist - Additional Prices are hidden */}
              {hasSubProducts && (
                <div className='border-t pt-6'>
                  <div className='bg-muted rounded-lg p-4 text-sm'>
                    <p className='text-muted-foreground'>
                      This product has sub-products, so the sell, e-commerce and additional prices are set on each sub-product above.
                    </p>
                  </div>
                </div>
              )}

              {/* Additional Prices Section - Hidden if Sub Products exist */}
              {!hasSubProducts && (
                <div className='border-t pt-6'>
                  <div className='mb-4 flex items-center justify-between'>
                    <CardTitle className='text-lg'>Additional Prices</CardTitle>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={addAdditionalPrice}
                      className='flex items-center gap-2'
                    >
                      <Plus className='h-4 w-4' />
                      Add Price
                    </Button>
                  </div>

                  <div className='space-y-4'>
                    {additionalPricesArray.fields.map((field, index) => (
                      <div
                        key={field.id}
                        className='grid grid-cols-1 items-end gap-4 rounded-lg border p-4 md:grid-cols-12'
                      >
                        {/* Label Input - 3 columns */}
                        <div className='md:col-span-3'>
                          <FormField
                            control={form.control}
                            name={`additionalPrices.${index}.label`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Label</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder='Enter label'
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Price Input - 3 columns */}
                        <div className='md:col-span-3'>
                          <FormField
                            control={form.control}
                            name={`additionalPrices.${index}.price`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Price</FormLabel>
                                <FormControl>
                                  <PriceInput
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder='0.00'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Shop Select - 4 columns */}
                        <div className='md:col-span-4'>
                          <FormField
                            control={form.control}
                            name={`additionalPrices.${index}.shopIds`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Shops</FormLabel>
                                <FormControl>
                                  <ShopCheckboxes
                                    shops={shopOptions}
                                    value={field.value}
                                    onChange={field.onChange}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Remove Button - 2 columns */}
                        <div className='md:col-span-2'>
                          <Button
                            type='button'
                            variant='destructive'
                            size='sm'
                            onClick={() => additionalPricesArray.remove(index)}
                            disabled={additionalPricesArray.fields.length <= 1}
                            className='w-full'
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className='flex justify-end'>
                <Button
                  type='submit'
                  className='w-full md:w-auto'
                  disabled={isUploading}
                >
                  {isUploading
                    ? 'Uploading...'
                    : initialData
                      ? 'Update Product'
                      : 'Create Product'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      <Modal
        title='Add Unit of Measure'
        description='Create a new unit of measure'
        isOpen={isUnitModalOpen}
        onClose={() => {
          setIsUnitModalOpen(false);
          refetchUnits();
        }}
        size='md'
      >
        <UnitOfMeasureForm
          initialData={null}
          closeModal={() => setIsUnitModalOpen(false)}
        />
      </Modal>
    </>
  );
}