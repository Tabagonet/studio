
"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/constants';

interface GoogleSnippetPreviewProps {
  title: string;
  description: string;
  url: string;
}

const TITLE_MAX_LENGTH = 60;
const DESC_MAX_LENGTH = 160;

const LengthIndicator = ({ value, maxValue }: { value: number, maxValue: number }) => {
    const percentage = (value / maxValue) * 100;
    let colorClass = 'bg-green-500';
    if (percentage > 100) {
        colorClass = 'bg-red-500';
    } else if (percentage > 90) {
        colorClass = 'bg-yellow-500';
    }
    return (
        <div className="w-full bg-muted rounded-full h-1.5 mt-1">
            <div className={cn("h-1.5 rounded-full", colorClass)} style={{ width: `${Math.min(percentage, 100)}%` }} />
        </div>
    );
};

export function GoogleSnippetPreview({ title, description, url }: GoogleSnippetPreviewProps) {
  const displayUrl = url ? `${url.replace(/^(https?:\/\/)/, '')}` : `www.${APP_NAME.toLowerCase().replace(/\s/g, '')}.com > blog > mi-entrada`;

  return (
    <div className="p-3 border rounded-lg bg-card space-y-3">
        <h4 className="font-semibold text-sm">Vista Previa en Google</h4>
        <div className="p-4 rounded-md shadow-sm bg-background">
            <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-bold">{APP_NAME.charAt(0)}</div>
                <div>
                    <p className="text-sm font-semibold">{APP_NAME}</p>
                    <p className="text-xs text-muted-foreground">{displayUrl.split(' > ')[0]}</p>
                </div>
            </div>
            <h3 className="text-blue-700 text-lg hover:underline truncate mt-2">
                {title || 'Título de la entrada'}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
                {description || 'Aquí aparecerá tu meta descripción. Asegúrate de que sea atractiva e incluya tu palabra clave.'}
            </p>
        </div>
        <div className="space-y-3 text-xs">
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
    </div>
  );
}
