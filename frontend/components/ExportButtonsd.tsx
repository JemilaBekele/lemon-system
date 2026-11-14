'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ISell } from '@/models/Sell';
import { exportSellsToExcel } from '@/lib/exportSellExcel';

interface ExportButtonsProps {
  data: ISell[];
  /** Loads every matching sale from the server; when given, it is used instead of `data` */
  fetchAll?: () => Promise<ISell[]>;
  statusCounts?: Record<string, number>;
  totalSells?: number;
  showSummaryExport?: boolean;
}

export default function ExportButtons({ data, fetchAll }: ExportButtonsProps) {
  const [exporting, setExporting] = useState(false);

  if (!data.length) return null;

  const handleExportExcel = async () => {
    if (!fetchAll) {
      exportSellsToExcel(data, 'sales_report');
      return;
    }
    setExporting(true);
    try {
      const allSells = await fetchAll();
      if (allSells.length === 0) {
        toast.error('No sales to export');
        return;
      }
      exportSellsToExcel(allSells, 'sales_report');
    } catch {
      toast.error('Failed to export sales');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <Button
        onClick={handleExportExcel}
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={exporting}
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {exporting ? 'Exporting…' : 'Export Sales to Excel'}
      </Button>
    </div>
  );
}
