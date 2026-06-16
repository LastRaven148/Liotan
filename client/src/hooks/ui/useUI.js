import { useState } from "react";

export default function useUI() {

  const [
    profileMenu,
    setProfileMenu
  ] = useState(false);

  const [
    profileUser,
    setProfileUser
  ] = useState(null);

  const [
    settingsOpen,
    setSettingsOpen
  ] = useState(false);

  return {

    profileMenu,
    setProfileMenu,

    profileUser,
    setProfileUser,

    settingsOpen,
    setSettingsOpen

  };

}