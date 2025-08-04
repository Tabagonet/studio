
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NAV_GROUPS } from "@/lib/constants";

// Define the plans and their properties
const plans = [
  { id: 'lite', name: 'Plan Lite', price: '29€/mes', color: 'bg-sky-500' },
  { id: 'pro', name: 'Plan Pro', price: '49€/mes', color: 'bg-blue-500' },
  { id: 'agency', name: 'Plan Agency', price: '99€/mes', color: 'bg-indigo-500' },
];

const allTools = NAV_GROUPS.flatMap(group => 
    group.items.filter(item => item.requiredPlan) // Only include items that are part of a plan
).map(item => ({
    id: item.href,
    title: item.title,
    icon: item.icon,
    requiredPlan: item.requiredPlan || [],
}));

export function PlanManager() {

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {plans.map(plan => (
        <Card key={plan.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${plan.color}`} />
                {plan.name}
              </CardTitle>
              <Badge variant="outline">{plan.price}</Badge>
            </div>
            <CardDescription>
              Herramientas activas para este plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {allTools.map(tool => {
              const isEnabled = tool.requiredPlan.includes(plan.id as 'lite' | 'pro' | 'agency');
              const ToolIcon = tool.icon;
              return (
                <div key={tool.id} className="flex items-center justify-between p-3 rounded-md border bg-muted/50">
                  <Label htmlFor={`${plan.id}-${tool.id}`} className="flex items-center gap-3 cursor-pointer">
                    <ToolIcon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm">{tool.title}</span>
                  </Label>
                  <Switch
                    id={`${plan.id}-${tool.id}`}
                    checked={isEnabled}
                    disabled // Editing will be enabled in a future phase
                    aria-readonly
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
