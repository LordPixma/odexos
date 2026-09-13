interface IconProps {
  className?: string;
  size?: number;
}

function base(size: number, className: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
}

export function HomeIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

export function CalendarIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </svg>
  );
}

export function WalletIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 7a2 2 0 0 1 2-2h12v4" />
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <circle cx="16.5" cy="13" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChartIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" />
      <path d="M12 3v9h9" opacity="0.5" />
    </svg>
  );
}

export function UsersIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 20a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  );
}

export function PlusIcon({ className = "", size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function LogoutIcon({ className = "", size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 16l-4-4 4-4M6 12h11" />
    </svg>
  );
}

export function MapPinIcon({ className = "", size = 16 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function ClockIcon({ className = "", size = 16 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function TrashIcon({ className = "", size = 16 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  );
}

export function EditIcon({ className = "", size = 16 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="M13.5 6.5l3 3" />
    </svg>
  );
}

export function BankIcon({ className = "", size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v8M9 10v8M15 10v8M19 10v8" />
      <path d="M3 21h18" />
    </svg>
  );
}

export function RefreshIcon({ className = "", size = 16 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M20 11a8 8 0 0 0-14-4.5L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14 4.5L20 16" />
      <path d="M20 20v-4h-4" />
    </svg>
  );
}

export function BellIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 9a6 6 0 0 1 12 0c0 4.5 1.5 5.5 2 6H4c.5-.5 2-1.5 2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function ClipboardIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5H9V4Z" />
      <path d="M8.5 11h7M8.5 15h5" />
    </svg>
  );
}

export function TargetIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ReceiptIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 3v18l2.5-1.5L10 21l2-1.5L14 21l2.5-1.5L19 21V3l-2.5 1.5L14 3l-2 1.5L10 3 7.5 4.5 5 3Z" />
      <path d="M8.5 9h7M8.5 13h7" />
    </svg>
  );
}

export function CheckIcon({ className = "", size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)} strokeWidth={2.6}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function BroomIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M15 4l5 5" />
      <path d="M13.5 6.5 17.5 10.5l-6 6H5l2.5-4 6-6Z" />
      <path d="M5 16.5 3 21l4.5-2" />
    </svg>
  );
}

export function LinkIcon({ className = "", size = 16 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5" />
    </svg>
  );
}

export function PhoneIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="2" width="14" height="20" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  );
}

export function StarIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9L12 3Z" />
    </svg>
  );
}

export function PiggyIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12a6 6 0 0 1 6-6h3a6 6 0 0 1 5.6 3.9l1.7.9a1 1 0 0 1 .5.9v1.7a1 1 0 0 1-1 1h-1.3A6 6 0 0 1 16 17v2h-3v-1.3a6.4 6.4 0 0 1-2 0V19H8v-2.2A6 6 0 0 1 4 12Z" />
      <path d="M9 10h.01" />
    </svg>
  );
}

export function ShieldIcon({ className = "", size = 20 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 5 6v5.5c0 4.2 2.9 8.1 7 9.5 4.1-1.4 7-5.3 7-9.5V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8 3.4-3.6" />
    </svg>
  );
}
