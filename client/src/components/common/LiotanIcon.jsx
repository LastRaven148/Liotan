const ICON_STROKE = 1.72;

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
          <path d="M5.25 8.15h13.5" />
          <path d="M6.7 8.15h10.6v9.9c0 1.12-.83 1.95-1.95 1.95h-6.7c-1.12 0-1.95-.83-1.95-1.95v-9.9Z" />
          <path d="M6.2 4.4h11.6l.95 3.75H5.25L6.2 4.4Z" />
          <path d="M12 11.1v4.65" />
          <path d="m9.85 13.75 2.15 2.15 2.15-2.15" />
        </Svg>
      );

    case "unarchive":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M5.25 8.15h13.5" />
          <path d="M6.7 8.15h10.6v9.9c0 1.12-.83 1.95-1.95 1.95h-6.7c-1.12 0-1.95-.83-1.95-1.95v-9.9Z" />
          <path d="M6.2 4.4h11.6l.95 3.75H5.25L6.2 4.4Z" />
          <path d="M12 15.9v-4.65" />
          <path d="m9.85 13.25 2.15-2.15 2.15 2.15" />
        </Svg>
      );

    case "trash":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M7.2 8.05h9.6" />
          <path d="M8.35 8.05v10.05c0 1.2.8 2.05 2 2.05h3.3c1.2 0 2-.85 2-2.05V8.05" />
          <path d="M10.1 8.05V6.45c0-1 .78-1.65 1.75-1.65h.3c.97 0 1.75.65 1.75 1.65v1.6" />
          <path d="M10.7 11.25v5.35" />
          <path d="M13.3 11.25v5.35" />
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
          <circle cx="12" cy="8.7" r="3.35" />
          <path d="M6.2 19.35c.6-3.15 2.8-5 5.8-5s5.2 1.85 5.8 5" />
          <circle cx="5.9" cy="10" r="2.35" />
          <path d="M2.8 18.2c.35-2.25 1.55-3.75 3.45-4.35" />
          <circle cx="18.1" cy="10" r="2.35" />
          <path d="M21.2 18.2c-.35-2.25-1.55-3.75-3.45-4.35" />
        </Svg>
      );

    case "settings":
      return (
        <Svg size={size} className={className} title={title}>
          <circle cx="12" cy="12" r="2.75" />
          <path d="M12 3.35 12.72 5.35c.66.14 1.28.4 1.84.76l1.94-.9 1.52 1.52-.9 1.94c.36.56.62 1.18.76 1.84l2 .72v2.14l-2 .72a6.6 6.6 0 0 1-.76 1.84l.9 1.94-1.52 1.52-1.94-.9a6.6 6.6 0 0 1-1.84.76L12 20.65H9.86l-.72-2a6.6 6.6 0 0 1-1.84-.76l-1.94.9-1.52-1.52.9-1.94a6.6 6.6 0 0 1-.76-1.84l-2-.72v-2.14l2-.72c.14-.66.4-1.28.76-1.84l-.9-1.94 1.52-1.52 1.94.9c.56-.36 1.18-.62 1.84-.76l.72-2H12Z" />
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
