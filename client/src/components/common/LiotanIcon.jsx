const ICON_STROKE = 1.62;
const ICON_SIZE_BUMP = 2;

function normalizeIconSize(size) {
  const numericSize = Number(size) || 22;
  return numericSize + ICON_SIZE_BUMP;
}

function Svg({ children, size = 22, className = "", title }) {
  const renderSize = normalizeIconSize(size);

  return (
    <svg
      className={className || undefined}
      width={renderSize}
      height={renderSize}
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

function FilledSvg({ children, size = 22, className = "", title }) {
  const renderSize = normalizeIconSize(size);

  return (
    <svg
      className={className || undefined}
      width={renderSize}
      height={renderSize}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <g fill="currentColor">
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
          <path d="M10.35 6.65 5 12l5.35 5.35" />
          <path d="M5.25 12h13.5" />
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

    case "close":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="m6.4 6.4 11.2 11.2" />
          <path d="m17.6 6.4-11.2 11.2" />
        </Svg>
      );

    case "send":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M4.2 5.2 20 12 4.2 18.8l2.15-6.8L4.2 5.2Z" />
          <path d="M6.35 12H20" />
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
        <FilledSvg size={size} className={className} title={title}>
          <path d="M5.25 4.25c-.66 0-1.15.54-1.03 1.18l.72 3.72c.1.54.56.93 1.11.93h11.9c.55 0 1.01-.39 1.11-.93l.72-3.72c.12-.64-.37-1.18-1.03-1.18H5.25Zm1.05 4.05-.43-2.2h12.26l-.43 2.2H6.3Z" />
          <path d="M6.1 10.05v7.15c0 1.6 1.1 2.65 2.72 2.65h6.36c1.62 0 2.72-1.05 2.72-2.65v-7.15H6.1Zm6.9 2.1v3.25l1.28-1.28a.85.85 0 0 1 1.2 1.2l-2.9 2.9a.82.82 0 0 1-1.16 0l-2.9-2.9a.85.85 0 0 1 1.2-1.2L11 15.4v-3.25a1 1 0 1 1 2 0Z" />
        </FilledSvg>
      );

    case "unarchive":
      return (
        <FilledSvg size={size} className={className} title={title}>
          <path d="M5.25 4.25c-.66 0-1.15.54-1.03 1.18l.72 3.72c.1.54.56.93 1.11.93h11.9c.55 0 1.01-.39 1.11-.93l.72-3.72c.12-.64-.37-1.18-1.03-1.18H5.25Zm1.05 4.05-.43-2.2h12.26l-.43 2.2H6.3Z" />
          <path d="M6.1 10.05v7.15c0 1.6 1.1 2.65 2.72 2.65h6.36c1.62 0 2.72-1.05 2.72-2.65v-7.15H6.1Zm5.32 2.08a.82.82 0 0 1 1.16 0l2.9 2.9a.85.85 0 0 1-1.2 1.2L13 14.95v3.25a1 1 0 1 1-2 0v-3.25l-1.28 1.28a.85.85 0 0 1-1.2-1.2l2.9-2.9Z" />
        </FilledSvg>
      );

    case "trash":
      return (
        <FilledSvg size={size} className={className} title={title}>
          <path d="M9.25 3.25c-.58 0-1.02.34-1.22.88l-.52 1.42H5.1a1 1 0 1 0 0 2h13.8a1 1 0 1 0 0-2h-2.41l-.52-1.42c-.2-.54-.64-.88-1.22-.88h-5.5Zm.55 2.3.18-.5h4.04l.18.5H9.8Z" />
          <path d="M6.35 8.6v8.25c0 2 1.25 3.35 3.25 3.35h4.8c2 0 3.25-1.35 3.25-3.35V8.6H6.35Zm3.15 2.5a.92.92 0 0 1 1.84 0v5.72a.92.92 0 0 1-1.84 0V11.1Zm3.16 0a.92.92 0 0 1 1.84 0v5.72a.92.92 0 0 1-1.84 0V11.1Z" />
        </FilledSvg>
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
          <circle cx="12" cy="7.35" r="3.25" />
          <path d="M7.2 20.05v-1.25c0-2.58 1.92-4.45 4.8-4.45s4.8 1.87 4.8 4.45v1.25" />
          <circle cx="5.65" cy="9.15" r="2.35" />
          <path d="M2.8 17.4v-.65c0-1.65 1.08-2.92 2.95-3.28" />
          <circle cx="18.35" cy="9.15" r="2.35" />
          <path d="M21.2 17.4v-.65c0-1.65-1.08-2.92-2.95-3.28" />
        </Svg>
      );

    case "settings":
      return (
        <Svg size={size} className={className} title={title}>
          <path d="M9.7 3.8h4.6l.55 2.05c.55.2 1.08.5 1.55.9l2.05-.58 2.3 3.98-1.5 1.48c.1.62.1 1.12 0 1.74l1.5 1.48-2.3 3.98-2.05-.58c-.47.4-1 .7-1.55.9l-.55 2.05H9.7l-.55-2.05a7.25 7.25 0 0 1-1.55-.9l-2.05.58-2.3-3.98 1.5-1.48a5.7 5.7 0 0 1 0-1.74l-1.5-1.48 2.3-3.98 2.05.58c.47-.4 1-.7 1.55-.9L9.7 3.8Z" />
          <circle cx="12" cy="12.5" r="3" />
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
          <path d="M10.15 6.2 15.95 12l-5.8 5.8" />
          <path d="M5.15 12h11.15" />
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
