import { avatarUrl }
from "../../utils/avatarUrl";

import {
  useLanguage
} from "../../context/LanguageContext";
import useTimeFormat from "../../hooks/ui/useTimeFormat";

function isSameDay(a, b) {

  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );

}

function formatShortTime(date, timeFormat) {

  return date.toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: timeFormat === "12"
    }
  );

}

function formatShortDate(date) {

  return date.toLocaleDateString(
    [],
    {
      day: "2-digit",
      month: "2-digit"
    }
  );

}

function getLastSeenText(
  value,
  t,
  timeFormat
) {

  if (!value) {
    return t.lastSeenLongAgo;
  }

  const date =
    new Date(value);

  if (Number.isNaN(date.getTime())) {
    return t.lastSeenLongAgo;
  }

  const now =
    new Date();

  const diffMs =
    now.getTime() - date.getTime();

  const diffDays =
    Math.floor(
      diffMs / (1000 * 60 * 60 * 24)
    );

  const yesterday =
    new Date();

  yesterday.setDate(
    yesterday.getDate() - 1
  );

  if (isSameDay(date, now)) {
    return `${t.lastSeenTodayAt} ${formatShortTime(date, timeFormat)}`;
  }

  if (isSameDay(date, yesterday)) {
    return `${t.lastSeenYesterdayAt} ${formatShortTime(date, timeFormat)}`;
  }

  if (diffDays < 7) {
    return `${t.lastSeen} ${formatShortDate(date)}`;
  }

  if (diffDays < 30) {
    return t.lastSeenWeekAgo;
  }

  if (diffDays < 60) {
    return t.lastSeenMonthAgo;
  }

  return t.lastSeenLongAgo;

}

export default function ChatHeader({
  activeChat,
  activeDialog,
  onlineUsers,
  typingUsers,
  openProfile,
  username,
  onBack
}) {

  const { t } =
    useLanguage();
  const timeFormat = useTimeFormat();

  const isSavedMessages =
    activeChat === username;

  const isGroup =
    activeDialog?.type === "group";

  const title =
    isSavedMessages
      ? t.savedMessages
      : isGroup
        ? activeDialog?.title ||
          activeDialog?.name ||
          "Группа"
        : activeDialog?.displayName?.trim() ||
          activeDialog?.name?.trim() ||
          activeDialog?.title?.trim() ||
          activeDialog?.username ||
          activeChat;

  const subtitle =
    isGroup
      ? `${activeDialog?.members?.length || 1} участников`
      : null;

  const isTyping =
    Boolean(
      activeChat &&
      typingUsers?.[activeChat]
    );

  const isOnline =
    !isGroup &&
    onlineUsers?.includes(activeChat);

  return (
    <div
      className="chat-header"
      onClick={
        isSavedMessages
          ? undefined
          : openProfile
      }
    >

      <button
        type="button"
        className="mobile-back-button"
        onClick={(e) => {
          e.stopPropagation();
          onBack?.();
        }}
      >
        ←
      </button>

      <div className="chat-avatar">
        {isSavedMessages ? (
          <div className="saved-icon">
            ★
          </div>
        ) : activeDialog?.avatar ? (
          <img
            src={avatarUrl(activeDialog.avatar)}
            alt=""
            className="avatar-image"
          />
        ) : (
          title
            ? title.charAt(0).toUpperCase()
            : "?"
        )}
      </div>

      <div className="chat-header-main">
        <div className="chat-name">
          {title}
        </div>

        {!isSavedMessages && (
          <div className="chat-status">
            {isGroup
              ? subtitle
              : isTyping
                ? t.typing
                : isOnline
                  ? t.online
                  : getLastSeenText(
                      activeDialog?.lastSeen,
                      t,
                      timeFormat
                    )}
          </div>
        )}
      </div>

    </div>
  );

}
