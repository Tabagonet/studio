
"use client";

import React, { useMemo } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

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
  const { checks, passedCount } = useMemo(() => {
    if (!focusKeyword || !focusKeyword.trim()) {
      return { checks: [], passedCount: 0 };
    }

    const keyword = focusKeyword.trim().toLowerCase();
    const plainContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = plainContent.split(' ').filter(Boolean).length;
    const firstParagraph = plainContent.substring(0, 600).toLowerCase();

    const allChecks: SeoCheck[] = [
      {
        id: 'keywordInTitle',
        pass: title.trim().toLowerCase().includes(keyword),
        text: <>La palabra clave principal aparece en el <strong>título SEO</strong>.</>,
      },
      {
        id: 'keywordInMetaDesc',
        pass: metaDescription.trim().toLowerCase().includes(keyword),
        text: <>La palabra clave principal aparece en la <strong>meta descripción</strong>.</>,
      },
      {
        id: 'keywordInIntro',
        pass: firstParagraph.includes(keyword),
        text: <>La palabra clave principal se encuentra en la <strong>introducción</strong>.</>,
      },
      {
        id: 'titleLength',
        pass: title.length >= 30 && title.length <= 65,
        text: <>El título SEO tiene una <strong>longitud adecuada</strong> ({title.length} caracteres).</>,
      },
      {
        id: 'metaDescLength',
        pass: metaDescription.length >= 50 && metaDescription.length <= 160,
        text: <>La meta descripción tiene una <strong>longitud adecuada</strong> ({metaDescription.length} caracteres).</>,
      },
      {
        id: 'contentLength',
        pass: wordCount >= 300,
        text: <>La longitud del contenido es <strong>suficiente</strong> ({wordCount} palabras).</>,
      },
    ];

    const currentPassedCount = allChecks.filter(check => check.pass).length;

    return { checks: allChecks, passedCount: currentPassedCount };
  }, [title, content, focusKeyword, metaDescription]);

  if (!focusKeyword || !focusKeyword.trim()) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Checklist de Análisis Básico</CardTitle>
                <CardDescription>Introduce una palabra clave para activar el checklist.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground p-4 text-center">Aquí aparecerán las comprobaciones SEO básicas.</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card>
        <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Checklist de Análisis Básico</CardTitle>
                <CardDescription>Optimiza según las mejores prácticas.</CardDescription>
              </div>
              <div className="text-right">
                 <p className="text-sm text-muted-foreground">Completado</p>
                 <p className="text-2xl font-bold">{passedCount}/{checks.length}</p>
              </div>
            </div>
        </CardHeader>
        <CardContent>
            <div className="space-y-3">
                <ul className="space-y-3 pt-4 border-t">
                {checks.map(check => (
                    <CheckItem key={check.id} pass={check.pass} text={check.text} />
                ))}
                </ul>
            </div>
        </CardContent>
    </Card>
  );
}
