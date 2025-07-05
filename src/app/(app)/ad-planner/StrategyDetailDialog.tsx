
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, DollarSign, Trash2 } from 'lucide-react';
import type { Strategy } from './schema';
import { v4 as uuidv4 } from 'uuid';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Task {
  id: string;
  name: string;
  hours: number;
}

interface StrategyDetailDialogProps {
  strategy: Strategy | null;
  onOpenChange: (open: boolean) => void;
}

export function StrategyDetailDialog({ strategy, onOpenChange }: StrategyDetailDialogProps) {
  const [hourlyRate, setHourlyRate] = useState(60);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    // Reset tasks when a new strategy is selected
    if (strategy) {
      // Pre-populate with a few example tasks based on campaign type
      const exampleTasks: Task[] = [
        { id: uuidv4(), name: 'Investigación de Palabras Clave y Competencia', hours: 4 },
        { id: uuidv4(), name: `Configuración de Campaña de ${strategy.campaign_type}`, hours: 3 },
        { id: uuidv4(), name: 'Creación de Grupos de Anuncios y Anuncios Iniciales', hours: 5 },
        { id: uuidv4(), name: 'Configuración de Seguimiento de Conversiones', hours: 2 },
        { id: uuidv4(), name: 'Optimización y Gestión Mensual', hours: 8 },
      ];
      setTasks(exampleTasks);
    }
  }, [strategy]);

  const addTask = () => {
    setTasks([...tasks, { id: uuidv4(), name: 'Nueva Tarea', hours: 1 }]);
  };

  const updateTask = (id: string, field: 'name' | 'hours', value: string) => {
    const newTasks = tasks.map(task => {
      if (task.id === id) {
        if (field === 'hours') {
          const hours = parseFloat(value);
          return { ...task, hours: isNaN(hours) ? 0 : hours };
        }
        return { ...task, [field]: value };
      }
      return task;
    });
    setTasks(newTasks);
  };

  const removeTask = (id: string) => {
    setTasks(tasks.filter(task => task.id !== id));
  };
  
  const { totalHours, totalCost } = useMemo(() => {
    const totalHours = tasks.reduce((sum, task) => sum + task.hours, 0);
    const totalCost = totalHours * hourlyRate;
    return { totalHours, totalCost };
  }, [tasks, hourlyRate]);
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
  };


  if (!strategy) return null;

  return (
    <Dialog open={!!strategy} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl">Plan de Acción Detallado: {strategy.platform}</DialogTitle>
          <DialogDescription>
            Define las tareas, horas y costes para ejecutar esta estrategia. Esto es para tu planificación interna y no aparecerá en el informe PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-6 py-4 flex-1 min-h-0">
            {/* Left Column: Tasks */}
            <div className="md:col-span-2 flex flex-col min-h-0">
                <h3 className="text-lg font-semibold mb-3">Desglose de Tareas</h3>
                <ScrollArea className="flex-1 pr-4 -mr-4">
                    <div className="space-y-3">
                        {tasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                            <div className="flex-1">
                                <Label htmlFor={`task-name-${task.id}`} className="sr-only">Nombre de la tarea</Label>
                                <Input
                                    id={`task-name-${task.id}`}
                                    value={task.name}
                                    onChange={(e) => updateTask(task.id, 'name', e.target.value)}
                                    className="bg-background"
                                />
                            </div>
                            <div className="w-24">
                                <Label htmlFor={`task-hours-${task.id}`} className="sr-only">Horas</Label>
                                <Input
                                    id={`task-hours-${task.id}`}
                                    type="number"
                                    value={task.hours}
                                    onChange={(e) => updateTask(task.id, 'hours', e.target.value)}
                                    className="text-center bg-background"
                                    min="0"
                                    step="0.5"
                                />
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removeTask(task.id)} className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                        ))}
                    </div>
                </ScrollArea>
                <Button onClick={addTask} variant="outline" className="mt-4">
                    <Plus className="mr-2 h-4 w-4" /> Añadir Tarea
                </Button>
            </div>
            
            {/* Right Column: Summary */}
            <div className="md:col-span-1 bg-muted/30 rounded-lg p-6 flex flex-col justify-between">
                <div>
                    <h3 className="text-lg font-semibold mb-4">Resumen de Costes</h3>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="hourly-rate" className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-muted-foreground"/> Precio por Hora (€)</Label>
                            <Input
                                id="hourly-rate"
                                type="number"
                                value={hourlyRate}
                                onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)}
                                className="text-lg font-bold"
                            />
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Horas Totales Estimadas:</span>
                            <span className="font-semibold">{totalHours.toFixed(1)} h</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Presupuesto en Medios:</span>
                            <span className="font-semibold">{formatCurrency(strategy.monthly_budget)}</span>
                        </div>
                    </div>
                </div>

                <div className="border-t pt-4 mt-6">
                    <div className="flex justify-between items-center text-xl font-bold">
                        <span>Coste de Gestión:</span>
                        <span>{formatCurrency(totalCost)}</span>
                    </div>
                     <div className="flex justify-between items-center text-xl font-bold text-primary mt-2">
                        <span>COSTE TOTAL MENSUAL:</span>
                        <span>{formatCurrency(totalCost + strategy.monthly_budget)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">(Gestión + Presupuesto en Medios)</p>
                </div>
            </div>
        </div>
        
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
