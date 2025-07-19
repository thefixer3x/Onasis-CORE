"use client"

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from "../utils";

export interface CardProps {
  title: string;
  description: string;
  date?: string;
  icon?: LucideIcon;
  className?: string;
  iconClassName?: string;
}

interface DisplayCardsProps {
  cards: CardProps[];
  className?: string;
}

export function DisplayCards({ cards, className }: DisplayCardsProps) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-3", className)}>
      {cards.map((card, index) => {
        const Icon = card.icon;
        
        return (
          <div 
            key={index} 
            className="group relative overflow-hidden rounded-lg border p-6 shadow-md transition-all duration-300 hover:shadow-lg hover:-translate-y-1 dark:bg-slate-900 dark:border-slate-800"
          >
            <div className="flex items-start gap-4">
              {Icon && (
                <div className={cn("mt-1 rounded-full bg-primary/10 p-3 text-primary", card.iconClassName)}>
                  <Icon className="h-6 w-6" />
                </div>
              )}
              <div>
                <h3 className="font-bold text-xl mb-2 dark:text-white">{card.title}</h3>
                <p className="text-sm text-slate-600 mb-3 dark:text-slate-400">{card.description}</p>
                {card.date && (
                  <p className="text-xs text-slate-500 dark:text-slate-500">{card.date}</p>
                )}
              </div>
            </div>
            
            <div className="absolute inset-0 z-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          </div>
        );
      })}
    </div>
  );
}
