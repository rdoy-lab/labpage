"use client";

import { useState } from "react";
import { Service, GroupMeta } from "@/lib/types";
import { ServiceCard } from "./service-card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFavorites } from "@/lib/favorites";

interface ServiceGroupProps {
  name: string;
  services: Array<[string, Service]>;
  meta?: GroupMeta;
  onToggleCollapse?: () => void;
}

export function ServiceGroup({
  name,
  services,
  meta,
  onToggleCollapse,
}: ServiceGroupProps) {
  const [collapsed, setCollapsed] = useState(meta?.collapsed ?? false);
  const { isFavorite } = useFavorites();

  const handleToggle = () => {
    setCollapsed(!collapsed);
    onToggleCollapse?.();
  };

  // Sort services: favorites first, then favicons, then URLs, then alphabetical
  const sortedServices = [...services].sort((a, b) => {
    const favA = isFavorite(a[0]) ? 0 : 1;
    const favB = isFavorite(b[0]) ? 0 : 1;
    if (favA !== favB) return favA - favB;
    if (a[1].hasFavicon && !b[1].hasFavicon) return -1;
    if (!a[1].hasFavicon && b[1].hasFavicon) return 1;
    if (a[1].url && !b[1].url) return -1;
    if (!a[1].url && b[1].url) return 1;
    return a[1].name.localeCompare(b[1].name);
  });

  return (
    <div className="space-y-3">
      <Button
        variant="ghost"
        className="h-auto w-full justify-start gap-2 px-2 py-1"
        onClick={handleToggle}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        <h2 className="text-lg font-semibold">{name}</h2>
        <span className="ml-auto text-sm text-muted-foreground">
          {services.length}
        </span>
      </Button>
      <div
        className={cn(
          "grid gap-4 transition-all",
          collapsed && "hidden"
        )}
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        }}
      >
        {sortedServices.map(([id, service]) => (
          <ServiceCard key={id} id={id} service={service} />
        ))}
      </div>
    </div>
  );
}
