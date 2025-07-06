
'use client';

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Strategy } from './schema';
import { formatCurrency } from '@/lib/utils';
import { Target, FileText, Wand2, Lightbulb } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface StrategiesTableProps {
  strategies: Strategy[];
  onViewTasks: (strategy: Strategy) => void;
  onViewCreatives: (strategy: Strategy) => void;
}

export function StrategiesTable({ strategies, onViewTasks, onViewCreatives }: StrategiesTableProps) {
  if (!strategies || strategies.length === 0) {
    return <p className="text-muted-foreground text-center py-4">No se han generado estrategias.</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Plataforma</TableHead>
            <TableHead>Tipo de Campaña</TableHead>
            <TableHead>Presupuesto Mensual</TableHead>
            <TableHead>Ángulo Creativo</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {strategies.map((strategy, index) => (
            <TableRow key={index} className="group">
              <TableCell className="font-semibold">{strategy.platform}</TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span>{strategy.campaign_type}</span>
                  <Badge variant="outline" className="w-fit mt-1">{strategy.funnel_stage}</Badge>
                </div>
              </TableCell>
              <TableCell>{formatCurrency(strategy.monthly_budget)}</TableCell>
              <TableCell className="max-w-xs">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="truncate text-sm text-muted-foreground">{strategy.creative_angle}</p>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start">
                      <p className="max-w-xs">{strategy.creative_angle}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <TooltipProvider>
                       <Tooltip>
                            <TooltipTrigger asChild>
                                <Button size="icon-sm" variant="outline" onClick={() => onViewTasks(strategy)}>
                                    <FileText className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Ver/Editar Tareas y Costes</p>
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button size="icon-sm" variant="outline" onClick={() => onViewCreatives(strategy)}>
                                    <Wand2 className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Ver Estudio de Creativos</p>
                            </TooltipContent>
                        </Tooltip>
                         <Tooltip>
                            <TooltipTrigger asChild>
                                <Button size="icon-sm" variant="outline">
                                    <Lightbulb className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{strategy.strategy_rationale}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
