/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { Modal } from '@/components/ui/modal';
import { IProduct, IAdditionalPrice, ISubProduct } from '@/models/Product';
import { ISell, ISellItem, SaleStatus } from '@/models/Sell';
import { ICustomer } from '@/models/customer';
import { getCustomer } from '@/service/customer';
import { IShop } from '@/models/shop';
import { getShopsBasedOnUser } from '@/service/shop';
import { createSell } from '@/service/Sell';
import CreateCustomerModal from './customer';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { getProductByShops } from '@/service/Product';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import SelectReac from 'react-select';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

// You can use an environment variable or fallback to a default value
const BACKEND_URL = process.env.NEXT_PUBLIC_API || 'http://localhost:5000';

// Helper functions
const normalizeImagePath = (path?: string | File) => {
  if (!path) return '/placeholder-image.jpg';
  if (typeof path !== 'string') return '/placeholder-image.jpg';

  const normalizedPath = path.replace(/\\/g, '/');
  if (normalizedPath.startsWith('http')) return normalizedPath;

  const cleanPath = normalizedPath.replace(/^\/+/, '');
  return `${BACKEND_URL}/${cleanPath}`;
};

const formatPrice = (price: unknown): string => {
  if (price === null || price === undefined) return '0.00';
  const numericPrice =
    typeof price === 'string' ? parseFloat(price) : Number(price);
  return isNaN(numericPrice) ? '0.00' : `${numericPrice.toFixed(2)}`;
};

const PLACEHOLDER_IMAGE = '/placeholder-image.jpg';

