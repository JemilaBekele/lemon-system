'use client';

import { useEffect, useState } from 'react';
import { getProductById } from '@/service/Product';
import ProductForm from './form';
import { IProduct } from '@/models/Product';
import { ICategory } from '@/models/Category';
import { IUnitOfMeasure } from '@/models/UnitOfMeasure';
import { IShop } from '@/models/shop';
import { getCategories, getSubCategories } from '@/service/Category';
import { getUnitsOfMeasure } from '@/service/UnitOfMeasure';
import { normalizeImagePath } from '@/lib/norm';
import { getShopallapi } from '@/service/shop';
import FormCardSkeleton from '@/components/form-card-skeleton';

type TProductViewPageProps = {
  productId: string;
};

type TProductPageData = {
  id: string;
  product: IProduct | null;
  categories: ICategory[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subCategories: any[];
  unitsOfMeasure: IUnitOfMeasure[];
  shops: IShop[];
};

export default function ProductViewPage({ productId }: TProductViewPageProps) {
  const isNew = productId === 'new';
  // Keyed by id so a stale result never shows while a new id is loading.
  const [data, setData] = useState<TProductPageData | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    const loadProduct = async (): Promise<IProduct | null> => {
      if (isNew) return null;
      const product = (await getProductById(productId)) as IProduct | null;
      if (!product) return null;
      return {
        ...product,
        imageUrl:
          typeof product.imageUrl === 'string'
            ? normalizeImagePath(product.imageUrl)
            : undefined
      };
    };

    Promise.all([
      loadProduct(),
      getCategories(),
      getSubCategories(),
      getUnitsOfMeasure(),
      getShopallapi()
    ])
      .then(([product, categories, subCategories, unitsOfMeasure, shops]) => {
        if (cancelled) return;
        setData({
          id: productId,
          product,
          categories,
          subCategories,
          unitsOfMeasure,
          shops
        });
      })
      .catch(() => {
        if (!cancelled)
          setError({ id: productId, message: 'Failed to load product.' });
      });

    return () => {
      cancelled = true;
    };
  }, [productId, isNew]);

  if (error?.id === productId)
    return <p className='text-destructive text-sm'>{error.message}</p>;
  if (data?.id !== productId) return <FormCardSkeleton />;

  const { product } = data;
  const pageTitle = product
    ? `Edit Product: ${product.name || product.id}`
    : 'Create New Product';

  return (
    <ProductForm
      initialData={product}
      pageTitle={pageTitle}
      categories={data.categories}
      subCategories={data.subCategories}
      unitsOfMeasure={data.unitsOfMeasure}
      shops={data.shops}
    />
  );
}
