import {
  useMemo
} from "react";

import DialogItem from "./DialogItem";

export default function DialogList({
  dialogs = [],
  pinnedChats = [],
  togglePin,
  archivedChats = [],
  toggleArchive,
  showArchive,
  activeChat,
  openChat,
  deleteChat,
  unread,
  username
}) {

  const safePinnedChats =
    Array.isArray(pinnedChats)
      ? pinnedChats
      : [];

  const safeArchivedChats =
    Array.isArray(archivedChats)
      ? archivedChats
      : [];

  const sortedDialogs =
    useMemo(() => {

      return [...dialogs].sort((a, b) => {

        const aPinned = pinnedChats.includes(a.username);

        const bPinned = pinnedChats.includes(b.username);

        if (aPinned && !bPinned) {
          return -1;
        }

        if (!aPinned && bPinned) {
          return 1;
        }

        return 0;

      });

    }, [
      dialogs,
      pinnedChats
    ]);

  return (
    <div className="dialogs-list">

      {sortedDialogs.map(dialog => (
        <DialogItem
          key={dialog.username}
          dialog={dialog}
          activeChat={activeChat}
          openChat={openChat}
          deleteChat={deleteChat}
          unread={unread}
          username={username}
          isPinned={
            safePinnedChats.includes(
              dialog.username
            )
          }
          isArchived={
            safeArchivedChats.includes(
              dialog.username
            )
          }
          togglePin={togglePin}
          toggleArchive={toggleArchive}
          showArchive={showArchive}
        />
      ))}

    </div>
  );

}