'use client';

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, History, FileText, Trash2 } from "lucide-react";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from "@/components/ui/badge";
import type { CreateAdPlanOutput } from "./schema";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { deleteAdPlansAction } from "./actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


interface AdPlanHistoryProps {
    history: CreateAdPlanOutput[];
    isLoading: boolean;
    onViewPlan: (plan: CreateAdPlanOutput) => void;
    onHistoryUpdate: () => void;
}

export function AdPlanHistory({ history, isLoading, onViewPlan, onHistoryUpdate }: AdPlanHistoryProps) {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState(false);
    const { toast } = useToast();

    const handleSelectAll = (checked: boolean) => {
        setSelectedIds(checked ? history.map(item => item.id!) : []);
    };

    const handleSelectRow = (id: string, checked: boolean) => {
        setSelectedIds(prev => 
            checked ? [...prev, id] : prev.filter(selectedId => selectedId !== id)
        );
    };

    const handleDeleteSelected = async () => {
        setIsDeleting(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: 'No autenticado', variant: 'destructive' });
            setIsDeleting(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const result = await deleteAdPlansAction(selectedIds, token);
            if (result.success) {
                toast({ title: 'Planes eliminados', description: `${selectedIds.length} planes han sido eliminados.` });
                setSelectedIds([]);
                onHistoryUpdate();
            } else {
                throw new Error(result.error || 'No se pudieron eliminar los planes seleccionados.');
            }
        } catch (error: any) {
            toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' });
        } finally {
            setIsDeleting(false);
        }
    };

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
        return null;
    }

    const isAllSelected = selectedIds.length > 0 && selectedIds.length === history.length;
    const isSomeSelected = selectedIds.length > 0 && selectedIds.length < history.length;

    return (
        <Card>
            <CardHeader>
                 <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2"><History className="h-6 w-6" /> Historial de Planes</CardTitle>
                        <CardDescription>Aquí puedes ver y gestionar los planes que has generado.</CardDescription>
                    </div>
                    {selectedIds.length > 0 && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" disabled={isDeleting}>
                                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4" />}
                                    Eliminar ({selectedIds.length})
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción no se puede deshacer. Se eliminarán permanentemente los {selectedIds.length} planes seleccionados.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteSelected} className="bg-destructive hover:bg-destructive/90">
                                        Sí, eliminar
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]">
                                <Checkbox
                                    checked={isAllSelected || isSomeSelected ? "indeterminate" : false}
                                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                    aria-label="Seleccionar todo"
                                />
                            </TableHead>
                            <TableHead>URL Analizada</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Objetivos</TableHead>
                            <TableHead className="text-right">Acción</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {history.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell>
                                    <Checkbox
                                        checked={selectedIds.includes(item.id!)}
                                        onCheckedChange={(checked) => handleSelectRow(item.id!, !!checked)}
                                        aria-label={`Seleccionar plan para ${item.url}`}
                                    />
                                </TableCell>
                                <TableCell className="font-medium truncate max-w-xs">
                                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{item.url}</a>
                                </TableCell>
                                <TableCell>{item.createdAt ? format(new Date(item.createdAt), "d MMM yyyy, HH:mm", { locale: es }) : 'N/A'}</TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                      {(item.objectives || []).slice(0, 2).map(obj => <Badge key={obj} variant="outline" className="text-xs">{obj.substring(0, 25)}...</Badge>)}
                                      {(item.objectives || []).length > 2 && <Badge variant="outline">+{item.objectives.length - 2}</Badge>}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="outline" size="sm" onClick={() => onViewPlan(item)}>
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
