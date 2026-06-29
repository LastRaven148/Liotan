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
  deleteGroupDialog,
  username
}) {

  const safePinnedChats =
    useMemo(() => (
      Array.isArray(pinnedChats)
        ? pinnedChats
        : []
    ), [
      pinnedChats
    ]);

  const safeArchivedChats =
    useMemo(() => (
      Array.isArray(archivedChats)
        ? archivedChats
        : []
    ), [
      archivedChats
    ]);

  const sortedDialogs =
    useMemo(() => {

      return [...dialogs].sort((a, b) => {

        const aKey =
          a.chatKey ||
          a.username;

        const bKey =
          b.chatKey ||
          b.username;

        const aPinned =
          safePinnedChats.includes(aKey);

        const bPinned =
          safePinnedChats.includes(bKey);

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
      safePinnedChats
    ]);

  return (
    <div className="dialogs-list">

      {sortedDialogs.map(dialog => {

        const dialogKey =
          dialog.chatKey ||
          dialog.username;

        return (
          <DialogItem
            key={dialogKey}
            dialog={dialog}
            activeChat={activeChat}
            openChat={openChat}
            deleteChat={deleteChat}
            unread={unread}
            username={username}
            isPinned={
              safePinnedChats.includes(dialogKey)
            }
            isArchived={
              safeArchivedChats.includes(dialogKey)
            }
            togglePin={togglePin}
            toggleArchive={toggleArchive}
            showArchive={showArchive}
            deleteGroupDialog={deleteGroupDialog}
          />
        );

      })}

    </div>
  );

}