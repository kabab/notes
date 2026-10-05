import type { SVGProps } from "react";

function Icon({ d, ...props }: SVGProps<SVGSVGElement> & { d: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d={d} />
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;
export const ChevronIcon = (p: P) => <Icon d="M6 4l4 4-4 4" {...p} />;
export const FolderIcon = (p: P) => <Icon d="M2 4.5V12a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3.5H3a1 1 0 00-1 1z" {...p} />;
export const NoteIcon = (p: P) => <Icon d="M4 2h5l3 3v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zM9 2v3h3M5.5 8.5h5M5.5 11h5" {...p} />;
export const PlusIcon = (p: P) => <Icon d="M8 3v10M3 8h10" {...p} />;
export const FolderPlusIcon = (p: P) => <Icon d="M2 4.5V12a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3.5H3a1 1 0 00-1 1zM8 7v4M6 9h4" {...p} />;
export const PencilIcon = (p: P) => <Icon d="M10.5 2.5l3 3L6 13H3v-3z" {...p} />;
export const TrashIcon = (p: P) => <Icon d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5" {...p} />;
export const CalendarIcon = (p: P) => <Icon d="M3 4h10v9H3zM3 7h10M6 2.5v3M10 2.5v3" {...p} />;
export const CheckSquareIcon = (p: P) => <Icon d="M3 3h10v10H3zM5.5 8l2 2 3-4" {...p} />;
export const CheckCircleIcon = (p: P) => <Icon d="M8 14A6 6 0 108 2a6 6 0 000 12zM5.5 8l2 2 3-4" {...p} />;
export const ImageIcon = (p: P) => <Icon d="M2.5 3.5h11v9h-11zM2.5 10.5l3-3 3 3 2-2 3 3M10.5 6.5h.01" {...p} />;
export const SearchIcon = (p: P) => <Icon d="M7 12A5 5 0 107 2a5 5 0 000 10zM14 14l-3.5-3.5" {...p} />;
export const ExportIcon = (p: P) => <Icon d="M8 10V2M5 5l3-3 3 3M3 9v4h10V9" {...p} />;
