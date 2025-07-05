
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, DollarSign, Trash2, Save, Loader2 } from 'lucide-react';
import type { CreateAdPlanOutput, Strategy, Task } from './schema';
import { v4 as uuidv4 } from 'uuid';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { generateStrategyTasksAction } from './actions';
import { auth } from '@/lib/firebase';
import { formatCurrency } from '@/lib/utils';

interface StrategyDetailDialogProps {
  plan: CreateAdPlanOutput | null;
  strategy: Strategy | null;
  onOpenChange: (open: boolean) => void;
  onPlanUpdate: (updatedPlan: CreateAdPlanOutput) => void;
}

export function StrategyDetailDialog({ plan, strategy, onOpenChange, onPlanUpdate }: StrategyDetailDialogProps) {
  const [hourlyRate, setHourlyRate] = useState(60);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (strategy && plan) {
      // If tasks are already in the plan, use them. Otherwise, fetch from AI.
      if (strategy.tasks && strategy.tasks.length > 0) {
        setTasks(strategy.tasks);
      } else {
        const fetchTasks = async () => {
          setIsLoadingTasks(true);
          const user = auth.currentUser;
          if (!user) {
            toast({ title: 'Error de autenticación', variant: 'destructive' });
            setIsLoadingTasks(false);
            return;
          }
          try {
            const token = await user.getIdToken();
            const result = await generateStrategyTasksAction({
              url: plan.url,
              objectives: plan.objectives,
              platform: strategy.platform,
              campaign_type: strategy.campaign_type,
              funnel_stage: strategy.funnel_stage,
              strategy_rationale: strategy.strategy_rationale,
            }, token);

            if (result.error || !result.data) {
              throw new Error(result.error || 'La IA no pudo generar tareas.');
            }

            const newTasksWithIds = result.data.tasks.map(t => ({...t, id: uuidv4()}));
            setTasks(newTasksWithIds);

            // Persist the newly generated tasks to the main plan state
            const updatedPlan = {
              ...plan,
              strategies: plan.strategies.map(s => 
                s.platform === strategy.platform ? { ...s, tasks: newTasksWithIds } : s
              )
            };
            onPlanUpdate(updatedPlan);

          } catch (error: any) {
            toast({ title: 'Error al generar tareas', description: error.message, variant: 'destructive' });
          } finally {
            setIsLoadingTasks(false);
          }
        };
        fetchTasks();
      }
    }
  }, [strategy, plan, onPlanUpdate, toast]);


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
  

  const handleUpdateProposal = () => {
    if (!strategy || !plan) return;
    const updatedPlan: CreateAdPlanOutput = {
      ...plan,
      strategies: plan.strategies.map(s => 
        s.platform === strategy.platform ? { ...s, tasks: tasks } : s
      ),
      fee_proposal: {
        ...plan.fee_proposal,
        management_fee: totalCost,
      },
    };
    onPlanUpdate(updatedPlan);
    toast({ title: 'Propuesta Actualizada', description: `La cuota de gestión se ha actualizado a ${formatCurrency(totalCost)}.` });
  };
  
  const handleSaveAndClose = useCallback(() => {
     if (strategy && plan) {
         const updatedPlan: CreateAdPlanOutput = {
           ...plan,
           strategies: plan.strategies.map(s => 
             s.platform === strategy.platform ? { ...s, tasks: tasks } : s
           ),
         };
         onPlanUpdate(updatedPlan);
     }
     onOpenChange(false);
  }, [strategy, plan, tasks, onPlanUpdate, onOpenChange]);


  if (!strategy || !plan) return null;

  return (
    <Dialog open={!!strategy} onOpenChange={(open) => !open && handleSaveAndClose()}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl">Plan de Acción Detallado: {strategy.platform}</DialogTitle>
          <DialogDescription>
            Define las tareas, horas y costes para ejecutar esta estrategia. La cuota de gestión se actualizará cuando hagas clic en "Actualizar Propuesta".
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-6 py-4 flex-1 min-h-0">
            {/* Left Column: Tasks */}
            <div className="md:col-span-2 flex flex-col min-h-0">
                <h3 className="text-lg font-semibold mb-3">Desglose de Tareas</h3>
                {isLoadingTasks ? (
                    <div className="flex-1 flex flex-col items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <p className="mt-2 text-muted-foreground">La IA está generando tareas...</p>
                    </div>
                ) : (
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
                )}
                <Button onClick={addTask} variant="outline" className="mt-4" disabled={isLoadingTasks}>
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
                     <Button onClick={handleUpdateProposal} className="w-full mt-4">
                      <Save className="mr-2 h-4 w-4"/>
                      Actualizar Propuesta de Gestión
                    </Button>
                </div>
            </div>
        </div>
        
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={handleSaveAndClose}>Guardar y Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
