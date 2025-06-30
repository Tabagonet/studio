
"use client";

import React, { useMemo } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  weight: number;
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
  const { checks, score } = useMemo(() => {
    if (!focusKeyword || !focusKeyword.trim()) {
      return { checks: [], score: 0 };
    }

    const keyword = focusKeyword.trim().toLowerCase();
    const plainContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = plainContent.split(' ').filter(Boolean).length;
    const firstParagraph = plainContent.substring(0, 600).toLowerCase();

    const allChecks: SeoCheck[] = [
      {
        id: 'titleLength',
        pass: title.length >= 30 && title.length <= 65,
        text: title.length >= 30 && title.length <= 65
          ? <>La longitud del título ({title.length}) es buena (entre 30-65 caracteres).</>
          : <>La longitud del título ({title.length}) debería estar entre 30 y 65 caracteres.</>,
        weight: 15,
      },
      {
        id: 'keywordInTitle',
        pass: title.trim().toLowerCase().includes(keyword),
        text: title.trim().toLowerCase().includes(keyword)
          ? <>La palabra clave <strong className="text-foreground">{`"${focusKeyword}"`}</strong> aparece en el título.</>
          : <>La palabra clave <strong className="text-foreground">{`"${focusKeyword}"`}</strong> no está en el título.</>,
        weight: 20,
      },
      {
        id: 'metaDescLength',
        pass: metaDescription.length >= 50 && metaDescription.length <= 160,
        text: metaDescription.length >= 50 && metaDescription.length <= 160
          ? <>La longitud de la meta descripción ({metaDescription.length}) es buena (entre 50-160).</>
          : <>La longitud de la meta descripción ({metaDescription.length}) debería estar entre 50 y 160 caracteres.</>,
        weight: 15,
      },
      {
        id: 'keywordInMetaDesc',
        pass: metaDescription.trim().toLowerCase().includes(keyword),
        text: metaDescription.trim().toLowerCase().includes(keyword)
          ? <>La palabra clave aparece en la meta descripción.</>
          : <>La palabra clave no se encontró en la meta descripción.</>,
        weight: 20,
      },
      {
        id: 'keywordInIntro',
        pass: firstParagraph.includes(keyword),
        text: firstParagraph.includes(keyword)
          ? <>La palabra clave aparece en la introducción.</>
          : <>La palabra clave no se encontró en la introducción (primeros párrafos).</>,
        weight: 15,
      },
      {
        id: 'contentLength',
        pass: wordCount >= 300,
        text: wordCount >= 300
          ? <>El contenido tiene más de 300 palabras ({wordCount} palabras).</>
          : <>El contenido tiene {wordCount} palabras. Se recomienda un mínimo de 300.</>,
        weight: 15,
      },
    ];

    const calculatedScore = allChecks.reduce((acc, check) => acc + (check.pass ? check.weight : 0), 0);

    return { checks: allChecks, score: calculatedScore };
  }, [title, content, focusKeyword, metaDescription]);

  const scoreColor = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';

  if (!focusKeyword || !focusKeyword.trim()) {
    return (
        <Card>
            <CardHeader><CardTitle>Checklist SEO Dinámico</CardTitle></CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground p-4 text-center">Introduce una palabra clave principal para ver el análisis.</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card>
        <CardHeader>
            <CardTitle>Checklist SEO Dinámico</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="space-y-3">
                <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                        <span>Puntuación SEO (Simulada)</span>
                        <span>{score} / 100</span>
                    </div>
                    <Progress value={score} className={cn("[&>div]:bg-primary", scoreColor)} />
                </div>
                <ul className="space-y-3 pt-4">
                {checks.map(check => (
                    <CheckItem key={check.id} pass={check.pass} text={check.text} />
                ))}
                </ul>
            </div>
        </CardContent>
    </Card>
  );
}

    