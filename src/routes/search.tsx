import { useEffect, useMemo, useState } from "react";
import { Link, type LoaderFunctionArgs, useLoaderData, useNavigation, useRouteLoaderData, useSearchParams } from "react-router";
import { api } from "../api";
import { Snippet } from "../components/Snippet";
import { debounce } from "../lib/debounce";
import { folderPath } from "../lib/tree";
import type { RootData } from "./root";

export async function loader({ request }: LoaderFunctionArgs) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return { q, hits: q.trim() ? await api.search(q, 100) : [] };
}

export function Component() {
  const { q, hits } = useLoaderData<typeof loader>();
  const { folders } = useRouteLoaderData("root") as RootData;
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const [value, setValue] = useState(q);

  const updateUrl = useMemo(
    () => debounce((next: string) => setSearchParams(next ? { q: next } : {}, { replace: true }), 150),
    [setSearchParams],
  );
  useEffect(() => () => updateUrl.cancel(), [updateUrl]);

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <input
        autoFocus
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          updateUrl(e.target.value);
        }}
        placeholder="Search notes…"
        className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 outline-none focus:border-blue-500 dark:border-neutral-700"
      />
      <p className="mt-3 text-xs text-neutral-500">
        {q.trim() ? `${hits.length === 100 ? "100+" : hits.length} result${hits.length === 1 ? "" : "s"}` : "Searches titles and text. All words must match; word beginnings are enough."}
        {navigation.state === "loading" && " · searching…"}
      </p>
      <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
        {hits.map((hit) => {
          const path = folderPath(folders, hit.folderId).map((f) => f.name);
          return (
            <li key={hit.id}>
              <Link to={`/notes/${hit.id}`} className="block py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="truncate font-medium">{hit.title}</span>
                  {path.length > 0 && <span className="shrink-0 text-xs text-neutral-400">{path.join(" / ")}</span>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">
                  <Snippet text={hit.snippet} />
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
