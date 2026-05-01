"use client";

import { Service } from "@/lib/types";
import { ServiceCard } from "./service-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers } from "lucide-react";

interface StackGroupProps {
  name: string;
  services: Array<[string, Service]>;
}

export function StackGroup({ name, services }: StackGroupProps) {
  // Sort services: ones with favicons first, then URLs, then alphabetical
  const sortedServices = [...services].sort((a, b) => {
    if (a[1].hasFavicon && !b[1].hasFavicon) return -1;
    if (!a[1].hasFavicon && b[1].hasFavicon) return 1;
    if (a[1].url && !b[1].url) return -1;
    if (!a[1].url && b[1].url) return 1;
    return a[1].name.localeCompare(b[1].name);
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Layers className="h-5 w-5 text-muted-foreground" />
          {name}
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {services.length} {services.length === 1 ? "service" : "services"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {sortedServices.map(([id, service]) => (
            <ServiceCard key={id} service={service} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
