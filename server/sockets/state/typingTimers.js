const typingTimers =
  new Map();

function getTypingKey(
  from,
  to
) {

  return `${from}->${to}`;

}

function setTypingTimer(
  from,
  to,
  timer
) {

  const key =
    getTypingKey(
      from,
      to
    );

  typingTimers.set(
    key,
    timer
  );

}

function clearTypingTimer(
  from,
  to
) {

  const key =
    getTypingKey(
      from,
      to
    );

  const timer =
    typingTimers.get(key);

  if (timer) {
    clearTimeout(timer);
    typingTimers.delete(key);
  }

}

function deleteTypingTimerByKey(
  key
) {

  const timer =
    typingTimers.get(key);

  if (timer) {
    clearTimeout(timer);
  }

  typingTimers.delete(key);

}

module.exports = {
  typingTimers,
  getTypingKey,
  setTypingTimer,
  clearTypingTimer,
  deleteTypingTimerByKey
};