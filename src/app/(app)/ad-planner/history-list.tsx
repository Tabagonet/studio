
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, History, FileText } from "lucide-react";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from "@/components/ui/badge";
import type { CreateAdPlanOutput } from "./schema";

export interface AdPlanHistoryItem {
    id: string;
    url: string;
    objectives: string[];
    createdAt: string; // ISO string
    planData: CreateAdPlanOutput;
}

interface AdPlanHistoryProps {
    history: AdPlanHistoryItem[];
    isLoading: boolean;
    onViewPlan: (plan: CreateAdPlanOutput) => void;
}

export function AdPlanHistory({ history, isLoading, onViewPlan }: AdPlanHistoryProps) {
    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><History className="h-6 w-6" /> Historial de Planes</CardTitle>
                </CardHeader>
                <CardContent className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="ml-2 text-muted-foreground">Cargando historial...</p>
                </CardContent>
            </Card>
        );
    }
    
    if (history.length === 0) {
        return null; // Don't show the card if there's no history
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><History className="h-6 w-6" /> Historial de Planes</CardTitle>
                <CardDescription>Aquí puedes ver los planes que has generado anteriormente.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>URL Analizada</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Objetivos</TableHead>
                            <TableHead className="text-right">Acción</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {history.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium truncate max-w-xs">
                                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{item.url}</a>
                                </TableCell>
                                <TableCell>{format(new Date(item.createdAt), "d MMM yyyy, HH:mm", { locale: es })}</TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                      {item.objectives.slice(0, 2).map(obj => <Badge key={obj} variant="outline" className="text-xs">{obj.substring(0, 25)}...</Badge>)}
                                      {item.objectives.length > 2 && <Badge variant="outline">+{item.objectives.length - 2}</Badge>}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="outline" size="sm" onClick={() => onViewPlan(item.planData)}>
                                        <FileText className="mr-2 h-4 w-4" />
                                        Ver Plan
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
