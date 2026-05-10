"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { ServiceGroup } from "./service-group";
import { StackGroup } from "./stack-group";
import { Service } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Layers, LayoutGrid } from "lucide-react";

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Dashboard() {
  const config = useStore((s) => s.config);
  const loading = useStore((s) => s.loading);
  const refreshDocker = useStore((s) => s.refreshDocker);
  const updateGroup = useStore((s) => s.updateGroup);
  const checkHealth = useStore((s) => s.checkHealth);

  const [activeTab, setActiveTab] = useState("groups");

  useEffect(() => {
    refreshDocker().then(() => checkHealth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const services = useMemo(() => config?.services || {}, [config?.services]);
  const serviceCount = Object.values(services).filter(
    (s) => s.status !== "removed"
  ).length;

  // Group services by their group field
  const groupedServices = useMemo(() => {
    const groups = new Map<string, Array<[string, Service]>>();

    for (const [id, service] of Object.entries(services)) {
      if (service.status === "removed") continue;
      const groupName = service.group || "Other";
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName)!.push([id, service]);
    }

    return groups;
  }, [services]);

  const sortedGroups = useMemo(() => {
    const entries = Array.from(groupedServices.entries());
    const groupOrder = config?.groups || {};
    return entries.sort((a, b) => {
      const orderA = groupOrder[a[0]]?.order ?? 999;
      const orderB = groupOrder[b[0]]?.order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a[0].localeCompare(b[0]);
    });
  }, [groupedServices, config]);

  const stackedServices = useMemo(() => {
    const stacks = new Map<string, Array<[string, Service]>>();
    for (const [id, service] of Object.entries(services)) {
      if (service.status === "removed" || !service.composeProject) continue;
      const projectName = service.composeProject;
      if (!stacks.has(projectName)) stacks.set(projectName, []);
      stacks.get(projectName)!.push([id, service]);
    }
    return stacks;
  }, [services]);

  const sortedStacks = useMemo(() => {
    return Array.from(stackedServices.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }, [stackedServices]);

  const kubernetesByNamespace = useMemo(() => {
    const namespaces = new Map<string, Array<[string, Service]>>();
    for (const [id, service] of Object.entries(services)) {
      if (service.status === "removed" || service.source !== "kubernetes" || !service.namespace) continue;
      const ns = service.namespace;
      if (!namespaces.has(ns)) namespaces.set(ns, []);
      namespaces.get(ns)!.push([id, service]);
    }
    return namespaces;
  }, [services]);

  const sortedNamespaces = useMemo(() => {
    return Array.from(kubernetesByNamespace.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }, [kubernetesByNamespace]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <h1 className="text-xl font-bold">LabPage</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshDocker().then(() => checkHealth())}
              disabled={loading}
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", loading && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-6 py-10">
        {loading && serviceCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              Discovering services...
            </p>
          </div>
        ) : !loading && serviceCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-lg text-muted-foreground">
              No services discovered.
            </p>
            <Button
              className="mt-4"
              onClick={() => refreshDocker().then(() => checkHealth())}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Scan Now
            </Button>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="groups" className="gap-2">
                <LayoutGrid className="h-4 w-4" />
                Groups
              </TabsTrigger>
              <TabsTrigger value="stacks" className="gap-2">
                <Layers className="h-4 w-4" />
                Stacks
                {(sortedStacks.length + sortedNamespaces.length) > 0 && (
                  <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                    {sortedStacks.length + sortedNamespaces.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="groups">
              <div className="space-y-10">
                {sortedGroups.map(([name, services]) => (
                  <ServiceGroup
                    key={name}
                    name={name}
                    services={services}
                    meta={config?.groups[name]}
                    onToggleCollapse={() =>
                      updateGroup(name, {
                        collapsed: !config?.groups[name]?.collapsed,
                      })
                    }
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="stacks">
              {sortedStacks.length === 0 && sortedNamespaces.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  No stacks detected.
                </div>
              ) : (
                <div className="space-y-8">
                  {sortedStacks.map(([name, services]) => (
                    <StackGroup key={name} name={name} services={services} />
                  ))}
                  {sortedNamespaces.length > 0 && (
                    <>
                      {sortedStacks.length > 0 && (
                        <h2 className="mt-10 text-lg font-semibold text-muted-foreground">
                          Kubernetes Namespaces
                        </h2>
                      )}
                      <div className="space-y-6">
                        {sortedNamespaces.map(([name, services]) => (
                          <StackGroup key={name} name={name} services={services} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>

      <footer className="py-6">
        <div className="container mx-auto max-w-6xl px-6 text-center text-xs text-muted-foreground">
          <span>Image: {process.env.NEXT_PUBLIC_DOCKER_IMAGE_VERSION}</span>
          <span> · Commit: {process.env.NEXT_PUBLIC_GIT_HASH}</span>
        </div>
      </footer>
    </div>
  );
}
