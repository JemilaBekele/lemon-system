// Products listing: "Export to Excel" opens a dialog to pick the columns and
// whether to include out-of-stock items
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { IProduct } from '@/models/Product';
import {
  exportToExcel,
  PRODUCT_EXPORT_COLUMNS,
  TProductExportColumn
} from '@/lib/bb';

interface ExportButtonsProps {
  data: IProduct[];
}

const STORAGE_KEY = 'products-export-options';
const ALL_COLUMNS = PRODUCT_EXPORT_COLUMNS.map((column) => column.key);

type TSavedOptions = {
  columns: TProductExportColumn[];
  includeOutOfStock: boolean;
};

// Last choice is remembered in this browser only
const loadOptions = (): TSavedOptions => {
  const fallback = { columns: ALL_COLUMNS, includeOutOfStock: true };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || !Array.isArray(saved.columns)) return fallback;
    return {
      columns: ALL_COLUMNS.filter((key) => saved.columns.includes(key)),
      includeOutOfStock: saved.includeOutOfStock !== false
    };
  } catch {
    return fallback;
  }
};

const saveOptions = (options: TSavedOptions) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
};

export default function ExportButtons({ data }: ExportButtonsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [columns, setColumns] = useState<TProductExportColumn[]>(ALL_COLUMNS);
  const [includeOutOfStock, setIncludeOutOfStock] = useState(true);

  if (!data.length) return null;

  const outOfStockCount = data.filter(
    (product) => (product.stockSummary?.totalStock ?? 0) <= 0
  ).length;
  const exportCount = includeOutOfStock
    ? data.length
    : data.length - outOfStockCount;

  const openDialog = () => {
    const saved = loadOptions();
    setColumns(saved.columns);
    setIncludeOutOfStock(saved.includeOutOfStock);
    setIsOpen(true);
  };

  const toggleColumn = (key: TProductExportColumn, checked: boolean) => {
    setColumns((prev) =>
      checked
        ? ALL_COLUMNS.filter((k) => k === key || prev.includes(k))
        : prev.filter((k) => k !== key)
    );
  };

  const handleExport = () => {
    if (columns.length === 0) {
      toast.error('Select at least one column');
      return;
    }
    const exported = exportToExcel(data, 'products_export', {
      columns,
      includeOutOfStock
    });
    if (!exported) {
      toast.error('No products to export');
      return;
    }
    saveOptions({ columns, includeOutOfStock });
    setIsOpen(false);
  };

  return (
    <>
      <div className='mb-4 flex gap-2'>
        <Button onClick={openDialog} variant='outline' size='sm' className='gap-2'>
          <Download className='h-4 w-4' />
          Export to Excel
        </Button>
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title='Export to Excel'
        description='Choose the columns to include in the file.'
      >
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-medium'>Columns</span>
            <div className='flex gap-2'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => setColumns(ALL_COLUMNS)}
              >
                Select all
              </Button>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => setColumns([])}
              >
                Clear
              </Button>
            </div>
          </div>

          <div className='grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2'>
            {PRODUCT_EXPORT_COLUMNS.map((column) => (
              <label
                key={column.key}
                className='flex cursor-pointer items-center gap-2 text-sm'
              >
                <Checkbox
                  checked={columns.includes(column.key)}
                  onCheckedChange={(checked) =>
                    toggleColumn(column.key, checked === true)
                  }
                />
                {column.label}
              </label>
            ))}
          </div>

          <label className='flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm'>
            <Checkbox
              checked={includeOutOfStock}
              onCheckedChange={(checked) => setIncludeOutOfStock(checked === true)}
            />
            Include out-of-stock items
            <span className='text-muted-foreground'>({outOfStockCount})</span>
          </label>

          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground text-sm'>
              {exportCount} product{exportCount === 1 ? '' : 's'} will be exported
            </span>
            <div className='flex gap-2'>
              <Button type='button' variant='outline' onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button
                type='button'
                onClick={handleExport}
                disabled={columns.length === 0 || exportCount === 0}
                className='gap-2'
              >
                <Download className='h-4 w-4' />
                Export
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
