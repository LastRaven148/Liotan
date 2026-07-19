import { useCallback, useEffect, useState } from "react";
import { avatarUrl } from "../../../utils/avatarUrl";
import { getBlocklistApi, unblockUserApi } from "../../../services/api";
import LiotanIcon from "../../common/LiotanIcon";

export default function BlocklistPage({ back, labels }) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [busyUsername, setBusyUsername] = useState("");

  const load = useCallback(async (nextCursor = "") => {
    nextCursor ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const data = await getBlocklistApi({ cursor: nextCursor, limit: 50 });
      setItems(previous => nextCursor ? [...previous, ...(data.blocks || [])] : (data.blocks || []));
      setCursor(data.hasMore ? data.nextCursor || "" : "");
    } catch (err) {
      setError(err?.message || "Не удалось загрузить чёрный список");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    function handleInvalidation(event) {
      if (event?.detail?.kind === "blocklist-updated") load();
    }
    window.addEventListener("liotan:account-state-invalidated", handleInvalidation);
    return () => window.removeEventListener("liotan:account-state-invalidated", handleInvalidation);
  }, [load]);

  async function unblock(username) {
    if (busyUsername) return;
    setBusyUsername(username);
    setError("");
    try {
      await unblockUserApi(username);
      setItems(previous => previous.filter(item => item.username !== username));
    } catch (err) {
      setError(err?.message || "Не удалось разблокировать пользователя");
    } finally {
      setBusyUsername("");
    }
  }

  return <>
    <div className="drawer-topbar">
      <button type="button" className="drawer-icon-button" onClick={back} aria-label={labels.back}><LiotanIcon name="back" size={22} /></button>
      <div className="drawer-title">{labels.blacklist}</div>
    </div>
    <div className="settings-blocklist" aria-busy={loading}>
      {loading && <div className="settings-muted-text" role="status">Загрузка…</div>}
      {!loading && error && <div className="settings-modal-error" role="alert">{error}<button type="button" onClick={() => load()}>Повторить</button></div>}
      {!loading && !error && !items.length && <div className="settings-muted-text">В чёрном списке никого нет.</div>}
      {items.map(item => <div className="settings-blocklist-row" key={item.username}>
        <div className="avatar small-avatar">{item.avatar ? <img src={avatarUrl(item.avatar)} alt="" className="avatar-image" /> : (item.displayName || item.username).charAt(0).toUpperCase()}</div>
        <div className="settings-blocklist-identity"><strong>{item.displayName || item.username}</strong><span>@{item.username}</span></div>
        <button type="button" onClick={() => unblock(item.username)} disabled={busyUsername === item.username}>
          {busyUsername === item.username ? "…" : "Разблокировать"}
        </button>
      </div>)}
      {cursor && <button type="button" className="settings-support-button" onClick={() => load(cursor)} disabled={loadingMore}>{loadingMore ? "Загрузка…" : "Показать ещё"}</button>}
    </div>
  </>;
}
