import { useEffect } from "react";
import { data, Form, Link, type LoaderFunctionArgs, useLoaderData, useRevalidator } from "react-router";
import { api } from "../api";
import { ChevronIcon } from "../components/icons";
import { NoteEditor, waitForPendingSaves } from "../components/NoteEditor";
import { addDays, formatLongDate, isValidISODate, todayISO } from "../lib/date";

export async function loader({ params }: LoaderFunctionArgs) {
  const date = params.date!;
  if (!isValidISODate(date)) throw data(`Invalid date: ${date}`, { status: 404 });
  await waitForPendingSaves();
  // Today's note is created on open; other days only on request (so browsing doesn't litter).
  if (date === todayISO()) {
    const { note, created } = await api.ensureDailyNote(date);
    return { date, note, created };
  }
  return { date, note: await api.getDailyNote(date), created: false };
}

/** "Create note for this day" on a past/future date. */
export async function action({ params }: LoaderFunctionArgs) {
  await api.ensureDailyNote(params.date!);
  return null;
}

export function Component() {
  const { date, note, created } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();

  // A note (and maybe the Daily folder) was just created by the loader: refresh the sidebar.
  useEffect(() => {
    if (created) void revalidate();
  }, [created, note?.id]); // re-run only when a new note was created

  const header = <DailyHeader date={date} />;
  if (note) return <NoteEditor key={note.id} note={note} header={header} />;

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      {header}
      <div className="mt-16 flex flex-col items-center gap-3 text-neutral-500">
        <p>No daily note for this day.</p>
        <Form method="post">
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Create note
          </button>
        </Form>
      </div>
    </div>
  );
}

function DailyHeader({ date }: { date: string }) {
  const today = todayISO();
  const arrow =
    "rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100";
  return (
    <div className="mb-3 flex items-center gap-1 border-b border-neutral-200 pb-3 dark:border-neutral-800">
      <Link to={`/daily/${addDays(date, -1)}`} title="Previous day" className={arrow}>
        <ChevronIcon className="rotate-180" />
      </Link>
      <Link to={`/daily/${addDays(date, 1)}`} title="Next day" className={arrow}>
        <ChevronIcon />
      </Link>
      <h2 className="ml-1 flex-1 text-sm font-medium">{formatLongDate(date)}</h2>
      {date !== today && (
        <Link
          to={`/daily/${today}`}
          className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Today
        </Link>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return <p className="p-8 text-neutral-500">That isn't a valid date.</p>;
}
