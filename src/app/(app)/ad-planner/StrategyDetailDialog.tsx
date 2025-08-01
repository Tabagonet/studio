
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, DollarSign, Trash2, Save, Loader2, PlayCircle } from 'lucide-react';
import type { CreateAdPlanOutput, Strategy, Task } from './schema';
import { v4 as uuidv4 } from 'uuid';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { generateStrategyTasksAction } from './actions';
import { auth } from '@/lib/firebase';
import { formatCurrency } from '@/lib/utils';
import type { Company } from '@/lib/types';
import { TaskExecutionDialog } from './TaskExecutionDialog';


interface StrategyDetailDialogProps {
  plan: CreateAdPlanOutput | null;
  strategy: Strategy | null;
  companyInfo: Company | null;
  onOpenChange: (open: boolean) => void;
  onPlanUpdate: (updatedPlan: CreateAdPlanOutput) => void;
}

const isTaskExecutable = (taskName: string): boolean => {
    const lowerCaseName = taskName.toLowerCase();
    const executableKeywords = ['palabras clave', 'keyword', 'anuncios', 'creativos', 'copy', 'configuración de campaña', 'campaign setup'];
    return executableKeywords.some(keyword => lowerCaseName.includes(keyword));
};

export function StrategyDetailDialog({ plan, strategy, companyInfo, onOpenChange, onPlanUpdate }: StrategyDetailDialogProps) {
  const [hourlyRate, setHourlyRate] = useState(60);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editableBudget, setEditableBudget] = useState<number | string>('');
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [taskToExecute, setTaskToExecute] = useState<Task | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (companyInfo?.seoHourlyRate) {
        setHourlyRate(companyInfo.seoHourlyRate);
    } else {
        setHourlyRate(60);
    }
  }, [companyInfo]);


  const fetchAndSetTasks = useCallback(async (currentPlan: CreateAdPlanOutput, currentStrategy: Strategy) => {
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
        url: currentPlan.url,
        objectives: currentPlan.objectives,
        platform: currentStrategy.platform,
        campaign_type: currentStrategy.campaign_type,
        funnel_stage: currentStrategy.funnel_stage,
        strategy_rationale: currentStrategy.strategy_rationale,
      }, token);

      if (result.error || !result.data) {
        throw new Error(result.error || 'La IA no pudo generar tareas.');
      }

      const newTasksWithIds = result.data.tasks.map(t => ({ ...t, id: uuidv4(), result: null }));
      setTasks(newTasksWithIds);

    } catch (error: any) {
      toast({ title: 'Error al generar tareas', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoadingTasks(false);
    }
  }, [toast]);
  
  useEffect(() => {
    if (strategy && plan) {
        const currentStrategyFromPlan = plan.strategies.find(s => s.platform === strategy.platform);
        setEditableBudget(currentStrategyFromPlan?.monthly_budget ?? 0);

        if (currentStrategyFromPlan?.tasks && currentStrategyFromPlan.tasks.length > 0) {
            setTasks(currentStrategyFromPlan.tasks);
        } else {
            fetchAndSetTasks(plan, strategy);
        }
    }
  }, [strategy, plan, fetchAndSetTasks]);


  const addTask = () => {
    setTasks([...tasks, { id: uuidv4(), name: 'Nueva Tarea', hours: 1, result: null }]);
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

  const handleTaskUpdate = (taskId: string, result: any) => {
    const updatedTasks = tasks.map(task =>
        task.id === taskId ? { ...task, result } : task
      );
    setTasks(updatedTasks);
    setTaskToExecute(null); // Close the execution dialog
  };
  
  const { totalHours, totalCost } = useMemo(() => {
    const totalHours = tasks.reduce((sum, task) => sum + task.hours, 0);
    const totalCost = totalHours * hourlyRate;
    return { totalHours, totalCost };
  }, [tasks, hourlyRate]);
  
   const updatePlanState = useCallback(() => {
    if (!strategy || !plan) return;
    
    const updatedStrategies = plan.strategies.map(s => 
      s.platform === strategy.platform 
        ? { 
            ...s, 
            tasks: tasks, 
            monthly_budget: Number(editableBudget)
          } 
        : s
    );

    const newTotalManagementFee = updatedStrategies.reduce((total, s) => {
        const strategyHours = s.tasks?.reduce((sum, task) => sum + (task.hours || 0), 0) || 0;
        return total + (strategyHours * hourlyRate);
    }, 0);
    
    const updatedPlan: CreateAdPlanOutput = {
      ...plan,
      strategies: updatedStrategies,
      fee_proposal: {
        ...plan.fee_proposal,
        management_fee: newTotalManagementFee,
      },
    };
    onPlanUpdate(updatedPlan);
    return newTotalManagementFee;
  }, [strategy, plan, tasks, editableBudget, hourlyRate, onPlanUpdate]);


  const handleUpdateProposal = () => {
    const newFee = updatePlanState();
    if(newFee !== undefined) {
      toast({ title: 'Propuesta Actualizada', description: `La cuota de gestión total se ha actualizado a ${formatCurrency(newFee)}.` });
    }
  };
  
  const handleSaveAndClose = useCallback(() => {
     updatePlanState();
     onOpenChange(false);
  }, [updatePlanState, onOpenChange]);


  if (!strategy || !plan) return null;

  return (
    <>
      <TaskExecutionDialog
        isOpen={!!taskToExecute}
        onOpenChange={() => setTaskToExecute(null)}
        task={taskToExecute}
        plan={plan}
        strategy={strategy}
        onTaskUpdate={handleTaskUpdate}
      />
      <Dialog open={!!strategy} onOpenChange={(open) => {
        if (!open) {
          handleSaveAndClose();
        } else {
          onOpenChange(true);
        }
      }}>
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
                                  <div className="flex gap-1">
                                      {isTaskExecutable(task.name) && (
                                          <Button variant="outline" size="icon-sm" onClick={() => setTaskToExecute(task)}>
                                              <PlayCircle className="h-4 w-4 text-primary" />
                                          </Button>
                                      )}
                                      <Button variant="ghost" size="icon-sm" onClick={() => removeTask(task.id)} className="text-destructive">
                                          <Trash2 className="h-4 w-4" />
                                      </Button>
                                  </div>
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
                          <div>
                              <Label htmlFor="media-budget" className="flex items-center gap-2 mb-1">Presupuesto en Medios (€)</Label>
                              <Input
                                  id="media-budget"
                                  type="number"
                                  value={editableBudget}
                                  onChange={(e) => setEditableBudget(e.target.value)}
                                  className="text-lg font-bold"
                              />
                          </div>
                          <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Horas Totales Estimadas (esta estrategia):</span>
                              <span className="font-semibold">{totalHours.toFixed(1)} h</span>
                          </div>
                      </div>
                  </div>

                  <div className="border-t pt-4 mt-6">
                      <div className="flex justify-between items-center text-xl font-bold">
                          <span>Coste de Gestión (esta estrategia):</span>
                          <span>{formatCurrency(totalCost)}</span>
                      </div>
                       <div className="flex justify-between items-center text-xl font-bold text-primary mt-2">
                          <span>COSTE TOTAL MENSUAL:</span>
                          <span>{formatCurrency(totalCost + Number(editableBudget))}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 text-right">(Gestión + Presupuesto en Medios)</p>
                       <Button onClick={handleUpdateProposal} className="w-full mt-4">
                        <Save className="mr-2 h-4 w-4"/>
                        Actualizar Propuesta de Gestión Total
                      </Button>
                  </div>
              </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={handleSaveAndClose}>Guardar y Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
