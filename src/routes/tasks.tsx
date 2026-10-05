import { type ReactNode, useEffect } from "react";
import {
  type ActionFunctionArgs,
  Link,
  type LoaderFunctionArgs,
  NavLink,
  useFetcher,
  useLoaderData,
} from "react-router";
import { api, type Task } from "../api";
import { useNotify } from "../components/Toaster";
import { addDays, formatLongDate, todayISO } from "../lib/date";
import { displayTaskText, groupByDoneDay, groupByNote } from "../lib/tasks";

const PAGE = 200;

export async function todoLoader() {
  return { tasks: await api.listOpenTasks() };
}

export async function doneLoader({ request }: LoaderFunctionArgs) {
  const limit = Number(new URL(request.url).searchParams.get("limit")) || PAGE;
  return { tasks: await api.listDoneTasks(limit), limit };
}

type ToggleRequest = { id: string; done: boolean };

/** Resource route action (`/task`): check or uncheck a task in its note. */
export async function action({ request }: ActionFunctionArgs) {
  const { id, done } = (await request.json()) as ToggleRequest;
  try {
    await api.setTaskDone(id, done);
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function TodoPage() {
  const { tasks } = useLoaderData<typeof todoLoader>();
  const groups = groupByNote(tasks);
  return (
    <Page>
      {groups.length === 0 && <Empty>Nothing to do. Add tasks with “- [ ]” in any note.</Empty>}
      {groups.map(({ key, tasks }) => (
        <section key={key} className="mt-6">
          <Link to={`/notes/${key}`} className="text-sm font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
            {tasks[0]!.noteTitle}
          </Link>
          <ul className="mt-1">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

export function DonePage() {
  const { tasks, limit } = useLoaderData<typeof doneLoader>();
  const today = todayISO();
  const yesterday = addDays(today, -1);
  const dayLabel = (day: string) => (day === today ? "Today" : day === yesterday ? "Yesterday" : formatLongDate(day));

  return (
    <Page>
      {tasks.length === 0 && <Empty>No completed tasks yet.</Empty>}
      {groupByDoneDay(tasks).map(({ key, tasks }) => (
        <section key={key} className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-500">{key ? dayLabel(key) : "Unknown date"}</h2>
          <ul className="mt-1">
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                meta={
                  <>
                    {t.noteTitle}
                    {t.doneAt !== null && ` · ${timeFormat.format(t.doneAt)}`}
                  </>
                }
              />
            ))}
          </ul>
        </section>
      ))}
      {tasks.length === limit && (
        <Link to={`?limit=${limit + PAGE}`} replace className="mt-6 inline-block text-sm text-blue-600 hover:underline">
          Show more
        </Link>
      )}
    </Page>
  );
}

function TaskRow({ task, meta }: { task: Task; meta?: ReactNode }) {
  const fetcher = useFetcher<Awaited<ReturnType<typeof action>>>();
  const notify = useNotify();
  // Optimistic: show the requested state while the toggle is in flight.
  const done = fetcher.json ? (fetcher.json as ToggleRequest).done : task.done;
  const data = fetcher.data;

  useEffect(() => {
    if (data && "error" in data) notify(`Couldn't update task: ${data.error}`);
  }, [data, notify]);

  return (
    <li className="group flex items-start gap-2 rounded px-1 py-1 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
      <input
        type="checkbox"
        checked={done}
        onChange={(e) =>
          fetcher.submit({ id: task.id, done: e.target.checked } satisfies ToggleRequest, {
            method: "post",
            action: "/task",
            encType: "application/json",
          })
        }
        className="mt-1 size-3.5 shrink-0 cursor-pointer accent-blue-600"
        aria-label={done ? "Mark as not done" : "Mark as done"}
      />
      <Link to={`/notes/${task.noteId}?line=${task.line}`} className="min-w-0 flex-1">
        <span className={done ? "text-neutral-400 line-through" : ""}>{displayTaskText(task.text)}</span>
        {meta && <span className="ml-2 text-xs text-neutral-400">{meta}</span>}
      </Link>
    </li>
  );
}

function Page({ children }: { children: ReactNode }) {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1 text-sm ${isActive ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"}`;
  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <nav className="flex gap-1">
        <NavLink to="/tasks" end className={tab}>
          To do
        </NavLink>
        <NavLink to="/tasks/done" className={tab}>
          Done
        </NavLink>
      </nav>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="mt-10 text-center text-sm text-neutral-500">{children}</p>;
}
