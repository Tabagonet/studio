// src/components/core/combobox.tsx
"use client";

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ComboBoxProps {
  items: { value: string; label: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onNewItemChange: (value: string) => void;
  placeholder?: string;
  newItemValue: string;
  loading?: boolean;
}

export function ComboBox({
  items,
  selectedValue,
  onSelect,
  onNewItemChange,
  placeholder = "Selecciona un elemento...",
  newItemValue,
  loading = false,
}: ComboBoxProps) {
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState('');

  const filteredItems = filter
    ? items.filter(item =>
        item.label.toLowerCase().includes(filter.toLowerCase())
      )
    : items;

  const displayValue = selectedValue
    ? items.find(item => item.value === selectedValue)?.label
    : newItemValue || placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{displayValue}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" style={{ minWidth: 'var(--radix-popover-trigger-width)' }}>
        <div className="p-2 border-b">
            <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar o crear nuevo..."
                className="h-8"
            />
        </div>
        <ScrollArea className="max-h-60">
            {loading ? (
                <div className="py-4 text-center text-sm">Cargando...</div>
            ) : filteredItems.length > 0 ? (
                filteredItems.map(item => (
                <Button
                    key={item.value}
                    variant="ghost"
                    className="w-full justify-start font-normal h-9"
                    onClick={() => {
                        onSelect(item.value);
                        setOpen(false);
                        setFilter('');
                    }}
                >
                    <Check
                        className={cn("mr-2 h-4 w-4", selectedValue === item.value ? "opacity-100" : "opacity-0")}
                    />
                    {item.label}
                </Button>
                ))
            ) : (
                 <div className="py-4 text-center text-sm">No se encontraron resultados.</div>
            )}
        </ScrollArea>
        {filter && !filteredItems.some(i => i.label.toLowerCase() === filter.toLowerCase()) && (
             <div className="p-2 border-t">
                 <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                        onNewItemChange(filter);
                        setOpen(false);
                        setFilter('');
                    }}
                >
                    Crear "{filter}"
                </Button>
            </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
