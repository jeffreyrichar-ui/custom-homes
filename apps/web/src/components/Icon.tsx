type Props = {
  name: IconName;
  size?: number;
  className?: string;
};

export type IconName =
  | "edit"
  | "delete"
  | "duplicate"
  | "plus"
  | "image"
  | "upload"
  | "download"
  | "check"
  | "x"
  | "warn"
  | "search"
  | "grid"
  | "list"
  | "chevron-right"
  | "external"
  | "user"
  | "logout";

const PATHS: Record<IconName, string> = {
  edit:
    "M11.5 1.5 L13.5 3.5 L4 13 H2 V11 L11.5 1.5 Z M10 3 L12 5",
  delete:
    "M2 4 H14 M5 4 V2.5 A0.5 0.5 0 0 1 5.5 2 H10.5 A0.5 0.5 0 0 1 11 2.5 V4 M4 4 V13 A1 1 0 0 0 5 14 H11 A1 1 0 0 0 12 13 V4 M6.5 7 V11 M9.5 7 V11",
  duplicate:
    "M5 2 H12 A1 1 0 0 1 13 3 V10 M3 5 H10 A1 1 0 0 1 11 6 V13 A1 1 0 0 1 10 14 H3 A1 1 0 0 1 2 13 V6 A1 1 0 0 1 3 5 Z",
  plus: "M8 3 V13 M3 8 H13",
  image: "M2 3 H14 A1 1 0 0 1 14 13 H2 A1 1 0 0 1 2 3 Z M2 11 L5 8 L8 10 L11 6 L14 9",
  upload: "M8 2 V11 M4 6 L8 2 L12 6 M2 14 H14",
  download: "M8 2 V11 M4 7 L8 11 L12 7 M2 14 H14",
  check: "M3 8 L7 12 L13 4",
  x: "M3 3 L13 13 M13 3 L3 13",
  warn: "M8 2 L14 13 H2 Z M8 6 V10 M8 11.5 V12",
  search:
    "M7 12 A5 5 0 1 1 7 2 A5 5 0 1 1 7 12 Z M11 11 L14 14",
  grid:
    "M2 2 H7 V7 H2 Z M9 2 H14 V7 H9 Z M2 9 H7 V14 H2 Z M9 9 H14 V14 H9 Z",
  list: "M3 4 H13 M3 8 H13 M3 12 H13",
  "chevron-right": "M6 3 L11 8 L6 13",
  external:
    "M9 3 H13 V7 M13 3 L7 9 M11 13 H4 A1 1 0 0 1 3 12 V5 A1 1 0 0 1 4 4 H7",
  user:
    "M8 8 A3 3 0 1 1 8 2 A3 3 0 1 1 8 8 Z M2 14 C2 11 5 9 8 9 C11 9 14 11 14 14",
  logout:
    "M9 3 H13 A1 1 0 0 1 14 4 V12 A1 1 0 0 1 13 13 H9 M3 8 H11 M8 5 L11 8 L8 11",
};

export function Icon({ name, size = 14, className }: Props) {
  const d = PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
