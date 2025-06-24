
"use client";

import React, { useMemo } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SeoAnalyzerProps {
  title: string;
  content: string;
  focusKeyword: string;
  metaDescription: string;
}

interface SeoCheck {
  id: string;
  pass: boolean;
  text: React.ReactNode;
}

const CheckItem = ({ pass, text }: { pass: boolean; text: React.ReactNode }) => {
  const Icon = pass ? CheckCircle : XCircle;
  const color = pass ? 'text-green-600' : 'text-amber-600';
  return (
    <li className="flex items-start gap-3">
      <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", color)} />
      <span className="text-sm text-muted-foreground">{text}</span>
    </li>
  );
};

export function SeoAnalyzer({ title, content, focusKeyword, metaDescription }: SeoAnalyzerProps) {
  const analysis = useMemo(() => {
    if (!focusKeyword || !focusKeyword.trim()) {
      return null;
    }

    const keyword = focusKeyword.trim().toLowerCase();
    const plainContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = plainContent.split(' ').filter(Boolean).length;
    const firstParagraph = plainContent.substring(0, 600).toLowerCase();

    const checks: SeoCheck[] = [
      {
        id: 'titleLength',
        pass: title.length >= 30 && title.length <= 65,
        text: title.length >= 30 && title.length <= 65
          ? <>La longitud del título ({title.length}) es buena (entre 30-65 caracteres).</>
          : <>La longitud del título ({title.length}) debería estar entre 30 y 65 caracteres.</>,
      },
      {
        id: 'keywordInTitle',
        pass: title.trim().toLowerCase().includes(keyword),
        text: title.trim().toLowerCase().includes(keyword)
          ? <>La palabra clave <strong className="text-foreground">{`"${focusKeyword}"`}</strong> aparece en el título.</>
          : <>La palabra clave <strong className="text-foreground">{`"${focusKeyword}"`}</strong> no está en el título.</>,
      },
      {
        id: 'metaDescLength',
        pass: metaDescription.length >= 50 && metaDescription.length <= 160,
        text: metaDescription.length >= 50 && metaDescription.length <= 160
          ? <>La longitud de la meta descripción ({metaDescription.length}) es buena (entre 50-160).</>
          : <>La longitud de la meta descripción ({metaDescription.length}) debería estar entre 50 y 160 caracteres.</>,
      },
      {
        id: 'keywordInMetaDesc',
        pass: metaDescription.trim().toLowerCase().includes(keyword),
        text: metaDescription.trim().toLowerCase().includes(keyword)
          ? <>La palabra clave aparece en la meta descripción.</>
          : <>La palabra clave no se encontró en la meta descripción.</>,
      },
      {
        id: 'keywordInIntro',
        pass: firstParagraph.includes(keyword),
        text: firstParagraph.includes(keyword)
          ? <>La palabra clave aparece en la introducción.</>
          : <>La palabra clave no se encontró en la introducción (primeros párrafos).</>,
      },
      {
        id: 'contentLength',
        pass: wordCount >= 300,
        text: wordCount >= 300
          ? <>El contenido tiene más de 300 palabras ({wordCount} palabras).</>
          : <>El contenido tiene {wordCount} palabras. Se recomienda un mínimo de 300.</>,
      },
    ];

    return { checks };
  }, [title, content, focusKeyword, metaDescription]);

  if (!analysis) {
    return (
        <div className="pt-3">
            <p className="text-sm text-muted-foreground">Introduce una palabra clave principal para ver el análisis.</p>
        </div>
    );
  }

  return (
    <div className="space-y-3 pt-3">
        <h4 className="font-semibold text-sm">Checklist SEO</h4>
        <ul className="space-y-3">
          {analysis.checks.map(check => (
            <CheckItem key={check.id} pass={check.pass} text={check.text} />
          ))}
        </ul>
    </div>
  );
}
