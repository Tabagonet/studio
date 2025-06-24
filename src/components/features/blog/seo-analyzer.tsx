
"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle, XCircle, FileText, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SeoAnalyzerProps {
  title: string;
  content: string;
  focusKeyword: string;
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
    <li className="flex items-center gap-3">
      <Icon className={cn("h-5 w-5 flex-shrink-0", color)} />
      <span className="text-sm text-muted-foreground">{text}</span>
    </li>
  );
};

export function SeoAnalyzer({ title, content, focusKeyword }: SeoAnalyzerProps) {
  const analysis = useMemo(() => {
    if (!focusKeyword || !focusKeyword.trim()) {
      return null;
    }

    const keyword = focusKeyword.trim().toLowerCase();
    
    // Remove HTML tags for accurate word count and text analysis
    const plainContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = plainContent.split(' ').filter(Boolean).length;
    
    // Check if keyword is in the title
    const isKeywordInTitle = title.trim().toLowerCase().includes(keyword);
    
    // Check if keyword is in the first ~100 words (approx. 600 chars)
    const firstParagraph = plainContent.substring(0, 600).toLowerCase();
    const isKeywordInFirstParagraph = firstParagraph.includes(keyword);
    
    const checks: SeoCheck[] = [
      {
        id: 'title',
        pass: isKeywordInTitle,
        text: <>La palabra clave <strong className="text-foreground">{`"${focusKeyword}"`}</strong> está en el título.</>,
      },
      {
        id: 'intro',
        pass: isKeywordInFirstParagraph,
        text: <>La palabra clave aparece en la introducción (primeros párrafos).</>,
      },
      {
        id: 'length',
        pass: wordCount >= 300,
        text: <>El contenido tiene más de 300 palabras ({wordCount} palabras).</>,
      },
    ];

    return { wordCount, checks };
  }, [title, content, focusKeyword]);

  if (!analysis) {
    return null;
  }

  return (
    <div className="space-y-3 pt-3">
        <h4 className="font-semibold text-sm">Análisis SEO</h4>
        <ul className="space-y-3">
          {analysis.checks.map(check => (
            <CheckItem key={check.id} pass={check.pass} text={check.text} />
          ))}
        </ul>
    </div>
  );
}
