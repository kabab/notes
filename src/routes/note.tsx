import { isRouteErrorResponse, type LoaderFunctionArgs, useLoaderData, useRouteError } from "react-router";
import { api, ApiError } from "../api";
import { NoteEditor, waitForPendingSaves } from "../components/NoteEditor";

export async function loader({ params }: LoaderFunctionArgs) {
  await waitForPendingSaves();
  return { note: await api.getNote(params.noteId!) };
}

export function Component() {
  const { note } = useLoaderData<typeof loader>();
  return <NoteEditor key={note.id} note={note} />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (error instanceof ApiError && error.code === "not_found") {
    return <p className="p-8 text-neutral-500">This note doesn't exist (it may have been deleted).</p>;
  }
  const message = isRouteErrorResponse(error) ? error.statusText : error instanceof Error ? error.message : String(error);
  return <p className="p-8 text-red-600 select-text">{message}</p>;
}
