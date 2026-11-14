import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function PageContainer({
  children,
  scrollable = true
}: {
  children: React.ReactNode;
  scrollable?: boolean;
}) {
  return (
    <>
      {scrollable ? (
        // Radix wraps the content in a `display: table` box that grows to the
        // widest child and only scrolls vertically, so a wide table pushed
        // the page past the screen and its right side was cut off. Keep that
        // box at the viewport width so wide tables scroll inside their card.
        <ScrollArea className='h-[calc(100dvh-52px)] [&>[data-radix-scroll-area-viewport]>div]:block!'>
          <div className='flex min-w-0 flex-1 p-4 md:px-6 *:min-w-0'>
            {children}
          </div>
        </ScrollArea>
      ) : (
        <div className='flex min-w-0 flex-1 p-4 md:px-6 *:min-w-0'>
          {children}
        </div>
      )}
    </>
  );
}
