"use client";

import { useState } from "react";
import Image from "next/image";
import { Service } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ServiceCardProps {
  service: Service;
  onClick?: () => void;
  compact?: boolean;
}

function getFaviconProxyUrl(url: string): string {
  return `/api/favicon?url=${encodeURIComponent(url)}`;
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function getColorFromName(name: string): string {
  const colors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-yellow-500",
    "bg-lime-500",
    "bg-green-500",
    "bg-emerald-500",
    "bg-teal-500",
    "bg-cyan-500",
    "bg-sky-500",
    "bg-blue-500",
    "bg-indigo-500",
    "bg-violet-500",
    "bg-purple-500",
    "bg-fuchsia-500",
    "bg-pink-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function ServiceIcon({ service, compact }: { service: Service; compact?: boolean }) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const faviconUrl = service.url ? getFaviconProxyUrl(service.url) : "";
  const bgColor = getColorFromName(service.name);

  if (compact) {
    if (faviconUrl && !faviconFailed) {
      return (
        <Image
          src={faviconUrl}
          alt={service.name}
          width={16}
          height={16}
          className="h-4 w-4 object-contain"
          unoptimized
          onError={() => setFaviconFailed(true)}
        />
      );
    }
    return (
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-white shrink-0",
          bgColor
        )}
      >
        {getInitial(service.name)}
      </span>
    );
  }

  if (faviconUrl && !faviconFailed) {
    return (
      <Image
        src={faviconUrl}
        alt={service.name}
        width={32}
        height={32}
        className="h-8 w-8 object-contain"
        unoptimized
        onError={() => setFaviconFailed(true)}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold text-white",
        bgColor
      )}
    >
      {getInitial(service.name)}
    </span>
  );
}

export function ServiceCard({ service, onClick, compact }: ServiceCardProps) {
  const statusColor = service.url
    ? {
        online: "bg-green-500",
        offline: "bg-red-500",
        unknown: "bg-yellow-500",
        removed: "bg-gray-500",
      }[service.status || "unknown"]
    : "bg-gray-500";

  const Wrapper = service.url ? "a" : "div";
  const wrapperProps = service.url
    ? { href: service.url, target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <Wrapper {...wrapperProps} className="block">
      <Card
        className={cn(
          "group relative overflow-hidden transition-all hover:shadow-lg",
          service.url && "cursor-pointer hover:border-primary/50",
          !service.url && "opacity-60"
        )}
        onClick={onClick}
      >
        <CardContent className={cn("flex items-center gap-3", compact ? "p-2" : "gap-4 p-4")}>
          <div className="relative shrink-0">
            <ServiceIcon service={service} compact={compact} />
            {compact ? (
              <span
                className={cn(
                  "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-background",
                  statusColor
                )}
              />
            ) : (
              <span
                className={cn(
                  "absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background",
                  statusColor
                )}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className={cn("truncate", compact ? "text-sm font-medium" : "font-semibold")}>{service.name}</h3>
            {!compact && service.description && (
              <p className="truncate text-sm text-muted-foreground">
                {service.description}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Wrapper>
  );
}
