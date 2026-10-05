import { useEffect, useMemo, useState } from "react";
import { Link, useMatch } from "react-router";
import type { NoteSummary } from "../api";
import { addMonths, formatMonth, monthGrid, monthOf, todayISO, weekdayLabels } from "../lib/date";
import { ChevronIcon } from "./icons";

const WEEKDAYS = weekdayLabels();

/** Month view of daily notes. Days with a note get a dot; clicking a day opens it. */
export function Calendar({ notes }: { notes: NoteSummary[] }) {
  const today = todayISO();
  const selected = useMatch("/daily/:date")?.params.date ?? null;
  const [month, setMonth] = useState(monthOf(selected ?? today));

  // Follow navigation (prev/next day, "Today") into other months.
  useEffect(() => {
    if (selected) setMonth(monthOf(selected));
  }, [selected]);

  const byDate = useMemo(() => new Map(notes.filter((n) => n.date).map((n) => [n.date!, n])), [notes]);
  const weeks = useMemo(() => monthGrid(month), [month]);

  const arrow = "rounded p-0.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-800";

  return (
    <div className="px-3 pt-3">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => setMonth(monthOf(today))} className="text-sm font-medium hover:underline" title="This month">
          {formatMonth(month)}
        </button>
        <div className="flex">
          <button type="button" title="Previous month" className={arrow} onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronIcon className="rotate-180" />
          </button>
          <button type="button" title="Next month" className={arrow} onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronIcon />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px]">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="py-0.5 text-neutral-400">
            {d}
          </div>
        ))}
        {weeks.flat().map((date) => {
          const note = byDate.get(date);
          const outside = monthOf(date) !== month;
          const isSelected = date === selected;
          return (
            <Link
              key={date}
              to={`/daily/${date}`}
              title={note ? note.title : date}
              className={`relative mx-auto flex size-7 items-center justify-center rounded-full ${
                isSelected
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
              } ${outside && !isSelected ? "text-neutral-300 dark:text-neutral-600" : ""} ${
                date === today && !isSelected ? "font-bold text-blue-600 dark:text-blue-400" : ""
              }`}
            >
              {Number(date.slice(8))}
              {note && (
                <span
                  className={`absolute bottom-0.5 size-1 rounded-full ${isSelected ? "bg-white dark:bg-neutral-900" : "bg-blue-500"}`}
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