// Save an image under a name built from the product / sub-product name
const downloadImage = async (url: string, name: string) => {
  const fileBase =
    (name || 'product')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'product';
  const extension =
    url.split('?')[0].match(/\.(png|jpe?g|webp|gif|avif|svg)$/i)?.[0] || '.jpg';

  try {
    // Fetch as a blob: the download attribute is ignored for other origins
    // 'reload' skips a cached copy saved without CORS headers
    const response = await fetch(url, { mode: 'cors', cache: 'reload' });
    if (!response.ok) throw new Error('Image request failed');
    const blobUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${fileBase}${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fall back to opening the image so it can be saved manually
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

const DownloadImageButton = ({
  url,
  name,
  className = ''
}: {
  url: string;
  name: string;
  className?: string;
}) => (
  <button
    type='button'
    onClick={(e) => {
      // Don't select the card / option underneath
      e.stopPropagation();
      downloadImage(url, name);
    }}
    onDoubleClick={(e) => e.stopPropagation()}
    title='Download image'
    aria-label={`Download image of ${name}`}
    className={`rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80 ${className}`}
  >
    <svg
      className='h-4 w-4'
      fill='none'
      stroke='currentColor'
      strokeWidth={2}
      viewBox='0 0 24 24'
      aria-hidden='true'
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M12 4v12m0 0l-4-4m4 4l4-4M4 20h16'
      />
    </svg>
  </button>
);

// Props interfaces
interface ProductCardProps {
  product: IProduct;
  onSelectProduct: (product: IProduct) => void;
}

interface ProductSearchProps {
  products: any[];
  categories: any[];
  subCategories: any[];
  initialSearchTerm?: string;
  initialCategoryName?: string;
  initialSubCategoryName?: string;
}

interface SearchFilters {
  category: string;
  subCategory: string;
  productName: string;
}

interface CartItem extends ISellItem {
  product: IProduct;
  shop: IShop;
  selectedPrice: number;
  availableQuantity: number;
  subProduct?: ISubProduct;
}

// Shop stock interface based on getProductByShops response
interface IShopStockInfo {
  shopId: string;
  shopName: string;
  branchName: string;
  quantity: number;
  basePrice?: number | string | null; // standard sell price (sub-product's or product's)
  additionalPrices: IAdditionalPrice[];
  totalPrice?: number;
}

type TPriceOption = { id: string; label: string; price: number };

export interface IProductShopAvailability {
  totalAvailableQuantity: number;
  shops: IShopStockInfo[];
  hasStock: boolean;
}

// SubProduct Selection Modal Component
interface SubProductModalProps {
  product: IProduct | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectSubProduct: (product: IProduct, subProduct: ISubProduct) => void;
}
const SubProductModal = ({ product, isOpen, onClose, onSelectSubProduct }: SubProductModalProps) => {
  const [selectedSubProduct, setSelectedSubProduct] = useState<ISubProduct | null>(null);

  if (!product) return null;

  const subProducts = product.subProducts || [];

  const handleSubProductSelect = (subProduct: ISubProduct) => {
    setSelectedSubProduct(subProduct);
  };

  const handleConfirm = () => {
    if (selectedSubProduct && product) {
      onSelectSubProduct(product, selectedSubProduct);
      onClose();
    }
  };

  const handleDoubleClick = (subProduct: ISubProduct) => {
    if (product) {
      onSelectSubProduct(product, subProduct);
      onClose();
    }
  };

  const getImageUrl = (imagePath?: string | File | null, useFallback: boolean = false): string => {
    if (!imagePath) {
      if (useFallback && product?.imageUrl) {
        return normalizeImagePath(product.imageUrl);
      }
      return '/placeholder-image.jpg';
    }
    if (typeof imagePath !== 'string') return '/placeholder-image.jpg';
    
    const normalizedPath = normalizeImagePath(imagePath);
    
    if (normalizedPath === '' || normalizedPath === 'http://localhost:5000/') {
      if (useFallback && product?.imageUrl) {
        return normalizeImagePath(product.imageUrl);
      }
      return '/placeholder-image.jpg';
    }
    
    return normalizedPath;
  };



  const productImageUrl = getImageUrl(product.imageUrl);

 return (
  <Modal
    title={`Select ${product.name} Option`}
    description="Choose a specific variant of this product"
    isOpen={isOpen}
    onClose={onClose}
    size="xl"
    className="max-w-5xl"
  >
    <div className="flex max-h-[80vh] overflow-hidden">
      
      {/* LEFT SIDE — PRODUCT */}
      <div className="w-1/3 border-r bg-muted/30 p-4">
        <div className="space-y-4">
          <div className="relative aspect-square overflow-hidden rounded-lg border bg-background">
                        {/* eslint-disable-next-line @next/next/no-img-element */}

            <img
              src={productImageUrl}
              alt={product.name}
              className="h-full w-full object-cover"
            />
            {productImageUrl !== PLACEHOLDER_IMAGE && (
              <DownloadImageButton
                url={productImageUrl}
                name={product.name}
                className="absolute top-2 right-2"
              />
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold">{product.name}</h3>
         
          </div>
        </div>
      </div>

      {/* RIGHT SIDE — SUBPRODUCTS */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">
          Available Options ({subProducts.length})
        </h4>

        {subProducts.map((subProduct) => {
          const subProductImageUrl = getImageUrl(subProduct.imageUrl, true);

          return (
            <div
              key={subProduct.id}
              onClick={() => handleSubProductSelect(subProduct)}
              onDoubleClick={() => handleDoubleClick(subProduct)}
              className={`flex items-center gap-4 rounded-lg border p-3 cursor-pointer transition ${
                selectedSubProduct?.id === subProduct.id
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/40"
              }`}
            >
              {/* SUBPRODUCT IMAGE WITH ZOOM */}
              <Dialog>
                <DialogTrigger asChild>
                  <div className="h-16 w-16 overflow-hidden rounded-md border bg-background">
                                {/* eslint-disable-next-line @next/next/no-img-element */}

                    <img
                      src={subProductImageUrl}
                      alt={subProduct.name}
                      className="h-full w-full object-cover hover:scale-110 transition"
                    />
                  </div>
                </DialogTrigger>

                {/* ZOOM VIEW */}
                <DialogContent className="max-w-2xl">
                  <div className="relative">
                    <img
                      src={subProductImageUrl}
                      alt={subProduct.name}
                      className="w-full rounded-md"
                    />
                    {subProductImageUrl !== PLACEHOLDER_IMAGE && (
                      <DownloadImageButton
                        url={subProductImageUrl}
                        name={`${product.name} ${subProduct.name}`}
                        className="absolute top-2 right-2"
                      />
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              {/* TEXT INFO */}
              <div className="flex-1">
                {/* Product name above */}
                <p className="text-xs text-muted-foreground">
                  {product.name} <span className="text-primary">:</span> {subProduct.name}
                </p>

                

                <p className="text-xs text-muted-foreground">
                  {subProduct.subProductCode}
                </p>
              </div>

              {subProductImageUrl !== PLACEHOLDER_IMAGE && (
                <DownloadImageButton
                  url={subProductImageUrl}
                  name={`${product.name} ${subProduct.name}`}
                />
              )}

              {/* RADIO */}
              <input
                type="radio"
                checked={selectedSubProduct?.id === subProduct.id}
                onChange={() => handleSubProductSelect(subProduct)}
                className="h-4 w-4"
              />
            </div>
          );
        })}
      </div>
    </div>

    {/* ACTIONS */}
    <div className="flex justify-end gap-2 border-t p-4">
      <Button variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button
        onClick={handleConfirm}
        disabled={!selectedSubProduct}
      >
        Select Option
      </Button>
    </div>
  </Modal>
);

};

// ProductCard Component
const ProductCard = ({ product, onSelectProduct }: ProductCardProps) => {
  const actualProduct = product;

  const [imageError, setImageError] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const getImageUrls = (): string[] => {
    if (!actualProduct.imageUrl) return ['/placeholder-image.jpg'];

    if (Array.isArray(actualProduct.imageUrl)) {
      return actualProduct.imageUrl.map((url) => normalizeImagePath(url));
    }

    return [normalizeImagePath(actualProduct.imageUrl)];
  };

  const imageUrls = getImageUrls();
  const currentImageUrl = imageError
    ? '/placeholder-image.jpg'
    : imageUrls[currentImageIndex];
  const hasMultipleImages = imageUrls.length > 1;
  const formattedPrice = formatPrice(actualProduct.sellPrice);
  const subProductCount = actualProduct.subProductCount || 0;

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % imageUrls.length);
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex(
      (prev) => (prev - 1 + imageUrls.length) % imageUrls.length
    );
  };


  const canDownload = !imageError && currentImageUrl !== PLACEHOLDER_IMAGE;

  // Check if the URL is external (starts with http)
  const isExternalUrl = currentImageUrl.startsWith('http');

  return (
    <Card
      className='group w-62.5 cursor-pointer overflow-hidden transition-shadow hover:shadow-lg'
      onClick={() => onSelectProduct(actualProduct)}
    >
      <CardHeader className='relative p-0'>
        <div className='relative h-37.5 w-full'>
          {isExternalUrl ? (
            // Use regular img tag for external URLs
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentImageUrl}
              alt={actualProduct.name}
              className='h-full w-full object-cover'
              onError={() => setImageError(true)}
            />
          ) : (
            // Use Next.js Image for local images
            <Image
              src={currentImageUrl}
              alt={actualProduct.name}
              fill
              className='object-cover'
              sizes='(max-width: 768px) 100vw, 300px'
              priority={false}
              onError={() => setImageError(true)}
            />
          )}

          {canDownload && (
            <DownloadImageButton
              url={currentImageUrl}
              name={actualProduct.name}
              className='absolute top-2 right-2'
            />
          )}

          {hasMultipleImages && (
            <>
              <button
                className='bg-opacity-50 absolute top-1/2 left-2 -translate-y-1/2 transform rounded-full bg-black p-1 text-white'
                onClick={handlePrevImage}
              >
                ‹
              </button>
              <button
                className='bg-opacity-50 absolute top-1/2 right-2 -translate-y-1/2 transform rounded-full bg-black p-1 text-white'
                onClick={handleNextImage}
              >
                ›
              </button>

              <div className='absolute bottom-2 left-1/2 flex -translate-x-1/2 transform space-x-1'>
                {imageUrls.map((_, index) => (
                  <div
                    key={index}
                    className={`h-2 w-2 rounded-full ${
                      index === currentImageIndex
                        ? 'bg-white'
                        : 'bg-opacity-50 bg-white'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Long names are cut to one line; hovering the card shows the full name */}
        <h3
          className='line-clamp-1 text-lg font-semibold wrap-break-word group-hover:line-clamp-none'
          title={actualProduct.name}
        >
          {actualProduct.name}
        </h3>

        <div className='mt-2 flex flex-wrap gap-2'>
          {subProductCount > 0 && (
            <span className='inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800'>
              <svg className='mr-1 h-3 w-3' fill='currentColor' viewBox='0 0 20 20'>
                <path d='M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' />
              </svg>
              {subProductCount} {subProductCount === 1 ? 'Option' : 'Options'}
            </span>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <p className='text-primary text-xl font-bold'>{formattedPrice}</p>
      </CardFooter>
    </Card>
  );
};

// Shop and Batch Selection Modal
interface ShopBatchModalProps {
  product: IProduct | null;
  subProduct?: ISubProduct | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

const ShopBatchModal = ({
  product,
  subProduct,
  isOpen,
  onClose,
  onAddToCart
}: ShopBatchModalProps) => {
  const [shops, setShops] = useState<IShop[]>([]);
  const [selectedShop, setSelectedShop] = useState<IShop | null>(null);
  const [shopAvailability, setShopAvailability] =
    useState<IProductShopAvailability | null>(null);
  const [selectedPriceOption, setSelectedPriceOption] =
    useState<string>('custom');
  const [customPrice, setCustomPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setCustomers] = useState<ICustomer[]>([]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const customersData = await getCustomer();
      setCustomers(customersData);
    } catch (err) {
      toast.error(err as string);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    const fetchShops = async () => {
      try {
        setLoading(true);
        const shopsData = await getShopsBasedOnUser();
        setShops(shopsData);
      } catch  {
        setError('Failed to fetch shops');
      } finally {
        setLoading(false);
      }
    };

    if (isOpen && product) {
      fetchShops();
    }
  }, [isOpen, product]);

  useEffect(() => {
    const fetchShopAvailability = async () => {
      if (!product) return;

      try {
        setLoading(true);
        setError(null);
        
        // Pass subProductId if available
        const availabilityData = await getProductByShops(
          product.id, 
          subProduct?.id // 👈 Pass subProductId when available
        );
        
        setShopAvailability(availabilityData);

        if (availabilityData?.shops?.length > 0) {
          const firstAvailableShop = shops.find((shop) =>
            availabilityData.shops.some(
              (avail: { shopId: string; quantity: number }) =>
                avail.shopId === shop.id && avail.quantity > 0
            )
          );
          if (firstAvailableShop) {
            setSelectedShop(firstAvailableShop);
          }
        }
      } catch  {
        setError('Failed to fetch product availability');
      } finally {
        setLoading(false);
      }
    };

    if (isOpen && product && shops.length > 0) {
      fetchShopAvailability();
    }
  }, [isOpen, product, shops, subProduct]);

  const getAvailableStockForSelectedShop = (): number => {
    if (!selectedShop || !shopAvailability) return 0;

    const shopStock = shopAvailability.shops.find(
      (shop) => shop.shopId === selectedShop.id
    );
    return shopStock?.quantity || 0;
  };

  // The product's additional prices for this shop. The standard sell price
  // is shown on the product card only, not offered here.
  const getPriceOptionsForSelectedShop = (): TPriceOption[] => {
    if (!selectedShop || !shopAvailability) return [];

    const shopStock = shopAvailability.shops.find(
      (shop) => shop.shopId === selectedShop.id
    );
    if (!shopStock) return [];

    return (shopStock.additionalPrices || []).map((ap) => ({
      id: ap.id,
      label: ap.label ?? 'Price',
      price: Number(ap.price)
    }));
  };

  const getUnitPrice = (): number => {
    if (!product) return 0;

    if (selectedPriceOption === 'custom') {
      return parseFloat(customPrice) || 0;
    }
    const option = getPriceOptionsForSelectedShop().find(
      (o) => o.id === selectedPriceOption
    );
    return option?.price || 0;
  };

  const handleAddToCart = () => {
    if (!product || !selectedShop) return;

    const unitPrice = getUnitPrice();
    const availableQuantity = getAvailableStockForSelectedShop();

    const cartItem: CartItem = {
      id: `temp-${Date.now()}`,
      sellId: '',
      shopId: selectedShop.id,
      productId: product.id,
      subProductId: subProduct?.id,
      unitOfMeasureId: product.unitOfMeasureId,
      itemSaleStatus: 'PENDING' as any,
      quantity,
      unitPrice,
      totalPrice: unitPrice * quantity,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      product,
      subProduct: subProduct || undefined,
      shop: selectedShop,
      selectedPrice: unitPrice,
      availableQuantity
    };

    onAddToCart(cartItem);
    onClose();
    resetModal();
  };

  const resetModal = () => {
    setSelectedShop(null);
    setSelectedPriceOption('custom');
    setCustomPrice('');
    setShopAvailability(null);
    setQuantity(1);
    setError(null);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleShopSelect = (shop: IShop) => {
    setSelectedShop(shop);
    setQuantity(1);
  };

  const handleQuantityChange = (value: string) => {
    if (value === '') {
      setQuantity(0);
    } else {
      const numValue = Number(value);
      setQuantity(numValue);
    }
  };

  const availableStock = getAvailableStockForSelectedShop();
  const unitPrice = getUnitPrice();
  const displayQuantity = quantity > 0 ? quantity : '';
  const totalPrice = unitPrice * (quantity > 0 ? quantity : 0);
  const priceOptions = getPriceOptionsForSelectedShop();

  // The unit price starts empty for every shop: the user picks one of the
  // listed prices (or types one) on purpose
  useEffect(() => {
    if (selectedShop) {
      setCustomPrice('');
      setSelectedPriceOption('custom');
    }
  }, [selectedShop]);

  const displayName = subProduct 
    ? `${product?.name} - ${subProduct.name}`
    : product?.name || '';

  return (
    <Modal
      title={`Select Shop for ${displayName}`}
      description='Choose a shop and set the price for this product'
      isOpen={isOpen}
      onClose={handleClose}
      size='lg'
      className='w-full max-w-[95vw] sm:max-w-[80vw] md:max-w-4xl'
    >
      <div className='max-h-[80vh] space-y-4 overflow-y-auto py-2 sm:py-4'>
        {/* Product/SubProduct Info */}
        {(product || subProduct) && (
          <div className='flex items-center space-x-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800'>
          
            <div>
           <h3 className="font-semibold text-gray-900 dark:text-gray-100">
  {product?.name}
  {subProduct && (
    <span>
      : {subProduct.name}
    </span>
  )}
</h3>

            
           
            </div>
          </div>
        )}

        {/* Combined Shop Availability and Selection */}
        {shopAvailability && (
          <div className='space-y-3'>
            <Label className='text-sm font-semibold sm:text-base'>
              Available Shops
            </Label>

            <div className='overflow-hidden rounded-md border border-gray-300 dark:border-gray-600'>
              <Table>
                <TableHeader>
                  <TableRow className='bg-gray-50 hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-800'>
                    <TableHead className='w-10 text-gray-900 dark:text-gray-100'>
                      Select
                    </TableHead>
                    <TableHead className='text-gray-900 dark:text-gray-100'>
                      Shop Name
                    </TableHead>
                    <TableHead className='text-gray-900 dark:text-gray-100'>
                      Available Quantity
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shopAvailability.shops.map((shopAvail) => {
                    const shop = shops.find((s) => s.id === shopAvail.shopId);
                    const isSelected = selectedShop?.id === shopAvail.shopId;
                    const isAvailable = shopAvail.quantity > 0;

                    return (
                      <TableRow
                        key={shopAvail.shopId}
                        className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${
                          isSelected
                            ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
                            : ''
                        } ${!isAvailable ? 'opacity-50' : ''}`}
                        onClick={() =>
                          isAvailable && shop && handleShopSelect(shop)
                        }
                      >
                        <TableCell>
                          <div className='flex items-center justify-center'>
                            <input
                              type='radio'
                              checked={isSelected}
                              onChange={() =>
                                isAvailable && shop && handleShopSelect(shop)
                              }
                              className='h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-blue-400'
                              disabled={!isAvailable}
                            />
                          </div>
                        </TableCell>
                        <TableCell className='font-medium'>
                          <div>
                            <div className='font-semibold text-gray-900 dark:text-gray-100'>
                              {shopAvail.shopName}
                            </div>
                            {shop?.branch?.name && (
                              <div className='text-xs text-gray-500 dark:text-gray-400'>
                                {shop.branch.name}
                              </div>
                            )}
                            {isSelected && (
                              <div className='mt-1 text-xs font-semibold text-green-600 dark:text-green-400'>
                                ✓ Selected
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`font-bold ${
                              shopAvail.quantity > 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {shopAvail.quantity} units
                          </span>
                          {!isAvailable && (
                            <div className='mt-1 text-xs text-red-500 dark:text-red-400'>
                              Out of stock
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && !shopAvailability && (
          <div className='flex justify-center py-8'>
            <div className='h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600 dark:border-blue-400'></div>
          </div>
        )}

        {/* Price Selection */}
        <div className='space-y-4 border-t border-gray-200 pt-4 dark:border-gray-600'>
          <div className='space-y-2'>
            <Label
              htmlFor='unitPrice'
              className='flex items-center gap-2 text-sm text-gray-900 sm:text-base dark:text-gray-100'
            >
              Unit Price
              {!selectedShop && (
                <span className='text-xs text-gray-500 dark:text-gray-400'>
                  (Select a shop first)
                </span>
              )}
            </Label>
            <Input
              type='number'
              id='unitPrice'
              min='0'
              step='0.01'
              value={customPrice}
              onChange={(e) => {
                setSelectedPriceOption('custom');
                setCustomPrice(e.target.value);
              }}
              placeholder='Enter unit price'
              className='w-full border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-500 sm:text-base dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400'
              disabled={!selectedShop}
            />
          </div>

          {/* Product prices: additional prices only */}
          {selectedShop && priceOptions.length > 0 && (
            <div className='space-y-2'>
              <div className='text-xs text-gray-500 dark:text-gray-400'>
                Prices for this product
              </div>
              <div className='flex flex-wrap gap-2'>
                {priceOptions.map((option) => (
                  <Button
                    key={option.id}
                    type='button'
                    variant={
                      selectedPriceOption === option.id ? 'default' : 'outline'
                    }
                    size='sm'
                    onClick={() => {
                      setSelectedPriceOption(option.id);
                      setCustomPrice(option.price.toString());
                    }}
                    className='text-xs sm:text-sm'
                  >
                    {option.label}: {formatPrice(option.price)}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quantity Input */}
        <div className='space-y-2'>
          <Label
            htmlFor='quantity'
            className='flex items-center gap-2 text-sm text-gray-900 sm:text-base dark:text-gray-100'
          >
            Quantity
            {!selectedShop && (
              <span className='text-xs text-gray-500 dark:text-gray-400'>
                (Select a shop first)
              </span>
            )}
          </Label>
          <Input
            type='number'
            id='quantity'
            min='0'
            step='1'
            value={displayQuantity}
            onChange={(e) => handleQuantityChange(e.target.value)}
            placeholder='Enter quantity'
            className={`w-full border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-500 sm:text-base dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 ${
              quantity > availableStock && selectedShop
                ? 'border-red-500 bg-red-50 dark:border-red-400 dark:bg-red-900/20'
                : ''
            }`}
            disabled={!selectedShop}
          />
          <p
            className={`text-xs sm:text-sm ${
              quantity > availableStock && selectedShop
                ? 'font-semibold text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {selectedShop ? (
              <>
                Available: {availableStock} units
                {quantity > availableStock &&
                  ' - Quantity exceeds available stock!'}
                {quantity <= 0 &&
                  quantity !== 0 &&
                  ' - Please enter a valid quantity greater than 0'}
              </>
            ) : (
              'Select a shop to see available quantity'
            )}
          </p>
        </div>

        {/* Price Summary */}
        <div className='rounded-md border border-gray-200 bg-gray-50 p-3 sm:p-4 dark:border-gray-600 dark:bg-gray-800'>
          <h4 className='mb-3 text-sm font-semibold text-gray-900 sm:text-base dark:text-gray-100'>
            Order Summary
          </h4>

          <div className='space-y-2'>
            {selectedShop ? (
              <>
                <div className='flex items-center justify-between text-sm sm:text-base'>
                  <span className='font-medium text-gray-700 dark:text-gray-300'>
                    Unit Price:
                  </span>
                  <span className='font-bold text-green-600 dark:text-green-400'>
                    {formatPrice(unitPrice)}
                  </span>
                </div>

                <div className='flex items-center justify-between text-sm sm:text-base'>
                  <span className='font-medium text-gray-700 dark:text-gray-300'>
                    Quantity:
                  </span>
                  <span className='text-gray-900 dark:text-gray-100'>
                    {quantity > 0 ? quantity : 'Enter quantity'}
                  </span>
                </div>

                <div className='mt-2 border-t border-gray-200 pt-2 dark:border-gray-600'>
                  <div className='flex items-center justify-between text-sm font-bold sm:text-base'>
                    <span className='text-gray-900 dark:text-gray-100'>
                      Total:
                    </span>
                    <span className='text-blue-600 dark:text-blue-400'>
                      {quantity > 0 ? formatPrice(totalPrice) : '--'}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className='py-4 text-center text-sm text-gray-500 dark:text-gray-400'>
                Select a shop to see order summary
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className='rounded-md bg-red-100 p-2 text-sm text-red-700 sm:text-base dark:bg-red-900/20 dark:text-red-400'>
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className='flex flex-col justify-end space-y-2 pt-4 sm:flex-row sm:space-y-0 sm:space-x-2'>
          <Button
            variant='outline'
            onClick={handleClose}
            className='w-full border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50 sm:w-auto sm:py-2.5 sm:text-base dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddToCart}
            disabled={
              !selectedShop ||
              loading ||
              quantity > availableStock ||
              quantity <= 0 ||
              availableStock === 0 ||
              unitPrice <= 0
            }
            className={`w-full py-2 text-sm sm:w-auto sm:py-2.5 sm:text-base ${
              quantity > availableStock && selectedShop
                ? 'bg-red-500 text-white hover:bg-red-600'
                : quantity <= 0
                  ? 'cursor-not-allowed bg-gray-400 text-white hover:bg-gray-500'
                  : ''
            }`}
          >
            {quantity > availableStock && selectedShop
              ? 'Quantity Too High'
              : quantity <= 0
                ? 'Enter Valid Quantity'
                : 'Add to Cart'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// Cart Component
interface CartProps {
  items: CartItem[];
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onCreateOrder: (orderData: Partial<ISell>) => Promise<void>;
  onResetCart: () => void;
}

const Cart = ({
  items,
  onUpdateQuantity,
  onRemoveItem,
  onCreateOrder,
  onResetCart
}: CartProps) => {
  const [customers, setCustomers] = useState<ICustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isOrderConfirmModalOpen, setIsOrderConfirmModalOpen] = useState(false);
  const [customerError, setCustomerError] = useState<string>('');

  const validateForm = () => {
    if (!selectedCustomer) {
      setCustomerError('Customer selection is required');
      return false;
    }
    setCustomerError('');
    return true;
  };

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const customersData = await getCustomer();
        setCustomers(customersData);
      } catch (err) {
        toast.error(err as string);
      }
    };

    fetchCustomers();
  }, []);

  const handleRefreshCustomers = async () => {
    try {
      setLoading(true);
      const customersData = await getCustomer();
      setCustomers(customersData);
    } catch  {
    } finally {
      setLoading(false);
    }
  };

  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const grandTotal = subtotal - discount;

  const handleCreateOrder = async () => {
    if (!validateForm()) {
      return;
    }
    if (items.length === 0) return;

    const sellItems: ISellItem[] = items.map((item) => ({
      id: item.id,
      sellId: item.sellId,
      shopId: item.shop.id,
      productId: item.product.id,
      subProductId: item.subProduct?.id,
      unitOfMeasureId: item.product.unitOfMeasureId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      itemSaleStatus: 'PENDING' as any
    }));

    const orderData: Partial<ISell> = {
      customerId: selectedCustomer || undefined,
      totalProducts: items.length,
      subTotal: subtotal,
      discount,
      grandTotal,
      saleStatus: SaleStatus.NOT_APPROVED,
      notes: notes || undefined,
      saleDate: new Date().toISOString(),
      items: sellItems
    };

    setLoading(true);
    try {
      await onCreateOrder(orderData);
      setSelectedCustomer('');
      setDiscount(0);
      setNotes('');
      onResetCart();
      setIsOrderConfirmModalOpen(false);
      toast.success('Order created successfully!');
    } catch  {
      toast.error('Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOrder = () => {
    if (items.length === 0) return;
    setIsOrderConfirmModalOpen(true);
  };

  const selectedCustomerDetails = customers.find(
    (c) => c.id === selectedCustomer
  );

  const customerOptions = useMemo(() => {
    return customers
      .filter(customer => customer.id && customer.name)
      .map((customer) => ({
        value: customer.id!,
        label: `${customer.name || ''} ${customer.companyName || ''} ${customer.phone1 || ''} ${customer.phone2 || ''}`,
        data: customer,
      }));
  }, [customers]);

  const handleCustomerSelect = (selectedOption: any) => {
    if (selectedOption) {
      setSelectedCustomer(selectedOption.value);
      if (customerError) {
        setCustomerError('');
      }
    } else {
      setSelectedCustomer('');
    }
  };

  return (
    <>
      <Card className='mx-auto w-full max-w-[100vw] sm:max-w-4xl lg:max-w-5xl'>
        <CardHeader className='py-3 sm:py-4'>
          <h2 className='text-lg font-bold sm:text-xl'>Order Summary</h2>
        </CardHeader>
        <CardContent className='space-y-3 px-2 sm:space-y-4 sm:px-4'>
          {/* Customer Selection */}
          <div className='flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center sm:gap-3'>
            <div className='w-full flex-1'>
              <Label htmlFor='customer' className='text-sm sm:text-base dark:text-gray-300'>
                Customer <span className='text-red-500'>*</span>
              </Label>
              
              <SelectReac
                options={customerOptions}
                value={
                  selectedCustomer
                    ? customerOptions.find(option => option.value === selectedCustomer)
                    : null
                }
                onChange={handleCustomerSelect}
                placeholder="Search customer by name, phone, or company..."
                isClearable
                isSearchable
                noOptionsMessage={() => 'No customers found'}
                formatOptionLabel={(option: any) => {
                  const customer = option.data;
                  return (
                    <div className="flex flex-col">
                      <span className="font-medium dark:text-gray-100">
                        {customer?.name || 'Unknown'}
                      </span>
                      <div className="flex flex-wrap gap-1 text-xs">
                        {customer?.phone1 && (
                          <span className="bg-gray-100 px-1 rounded dark:bg-gray-700 dark:text-gray-300">
                            📞 {customer.phone1}
                          </span>
                        )}
                        {customer?.companyName && (
                          <span className="bg-gray-100 px-1 rounded dark:bg-gray-700 dark:text-gray-300">
                            🏢 {customer.companyName}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }}
                styles={{
                  control: (base, state) => ({
                    ...base,
                    minHeight: '40px',
                    borderColor: customerError 
                      ? '#ef4444' 
                      : state.isFocused 
                        ? '#3b82f6' 
                        : '#e5e7eb',
                    backgroundColor: 'white',
                    '&:hover': {
                      borderColor: customerError ? '#ef4444' : '#9ca3af',
                    },
                    boxShadow: state.isFocused 
                      ? customerError 
                        ? '0 0 0 1px #ef4444' 
                        : '0 0 0 1px #3b82f6'
                      : 'none',
                    '.dark &': {
                      borderColor: customerError 
                        ? '#ef4444' 
                        : state.isFocused 
                          ? '#3b82f6' 
                          : '#4b5563',
                      backgroundColor: '#1f2937',
                      color: '#f3f4f6',
                      '&:hover': {
                        borderColor: customerError ? '#ef4444' : '#6b7280',
                      },
                    },
                  }),
                  placeholder: (base) => ({
                    ...base,
                    fontSize: '14px',
                    color: '#6b7280',
                    '@media (min-width: 640px)': {
                      fontSize: '16px',
                    },
                    '.dark &': {
                      color: '#9ca3af',
                    },
                  }),
                  singleValue: (base) => ({
                    ...base,
                    color: '#111827',
                    '.dark &': {
                      color: '#f3f4f6',
                    },
                  }),
                  input: (base) => ({
                    ...base,
                    color: '#111827',
                    '.dark &': {
                      color: '#f3f4f6',
                    },
                  }),
                  menu: (base) => ({
                    ...base,
                    zIndex: 9999,
                    backgroundColor: 'white',
                    borderColor: '#e5e7eb',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    '.dark &': {
                      backgroundColor: '#1f2937',
                      borderColor: '#374151',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
                    },
                  }),
                  menuList: (base) => ({
                    ...base,
                    padding: 0,
                    '.dark &': {
                      backgroundColor: '#1f2937',
                    },
                  }),
                  option: (base, state) => ({
                    ...base,
                    fontSize: '14px',
                    padding: '8px 12px',
                    backgroundColor: state.isSelected 
                      ? '#3b82f6' 
                      : state.isFocused 
                        ? '#f3f4f6' 
                        : 'transparent',
                    color: state.isSelected ? '#ffffff' : '#111827',
                    '&:active': {
                      backgroundColor: state.isSelected ? '#2563eb' : '#e5e7eb',
                    },
                    '.dark &': {
                      backgroundColor: state.isSelected 
                        ? '#3b82f6' 
                        : state.isFocused 
                          ? '#374151' 
                          : 'transparent',
                      color: state.isSelected ? '#ffffff' : '#f3f4f6',
                      '&:active': {
                        backgroundColor: state.isSelected ? '#2563eb' : '#4b5563',
                      },
                    },
                  }),
                }}
                className="react-select-container"
                classNamePrefix="react-select"
              />
              
              {customerError && (
                <p className='mt-1 text-xs text-red-500 dark:text-red-400'>{customerError}</p>
              )}
            </div>
            <div className='mt-2 flex w-full space-x-2 sm:mt-0 sm:w-auto'>
              <Button
                variant='outline'
                onClick={handleRefreshCustomers}
                disabled={loading}
                className='w-full py-2 text-sm sm:w-auto sm:py-2.5 sm:text-base dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Button
                onClick={() => setIsCustomerModalOpen(true)}
                className='w-full py-2 text-sm sm:w-auto sm:py-2.5 sm:text-base dark:bg-blue-700 dark:hover:bg-blue-800'
              >
                + New
              </Button>
            </div>
          </div>

          {/* Cart Items */}
          {items.length === 0 ? (
            <p className='py-4 text-center text-sm text-gray-500 sm:text-base'>
              Your cart is empty
            </p>
          ) : (
            <div className='overflow-x-auto'>
              <Table className='min-w-full text-xs sm:text-sm md:text-base'>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10'>No</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Option</TableHead>
                    <TableHead>Shop</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead className='text-right'>Total</TableHead>
                    <TableHead className='text-center'>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell className='font-medium'>{index + 1}</TableCell>
                      <TableCell>
                        <div>
                          <div className='font-medium'>{item.product.name}</div>
                        
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.subProduct ? (
                          <div className='flex items-center space-x-2'>
                          
                              {item.subProduct.name}
                           
                          </div>
                        ) : (
                          <span className='text-xs text-gray-400'>-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className='text-xs sm:text-sm'>
                          <div className='font-medium'>{item.shop.name}</div>
                          
                        </div>
                      </TableCell>
                      <TableCell>{formatPrice(item.unitPrice)}</TableCell>
                      <TableCell>
                        <Input
                          type='number'
                          min='1'
                          max={item.availableQuantity}
                          value={item.quantity}
                          onChange={(e) =>
                            onUpdateQuantity(item.id, Number(e.target.value))
                          }
                          className='w-16 text-sm sm:w-20 sm:text-base'
                        />
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatPrice(item.totalPrice)}
                      </TableCell>
                      <TableCell className='text-center'>
                        <Button
                          variant='destructive'
                          size='sm'
                          onClick={() => onRemoveItem(item.id)}
                          className='px-2 py-1 text-xs sm:text-sm'
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Order Totals */}
          {items.length > 0 && (
            <div className='space-y-2 pt-3 sm:pt-4'>
              <div className='flex flex-col text-sm sm:flex-row sm:justify-between sm:text-base'>
                <span>Subtotal:</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className='flex flex-col items-start gap-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:text-base'>
                <span>Discount:</span>
                <Input
                  type='number'
                  min='0'
                  max={subtotal}
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className='w-full text-sm sm:w-24 sm:text-base'
                />
              </div>
              <div className='flex flex-col border-t pt-2 text-base font-bold sm:flex-row sm:justify-between sm:text-lg'>
                <span>Grand Total:</span>
                <span>{formatPrice(grandTotal)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          {items.length > 0 && (
            <div className='space-y-2'>
              <Label htmlFor='notes' className='text-sm sm:text-base'>
                Notes (Optional)
              </Label>
              <Textarea
                id='notes'
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='Add any notes for this order'
                className='min-h-20 w-full text-sm sm:text-base'
                rows={3}
              />
            </div>
          )}
        </CardContent>

        <CardFooter className='px-3 py-3 sm:px-4 sm:py-4'>
          <Button
            className='w-full py-2 text-sm sm:py-2.5 sm:text-base'
            disabled={items.length === 0 || loading}
            onClick={handleConfirmOrder}
          >
            {loading ? 'Processing...' : 'Create Order'}
          </Button>
        </CardFooter>

        {isCustomerModalOpen && (
          <CreateCustomerModal
            closeModal={() => setIsCustomerModalOpen(false)}
            onSuccess={handleRefreshCustomers}
          />
        )}
      </Card>

      {/* Order Confirmation Modal */}
      <Modal
        title='Order Confirmation'
        description='Please review your order before confirming'
        isOpen={isOrderConfirmModalOpen}
        onClose={() => setIsOrderConfirmModalOpen(false)}
        size='xxl'
      >
        <div className='max-h-[70vh] space-y-4 overflow-y-auto py-2 sm:py-4'>
          {/* Customer Information */}
          <div className='rounded-md bg-gray-50 p-3 sm:p-4 dark:bg-gray-800'>
            <h3 className='mb-2 text-sm font-semibold text-gray-900 sm:text-base dark:text-gray-100'>
              Customer Information
            </h3>
            {selectedCustomerDetails ? (
              <div className='space-y-1 text-xs sm:text-sm'>
                <p className='text-gray-700 dark:text-gray-300'>
                  <span className='font-medium'>Name:</span>{' '}
                  {selectedCustomerDetails.name}
                </p>
                {selectedCustomerDetails.companyName && (
                  <p className='text-gray-700 dark:text-gray-300'>
                    <span className='font-medium'>Company:</span>{' '}
                    {selectedCustomerDetails.companyName}
                  </p>
                )}
                {selectedCustomerDetails.phone1 && (
                  <p className='text-gray-700 dark:text-gray-300'>
                    <span className='font-medium'>Phone:</span>{' '}
                    {selectedCustomerDetails.phone1}
                  </p>
                )}
              </div>
            ) : (
              <p className='text-xs text-gray-500 sm:text-sm dark:text-gray-400'>
                No customer selected
              </p>
            )}
          </div>

          {/* Order Items Summary */}
          <div className='overflow-hidden rounded-md border border-gray-300 dark:border-gray-600'>
            <Table>
              <TableHeader>
                <TableRow className='bg-gray-50 hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-800'>
                  <TableHead className='w-8 text-xs text-gray-900 sm:text-sm dark:text-gray-100'>
                    #
                  </TableHead>
                  <TableHead className='text-xs text-gray-900 sm:text-sm dark:text-gray-100'>
                    Product
                  </TableHead>
                  <TableHead className='text-xs text-gray-900 sm:text-sm dark:text-gray-100'>
                    Option
                  </TableHead>
                  <TableHead className='text-xs text-gray-900 sm:text-sm dark:text-gray-100'>
                    Shop
                  </TableHead>
                  <TableHead className='text-right text-xs text-gray-900 sm:text-sm dark:text-gray-100'>
                    Qty
                  </TableHead>
                  <TableHead className='text-right text-xs text-gray-900 sm:text-sm dark:text-gray-100'>
                    Price
                  </TableHead>
                  <TableHead className='text-right text-xs text-gray-900 sm:text-sm dark:text-gray-100'>
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow
                    key={item.id}
                    className='hover:bg-gray-50 dark:hover:bg-gray-700'
                  >
                    <TableCell className='text-xs text-gray-900 sm:text-sm dark:text-gray-100'>
                      {index + 1}
                    </TableCell>
                    <TableCell className='text-xs sm:text-sm'>
                      <div>
                        <div className='font-medium text-gray-900 dark:text-gray-100'>
                          {item.product.name}
                        </div>
                      
                      </div>
                    </TableCell>
                    <TableCell className='text-xs sm:text-sm'>
                      {item.subProduct ? (
                        <div className='flex items-center space-x-1'>
                          <div className='relative h-6 w-6'>
                                                   {item.subProduct.name}

                          </div>
                       
                        </div>
                      ) : (
                        <span className='text-gray-400'>-</span>
                      )}
                    </TableCell>
                    <TableCell className='text-xs sm:text-sm'>
                      <div>
                        <div className='font-medium text-gray-900 dark:text-gray-100'>
                          {item.shop.name}
                        </div>
                    
                      </div>
                    </TableCell>
                    <TableCell className='text-right text-xs text-gray-900 sm:text-sm dark:text-gray-100'>
                      {item.quantity}
                    </TableCell>
                    <TableCell className='text-right text-xs sm:text-sm'>
                      <span className='text-gray-900 dark:text-gray-100'>
                        {formatPrice(item.unitPrice)}
                      </span>
                    </TableCell>
                    <TableCell className='text-right text-xs text-gray-900 sm:text-sm dark:text-gray-100'>
                      {formatPrice(item.totalPrice)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Order Summary */}
          <div className='space-y-2 rounded-md bg-gray-50 p-3 sm:p-4 dark:bg-gray-800'>
            <div className='flex justify-between text-xs sm:text-sm'>
              <span className='text-gray-700 dark:text-gray-300'>
                Subtotal:
              </span>
              <span className='text-gray-900 dark:text-gray-100'>
                {formatPrice(subtotal)}
              </span>
            </div>
            <div className='flex justify-between text-xs sm:text-sm'>
              <span className='text-gray-700 dark:text-gray-300'>
                Discount:
              </span>
              <span className='text-red-600 dark:text-red-400'>
                -{formatPrice(discount)}
              </span>
            </div>
            <div className='flex justify-between border-t border-gray-200 pt-2 text-sm font-bold sm:text-base dark:border-gray-600'>
              <span className='text-gray-900 dark:text-gray-100'>
                Grand Total:
              </span>
              <span className='text-blue-600 dark:text-blue-400'>
                {formatPrice(grandTotal)}
              </span>
            </div>
          </div>

          {/* Notes Preview */}
          {notes && (
            <div className='rounded-md bg-blue-50 p-3 sm:p-4 dark:bg-blue-900/20'>
              <h3 className='mb-1 text-xs font-semibold text-blue-900 sm:text-sm dark:text-blue-100'>
                Order Notes
              </h3>
              <p className='text-xs text-blue-800 sm:text-sm dark:text-blue-200'>
                {notes}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className='flex flex-col gap-2 pt-4 sm:flex-row sm:gap-3'>
            <Button
              variant='outline'
              onClick={() => setIsOrderConfirmModalOpen(false)}
              className='w-full border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50 sm:w-1/2 sm:py-2.5 sm:text-base dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateOrder}
              disabled={loading}
              className='w-full py-2 text-sm sm:w-1/2 sm:py-2.5 sm:text-base'
            >
              {loading ? (
                <div className='flex items-center justify-center'>
                  <svg
                    className='mr-2 -ml-1 h-4 w-4 animate-spin text-white'
                    xmlns='http://www.w3.org/2000/svg'
                    fill='none'
                    viewBox='0 0 24 24'
                  >
                    <circle
                      className='opacity-25'
                      cx='12'
                      cy='12'
                      r='10'
                      stroke='currentColor'
                      strokeWidth='4'
                    ></circle>
                    <path
                      className='opacity-75'
                      fill='currentColor'
                      d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                    ></path>
                  </svg>
                  Creating Order...
                </div>
              ) : (
                'Confirm Order'
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export const ProductSearch = ({
  products,
  categories,
  subCategories,
  initialSearchTerm = '',
  initialCategoryName = 'all',
  initialSubCategoryName = 'all'
}: ProductSearchProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchFilters, setSearchFilters] = useState<SearchFilters>(() => {
    const urlCategory = searchParams.get('categoryName') || searchParams.get('categoryId');
    const urlSubCategory = searchParams.get('subCategoryName') || searchParams.get('subCategoryId');
    const urlSearchTerm = searchParams.get('searchTerm');
    
    return {
      category: urlCategory || initialCategoryName || 'all',
      subCategory: urlSubCategory || initialSubCategoryName || 'all',
      productName: urlSearchTerm || initialSearchTerm || ''
    };
  });

  const filteredSubCategories = useMemo(() => {
    if (searchFilters.category === 'all') {
      return subCategories || [];
    } else {
      const selectedCategory = categories.find(cat => cat.name === searchFilters.category);
      if (selectedCategory) {
        return (subCategories || []).filter(
          (subCat) => subCat.categoryId === selectedCategory.id
        );
      }
      return [];
    }
  }, [searchFilters.category, subCategories, categories]);

  const filteredProducts = useMemo(() => {
    let filtered = products || [];

    if (searchFilters.category !== 'all') {
      filtered = filtered.filter((product) => {
        const productCategoryName = product.category?.name || product.category;
        return productCategoryName === searchFilters.category;
      });
    }

    if (searchFilters.subCategory !== 'all') {
      filtered = filtered.filter((product) => {
        const subCategoryName = product.subCategory?.name || product.subCategory;
        return subCategoryName === searchFilters.subCategory;
      });
    }

    if (searchFilters.productName) {
      filtered = filtered.filter((product) => {
        const searchTerm = searchFilters.productName.toLowerCase();
        return (
          product.name.toLowerCase().includes(searchTerm) ||
          product.productCode.toLowerCase().includes(searchTerm) ||
          (product.generic && product.generic.toLowerCase().includes(searchTerm))
        );
      });
    }

    return filtered;
  }, [searchFilters, products]);

  const [selectedProduct, setSelectedProduct] = useState<IProduct | null>(null);
  const [selectedSubProduct, setSelectedSubProduct] = useState<ISubProduct | null>(null);
  const [isSubProductModalOpen, setIsSubProductModalOpen] = useState(false);
  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [productsPerPage] = useState(12);

  const updateUrl = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());

    if (searchFilters.productName) {
      params.set('searchTerm', searchFilters.productName);
    } else {
      params.delete('searchTerm');
    }

    if (searchFilters.category !== 'all') {
      params.set('categoryName', searchFilters.category);
    } else {
      params.delete('categoryName');
    }

    if (searchFilters.subCategory !== 'all') {
      params.set('subCategoryName', searchFilters.subCategory);
    } else {
      params.delete('subCategoryName');
    }

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    router.push(newUrl, { scroll: false });
  }, [searchFilters, router, searchParams]);

  useEffect(() => {
    updateUrl();
  }, [updateUrl]);

  useEffect(() => {
    if (
      searchFilters.subCategory !== 'all' &&
      !filteredSubCategories.some((subCat) => subCat.name === searchFilters.subCategory)
    ) {
      setTimeout(() => {
        setSearchFilters((prev) => ({ ...prev, subCategory: 'all' }));
      }, 0);
    }
  }, [filteredSubCategories, searchFilters.subCategory]);

  const indexOfLastProduct = currentPage * productsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
  const currentProducts = filteredProducts.slice(
    indexOfFirstProduct,
    indexOfLastProduct
  );
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const handleFilterChange = (key: keyof SearchFilters, value: string) => {
    setSearchFilters((prev) => {
      const newFilters = { ...prev, [key]: value };
      
      if (key === 'category' && value !== 'all') {
        const isValidSubCategory = filteredSubCategories.some(
          (subCat) => subCat.name === prev.subCategory
        );
        if (!isValidSubCategory) {
          newFilters.subCategory = 'all';
        }
      }
      
      return newFilters;
    });
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchFilters({
      category: 'all',
      subCategory: 'all',
      productName: ''
    });
    setCurrentPage(1);
    router.push(window.location.pathname, { scroll: false });
  };

  const handleSelectProduct = (product: IProduct) => {
    setSelectedProduct(product);
    
    // Check if product has subproducts
    if (product.subProducts && product.subProducts.length > 0) {
      // Show subproduct selection modal first
      setIsSubProductModalOpen(true);
    } else {
      // No subproducts, go directly to shop selection
      setSelectedSubProduct(null);
      setIsShopModalOpen(true);
    }
  };

  const handleSelectSubProduct = (product: IProduct, subProduct: ISubProduct) => {
    // Store the product and subproduct first
    setSelectedProduct(product);
    setSelectedSubProduct(subProduct);
    
    // Then close subproduct modal
    setIsSubProductModalOpen(false);
    
    // Finally open shop modal
    setIsShopModalOpen(true);
  };

  const handleAddToCart = (item: CartItem) => {
    const existingItemIndex = cartItems.findIndex(
      (cartItem) =>
        cartItem.product.id === item.product.id &&
        cartItem.shop.id === item.shop.id &&
        cartItem.subProduct?.id === item.subProduct?.id
    );

    if (existingItemIndex >= 0) {
      const updatedItems = [...cartItems];
      updatedItems[existingItemIndex].quantity += item.quantity;
      updatedItems[existingItemIndex].totalPrice =
        updatedItems[existingItemIndex].unitPrice *
        updatedItems[existingItemIndex].quantity;
      setCartItems(updatedItems);
      toast.success('Cart updated!');
    } else {
      setCartItems([...cartItems, item]);
      toast.success('Item added to cart!');
    }
  };

  const handleUpdateQuantity = (id: string, quantity: number) => {
    if (quantity < 1) return;

    setCartItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity,
              totalPrice: item.unitPrice * quantity
            }
          : item
      )
    );
  };

  const handleRemoveItem = (id: string) => {
    setCartItems((prevItems) => prevItems.filter((item) => item.id !== id));
    toast.success('Item removed from cart');
  };

  const handleCreateOrder = async (orderData: Partial<ISell>) => {
    try {
      await createSell(orderData);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const handleResetCart = () => {
    setCartItems([]);
  };

  const handleCloseShopModal = () => {
    setIsShopModalOpen(false);
    setSelectedProduct(null);
    setSelectedSubProduct(null);
  };

  const handleCloseSubProductModal = () => {
    setIsSubProductModalOpen(false);
    // Don't set selectedProduct to null here, just close the modal
    // This way if the user closes without selecting, we still have the product for next time
  };

  return (
    <div className='flex flex-col space-y-6 lg:flex-row lg:space-y-0 lg:space-x-6'>
      <div className='flex-1 space-y-4 sm:space-y-6'>
        {/* Search Filters */}
        <div className='w-full rounded-lg p-4 shadow-md sm:p-6'>
          <h2 className='mb-3 text-xl font-bold sm:mb-4 sm:text-2xl'>
            Search Products
          </h2>

          <div className='mb-3 grid grid-cols-1 gap-3 sm:mb-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4'>
            {/* Category Select */}
            <div>
              <label className='mb-1 block text-xs font-medium sm:mb-2 sm:text-sm'>
                Category
              </label>
              <Select
                value={searchFilters.category}
                onValueChange={(value) => handleFilterChange('category', value)}
              >
                <SelectTrigger className='w-full text-xs sm:text-sm'>
                  <SelectValue placeholder='Select category' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all' className='text-xs sm:text-sm'>
                    All Categories
                  </SelectItem>
                  {categories.map((category) => (
                    <SelectItem
                      key={category.id}
                      value={category.name}
                      className='text-xs sm:text-sm'
                    >
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Subcategory Select */}
            <div>
              <label className='mb-1 block text-xs font-medium sm:mb-2 sm:text-sm'>
                Subcategory
              </label>
              <Select
                value={searchFilters.subCategory}
                onValueChange={(value) =>
                  handleFilterChange('subCategory', value)
                }
              >
                <SelectTrigger className='w-full text-xs sm:text-sm'>
                  <SelectValue placeholder='Select subcategory' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all' className='text-xs sm:text-sm'>
                    All Subcategories
                  </SelectItem>
                  {Array.from(
                    new Map(
                      filteredSubCategories.map(subCat => [subCat.name, subCat])
                    ).values()
                  ).map((subCategory) => (
                    <SelectItem
                      key={subCategory.id}
                      value={subCategory.name}
                      className='text-xs sm:text-sm'
                    >
                      {subCategory.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Product Name Search */}
            <div>
              <label className='mb-1 block text-xs font-medium sm:mb-2 sm:text-sm'>
                Product Name/Code/Generic
              </label>
              <Input
                type='text'
                placeholder='Search by name, code or generic...'
                value={searchFilters.productName}
                onChange={(e) =>
                  handleFilterChange('productName', e.target.value)
                }
                className='w-full text-xs sm:text-sm'
              />
            </div>
          </div>

          <Button
            onClick={clearFilters}
            variant='outline'
            className='w-full py-2 text-xs sm:w-auto sm:py-2.5 sm:text-sm'
          >
            Clear Filters
          </Button>
        </div>

        {/* Results Count */}
        <div className='w-full rounded-lg p-3 shadow-md sm:p-4'>
          <p className='text-xs text-gray-600 sm:text-sm'>
            Showing {indexOfFirstProduct + 1}-
            {Math.min(indexOfLastProduct, filteredProducts.length)} of{' '}
            {filteredProducts.length} products
          </p>
        </div>

        {/* Product Grid */}
        <div className='grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3'>
          {currentProducts.length > 0 ? (
            currentProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onSelectProduct={handleSelectProduct}
              />
            ))
          ) : (
            <div className='col-span-full py-8 text-center sm:py-12'>
              <p className='text-base text-gray-500 sm:text-lg'>
                No products found matching your criteria.
              </p>
              <Button
                onClick={clearFilters}
                variant='link'
                className='mt-2 text-xs sm:text-sm'
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className='mt-6 flex flex-wrap items-center justify-center gap-2 sm:mt-8 sm:gap-3'>
            <Button
              key='prev'
              variant='outline'
              onClick={() => paginate(currentPage - 1)}
              disabled={currentPage === 1}
              className='px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm'
            >
              Previous
            </Button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={`page-${page}`}
                variant={currentPage === page ? 'default' : 'outline'}
                onClick={() => paginate(page)}
                className='px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm'
              >
                {page}
              </Button>
            ))}

            <Button
              key='next'
              variant='outline'
              onClick={() => paginate(currentPage + 1)}
              disabled={currentPage === totalPages}
              className='px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm'
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Cart Sidebar */}
      <div className='mt-6 w-full lg:mt-0 lg:w-140'>
        <Cart
          items={cartItems}
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveItem={handleRemoveItem}
          onCreateOrder={handleCreateOrder}
          onResetCart={handleResetCart}
        />
      </div>

      {/* SubProduct Selection Modal */}
      <SubProductModal
        product={selectedProduct}
        isOpen={isSubProductModalOpen}
        onClose={handleCloseSubProductModal}
        onSelectSubProduct={handleSelectSubProduct}
      />

      {/* Shop Selection Modal */}
      <ShopBatchModal
        product={selectedProduct}
        subProduct={selectedSubProduct}
        isOpen={isShopModalOpen}
        onClose={handleCloseShopModal}
        onAddToCart={handleAddToCart}
      />
    </div>
  );
};

export default ProductSearch;