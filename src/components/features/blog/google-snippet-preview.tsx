
"use client";

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface GoogleSnippetPreviewProps {
  title: string;
  description: string;
  url: string | null;
}

const TITLE_MAX_LENGTH = 60;
const DESC_MAX_LENGTH = 160;

const LengthIndicator = ({ value, maxValue }: { value: number, maxValue: number }) => {
    const percentage = (value / maxValue) * 100;
    let colorClass = 'bg-green-500';
    if (percentage > 100) {
        colorClass = 'bg-red-500';
    } else if (percentage > 90) {
        colorClass = 'bg-amber-500';
    }
    return (
        <div className="w-full bg-muted rounded-full h-1.5 mt-1">
            <div className={cn("h-1.5 rounded-full", colorClass)} style={{ width: `${Math.min(percentage, 100)}%` }} />
        </div>
    );
};

export function GoogleSnippetPreview({ title, description, url }: GoogleSnippetPreviewProps) {
  let displayUrl = `www.${APP_NAME.toLowerCase().replace(/\s/g, '')}.com > blog > mi-entrada`;
  let faviconUrl = `https://placehold.co/32x32.png`;

  if (url) {
    try {
      const parsedUrl = new URL(url);
      displayUrl = parsedUrl.hostname + parsedUrl.pathname.replace(/\/$/, '');
      faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${parsedUrl.hostname}`;
    } catch (e) {
      console.warn("Invalid URL for snippet preview:", url);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vista Previa en Google</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="p-4 rounded-md shadow-sm bg-background border">
            <div className="flex items-center gap-2">
                <Image src={faviconUrl} alt="Favicon" width={24} height={24} className="h-6 w-6" />
                <div>
                    <p className="text-sm font-semibold">{APP_NAME}</p>
                    <p className="text-xs text-muted-foreground truncate">{displayUrl}</p>
                </div>
            </div>
            <h3 className="text-blue-700 text-lg hover:underline truncate mt-2">
                {title || 'Título de la entrada'}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
                {description || 'Aquí aparecerá tu meta descripción. Asegúrate de que sea atractiva e incluya tu palabra clave.'}
            </p>
        </div>
        <div className="space-y-3 text-xs mt-4">
            <div>
                <div className="flex justify-between">
                    <span>Longitud del Título</span>
                    <span className={cn(title.length > TITLE_MAX_LENGTH && 'text-red-500')}>{title.length} / {TITLE_MAX_LENGTH}</span>
                </div>
                <LengthIndicator value={title.length} maxValue={TITLE_MAX_LENGTH} />
            </div>
            <div>
                 <div className="flex justify-between">
                    <span>Longitud de la Descripción</span>
                    <span className={cn(description.length > DESC_MAX_LENGTH && 'text-red-500')}>{description.length} / {DESC_MAX_LENGTH}</span>
                </div>
                <LengthIndicator value={description.length} maxValue={DESC_MAX_LENGTH} />
            </div>
        </div>
      </CardContent>
    </Card>
  );
}
