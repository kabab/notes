import { createBrowserRouter, redirect } from "react-router";
import { todayISO } from "./lib/date";
import * as daily from "./routes/daily";
import * as folder from "./routes/folder";
import * as note from "./routes/note";
import * as root from "./routes/root";
import * as search from "./routes/search";
import * as tasks from "./routes/tasks";
import * as tree from "./routes/tree-action";

export const router = createBrowserRouter([
  {
    id: "root",
    path: "/",
    loader: root.loader,
    Component: root.Component,
    ErrorBoundary: root.ErrorBoundary,
    HydrateFallback: () => null,
    children: [
      { index: true, loader: () => redirect(`/daily/${todayISO()}`), Component: () => null },
      {
        path: "daily/:date",
        loader: daily.loader,
        action: daily.action,
        Component: daily.Component,
        ErrorBoundary: daily.ErrorBoundary,
      },
      {
        path: "notes/:noteId",
        loader: note.loader,
        Component: note.Component,
        ErrorBoundary: note.ErrorBoundary,
      },
      { path: "folders/:folderId", Component: folder.Component },
      { path: "search", loader: search.loader, Component: search.Component },
      { path: "tasks", loader: tasks.todoLoader, Component: tasks.TodoPage },
      { path: "tasks/done", loader: tasks.doneLoader, Component: tasks.DonePage },
      // Resource route: toggling a task from the task views.
      { path: "task", action: tasks.action },
      // Resource route: all structural mutations of the folder/note tree.
      { path: "tree", action: tree.action },
    ],
  },
]);
