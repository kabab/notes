import { useEffect, useState } from "react";
import { isRouteErrorResponse, Outlet, useLoaderData, useRouteError } from "react-router";
import { api } from "../api";
import { QuickSwitcher } from "../components/QuickSwitcher";
import { Sidebar } from "../components/Sidebar";
import { ToastProvider } from "../components/Toaster";

export async function loader() {
  const [folders, notes] = await Promise.all([api.listFolders(), api.listNotes(), api.init()]);
  return { folders, notes };
}

export type RootData = Awaited<ReturnType<typeof loader>>;

export function Component() {
  const { notes } = useLoaderData<typeof loader>();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // ⌘K (Ctrl+K elsewhere) opens the quick switcher, even from inside the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        setSwitcherOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  return (
    <ToastProvider>
      {switcherOpen && <QuickSwitcher notes={notes} onClose={() => setSwitcherOpen(false)} />}
      <div className="flex h-full">
        <Sidebar onOpenSwitcher={() => setSwitcherOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);
  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <pre className="mt-2 text-sm whitespace-pre-wrap text-red-600 select-text">{message}</pre>
    </div>
  );
}
