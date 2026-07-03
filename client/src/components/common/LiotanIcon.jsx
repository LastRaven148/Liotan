const ICON_STROKE = 1.62;

function Svg({ children, size = 22, className = "", title }) {
  return (
    <svg
      className={className || undefined}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <g
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      >
        {children}
      </g>
    </svg>
  );
}

export default function LiotanIcon({ name, size = 22, className = "", title }) {
  switch (name) {
    case "back":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M14.8 6.2 9 12l5.8 5.8" />
          <path d="M9.4 12h10" />
        </Svg>
      );

    case "burger":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M5 7h14" />
          <path d="M5 12h14" />
          <path d="M5 17h14" />
        </Svg>
      );

    case "search":
      return (
        <Svg size={size} className={className} title={title}>
          <circle cx="10.7" cy="10.7" r="5.5" />
          <path d="m15 15 4.2 4.2" />
        </Svg>
      );

    case "edit":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M4.8 19.2 6 14.7 15.6 5.1a2.15 2.15 0 0 1 3.05 3.05L9.05 17.75 4.8 19.2Z" />
          <path d="m14.25 6.45 3.1 3.1" />
        </Svg>
      );

    case "moreVertical":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M12 6.6h.01" />
          <path d="M12 12h.01" />
          <path d="M12 17.4h.01" />
        </Svg>
      );

    case "profile":
      return (
        <Svg size={size} className={className} title={title}>
          <circle cx="12" cy="8.1" r="3.15" />
          <path d="M5.6 19.2c.75-3.35 3.1-5.05 6.4-5.05s5.65 1.7 6.4 5.05" />
        </Svg>
      );

    case "star":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M12 3.9 14.45 8.85 19.85 9.65 15.95 13.45 16.85 18.85 12 16.3 7.15 18.85 8.05 13.45 4.15 9.65 9.55 8.85 12 3.9Z" />
        </Svg>
      );

    case "archive":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M5.25 8.35h13.5" />
          <path d="M6.55 8.35h10.9v9.65c0 1.22-.88 2.1-2.1 2.1h-6.7c-1.22 0-2.1-.88-2.1-2.1V8.35Z" />
          <path d="M6.25 4.45h11.5l1 3.9H5.25l1-3.9Z" />
          <path d="M12 11.3v4.7" />
          <path d="m9.65 13.95 2.35 2.35 2.35-2.35" />
        </Svg>
      );

    case "unarchive":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M5.25 8.35h13.5" />
          <path d="M6.55 8.35h10.9v9.65c0 1.22-.88 2.1-2.1 2.1h-6.7c-1.22 0-2.1-.88-2.1-2.1V8.35Z" />
          <path d="M6.25 4.45h11.5l1 3.9H5.25l1-3.9Z" />
          <path d="M12 16.2v-4.7" />
          <path d="m9.65 13.85 2.35-2.35 2.35 2.35" />
        </Svg>
      );

    case "trash":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M6.35 7.65h11.3" />
          <path d="M8.05 7.65v10.15c0 1.35.9 2.25 2.25 2.25h3.4c1.35 0 2.25-.9 2.25-2.25V7.65" />
          <path d="M9.75 7.65V6.1c0-1.08.82-1.82 1.9-1.82h.7c1.08 0 1.9.74 1.9 1.82v1.55" />
          <path d="M10.2 11.15v5.7" />
          <path d="M13.8 11.15v5.7" />
        </Svg>
      );

    case "pin":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="m15.35 4.55 4.1 4.1" />
          <path d="M14.75 5.2 9.7 10.25l-2.65.35-.85.85 6.35 6.35.85-.85.35-2.65 5.05-5.05-4.05-4.05Z" />
          <path d="M10.45 15.55 5.2 20.8" />
        </Svg>
      );

    case "unpin":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="m15.35 4.55 4.1 4.1" />
          <path d="M14.75 5.2 9.7 10.25l-2.65.35-.85.85 6.35 6.35.85-.85.35-2.65 5.05-5.05-4.05-4.05Z" />
          <path d="M10.45 15.55 5.2 20.8" />
          <path d="M4.4 4.4 19.6 19.6" />
        </Svg>
      );

    case "group":
      return (
        <Svg size={size} className={className} title={title}>
          <circle cx="12" cy="7.65" r="3.25" />
          <path d="M7.1 20.15v-1.4c0-2.58 1.95-4.5 4.9-4.5s4.9 1.92 4.9 4.5v1.4" />
          <circle cx="5.95" cy="9.35" r="2.45" />
          <path d="M2.65 17.75v-.75c0-1.8 1.25-3.18 3.25-3.62" />
          <circle cx="18.05" cy="9.35" r="2.45" />
          <path d="M21.35 17.75v-.75c0-1.8-1.25-3.18-3.25-3.62" />
        </Svg>
      );

    case "settings":
      return (
        <Svg size={size} className={className} title={title}>
          <circle cx="12" cy="12" r="2.95" />
          <path d="M12 3.35h.02l.74 2.08c.62.15 1.21.39 1.74.72l2.02-.94 1.5 1.5-.94 2.02c.33.53.57 1.12.72 1.74l2.08.74v2.12l-2.08.74a6.07 6.07 0 0 1-.72 1.74l.94 2.02-1.5 1.5-2.02-.94c-.53.33-1.12.57-1.74.72L12.02 20.65h-2.14l-.74-2.08a6.07 6.07 0 0 1-1.74-.72l-2.02.94-1.5-1.5.94-2.02a6.07 6.07 0 0 1-.72-1.74l-2.08-.74v-2.12l2.08-.74c.15-.62.39-1.21.72-1.74l-.94-2.02 1.5-1.5 2.02.94c.53-.33 1.12-.57 1.74-.72l.74-2.08H12Z" />
        </Svg>
      );

    case "bell":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M6.15 10.2c0-3.55 2.25-5.85 5.85-5.85s5.85 2.3 5.85 5.85v2.65l1.25 2.15c.42.72-.08 1.6-.92 1.6H5.82c-.84 0-1.34-.88-.92-1.6l1.25-2.15V10.2Z" />
          <path d="M9.7 18.55c.42.85 1.18 1.3 2.3 1.3s1.88-.45 2.3-1.3" />
        </Svg>
      );

    case "lock":
      return (
        <Svg size={size} className={className} title={title}>
          <rect x="6.1" y="10.1" width="11.8" height="9.4" rx="2.15" />
          <path d="M8.55 10.1V7.85c0-2.1 1.36-3.45 3.45-3.45s3.45 1.35 3.45 3.45v2.25" />
          <path d="M12 13.35v2.65" />
        </Svg>
      );

    case "camera":
      return (
        <Svg size={size} className={className} title={title}>
          <rect x="4.2" y="7.1" width="12.25" height="9.8" rx="2.15" />
          <path d="m16.45 10.15 3.35-2.05v7.8l-3.35-2.05" />
        </Svg>
      );

    case "devices":
      return (
        <Svg size={size} className={className} title={title}>
          <rect x="3.9" y="5.15" width="10.75" height="8.35" rx="1.55" />
          <path d="M7.1 16.45h5.25" />
          <path d="M9.72 13.5v2.95" />
          <rect x="15.65" y="10.35" width="4.45" height="8.5" rx="1.25" />
          <path d="M17.25 16.9h1.25" />
        </Svg>
      );

    case "shield2":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M12 3.75 18.15 6.2v4.8c0 4.05-2.35 6.95-6.15 9.25C8.2 17.95 5.85 15.05 5.85 11V6.2L12 3.75Z" />
          <path d="M10.15 9.95c.15-1.1.9-1.75 1.98-1.75 1.18 0 1.92.72 1.92 1.72 0 .68-.32 1.18-1.12 1.72l-1.12.76c-.75.5-1.18 1.08-1.18 1.9h3.55" />
        </Svg>
      );

    case "arrowRight":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M9.2 6.2 15 12l-5.8 5.8" />
          <path d="M4.8 12h9.8" />
        </Svg>
      );

    case "openTab":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M7.4 6.2h-1.1c-1.05 0-1.8.75-1.8 1.8v9.7c0 1.05.75 1.8 1.8 1.8h9.7c1.05 0 1.8-.75 1.8-1.8v-1.1" />
          <path d="M12.2 4.5h7.3v7.3" />
          <path d="M10.4 13.6 19.2 4.8" />
        </Svg>
      );


    case "reply":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M10.2 7.15 5.35 12l4.85 4.85" />
          <path d="M6 12h8.2c3.2 0 5.1 2.05 5.1 5.15v.7" />
        </Svg>
      );

    case "copy":
      return (
        <Svg size={size} className={className} title={title}>
          <rect x="8.7" y="8" width="10.2" height="11" rx="2" />
          <path d="M5.1 15.85h-.2c-.98 0-1.75-.77-1.75-1.75V5.85c0-.98.77-1.75 1.75-1.75h8.25c.98 0 1.75.77 1.75 1.75v.2" />
        </Svg>
      );

    case "download":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M12 4.6v9.2" />
          <path d="m8.2 10.25 3.8 3.8 3.8-3.8" />
          <path d="M5.2 19.2h13.6" />
        </Svg>
      );

    case "select":
      return (
        <Svg size={size} className={className} title={title}>
          <circle cx="12" cy="12" r="7.7" />
          <path d="m8.5 12.2 2.25 2.25 4.9-4.9" />
        </Svg>
      );

    default:
      return null;
  }
}
