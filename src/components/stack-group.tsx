"use client";

import { Service } from "@/lib/types";
import { ServiceCard } from "./service-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers } from "lucide-react";
import { useFavorites } from "@/lib/favorites";

interface StackGroupProps {
  name: string;
  services: Array<[string, Service]>;
}

export function StackGroup({ name, services }: StackGroupProps) {
  const { isFavorite } = useFavorites();

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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-muted-foreground" />
          {name}
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {services.length} {services.length === 1 ? "service" : "services"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          }}
        >
          {sortedServices.map(([id, service]) => (
            <ServiceCard key={id} id={id} service={service} compact />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
